import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'

// ============================================================
// RiseOS — Local Supabase-compatible layer (Prisma + SQLite)
// ------------------------------------------------------------
// This module replaces the real Supabase client with a mock that
// mimics the Supabase JS query-builder API (`.from().select().eq()
// .order().single()` etc.) but executes against Prisma+SQLite.
// All 37 API routes, data.ts, and auth.ts remain UNCHANGED.
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'local'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'local'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'local'

// Admin email
export const ADMIN_EMAIL: string = process.env.ADMIN_EMAIL || ''

/** Check if Supabase is configured (always true in local mode) */
export function isSupabaseConfigured(): boolean {
  return true
}

/** Check if service role key is available (always true in local mode) */
export function hasServiceRole(): boolean {
  return true
}

// ============================================================
// Snake ↔ Camel case helpers
// ============================================================
function toSnakeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}
function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
}
function toSnake(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (typeof obj === 'object') {
    const out: Record<string, any> = {}
    for (const k of Object.keys(obj)) out[toSnakeKey(k)] = toSnake(obj[k])
    return out
  }
  return obj
}
function toCamel(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(toCamel)
  if (typeof obj === 'object') {
    const out: Record<string, any> = {}
    for (const k of Object.keys(obj)) out[toCamelKey(k)] = toCamel(obj[k])
    return out
  }
  return obj
}

// ============================================================
// Table → Prisma model mapping
// ============================================================
const TABLE_TO_MODEL: Record<string, string> = {
  profiles: 'user',
  projects: 'project',
  tasks: 'task',
  subtasks: 'subTask',
  goals: 'goal',
  milestones: 'milestone',
  habits: 'habit',
  habit_logs: 'habitLog',
  morning_logs: 'morningLog',
  journals: 'journal',
  focus_sessions: 'focusSession',
  health_logs: 'healthLog',
  finance_records: 'financeRecord',
  books: 'book',
  knowledge_items: 'knowledgeItem',
  planner_items: 'plannerItem',
  notifications: 'notification',
  daily_scores: 'dailyScore',
  user_achievements: 'userAchievement',
  user_settings: 'userSettings',
  user_ai_usage: 'userAIUsage',
  user_storage: 'userStorage',
  user_api_keys: 'userApiKey',
  app_config: 'appConfig',
}

function getModel(table: string): any {
  const modelName = TABLE_TO_MODEL[table]
  if (!modelName) throw new Error(`Unknown table: ${table}`)
  const model = (db as any)[modelName]
  if (!model) throw new Error(`Prisma model not found: ${modelName}`)
  return model
}

// ============================================================
// Mock Supabase Query Builder
// ============================================================
type FilterOp = { col: string; op: string; val: any }

class MockQueryBuilder {
  private table: string
  private operation: 'select' | 'insert' | 'update' | 'delete' | null = null
  private filters: FilterOp[] = []
  private orders: { col: string; ascending: boolean }[] = []
  private limitN: number | null = null
  private insertData: any = null
  private updateData: any = null
  private selectCols: string | null = null
  private singleMode: 'single' | 'maybeSingle' | null = null

  constructor(table: string) {
    this.table = table
  }

