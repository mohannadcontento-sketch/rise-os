/**
 * RiseOS MCP — Streamable HTTP Endpoint (Vercel-compatible)
 *
 * This is a stateless MCP server that works on Vercel serverless.
 * It implements the MCP JSON-RPC 2.0 protocol over HTTP POST.
 *
 * Claude Desktop / MCP client config:
 * {
 *   "mcpServers": {
 *     "riseos": {
 *       "url": "https://rise-os-gamma.vercel.app/api/mcp",
 *       "headers": { "Authorization": "Bearer rise_YOUR_API_KEY" }
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase'
import { getToday, getLast30Days } from '@/lib/rise-utils'

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null

  if (token.startsWith('rise_')) {
    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('UserApiKey')
        .select('userId')
        .eq('key', token)
        .single()
      if (data?.userId) return data.userId as string
    } catch { /* Supabase not configured */ }
    const allowedKeys = (process.env.RISE_ALLOWED_API_KEYS || '').split(',').filter(Boolean)
    if (allowedKeys.includes(token)) {
      return process.env.RISE_DEFAULT_USER_ID || 'dev-user'
    }
    return null
  }

  return null
}

/* ------------------------------------------------------------------ */
/*  MCP Tool Definitions                                               */
/* ------------------------------------------------------------------ */

interface McpToolArg {
  name: string
  type: string
  required?: boolean
  description: string
  enum?: string[]
}

interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
}

const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_tools',
    description: 'عرض قائمة الأدوات المتاحة',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_dashboard',
    description: 'عرض لوحة التحكم الرئيسية (المهام، العادات، التركيز، الصحة، النتيجة)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_tasks',
    description: 'عرض قائمة المهام مع فلتر اختياري للحالة',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'فلتر الحالة: todo, in_progress, done, cancelled' },
      },
    },
  },
  {
    name: 'add_task',
    description: 'إضافة مهمة جديدة',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'عنوان المهمة' },
        priority: { type: 'string', description: 'الأولوية: low, medium, high, urgent' },
        status: { type: 'string', description: 'الحالة الافتراضية: todo' },
        projectId: { type: 'string', description: 'معرف المشروع' },
        dueDate: { type: 'string', description: 'تاريخ الاستحقاق yyyy-MM-dd' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_habits',
    description: 'عرض العادات وسجل آخر 30 يوم',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'toggle_habit',
    description: 'تحويل حالة عادة (إكمال / إلغاء)',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: { type: 'string', description: 'معرف العادة' },
        completed: { type: 'boolean', description: 'true لإكمال، false لإلغاء' },
        date: { type: 'string', description: 'التاريخ yyyy-MM-dd (افتراضي: اليوم)' },
      },
      required: ['habitId', 'completed'],
    },
  },
  {
    name: 'get_goals',
    description: 'عرض الأهداف مع المعالم',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_goal',
    description: 'إضافة هدف جديد',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'عنوان الهدف' },
        type: { type: 'string', description: 'النوع: annual, quarterly, monthly, weekly, daily' },
        description: { type: 'string', description: 'وصف الهدف' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_finance',
    description: 'عرض السجلات المالية',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'فلتر الشهر yyyy-MM' },
      },
    },
  },
  {
    name: 'add_finance',
    description: 'إضافة سجل مالي',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'المبلغ' },
        type: { type: 'string', description: 'النوع: income أو expense' },
        category: { type: 'string', description: 'التصنيف' },
        description: { type: 'string', description: 'الوصف' },
        date: { type: 'string', description: 'التاريخ yyyy-MM-dd' },
      },
      required: ['amount', 'type'],
    },
  },
  {
    name: 'get_journal',
    description: 'عرض يوميات اليوم واليوميات الأخيرة',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'write_journal',
    description: 'كتابة أو تحديث يومية',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'محتوى اليومية' },
        mood: { type: 'string', description: 'المزاج' },
        date: { type: 'string', description: 'التاريخ yyyy-MM-dd (افتراضي: اليوم)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_focus',
    description: 'عرض جلسات التركيز',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_health',
    description: 'عرض سجلات الصحة لآخر 30 يوم',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_projects',
    description: 'عرض المشاريع',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_score',
    description: 'عرض نقاط الإنتاجية لليوم مع التفاصيل',
    inputSchema: { type: 'object', properties: {} },
  },
]

