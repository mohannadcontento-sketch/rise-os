import { NextRequest } from 'next/server'
import { getSupabaseAdmin, getSupabaseAnon, isSupabaseConfigured } from '@/lib/supabase'

// ============================================================
// Auth Token Context (set by API routes before data calls)
// ============================================================

let _currentAuthToken: string | undefined

/**
 * Set the current request's auth token so sb() can create an authenticated client.
 * P1#3: Reads from httpOnly cookie FIRST, then Authorization header.
 */
export function setCurrentAuthToken(tokenOrReq: string | undefined | NextRequest) {
  if (typeof tokenOrReq === 'string') {
    _currentAuthToken = tokenOrReq || undefined
    return
  }
  // NextRequest — read cookie first, then header
  if (tokenOrReq && typeof tokenOrReq === 'object' && 'cookies' in tokenOrReq) {
    const req = tokenOrReq as NextRequest
    const cookieToken = req.cookies.get('rise-access')?.value
    if (cookieToken) {
      _currentAuthToken = cookieToken
      return
    }
    const headerToken = req.headers.get('Authorization')?.replace('Bearer ', '')
    _currentAuthToken = headerToken || undefined
    return
  }
  _currentAuthToken = tokenOrReq as string | undefined
}

// ============================================================
// Case Conversion Helpers
// ============================================================

/**
 * Recursively convert camelCase object keys to snake_case.
 * Also serialises Date values to ISO strings for Supabase.
 */
function toSnake<T = Record<string, any>>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T
  if (obj instanceof Date) return obj.toISOString() as unknown as T
  if (typeof obj !== 'object') return obj as T

  if (Array.isArray(obj)) {
    return obj.map((item) => toSnake(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    result[snakeKey] = toSnake((obj as Record<string, unknown>)[key])
  }
  return result as T
}

/**
 * Recursively convert snake_case object keys to camelCase.
 */
function toCamel<T = Record<string, any>>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T
  if (typeof obj !== 'object') return obj as T

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamel(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
    result[camelKey] = toCamel((obj as Record<string, unknown>)[key])
  }
  return result as T
}

/**
 * Get a Supabase client for data operations.
 * Priority:
 * 1. Anon client with user JWT (respects RLS, per-user isolation)
 * 2. Anon client without JWT (may be blocked by RLS — correct behavior)
 * Admin client is NEVER used here — use getAdminSb() explicitly for admin ops.
 * Throws if no client can be created.
 */
