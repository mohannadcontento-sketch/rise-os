import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { getToday, getLast30Days } from '@/lib/rise-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    // Set auth token for data layer
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))

    // If Supabase is not configured, return early
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true, seeded: false, offline: true })
    }

    // Parse body to check for profileOnly flag
    let createProfileOnly = false
    try {
      const body = await req.json()
      createProfileOnly = body?.createProfileOnly === true
    } catch { /* no body or invalid JSON — default to full seed */ }

    // Check if user profile already exists in Supabase
    let userExists = false
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { data: profile } = await admin
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle()
        userExists = !!profile
      }
    } catch { /* ignore */ }

    // If profileOnly mode: just ensure profile exists, no sample data
    if (createProfileOnly) {
      return NextResponse.json({ success: true, seeded: false })
    }

    // Full seed mode — check if user already has data
    let hasTasks = false
    try {
      const tasks = await data.tasks.list(userId)
      hasTasks = tasks.length > 0
    } catch { /* data layer might fail on empty state */ }

    if (userExists && hasTasks) {
      return NextResponse.json({ success: true, seeded: false })
    }

    const today = getToday()
    const last30 = getLast30Days()

    // --- Create / update User profile in Supabase ---
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle()

        if (!existingProfile) {
          await admin.from('profiles').upsert({
            id: userId,
            name: 'مستخدم RiseOS',
            email: '',
            role: 'user',
          }, { onConflict: 'id' })
        }
      }
    } catch (err) {
      console.error('[seed] profile upsert error:', err)
    }

    // --- Create user_settings row if missing ---
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { data: existingSettings } = await admin
          .from('user_settings')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle()

        if (!existingSettings) {
          await admin.from('user_settings').insert({
            user_id: userId,
            theme: 'system',
            language: 'ar',
            wake_up_time: '06:00',
            sleep_time: '22:00',
            focus_duration: 50,
            daily_water_goal: 8,
            daily_reading_goal: 30,
            weekly_exercise_goal: 5,
          })
        }
      }
    } catch (err) {
      console.error('[seed] user_settings insert error:', err)
    }

    // --- Projects ---
    let project0: any = { id: 'mock-p0' }, project1: any = { id: 'mock-p1' }, project2: any = { id: 'mock-p2' }
    try {
      project0 = await data.projects.create(userId, { name: 'تطوير تطبيق الويب', description: 'بناء تطبيق ويب متكامل', color: '#059669', progress: 65 })
      project1 = await data.projects.create(userId, { name: 'كتابة الكتاب', description: 'إكمال كتاب الإنتاجية', color: '#D4A853', progress: 35 })
      project2 = await data.projects.create(userId, { name: 'تعلم البرمجة', description: 'دورة متقدمة في TypeScript', color: '#6366F1', progress: 80 })
    } catch (err) {
      console.error('[seed] projects error:', err)
    }

    // --- Tasks ---
    const taskData = [
      { title: 'إكمال التصميم', status: 'done', priority: 'high', projectId: project0.id, xpReward: 25, completedAt: new Date() },
      { title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', projectId: project1.id, xpReward: 30 },
      { title: 'مراجعة الكود', status: 'todo', priority: 'medium', projectId: project0.id, dueDate: today, xpReward: 15 },
      { title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20 },
      { title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10 },
      { title: 'اجتماع الفريق', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 },
      { title: 'تحديث المدونة', status: 'todo', priority: 'low', projectId: project0.id, xpReward: 20 },
      { title: 'درس TypeScript', status: 'in_progress', priority: 'medium', projectId: project2.id, xpReward: 15 },
      { title: 'تخطيط الأسبوع', status: 'done', priority: 'medium', xpReward: 10, completedAt: new Date() },
      { title: 'مراجعة أهداف الشهر', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 },
    ]
    for (const t of taskData) {
      try { await data.tasks.create(userId, t) } catch (err) { console.error('[seed] task error:', err) }
    }

    // --- Habits ---
    const habitData = [
      { name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
      { name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
      { name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
      { name: 'تأمل', icon: '🧘', color: '#8B5CF6', frequency: 'daily', targetCount: 1, xpReward: 15 },
      { name: 'كتابة اليوميات', icon: '✍️', color: '#D4A853', frequency: 'daily', targetCount: 1, xpReward: 20 },
      { name: 'تعلم مهارة جديدة', icon: '🎯', color: '#F97316', frequency: 'daily', targetCount: 1, xpReward: 20 },
      { name: 'لا ساعة لمدة ساعة', icon: '📵', color: '#6366F1', frequency: 'daily', targetCount: 1, xpReward: 10 },
    ]

    const createdHabits: Array<{ id: string; targetCount: number }> = []
    for (const h of habitData) {
      try {
        const habit = await data.habits.create(userId, h)
        createdHabits.push({ id: habit.id, targetCount: habit.targetCount || h.targetCount || 1 })
      } catch (err) {
        console.error('[seed] habit error:', err)
      }
    }

    // --- Habit Logs (last 30 days) — bulk insert via supabase ---
    try {
      const habitLogRows: Array<{ habit_id: string; date: string; completed: boolean; count: number }> = []
      for (const day of last30) {
        for (const habit of createdHabits) {
          const completed = Math.random() > 0.3
          habitLogRows.push({
            habit_id: habit.id,
            date: day,
            completed,
            count: completed ? (habit.targetCount || 1) : 0,
          })
        }
      }
      if (habitLogRows.length > 0) {
        const supabase = await getSupabaseAdmin()
        if (supabase) {
          // Insert in batches of 100
          for (let i = 0; i < habitLogRows.length; i += 100) {
            await supabase.from('habit_logs').insert(habitLogRows.slice(i, i + 100))
          }
        }
      }
    } catch (err) {
      console.error('[seed] habit_logs error:', err)
    }

    // --- Goals ---
    const goalData = [
      { title: 'إكمال كتاب الإنتاجية', vision: 'نشر كتاب يغيّر حياة الناس', why: 'للمساهمة في نشر المعرفة', type: 'quarterly', progress: 35, deadline: '2025-12-31' },
      { title: 'الوصول لمستوى 10', vision: 'بناء نظام حياة متكامل', why: 'للتحول لشخص أفضل', type: 'annual', progress: 70, deadline: '2025-12-31' },
      { title: 'قراءة 24 كتاب', vision: 'قراءة كتابين شهرياً', why: 'للتطور المستمر', type: 'annual', progress: 45, deadline: '2025-12-31' },
      { title: 'تسجيل 500 ساعة عمل عميق', vision: 'إتقان التركيز العميق', why: 'لزيادة الإنتاجية', type: 'annual', progress: 65, deadline: '2025-12-31' },
    ]

    const createdGoals: any[] = []
    for (const g of goalData) {
      try {
        const goal = await data.goals.create(userId, g)
        createdGoals.push(goal)
      } catch (err) {
        console.error('[seed] goal error:', err)
      }
    }

    // --- Milestones — bulk insert via supabase ---
    try {
      const milestoneRows: Array<{ goal_id: string; title: string; completed: boolean; order: number }> = []
      for (const goal of createdGoals) {
        milestoneRows.push({ goal_id: goal.id, title: 'البحث وجمع المصادر', completed: true, order: 0 })
        milestoneRows.push({ goal_id: goal.id, title: 'كتابة المسودة الأولى', completed: false, order: 1 })
        milestoneRows.push({ goal_id: goal.id, title: 'المراجعة والتحرير', completed: false, order: 2 })
        milestoneRows.push({ goal_id: goal.id, title: 'النشر', completed: false, order: 3 })
      }
      if (milestoneRows.length > 0) {
        const supabase = await getSupabaseAdmin()
        if (supabase) {
          for (let i = 0; i < milestoneRows.length; i += 100) {
            await supabase.from('milestones').insert(milestoneRows.slice(i, i + 100))
          }
        }
      }
    } catch (err) {
      console.error('[seed] milestones error:', err)
    }

    // --- Journals (last 10 days) ---
    const moodValues = [3, 4, 5, 4, 3, 5, 4, 3, 4, 5]
    const energyValues = [4, 3, 5, 4, 3, 4, 5, 3, 4, 5]
    for (let i = 0; i < last30.slice(-10).length; i++) {
      const day = last30.slice(-10)[i]
      try {
        await data.journals.upsert(userId, day, {
          content: 'كان يوماً مليئاً بالإنجازات والتقدم. تعلمت أشياء جديدة وأنجزت مهام مهمة.',
          gratitude: 'الصحة، العائلة، الفرص المتاحة',
          wins: 'أكملت مهمة مهمة وتعلمت مهارة جديدة',
          challenges: 'بعض التشتت في الصباح لكن تم التغلب عليه',
          mood: moodValues[i] ?? 4,
          energy: energyValues[i] ?? 4,
        })
      } catch (err) {
        console.error('[seed] journal error:', err)
      }
    }

    // --- Focus Sessions (last 14 days) ---
    for (const day of last30.slice(-14)) {
      const sessions = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < sessions; i++) {
        const duration = [25, 50, 90][Math.floor(Math.random() * 3)]
        const completed = Math.random() > 0.2
        try {
          await data.focusSessions.create(userId, {
            duration,
            actualMin: completed ? duration : Math.floor(duration * 0.7),
            type: duration === 25 ? 'pomodoro' : duration === 50 ? 'deep50' : 'deep90',
            completed,
            startedAt: new Date(day + 'T08:00:00'),
            completedAt: completed ? new Date(day + 'T09:00:00') : null,
          })
        } catch (err) {
          console.error('[seed] focus session error:', err)
        }
      }
    }

    // --- Health Logs (last 14 days) ---
    for (const day of last30.slice(-14)) {
      try {
        await data.healthLogs.upsert(userId, day, {
          sleepHours: +(6 + Math.random() * 3).toFixed(1),
          sleepQuality: Math.floor(Math.random() * 3) + 3,
          waterGlasses: Math.floor(Math.random() * 5) + 4,
          steps: Math.floor(Math.random() * 8000) + 3000,
          calories: Math.floor(Math.random() * 500) + 1500,
          mood: Math.floor(Math.random() * 3) + 3,
          energy: Math.floor(Math.random() * 3) + 3,
          exerciseType: Math.random() > 0.3 ? 'جري' : null,
          exerciseMin: Math.random() > 0.3 ? Math.floor(Math.random() * 45) + 15 : null,
        })
      } catch (err) {
        console.error('[seed] health log error:', err)
      }
    }

    // --- Finance Records ---
    const financeData = [
      { type: 'income', description: 'راتب شهري', amount: 15000, category: 'عمل', date: today },
      { type: 'income', description: 'مشروع حر', amount: 3000, category: 'عمل حر', date: today },
      { type: 'expense', description: 'إيجار', amount: 4000, category: 'سكن', date: today },
      { type: 'expense', description: 'طعام', amount: 2000, category: 'غذاء', date: today },
      { type: 'expense', description: 'مواصلات', amount: 500, category: 'تنقل', date: today },
      { type: 'expense', description: 'اشتراكات', amount: 200, category: 'اشتراكات', date: today },
      { type: 'savings', description: 'ادخار شهري', amount: 3000, category: 'ادخار', date: today },
      { type: 'investment', description: 'استثمار', amount: 2000, category: 'أسهم', date: today },
      { type: 'expense', description: 'كتب', amount: 300, category: 'تعلم', date: today },
      { type: 'expense', description: 'نادي رياضي', amount: 250, category: 'صحة', date: today },
    ]
    for (const f of financeData) {
      try { await data.financeRecords.create(userId, f) } catch (err) { console.error('[seed] finance error:', err) }
    }

    // --- Books ---
    const bookData = [
      { title: 'عادات ذرية', author: 'جيمس كلير', type: 'book', status: 'completed', totalPages: 320, currentPage: 320, progress: 100, rating: 5, favoriteQuote: 'أنت لا ترتفع لمستوى أهدافك، بل تنخفض لمستوى أنظمتك.', startDate: '2025-01-15' },
      { title: 'العمل العميق', author: 'كال نيوبورت', type: 'book', status: 'reading', totalPages: 296, currentPage: 180, progress: 61, rating: 0, startDate: '2025-01-15' },
      { title: 'العادات السبع', author: 'ستيفن كوفي', type: 'book', status: 'reading', totalPages: 384, currentPage: 120, progress: 31, rating: 0, startDate: '2025-01-15' },
      { title: 'التفكير السريع والبطيء', author: 'دانيال كانيمان', type: 'book', status: 'want_to_read', totalPages: 499, currentPage: 0, progress: 0, startDate: '2025-01-15' },
      { title: 'دورة React المتقدمة', author: 'أونلاين', type: 'course', status: 'reading', totalPages: 50, currentPage: 30, progress: 60, startDate: '2025-01-15' },
    ]
    for (const b of bookData) {
      try { await data.books.create(userId, b) } catch (err) { console.error('[seed] book error:', err) }
    }

    // --- Knowledge Items ---
    const knowledgeData = [
      { type: 'idea', title: 'فكرة تطبيق جديد', content: 'تطبيق لتتبع العادات مع gamification', tags: '["أفكار","تطبيقات"]' },
      { type: 'resource', title: 'أفضل أدوات الإنتاجية', content: 'Notion, Todoist, RiseOS...', tags: '["أدوات","إنتاجية"]' },
      { type: 'knowledge', title: 'مبادئ التصميم', content: 'التسلسل الهرمي البصري، التباين، المحاذاة...', tags: '["تصميم","UI"]' },
      { type: 'bookmark', title: 'مقال عن العمل العميق', content: 'https://example.com/deep-work', tags: '["قراءة","إنتاجية"]' },
    ]
    for (const k of knowledgeData) {
      try { await data.knowledgeItems.create(userId, k) } catch (err) { console.error('[seed] knowledge error:', err) }
    }

    // --- Morning Logs (last 10 days) ---
    for (const day of last30.slice(-10)) {
      const total = 7
      const done = Math.floor(Math.random() * 3) + 4
      try {
        await data.morningLogs.upsert(userId, day, {
          score: Math.round((done / total) * 100),
          completedItems: JSON.stringify(Array(done).fill(true).concat(Array(total - done).fill(false))),
          totalItems: total,
        })
      } catch (err) {
        console.error('[seed] morning log error:', err)
      }
    }

    // --- Daily Scores (last 30 days) — bulk insert via supabase ---
    try {
      const dailyScoreRows: Array<Record<string, any>> = []
      for (const day of last30) {
        dailyScoreRows.push({
          user_id: userId,
          date: day,
          score: Math.round(40 + Math.random() * 55),
          morning_score: Math.round(30 + Math.random() * 70),
          task_score: Math.round(30 + Math.random() * 70),
          habit_score: Math.round(30 + Math.random() * 70),
          focus_score: Math.round(20 + Math.random() * 80),
          health_score: Math.round(30 + Math.random() * 70),
          journal_score: Math.round(20 + Math.random() * 80),
        })
      }
      if (dailyScoreRows.length > 0) {
        const supabase = await getSupabaseAdmin()
        if (supabase) {
          for (let i = 0; i < dailyScoreRows.length; i += 100) {
            await supabase.from('daily_scores').insert(dailyScoreRows.slice(i, i + 100))
          }
        }
      }
    } catch (err) {
      console.error('[seed] daily_scores error:', err)
    }

    // --- Achievements ---
    const achievements = [
      { badgeId: 'streak_7', badgeName: 'أسبوع متواصل', badgeIcon: '🔥', badgeDesc: '7 أيام متتالية' },
      { badgeId: 'streak_21', badgeName: 'ثلاثة أسابيع', badgeIcon: '⚡', badgeDesc: '21 يوم متتالي' },
      { badgeId: 'tasks_100', badgeName: 'مائة مهمة', badgeIcon: '✅', badgeDesc: 'أكملت 100 مهمة' },
      { badgeId: 'focus_50h', badgeName: '50 ساعة تركيز', badgeIcon: '🧠', badgeDesc: '50 ساعة عمل عميق' },
      { badgeId: 'books_5', badgeName: 'قارئ نهم', badgeIcon: '📚', badgeDesc: 'أنهيت 5 كتب' },
    ]
    for (const a of achievements) {
      try { await data.userAchievements.create(userId, a) } catch (err) { console.error('[seed] achievement error:', err) }
    }

    return NextResponse.json({ success: true, seeded: true })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Seed failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}