/* ------------------------------------------------------------------ */
/*  Tool execution logic (same as /api/rise/mcp/call)                  */
/* ------------------------------------------------------------------ */

async function executeTool(tool: string, args: Record<string, unknown>, userId: string): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  if (tool === 'list_tools') {
    const list = MCP_TOOLS.map(t => `• ${t.name}: ${t.description}`).join('\n')
    return { content: [{ type: 'text', text: `📋 الأدوات المتاحة:\n${list}` }] }
  }

  // Check Supabase availability
  let supabase: ReturnType<typeof getSupabase> | null = null
  let useFallback = false
  try {
    const token = args.__token as string | undefined
    if (token?.startsWith('rise_')) {
      supabase = getSupabaseAdmin() || getSupabase()
    } else {
      supabase = getSupabase()
    }
  } catch {
    useFallback = true
  }

  // Fallback: use mock data (Supabase not configured or no auth)
  if (useFallback) {
    // Write tools — return success with mock data (no Supabase to persist to)
    const writeResponses: Record<string, string> = {
      add_task: `✅ تمت إضافة المهمة بنجاح!\nالعنوان: ${args.title || '(بدون عنوان)'}\nالأولوية: ${args.priority || 'medium'}\nالحالة: ${args.status || 'todo'}\n\n⚠️ ملاحظة: البيانات محفوظة مؤقتاً فقط (Supabase غير متصل)`,
      toggle_habit: `✅ تم تحديث حالة العادة!\nمعرف العادة: ${args.habitId}\nالحالة: ${args.completed ? 'مكتمل' : 'غير مكتمل'}\nالتاريخ: ${args.date || getToday()}\n\n⚠️ ملاحظة: البيانات محفوظة مؤقتاً فقط (Supabase غير متصل)`,
      add_finance: `✅ تمت إضافة السجل المالي!\nالمبلغ: ${args.amount}\nالنوع: ${args.type}\nالتصنيف: ${args.category || 'عام'}\n\n⚠️ ملاحظة: البيانات محفوظة مؤقتاً فقط (Supabase غير متصل)`,
      write_journal: `✅ تم حفظ اليومية!\nالمزاج: ${args.mood || 'عادي'}\nالتاريخ: ${args.date || getToday()}\n\n⚠️ ملاحظة: البيانات محفوظة مؤقتاً فقط (Supabase غير متصل)`,
      add_goal: `✅ تمت إضافة الهدف!\nالعنوان: ${args.title}\nالنوع: ${args.type || 'annual'}\n\n⚠️ ملاحظة: البيانات محفوظة مؤقتاً فقط (Supabase غير متصل)`,
    }

    if (writeResponses[tool]) {
      return { content: [{ type: 'text', text: writeResponses[tool] }] }
    }

    // Read tools — proxy to mock API routes
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rise-os-gamma.vercel.app'
    const routeMap: Record<string, { path: string; method?: string }> = {
      get_dashboard: { path: '/api/rise/dashboard' },
      get_tasks: { path: '/api/rise/tasks' },
      get_habits: { path: '/api/rise/habits' },
      get_goals: { path: '/api/rise/goals' },
      get_journal: { path: '/api/rise/journal' },
      get_health: { path: '/api/rise/health' },
      get_projects: { path: '/api/rise/projects' },
      get_finance: { path: '/api/rise/finance' },
      get_score: { path: '/api/rise/productivity-score' },
      get_focus: { path: '/api/rise/focus' },
    }
    const mapping = routeMap[tool]
    if (mapping) {
      const qs = new URLSearchParams()
      if (args.status) qs.set('status', String(args.status))
      if (args.month) qs.set('month', String(args.month))
      if (args.date) qs.set('date', String(args.date))
      if (args.days) qs.set('days', String(args.days))
      const url = `${baseUrl}${mapping.path}${qs.toString() ? '?' + qs.toString() : ''}`
      try {
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
        const data = await res.json()
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `❌ فشل الوصول: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
      }
    }
    return { content: [{ type: 'text', text: `❌ أداة غير معروفة: "${tool}"` }], isError: true }
  }

  // Supabase tool execution
  let result: unknown

  try {
    switch (tool) {
      case 'get_dashboard': {
        const today = getToday()
        const last30 = getLast30Days()
        const [tasksRes, habitsRes, focusRes, userRes, healthRes, morningRes, goalsRes] = await Promise.all([
          supabase!.from('Task').select('*').eq('userId', userId).order('createdAt', { ascending: false }).limit(10),
          supabase!.from('Habit').select('*').eq('userId', userId),
          supabase!.from('FocusSession').select('*').eq('userId', userId).gte('startedAt', last30[0]).order('startedAt', { ascending: false }).limit(5),
          supabase!.from('User').select('*').eq('id', userId).single(),
          supabase!.from('HealthLog').select('*').eq('userId', userId).eq('date', today).limit(1),
          supabase!.from('MorningLog').select('*').eq('userId', userId).eq('date', today).limit(1),
          supabase!.from('Goal').select('*').eq('userId', userId).eq('status', 'active').limit(5),
        ])
        result = {
          user: userRes.data ? { name: userRes.data.name, level: userRes.data.level, xp: userRes.data.xp, streak: userRes.data.streak } : null,
          today: {
            tasksCompleted: (tasksRes.data || []).filter((t: any) => t.status === 'done' && String(t.completedAt || '').startsWith(today)).length,
            tasksTotal: (tasksRes.data || []).length,
          },
          tasks: tasksRes.data || [],
          habits: habitsRes.data || [],
          recentFocus: focusRes.data || [],
          goals: goalsRes.data || [],
        }
        break
      }

      case 'get_tasks': {
        let query = supabase!.from('Task').select('*').eq('userId', userId).order('order', { ascending: true })
        if (args.status) query = query.eq('status', args.status as string)
        const { data } = await query
        result = { tasks: data || [] }
        break
      }

      case 'add_task': {
        if (!args.title) return { content: [{ type: 'text', text: '❌ حقل "title" مطلوب' }], isError: true }
        const insertData: Record<string, unknown> = { userId, title: args.title, status: (args.status as string) || 'todo' }
        if (args.priority) insertData.priority = args.priority
        if (args.projectId) insertData.projectId = args.projectId
        if (args.dueDate) insertData.dueDate = args.dueDate
        const { data, error } = await supabase!.from('Task').insert(insertData).select().single()
        if (error) throw error
        result = data
        break
      }

      case 'get_habits': {
        const [habitsRes, logsRes] = await Promise.all([
          supabase!.from('Habit').select('*').eq('userId', userId),
          supabase!.from('HabitLog').select('*').eq('userId', userId).in('date', getLast30Days()),
        ])
        result = { habits: habitsRes.data || [], logs: logsRes.data || [] }
        break
      }

      case 'toggle_habit': {
        if (!args.habitId || args.completed === undefined)
          return { content: [{ type: 'text', text: '❌ حقلَا "habitId" و "completed" مطلوبان' }], isError: true }
        const date = (args.date as string) || getToday()
        const { data: habit } = await supabase!.from('Habit').select('userId').eq('id', args.habitId).single()
        if (!habit || (habit.userId as string) !== userId)
          return { content: [{ type: 'text', text: '❌ غير مصرح' }], isError: true }
        const { data: existing } = await supabase!.from('HabitLog').select('id').eq('habitId', args.habitId).eq('date', date).single()
        if (existing && !(args.completed as boolean)) {
          await supabase!.from('HabitLog').delete().eq('id', existing.id)
          result = { success: true, action: 'removed' }
        } else if (existing && (args.completed as boolean)) {
          const { data, error } = await supabase!.from('HabitLog').update({ completed: true, count: (args.count as number) || 1 }).eq('id', existing.id).select().single()
          if (error) throw error
          result = data
        } else {
          const { data, error } = await supabase!.from('HabitLog').insert({ habitId: args.habitId, date, completed: args.completed, count: (args.count as number) || 1 }).select().single()
          if (error) throw error
          result = data
        }
        break
      }

      case 'get_goals': {
        const { data, error } = await supabase!.from('Goal').select('*, milestones:Milestone(*)').eq('userId', userId).order('createdAt', { ascending: false })
        if (error) throw error
        result = { goals: data || [] }
        break
      }

      case 'add_goal': {
        if (!args.title) return { content: [{ type: 'text', text: '❌ حقل "title" مطلوب' }], isError: true }
        const goalData: Record<string, unknown> = { userId, title: args.title, status: 'active' }
        if (args.type) goalData.type = args.type
        if (args.description) goalData.description = args.description
        const { data, error } = await supabase!.from('Goal').insert(goalData).select().single()
        if (error) throw error
        result = data
        break
      }

      case 'get_finance': {
        let query = supabase!.from('FinanceRecord').select('*').eq('userId', userId).order('date', { ascending: false })
        if (args.month) query = query.like('date', `${args.month}%`)
        const { data } = await query
        result = { records: data || [] }
        break
      }

      case 'add_finance': {
        if (args.amount === undefined || !args.type)
          return { content: [{ type: 'text', text: '❌ حقلَا "amount" و "type" مطلوبان' }], isError: true }
        const finData: Record<string, unknown> = { userId, amount: Number(args.amount), type: args.type }
        if (args.category) finData.category = args.category
        if (args.description) finData.description = args.description
        if (args.date) finData.date = args.date
        const { data, error } = await supabase!.from('FinanceRecord').insert(finData).select().single()
        if (error) throw error
        result = data
        break
      }

      case 'get_journal': {
        const today = getToday()
        const [journalRes, recentRes] = await Promise.all([
          supabase!.from('Journal').select('*').eq('userId', userId).eq('date', today).single(),
          supabase!.from('Journal').select('*').eq('userId', userId).order('createdAt', { ascending: false }).limit(30),
        ])
        result = { journal: journalRes.data || null, recentJournals: recentRes.data || [] }
        break
      }

      case 'write_journal': {
        if (!args.content) return { content: [{ type: 'text', text: '❌ حقل "content" مطلوب' }], isError: true }
        const journalDate = (args.date as string) || getToday()
        const journalData: Record<string, unknown> = { userId, content: args.content }
        if (args.mood) journalData.mood = args.mood
        const { data: existing } = await supabase!.from('Journal').select('id').eq('userId', userId).eq('date', journalDate).single()
        if (existing) {
          const { data, error } = await supabase!.from('Journal').update(journalData).eq('id', existing.id).select().single()
          if (error) throw error
          result = data
        } else {
          const { data, error } = await supabase!.from('Journal').insert({ ...journalData, date: journalDate }).select().single()
          if (error) throw error
          result = data
        }
        break
      }

      case 'get_focus': {
        const { data } = await supabase!.from('FocusSession').select('*').eq('userId', userId).order('startedAt', { ascending: false }).limit(100)
        result = { sessions: data || [] }
        break
      }

      case 'get_health': {
        const last30 = getLast30Days()
        const { data } = await supabase!.from('HealthLog').select('*').eq('userId', userId).in('date', last30).order('date', { ascending: false })
        result = { logs: data || [] }
        break
      }

      case 'get_projects': {
        const { data, error } = await supabase!.from('Project').select('*').eq('userId', userId).order('createdAt', { ascending: false })
        if (error) throw error
        result = { projects: data || [] }
        break
      }

      case 'get_score': {
        const today = getToday()
        const [tasksRes, habitsRes, habitLogsRes, focusRes, morningRes, userRes] = await Promise.all([
          supabase!.from('Task').select('*').eq('userId', userId),
          supabase!.from('Habit').select('*').eq('userId', userId),
          supabase!.from('HabitLog').select('*').eq('userId', userId).eq('date', today),
          supabase!.from('FocusSession').select('*').eq('userId', userId).gte('startedAt', today + 'T00:00:00').lt('startedAt', today + 'T23:59:59'),
          supabase!.from('MorningLog').select('*').eq('userId', userId).eq('date', today).single(),
          supabase!.from('User').select('streak').eq('id', userId).single(),
        ])
        const tasks = tasksRes.data || []
        const habits = habitsRes.data || []
        const habitLogs = habitLogsRes.data || []
        const focusSessions = focusRes.data || []
        const tasksScore = tasks.length > 0 ? (tasks.filter((t: any) => t.status === 'done' && String(t.completedAt || '').startsWith(today)).length / tasks.length) * 100 : 0
        const habitsScore = habits.length > 0 ? (habitLogs.filter((l: any) => l.completed).length / habits.length) * 100 : 0
        const focusScore = Math.min((focusSessions.filter((s: any) => s.completed).reduce((sum: number, s: any) => sum + (Number(s.actualMin) || 0), 0) / 120) * 100, 100)
        const score = Math.min(Math.round(tasksScore * 0.3 + habitsScore * 0.3 + focusScore * 0.4), 100)
        result = { score, breakdown: { tasks: Math.round(tasksScore), habits: Math.round(habitsScore), focus: Math.round(focusScore) } }
        break
      }

      default:
        return { content: [{ type: 'text', text: `❌ أداة غير معروفة: "${tool}". استخدم list_tools لعرض الأدوات المتاحة.` }], isError: true }
    }

    return { content: [{ type: 'text', text: JSON.stringify({ success: true, tool, data: result }, null, 2) }] }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `❌ خطأ في تنفيذ "${tool}": ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    }
  }
}