  select(cols: string = '*') {
    this.operation = 'select'
    this.selectCols = cols
    return this
  }
  insert(data: any) {
    this.operation = 'insert'
    this.insertData = data
    return this
  }
  update(data: any) {
    this.operation = 'update'
    this.updateData = data
    return this
  }
  delete() {
    this.operation = 'delete'
    return this
  }
  eq(col: string, val: any) { this.filters.push({ col, op: 'eq', val }); return this }
  neq(col: string, val: any) { this.filters.push({ col, op: 'neq', val }); return this }
  in(col: string, vals: any[]) { this.filters.push({ col, op: 'in', val: vals }); return this }
  gte(col: string, val: any) { this.filters.push({ col, op: 'gte', val }); return this }
  lte(col: string, val: any) { this.filters.push({ col, op: 'lte', val }); return this }
  gt(col: string, val: any) { this.filters.push({ col, op: 'gt', val }); return this }
  lt(col: string, val: any) { this.filters.push({ col, op: 'lt', val }); return this }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending ?? true })
    return this
  }
  limit(n: number) { this.limitN = n; return this }
  single() { this.singleMode = 'single'; return this.execute() }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this.execute() }

  private buildWhere(): any {
    const where: Record<string, any> = {}
    for (const f of this.filters) {
      const camelCol = toCamelKey(f.col)
      if (f.op === 'eq') where[camelCol] = f.val
      else if (f.op === 'neq') where[camelCol] = { not: f.val }
      else if (f.op === 'in') where[camelCol] = { in: f.val }
      else if (f.op === 'gte') where[camelCol] = { gte: f.val }
      else if (f.op === 'lte') where[camelCol] = { lte: f.val }
      else if (f.op === 'gt') where[camelCol] = { gt: f.val }
      else if (f.op === 'lt') where[camelCol] = { lt: f.val }
    }
    return where
  }

  private buildOrderBy(): any {
    if (this.orders.length === 0) return undefined
    const ob: Record<string, 'asc' | 'desc'> = {}
    for (const o of this.orders) ob[toCamelKey(o.col)] = o.ascending ? 'asc' : 'desc'
    return ob
  }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      const model = getModel(this.table)
      const where = this.buildWhere()
      const orderBy = this.buildOrderBy()
      const take = this.limitN ?? undefined

      if (this.operation === 'select') {
        let rows: any[]
        if (orderBy || take) {
          rows = await model.findMany({ where, orderBy, take })
        } else {
          rows = await model.findMany({ where })
        }
        // Handle selectCols subset (e.g., 'id, name, color')
        if (this.selectCols && this.selectCols !== '*') {
          const cols = this.selectCols.split(',').map((c) => c.trim())
          rows = rows.map((r: any) => {
            const out: Record<string, any> = {}
            for (const c of cols) out[c] = r[toCamelKey(c)]
            return out
          })
        }
        // Apply single/maybeSingle
        if (this.singleMode === 'single') {
          if (rows.length === 0) return { data: null, error: { message: 'No rows found', code: '', status: 0 } }
          return { data: toSnake(rows[0]), error: null }
        }
        if (this.singleMode === 'maybeSingle') {
          return { data: rows.length > 0 ? toSnake(rows[0]) : null, error: null }
        }
        return { data: toSnake(rows), error: null }
      }

      if (this.operation === 'insert') {
        const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData]
        const camelRows = rows.map((r: any) => toCamel(r))
        let created: any
        if (camelRows.length === 1) {
          created = await model.create({ data: camelRows[0] })
        } else {
          created = await model.createMany({ data: camelRows })
          if (this.selectCols) {
            const all = await model.findMany({ where })
            return { data: toSnake(all), error: null }
          }
          return { data: null, error: null }
        }
        // If .select() was chained, return the created row
        if (this.selectCols) {
          return { data: toSnake(created), error: null }
        }
        return { data: toSnake(created), error: null }
      }

      if (this.operation === 'update') {
        const camelData = toCamel(this.updateData)
        // If .select() chained → updateMany + return first, or update single
        if (this.singleMode === 'single' || this.singleMode === 'maybeSingle') {
          // Find first matching, update it
          const existing = await model.findFirst({ where })
          if (!existing && this.singleMode === 'single') {
            return { data: null, error: { message: 'No rows found', code: '', status: 0 } }
          }
          if (!existing) return { data: null, error: null }
          const updated = await model.update({ where: { id: existing.id }, data: camelData })
          return { data: toSnake(updated), error: null }
        }
        // Bulk update
        await model.updateMany({ where, data: camelData })
        if (this.selectCols) {
          const rows = await model.findMany({ where, orderBy, take })
          return { data: toSnake(rows), error: null }
        }
        return { data: null, error: null }
      }

      if (this.operation === 'delete') {
        await model.deleteMany({ where })
        return { data: null, error: null }
      }

      return { data: null, error: { message: 'No operation specified', code: '', status: 0 } }
    } catch (err) {
      console.error(`[mock-supabase] ${this.table}.${this.operation} error:`, err)
      return { data: null, error: { message: err instanceof Error ? err.message : 'DB error', code: '', status: 0 } }
    }
  }

  // Make thenable so `await client.from(t).select().eq(...)` works
  // Implements PromiseLike for proper TypeScript await support
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any)
  }
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<any> {
    return this.execute().catch(onrejected as any)
  }
}