async function sb() {
  try {
    // P1#1 FIX: Try anon client WITH user JWT FIRST (RLS enforced)
    if (_currentAuthToken && isSupabaseConfigured()) {
      const { createClient } = await import('@supabase/supabase-js')
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${_currentAuthToken}` } },
        })
      }
    }

    // 2. Fall back to plain anon client (RLS blocks unauthenticated access)
    const anonClient = await getSupabaseAnon()
    if (anonClient) return anonClient

    // 3. Local mock mode (development)
    const { getDefaultUser } = await import('@/lib/supabase')
    await getDefaultUser()  // ensure user exists
    const { createMockClient } = await import('@/lib/mock-client')
    return createMockClient()
  } catch (err) {
    console.error('[data/sb] Error creating Supabase client:', err)
  }

  throw new Error('Database client unavailable — check SUPABASE_URL and SUPABASE_ANON_KEY env vars')
}

/**
 * P1#1 FIX: Admin-only data client. Use ONLY in requireAdmin() routes.
 * Bypasses RLS — never use for regular user data access.
 */
async function adminSb() {
  const adminClient = await getSupabaseAdmin()
  if (adminClient) return adminClient
  // Local mock fallback
  const { createMockClient } = await import('@/lib/mock-client')
  return createMockClient()
}

// ============================================================
// Data Access Layer
// ============================================================

export const data = {
  // ────────────────────────────────────────────────────────────
  // 1. Projects  →  table: projects
  // ────────────────────────────────────────────────────────────
  projects: {
    async list(userId: string) {
      const client = await sb()
      const { data: rows, error } = await client
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return toCamel(rows ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const row = toSnake({ ...body, userId })
      const { data, error } = await client
        .from('projects')
        .insert(row)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('projects')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('projects')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 2. Tasks  →  table: tasks (+ subtasks, projects)
  // ────────────────────────────────────────────────────────────
  tasks: {
    async list(userId: string) {
      const client = await sb()

      // P2#4 FIX: Single query with joins (was 3 separate queries = 1+N problem)
      // Supabase supports nested selection: tasks → subtasks + project in one call
      const { data: tasks, error } = await client
        .from('tasks')
        .select(`
          *,
          subtasks!inner(*),
          project:projects(id, name, color)
        `)
        .eq('user_id', userId)
        .order('order', { ascending: true })
      if (error) throw error

      const taskList = tasks ?? []

      // Normalize: ensure subtasks is always an array, project is null-safe
      return toCamel(
        taskList.map((t: any) => ({
          ...t,
          subtasks: t.subtasks ?? [],
          project: t.project ?? null,
        }))
      )
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { subtasks: stBody, ...taskFields } = body

      const { data: task, error } = await client
        .from('tasks')
        .insert(toSnake({ ...taskFields, userId }))
        .select()
        .single()
      if (error) throw error

      // Insert subtasks if provided
      if (Array.isArray(stBody) && stBody.length > 0) {
        const stRows = stBody.map((s: any) => toSnake({ ...s, taskId: task.id }))
        const { data: inserted } = await client
          .from('subtasks')
          .insert(stRows)
          .select()
        return toCamel({ ...task, subtasks: inserted ?? [] })
      }

      return toCamel({ ...task, subtasks: [] })
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('tasks')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 3. Goals  →  table: goals (+ milestones)
  // ────────────────────────────────────────────────────────────
  goals: {
    async list(userId: string) {
      const client = await sb()

      const { data: goals, error } = await client
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error

      const goalList = goals ?? []
      const goalIds = goalList.map((g: any) => g.id)

      // Fetch milestones for these goals
      let milestoneRows: any[] = []
      if (goalIds.length > 0) {
        const { data: ms } = await client
          .from('milestones')
          .select('*')
          .in('goal_id', goalIds)
          .order('order', { ascending: true })
        milestoneRows = ms ?? []
      }

      const msMap = new Map<string, any[]>()
      for (const m of milestoneRows) {
        const gid = m.goal_id
        if (!msMap.has(gid)) msMap.set(gid, [])
        msMap.get(gid)!.push(m)
      }

      return toCamel(
        goalList.map((g: any) => ({
          ...g,
          milestones: msMap.get(g.id) ?? [],
        })),
      )
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('goals')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel({ ...data, milestones: [] })
    },

    async addMilestone(goalId: string, title: string) {
      const client = await sb()
      const { data, error } = await client
        .from('milestones')
        .insert(toSnake({ goalId, title }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('goals')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async toggleMilestone(milestoneId: string, completed: boolean) {
      const client = await sb()
      const { data, error } = await client
        .from('milestones')
        .update({ completed })
        .eq('id', milestoneId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 4. Habits  →  table: habits (+ habit_logs)
  // ────────────────────────────────────────────────────────────
  habits: {
    async list(userId: string) {
      const client = await sb()

      const { data: habits, error } = await client
        .from('habits')
        .select('*')
        .eq('user_id', userId)
      if (error) throw error

      const habitList = habits ?? []
      const habitIds = habitList.map((h: any) => h.id)

      // Fetch logs for the last 30 days
      let logRows: any[] = []
      if (habitIds.length > 0) {
        const thirtyAgo = new Date()
        thirtyAgo.setDate(thirtyAgo.getDate() - 30)
        const dateStr = thirtyAgo.toISOString().split('T')[0]

        const { data: logs } = await client
          .from('habit_logs')
          .select('*')
          .in('habit_id', habitIds)
          .gte('date', dateStr)
        logRows = logs ?? []
      }

      const logMap = new Map<string, any[]>()
      for (const log of logRows) {
        const hid = log.habit_id
        if (!logMap.has(hid)) logMap.set(hid, [])
        logMap.get(hid)!.push(log)
      }

      return toCamel(
        habitList.map((h: any) => ({
          ...h,
          logs: logMap.get(h.id) ?? [],
        })),
      )
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('habits')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel({ ...data, logs: [] })
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('habits')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async toggleLog(habitId: string, date: string, completed: boolean, count: number) {
      const client = await sb()

      // Find existing log for this habit + date
      const { data: existing } = await client
        .from('habit_logs')
        .select('*')
        .eq('habit_id', habitId)
        .eq('date', date)
        .maybeSingle()

      if (existing) {
        // Update
        const { data, error } = await client
          .from('habit_logs')
          .update({ completed, count })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) throw error
        return toCamel(data)
      }

      // Insert
      const { data, error } = await client
        .from('habit_logs')
        .insert({ habit_id: habitId, date, completed, count })
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 5. Journals  →  table: journals
  // ────────────────────────────────────────────────────────────
  journals: {
    async get(userId: string, date: string) {
      const client = await sb()
      const { data, error } = await client
        .from('journals')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },

    async list(userId: string, limit = 30) {
      const client = await sb()
      const { data, error } = await client
        .from('journals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return toCamel(data ?? [])
    },

    async upsert(userId: string, date: string, body: Record<string, any>) {
      // P2#5 FIX: Atomic upsert via Supabase native .upsert() (race-condition safe)
      // Relies on unique constraint (user_id, date) from migration 005.
      const client = await sb()
      const { data, error } = await client
        .from('journals')
        .upsert(
          toSnake({ ...body, userId, date }),
          { onConflict: 'user_id,date' }
        )
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  },

  // ────────────────────────────────────────────────────────────
  // 6. Focus Sessions  →  table: focus_sessions
  // ────────────────────────────────────────────────────────────
  focusSessions: {
    async list(userId: string, limit = 50) {
      const client = await sb()
      const { data, error } = await client
        .from('focus_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return toCamel(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('focus_sessions')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('focus_sessions')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  },

  // ────────────────────────────────────────────────────────────
  // 7. Health Logs  →  table: health_logs
  // ────────────────────────────────────────────────────────────
  healthLogs: {
    async list(userId: string, dates: string[]) {
      const client = await sb()
      const query = client
        .from('health_logs')
        .select('*')
        .eq('user_id', userId)

      if (dates.length > 0) {
        query.in('date', dates)
      }

      const { data, error } = await query.order('date', { ascending: false })
      if (error) throw error
      return toCamel(data ?? [])
    },

    async upsert(userId: string, date: string, body: Record<string, any>) {
      // P2#5 FIX: Atomic upsert (race-condition safe)
      const client = await sb()
      const { data, error } = await client
        .from('health_logs')
        .upsert(
          toSnake({ ...body, userId, date }),
          { onConflict: 'user_id,date' }
        )
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  },

  // ────────────────────────────────────────────────────────────
  // 8. Finance Records  →  table: finance_records
  // ────────────────────────────────────────────────────────────
  financeRecords: {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('finance_records')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
      if (error) throw error
      return toCamel(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('finance_records')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('finance_records')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 9. Books  →  table: books
  // ────────────────────────────────────────────────────────────
  books: {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('books')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return toCamel(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('books')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('books')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('books')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 10. Knowledge Items  →  table: knowledge_items
  // ────────────────────────────────────────────────────────────
  knowledgeItems: {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('knowledge_items')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return toCamel(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('knowledge_items')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('knowledge_items')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('knowledge_items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 11. Planner Items  →  table: planner_items
  // ────────────────────────────────────────────────────────────
  plannerItems: {
    async list(userId: string, date: string) {
      const client = await sb()
      const { data, error } = await client
        .from('planner_items')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .order('section', { ascending: true })
        .order('order', { ascending: true })
      if (error) throw error
      return toCamel(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('planner_items')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('planner_items')
        .update(toSnake(body))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('planner_items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 12. Morning Logs  →  table: morning_logs
  // ────────────────────────────────────────────────────────────
  morningLogs: {
    async list(userId: string, dates: string[]) {
      const client = await sb()
      const query = client
        .from('morning_logs')
        .select('*')
        .eq('user_id', userId)

      if (dates.length > 0) {
        query.in('date', dates)
      }

      const { data, error } = await query.order('date', { ascending: false })
      if (error) throw error
      return toCamel(data ?? [])
    },

    async upsert(userId: string, date: string, body: Record<string, any>) {
      // P2#5 FIX: Atomic upsert (race-condition safe)
      const client = await sb()
      const { data, error } = await client
        .from('morning_logs')
        .upsert(
          toSnake({ ...body, userId, date }),
          { onConflict: 'user_id,date' }
        )
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  },

  // ────────────────────────────────────────────────────────────
  // 13. Notifications  →  table: notifications
  // ────────────────────────────────────────────────────────────
  notifications: {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return toCamel(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('notifications')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('notifications')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  },

  // ────────────────────────────────────────────────────────────
  // 14. Daily Scores  →  table: daily_scores
  // ────────────────────────────────────────────────────────────
  dailyScores: {
    async get(userId: string, date: string) {
      const client = await sb()
      const { data, error } = await client
        .from('daily_scores')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },

    async list(userId: string, dates: string[]) {
      // P2#3: New method for fetching multiple days (used by weekly chart)
      const client = await sb()
      const { data, error } = await client
        .from('daily_scores')
        .select('*')
        .eq('user_id', userId)
        .in('date', dates)
        .order('date', { ascending: true })
      if (error) throw error
      return toCamel(data ?? [])
    },

    async upsert(userId: string, date: string, body: Record<string, any>) {
      // P2#5 FIX: Atomic upsert (race-condition safe)
      const client = await sb()
      const { data, error } = await client
        .from('daily_scores')
        .upsert(
          toSnake({ ...body, userId, date }),
          { onConflict: 'user_id,date' }
        )
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  },

  // ────────────────────────────────────────────────────────────
  // 15. User Achievements  →  table: user_achievements
  // ────────────────────────────────────────────────────────────
  userAchievements: {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('user_achievements')
        .select('*')
        .eq('user_id', userId)
      if (error) throw error
      return toCamel(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('user_achievements')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  },
}