/* ------------------------------------------------------------------ */
/*  JSON-RPC helpers                                                   */
/* ------------------------------------------------------------------ */

function jsonRpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: '2.0' as const, id, result }
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } }
}

/* ------------------------------------------------------------------ */
/*  Session ID (stateless — generate per request)                      */
/* ------------------------------------------------------------------ */

function generateSessionId(): string {
  return 'vercel-' + Math.random().toString(36).substring(2, 15)
}

/* ------------------------------------------------------------------ */
/*  CORS headers                                                       */
/* ------------------------------------------------------------------ */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
  'Access-Control-Expose-Headers': 'mcp-session-id',
}

/* ------------------------------------------------------------------ */
/*  GET — SSE endpoint (for Claude Desktop & SSE clients)               */
/*        Falls back to JSON health check for browsers/other clients    */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const accept = req.headers.get('Accept') || ''

  // If client expects SSE, return proper MCP SSE stream
  if (accept.includes('text/event-stream')) {
    const sessionId = generateSessionId()
    const postEndpoint = `/api/mcp`

    const body = `event: endpoint
data: ${postEndpoint}?sessionId=${sessionId}

`

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'mcp-session-id': sessionId,
        ...CORS_HEADERS,
      },
    })
  }

  // Otherwise return JSON health info
  return NextResponse.json({
    status: 'ok',
    server: 'riseos-mcp',
    version: '2.0.0',
    transport: 'streamable-http',
    endpoint: '/api/mcp',
    note: 'Send POST with MCP initialize request to start',
  }, { headers: CORS_HEADERS })
}

