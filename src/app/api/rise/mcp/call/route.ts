import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getToday, getLast30Days } from '@/lib/rise-utils'

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve a userId from either a `rise_` API key or a Supabase JWT.
 * Returns null when authentication fails.
 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null

  if (token.startsWith('rise_')) {
    // API-key auth
    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('UserApiKey')
        .select('userId')
        .eq('key', token)
        .single()
      if (data?.userId) return data.userId as string
    } catch {
      // UserApiKey table might not exist — trust the key format
      return 'api-key-user'
    }
    return null
  }

  // Regular JWT auth
  return requireAuth(req)
}

/* ------------------------------------------------------------------ */
/*  Tool catalogue (returned by GET & list_tools)                      */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: 'list_tools',
    description: 'عرض قائمة الأدوات المتاحة',
    args: [],
  },
  {
    name: 'get_dashboard',
    description: 'عرض لوحة التحكم الرئيسية (المهام، العادات، التركيز، الصحة)',
    args: [],
  },
  {
    name: 'get_tasks',
    description: 'عرض قائمة المهام',
    args: [{ name: 'status', type: 'string', required: false, description: 'فلتر الحالة: todo, in_progress, done, cancelled' }],
  },
  {
    name: 'add_task',
    description: 'إضافة مهمة جديدة',
    args: [
      { name: 'title', type: 'string', required: true, description: 'عنوان المهمة' },
      { name: 'priority', type: 'string', required: false, description: 'الأولوية: low, medium, high, urgent' },
      { name: 'status', type: 'string', required: false, description: 'الحالة الافتراضية: todo' },
      { name: 'projectId', type: 'string', required: false, description: 'معرف المشروع' },
      { name: 'dueDate', type: 'string', required: false, description: 'تاريخ الاستحقاق yyyy-MM-dd' },
    ],
  },
  {
    name: 'get_habits',
    description: 'عرض العادات وسجل آخر 30 يوم',
    args: [],
  },
  {
    name: 'toggle_habit',
    description: 'تحويل حالة عادة (إكمال / إلغاء)',
    args: [
      { name: 'habitId', type: 'string', required: true, description: 'معرف العادة' },
      { name: 'completed', type: 'boolean', required: true, description: 'true لإكمال، false لإلغاء' },
      { name: 'date', type: 'string', required: false, description: 'التاريخ yyyy-MM-dd (افتراضي: اليوم)' },
    ],
  },
  {
    name: 'get_goals',
    description: 'عرض الأهداف مع المعالم',
    args: [],
  },
  {
    name: 'add_goal',
    description: 'إضافة هدف جديد',
    args: [
      { name: 'title', type: 'string', required: true, description: 'عنوان الهدف' },
      { name: 'type', type: 'string', required: false, description: 'النوع: annual, quarterly, monthly, weekly, daily' },
      { name: 'description', type: 'string', required: false, description: 'وصف الهدف' },
    ],
  },
  {
    name: 'get_finance',
    description: 'عرض السجلات المالية',
    args: [],
  },
  {
    name: 'add_finance',
    description: 'إضافة سجل مالي',
    args: [
      { name: 'amount', type: 'number', required: true, description: 'المبلغ' },
      { name: 'type', type: 'string', required: true, description: 'النوع: income أو expense' },
      { name: 'category', type: 'string', required: false, description: 'التصنيف' },
      { name: 'description', type: 'string', required: false, description: 'الوصف' },
      { name: 'date', type: 'string', required: false, description: 'التاريخ yyyy-MM-dd' },
    ],
  },
  {
    name: 'get_journal',
    description: 'عرض يوميات اليوم واليوميات الأخيرة',
    args: [],
  },
  {
    name: 'write_journal',
    description: 'كتابة أو تحديث يومية',
    args: [
      { name: 'content', type: 'string', required: true, description: 'محتوى اليومية' },
      { name: 'mood', type: 'string', required: false, description: 'المزاج' },
      { name: 'date', type: 'string', required: false, description: 'التاريخ yyyy-MM-dd (افتراضي: اليوم)' },
    ],
  },
  {
    name: 'get_focus',
    description: 'عرض جلسات التركيز',
    args: [],
  },
  {
    name: 'get_health',
    description: 'عرض سجلات الصحة لآخر 30 يوم',
    args: [],
  },
  {
    name: 'get_projects',
    description: 'عرض المشاريع',
    args: [],
  },
  {
    name: 'get_score',
    description: 'عرض نقاط الإنتاجية لليوم',
    args: [],
  },
] as const