// ============================================================
// Mock Supabase Client
// ============================================================
class MockSupabaseClient {
  auth = {
    async signInWithPassword({ email, password }: { email: string; password: string }): Promise<any> {
      const user = await db.user.findFirst({ where: { email } })
      if (!user) {
        return { data: { user: null, session: null }, error: { message: 'Invalid credentials', code: '', status: 0 } }
      }
      // In local mode, any password works for the default user
      const ts = Date.now()
      const session = {
        access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`,
        refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`,
        expires_at: Math.floor(ts / 1000) + 3600,
      }
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: { name: user.name }, aud: 'authenticated', role: 'authenticated', app_metadata: {} },
          session,
        },
        error: null,
      }
    },

    async signUp({ email, password, data: meta, options }: { email: string; password: string; data?: any; options?: { data?: any; emailRedirectTo?: string } }): Promise<any> {
      // Support both `data` and `options.data` (Supabase accepts both)
      const userData = meta || options?.data
      const existing = await db.user.findFirst({ where: { email } })
      if (existing) {
        return { data: { user: null, session: null }, error: { message: 'User already exists', code: '', status: 0 } }
      }
      const user = await db.user.create({
        data: {
          email,
          name: userData?.name || email.split('@')[0],
          isDefault: false,
          settings: { create: {} },
          storage: { create: { email, name: userData?.name || email.split('@')[0] } },
        },
      })
      const ts = Date.now()
      const session = {
        access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`,
        refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`,
        expires_at: Math.floor(ts / 1000) + 3600,
      }
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: { name: user.name }, aud: 'authenticated', role: 'authenticated', app_metadata: {} },
          session,
        },
        error: null,
      }
    },

    async getUser(token: string): Promise<any> {
      // Tokens are `local.{userId}.{ts}.risecos.local.auth.token.payload.sig`
      const match = token.match(/^local\.(.+?)\.\d+\.risecos\.local/)
      if (!match) return { data: { user: null }, error: { message: 'Invalid token', code: '', status: 0 } }
      const userId = match[1]
      const user = await db.user.findUnique({ where: { id: userId } })
      if (!user) return { data: { user: null }, error: { message: 'User not found', code: '', status: 0 } }
      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            user_metadata: { name: user.name },
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
          },
        },
        error: null,
      }
    },

    async refreshSession({ refresh_token }: { refresh_token: string }): Promise<any> {
      const match = refresh_token.match(/^local\.refresh\.(.+?)\.\d+\.risecos\.local/)
      if (!match) return { data: { user: null, session: null }, error: { message: 'Invalid refresh token', code: '', status: 0 } }
      const userId = match[1]
      const user = await db.user.findUnique({ where: { id: userId } })
      if (!user) return { data: { user: null, session: null }, error: { message: 'User not found', code: '', status: 0 } }
      const ts = Date.now()
      const session = {
        access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`,
        refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`,
        expires_at: Math.floor(ts / 1000) + 3600,
      }
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: { name: user.name }, aud: 'authenticated', role: 'authenticated', app_metadata: {} },
          session,
        },
        error: null,
      }
    },

    async resend({ type, email }: { type: string; email: string }): Promise<any> {
      // Local mode: no email confirmation needed
      return { data: {}, error: null }
    },

    async signOut() {
      return { error: null }
    },
  }

  from(table: string) {
    return new MockQueryBuilder(table)
  }
}

// Singleton clients
let _anonClient: MockSupabaseClient | null = null
let _adminClient: MockSupabaseClient | null = null

/** Anon client (in local mode, same as admin) */
export async function getSupabaseAnon() {
  if (!_anonClient) _anonClient = new MockSupabaseClient()
  return _anonClient
}

/** Admin client (bypasses RLS — in local mode, same client) */
export async function getSupabaseAdmin() {
  if (!_adminClient) _adminClient = new MockSupabaseClient()
  return _adminClient
}

/** Server-side client with user JWT (in local mode, same client) */
export async function getSupabaseWithAuth(req?: NextRequest) {
  return getSupabaseAnon()
}

// Legacy compatibility
export const getSupabase = getSupabaseAnon
export function isAdminAvailable(): boolean {
  return true
}

// ============================================================
// API Key Resolution
// ============================================================
export async function resolveUserId(apiKey: string): Promise<string | null> {
  if (!apiKey || !apiKey.startsWith('rise_')) return null
  try {
    const key = await db.userApiKey.findUnique({ where: { key: apiKey } })
    if (key?.userId) {
      await db.userApiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      })
      return key.userId
    }
  } catch (err) {
    console.error('[resolveUserId] error:', err)
  }
  return null
}

// ============================================================
// Default User Helper (local mode — single user)
// ============================================================
export async function getDefaultUser() {
  let user = await db.user.findFirst({ where: { isDefault: true } })
  if (!user) {
    user = await db.user.create({
      data: {
        name: 'صانع الحياة',
        email: 'default@riseos.local',
        isDefault: true,
        settings: { create: {} },
        storage: { create: { email: 'default@riseos.local', name: 'صانع الحياة' } },
      },
    })
  }
  return user
}

// ============================================================
// Error Handling
// ============================================================
export function handleRouteError(error: unknown, route: string, hasToken = false): NextResponse {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[${route}] error:`, msg)
  return NextResponse.json(
    { success: false, error: 'حدث خطأ في الخادم' },
    { status: 500 }
  )
}

// ============================================================
// ZhipuAI JWT Token (kept from original)
// ============================================================
export function generateZhipuToken(): string {
  const apiKey = process.env.BIGMODEL_API_KEY || ''
  const [id, secret] = apiKey.split('.')
  if (!id || !secret) return apiKey

  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp, timestamp: now })).toString('base64url')

  const signInput = header + '.' + payload
  const signature = crypto.createHmac('sha256', secret).update(signInput).digest('base64url')

  return signInput + '.' + signature
}