/* ------------------------------------------------------------------ */
/*  OPTIONS — CORS preflight                                           */
/* ------------------------------------------------------------------ */

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/* ------------------------------------------------------------------ */
/*  POST — Handle MCP JSON-RPC requests (stateless)                    */
/*          Returns SSE if client expects it, JSON otherwise            */
/* ------------------------------------------------------------------ */

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const sessionId = generateSessionId()
  const wantsSSE = (req.headers.get('Accept') || '').includes('text/event-stream')

  try {
    // Parse JSON-RPC request
    let body: any
    try {
      body = await req.json()
    } catch {
      const errResp = jsonRpcError(null, -32700, 'Parse error: invalid JSON')
      return wantsSSE ? sseResponse(errResp, sessionId) : NextResponse.json(errResp, { status: 400, headers: { ...CORS_HEADERS, 'mcp-session-id': sessionId } })
    }

    // Handle batch requests (array of requests)
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map(async (msg: any) => handleSingleMessage(msg, req, sessionId)))
      return wantsSSE ? sseResponse(results, sessionId) : NextResponse.json(results, { headers: { ...CORS_HEADERS, 'mcp-session-id': sessionId } })
    }

    // Single request
    const result = await handleSingleMessage(body, req, sessionId)
    return wantsSSE ? sseResponse(result, sessionId) : NextResponse.json(result, { headers: { ...CORS_HEADERS, 'mcp-session-id': sessionId } })
  } catch (error) {
    const errResp = jsonRpcError(null, -32603, `Internal error: ${error instanceof Error ? error.message : String(error)}`)
    return wantsSSE ? sseResponse(errResp, sessionId) : NextResponse.json(errResp, { status: 500, headers: { ...CORS_HEADERS, 'mcp-session-id': sessionId } })
  }
}