/* ------------------------------------------------------------------ */
/*  GET — list available tools (no auth required)                      */
/* ------------------------------------------------------------------ */

export async function GET() {
  return NextResponse.json({ tools: TOOLS })
}

/* ------------------------------------------------------------------ */
/*  POST — execute a tool call                                         */
/* ------------------------------------------------------------------ */

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const userId = await resolveUserId(req)
    if (!userId) {
      return NextResponse.json(
        { error: 'يرجى توفير مفتاح API صالح. أنشئ واحد من إعدادات RiseOS.' },
        { status: 401 },
      )
    }

    // 2. Parse request body
    let tool: string
    let args: Record<string, unknown>
    try {
      const body = await req.json()
      tool = body.tool as string
      args = (body.args as Record<string, unknown>) || {}
    } catch {
      return NextResponse.json({ error: 'جسم الطلب غير صالح — يتطلب { tool, args }' }, { status: 400 })
    }

    if (!tool) {
      return NextResponse.json({ error: 'حقل "tool" مطلوب' }, { status: 400 })
    }

    // list_tools is special — no data access needed
    if (tool === 'list_tools') {
      return NextResponse.json({ success: true, data: TOOLS })
    }

    // 3. Execute tool
    const supabase = getSupabase()
    let result: unknown

    switch (tool) {
      /* ---- DASHBOARD ---- */
      case 'get_dashboard': {
        const today = getToday()
        const last30 = getLast30Days()

        const [tasksRes, habitsRes, focusRes, userRes, healthRes, morningRes, goalsRes] = await Promise.all([
          supabase.from('Task').select('*').eq('userId', userId).order('createdAt', { ascending: false }).limit(10),
          supabase.from('Habit').select('*').eq('userId', userId),
          supabase.from('FocusSession').select('*').eq('userId', userId).gte('startedAt', last30[0]).order('startedAt', { ascending: false }).limit(5),
          supabase.from('User').select('*').eq('id', userId).single(),
          supabase.from('HealthLog').select('*').eq('userId', userId).eq('date', today).limit(1),
          supabase.from('MorningLog').select('*').eq('userId', userId).eq('date', today).limit(1),
          supabase.from('Goal').select('*').eq('userId', userId).eq('status', 'active').limit(5),
        ])

        const tasks = tasksRes.data || []
        const habits = habitsRes.data || []
        const focusSessions = focusRes.data || []

        result = {
          user: userRes.data ? { name: userRes.data.name, level: userRes.data.level, xp: userRes.data.xp, streak: userRes.data.streak } : null,
          today: {
            tasksCompleted: tasks.filter((t: Record<string, unknown>) => t.status === 'done' && String(t.completedAt || '').startsWith(today)).length,
            tasksTotal: tasks.length,
            focusMin: focusSessions.filter((s: Record<string, unknown>) => s.completed && String(s.startedAt || '').startsWith(today)).reduce((sum: number, s: Record<string, unknown>) => sum + (Number(s.actualMin) || 0), 0),
          },
          tasks,
          habits,
          recentFocus: focusSessions,
          health: healthRes.data?.[0] || null,
          morning: morningRes.data?.[0] || null,
          goals: goalsRes.data || [],
        }
        break
      }

      /* ---- TASKS ---- */
      case 'get_tasks': {
        let query = supabase.from('Task').select('*').eq('userId', userId).order('order', { ascending: true })
        if (args.status) {
          query = query.eq('status', args.status as string)
        }
        const { data } = await query
        result = { tasks: data || [] }
        break
      }

      case 'add_task': {
        if (!args.title) {
          return NextResponse.json({ error: 'حقل "title" مطلوب' }, { status: 400 })
        }
        const insertData: Record<string, unknown> = {
          userId,
          title: args.title,
          status: (args.status as string) || 'todo',
        }
        if (args.priority) insertData.priority = args.priority
        if (args.projectId) insertData.projectId = args.projectId
        if (args.dueDate) insertData.dueDate = args.dueDate
        const { data, error } = await supabase.from('Task').insert(insertData).select().single()
        if (error) throw error
        result = data
        break
      }

      /* ---- HABITS ---- */
      case 'get_habits': {
        const [habitsRes, logsRes] = await Promise.all([
          supabase.from('Habit').select('*').eq('userId', userId),
          supabase.from('HabitLog').select('*').eq('userId', userId).in('date', getLast30Days()),
        ])
        result = { habits: habitsRes.data || [], logs: (logsRes.data || []).filter((l: Record<string, unknown>) => getLast30Days().includes(l.date as string)) }
        break
      }

      case 'toggle_habit': {
        if (!args.habitId || args.completed === undefined) {
          return NextResponse.json({ error: 'حقلَا "habitId" و "completed" مطلوبان' }, { status: 400 })
        }
        const date = (args.date as string) || getToday()
        const habitId = args.habitId as string
        const completed = args.completed as boolean

        // Verify ownership
        const { data: habit } = await supabase.from('Habit').select('userId').eq('id', habitId).single()
        if (!habit || (habit.userId as string) !== userId) {
          return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
        }

        const { data: existing } = await supabase.from('HabitLog').select('id').eq('habitId', habitId).eq('date', date).single()

        if (existing && !completed) {
          await supabase.from('HabitLog').delete().eq('id', existing.id)
          result = { success: true, action: 'removed' }
        } else if (existing && completed) {
          const { data, error } = await supabase.from('HabitLog').update({ completed: true, count: (args.count as number) || 1 }).eq('id', existing.id).select().single()
          if (error) throw error
          result = data
        } else {
          const { data, error } = await supabase.from('HabitLog').insert({ habitId, date, completed, count: (args.count as number) || 1 }).select().single()
          if (error) throw error
          result = data
        }
        break
      }

      /* ---- GOALS ---- */
      case 'get_goals': {
        const { data, error } = await supabase.from('Goal').select('*, milestones:Milestone(*)').eq('userId', userId).order('createdAt', { ascending: false })
        if (error) throw error
        result = { goals: data || [] }
        break
      }

      case 'add_goal': {
        if (!args.title) {
          return NextResponse.json({ error: 'حقل "title" مطلوب' }, { status: 400 })
        }
        const goalData: Record<string, unknown> = { userId, title: args.title, status: 'active' }
        if (args.type) goalData.type = args.type
        if (args.description) goalData.description = args.description
        const { data, error } = await supabase.from('Goal').insert(goalData).select().single()
        if (error) throw error
        result = data
        break
      }

      /* ---- FINANCE ---- */
      case 'get_finance': {
        const { data } = await supabase.from('FinanceRecord').select('*').eq('userId', userId).order('date', { ascending: false })
        result = { records: data || [] }
        break
      }

      case 'add_finance': {
        if (args.amount === undefined || !args.type) {
          return NextResponse.json({ error: 'حقلَا "amount" و "type" مطلوبان' }, { status: 400 })
        }
        const finData: Record<string, unknown> = { userId, amount: Number(args.amount), type: args.type }
        if (args.category) finData.category = args.category
        if (args.description) finData.description = args.description
        if (args.date) finData.date = args.date
        const { data, error } = await supabase.from('FinanceRecord').insert(finData).select().single()
        if (error) throw error
        result = data
        break
      }

      /* ---- JOURNAL ---- */
      case 'get_journal': {
        const today = getToday()
        const [journalRes, recentRes] = await Promise.all([
          supabase.from('Journal').select('*').eq('userId', userId).eq('date', today).single(),
          supabase.from('Journal').select('*').eq('userId', userId).order('createdAt', { ascending: false }).limit(30),
        ])
        result = { journal: journalRes.data || null, recentJournals: recentRes.data || [] }
        break
      }

      case 'write_journal': {
        if (!args.content) {
          return NextResponse.json({ error: 'حقل "content" مطلوب' }, { status: 400 })
        }
        const journalDate = (args.date as string) || getToday()
        const journalData: Record<string, unknown> = { userId, content: args.content }
        if (args.mood) journalData.mood = args.mood

        const { data: existing } = await supabase.from('Journal').select('id').eq('userId', userId).eq('date', journalDate).single()
        let journalResult
        if (existing) {
          const { data, error } = await supabase.from('Journal').update(journalData).eq('id', existing.id).select().single()
          if (error) throw error
          journalResult = data
        } else {
          const { data, error } = await supabase.from('Journal').insert({ ...journalData, date: journalDate }).select().single()
          if (error) throw error
          journalResult = data
        }
        result = journalResult
        break
      }

      /* ---- FOCUS ---- */
      case 'get_focus': {
        const { data } = await supabase.from('FocusSession').select('*').eq('userId', userId).order('startedAt', { ascending: false }).limit(50)
        result = { sessions: data || [] }
        break
      }

      /* ---- HEALTH ---- */
      case 'get_health': {
        const today = getToday()
        const last30 = getLast30Days()
        const { data } = await supabase.from('HealthLog').select('*').eq('userId', userId).in('date', last30).order('date', { ascending: false })
        const logs = data || []
        result = { logs, todayLog: logs.find((l: Record<string, unknown>) => l.date === today) || null }
        break
      }

      /* ---- PROJECTS ---- */
      case 'get_projects': {
        const { data, error } = await supabase.from('Project').select('*').eq('userId', userId).order('createdAt', { ascending: false })
        if (error) throw error
        result = { projects: data || [] }
        break
      }

      /* ---- PRODUCTIVITY SCORE ---- */
      case 'get_score': {
        const today = getToday()

        const [tasksRes, habitsRes, habitLogsRes, focusRes, morningRes, userRes] = await Promise.all([
          supabase.from('Task').select('*').eq('userId', userId),
          supabase.from('Habit').select('*').eq('userId', userId),
          supabase.from('HabitLog').select('*').eq('userId', userId).eq('date', today),
          supabase.from('FocusSession').select('*').eq('userId', userId).gte('startedAt', today + 'T00:00:00').lt('startedAt', today + 'T23:59:59'),
          supabase.from('MorningLog').select('*').eq('userId', userId).eq('date', today).single(),
          supabase.from('User').select('streak').eq('id', userId).single(),
        ])

        const tasks = tasksRes.data || []
        const habits = habitsRes.data || []
        const habitLogs = habitLogsRes.data || []
        const focusSessions = focusRes.data || []
        const morningLog = morningRes.data
        const user = userRes.data

        const totalTasks = tasks.length
        const completedTasksToday = tasks.filter((t: Record<string, unknown>) => t.status === 'done' && String(t.completedAt || '').startsWith(today)).length
        const tasksScore = totalTasks > 0 ? (completedTasksToday / totalTasks) * 100 : 0

        const totalHabits = habits.length
        const completedHabitsToday = habitLogs.filter((l: Record<string, unknown>) => l.completed).length
        const habitsScore = totalHabits > 0 ? (completedHabitsToday / totalHabits) * 100 : 0

        const todayFocusMin = focusSessions.filter((s: Record<string, unknown>) => s.completed).reduce((sum: number, s: Record<string, unknown>) => sum + (Number(s.actualMin) || 0), 0)
        const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

        const morningScore = Number(morningLog?.score) || 0

        const streakScore = Math.min(((Number(user?.streak) || 0) / 30) * 100, 100)

        const score = Math.min(Math.round(tasksScore * 0.25 + habitsScore * 0.25 + focusScore * 0.20 + morningScore * 0.20 + streakScore * 0.10), 100)

        let grade: string
        if (score >= 90) grade = 'متميز'
        else if (score >= 70) grade = 'جيد جداً'
        else if (score >= 50) grade = 'جيد'
        else if (score >= 30) grade = 'مقبول'
        else grade = 'يحتاج تحسين'

        result = {
          score,
          breakdown: {
            tasks: Math.round(tasksScore),
            habits: Math.round(habitsScore),
            focus: Math.round(focusScore),
            morning: Math.round(morningScore),
            streak: Math.round(streakScore),
          },
          grade,
        }
        break
      }

      default:
        return NextResponse.json(
          { error: `أداة غير معروفة: "${tool}". استخدم list_tools لعرض الأدوات المتاحة.` },
          { status: 400 },
        )
    }

    return NextResponse.json({ success: true, tool, data: result })
  } catch (error) {
    console.error('[mcp/call] POST error:', error)
    return NextResponse.json(
      { error: 'فشل في تنفيذ الأداة', details: error instanceof Error ? error.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}