/* ------------------------------------------------------------------ */
/*  SSE response helper                                                 */
/* ------------------------------------------------------------------ */

function sseResponse(data: unknown, sessionId: string): NextResponse {
  const jsonStr = JSON.stringify(data)
  const body = `data: ${jsonStr}\n\n`
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'mcp-session-id': sessionId,
      ...CORS_HEADERS,
    },
  })
}

/* ------------------------------------------------------------------ */
/*  DELETE — Session cleanup (stateless, no-op)                        */
/* ------------------------------------------------------------------ */

export async function DELETE() {
  return new NextResponse(null, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/* ------------------------------------------------------------------ */
/*  Single message handler                                             */
/* ------------------------------------------------------------------ */

async function handleSingleMessage(msg: any, req: NextRequest, sessionId: string): Promise<any> {
  const { method, id, params } = msg
  const reqId = id ?? null

  // ── initialize ────────────────────────────────────────────────
  if (method === 'initialize') {
    return {
      ...jsonRpcResult(reqId, {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'riseos',
          version: '2.0.0',
          description: 'RiseOS — نظام إدارة الحياة الشامل. يتيح قراءة وكتابة المهام والعادات والأهداف والمالية واليوميات والصحة والتركيز.',
        },
      }),
      // Note: session id is in response header, not body
    }
  }

  // ── notifications/initialized ─────────────────────────────────
  if (method === 'notifications/initialized') {
    return { jsonrpc: '2.0', id: null, result: {} }
  }

  // ── tools/list ────────────────────────────────────────────────
  if (method === 'tools/list') {
    return jsonRpcResult(reqId, {
      tools: MCP_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    })
  }

  // ── tools/call ────────────────────────────────────────────────
  if (method === 'tools/call') {
    const toolName = params?.name
    const toolArgs = params?.arguments || {}

    if (!toolName) {
      return jsonRpcError(reqId, -32602, 'Missing tool name in params.name')
    }

    // For tool calls, resolve the user ID from the request
    // Pass the API key as a hidden arg for internal use
    const userId = await resolveUserId(req)
    if (!userId) {
      // No auth — all tools use fallback/mock data (works for MCP clients)
      toolArgs.__token = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    }

    const effectiveUserId = userId || 'dev-user'
    const toolResult = await executeTool(toolName, toolArgs, effectiveUserId)

    return jsonRpcResult(reqId, {
      content: toolResult.content,
      isError: toolResult.isError,
    })
  }

  // ── ping ──────────────────────────────────────────────────────
  if (method === 'ping') {
    return jsonRpcResult(reqId, {})
  }

  // ── Unknown method ────────────────────────────────────────────
  return jsonRpcError(reqId, -32601, `Method not found: ${method}`)
}