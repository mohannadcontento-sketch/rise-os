import { db } from '@/lib/db'

// ============================================================
// Mock Supabase Client (local development mode)
// ------------------------------------------------------------
// Mimics the Supabase JS query-builder API so data.ts works
// unchanged in local mode (Prisma+SQLite). NOT for production —
// single-user only, no RLS enforcement.
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

  constructor(table: string) { this.table = table }
  select(cols: string = '*') { this.operation = 'select'; this.selectCols = cols; return this }
  insert(data: any) { this.operation = 'insert'; this.insertData = data; return this }
  update(data: any) { this.operation = 'update'; this.updateData = data; return this }
  delete() { this.operation = 'delete'; return this }
  eq(col: string, val: any) { this.filters.push({ col, op: 'eq', val }); return this }
  neq(col: string, val: any) { this.filters.push({ col, op: 'neq', val }); return this }
  in(col: string, vals: any[]) { this.filters.push({ col, op: 'in', val: vals }); return this }
  gte(col: string, val: any) { this.filters.push({ col, op: 'gte', val }); return this }
  lte(col: string, val: any) { this.filters.push({ col, op: 'lte', val }); return this }
  gt(col: string, val: any) { this.filters.push({ col, op: 'gt', val }); return this }
  lt(col: string, val: any) { this.filters.push({ col, op: 'lt', val }); return this }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending ?? true }); return this
  }
  limit(n: number) { this.limitN = n; return this }
  single() { this.singleMode = 'single'; return this.execute() }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this.execute() }

  private buildWhere(): any {
    const where: Record<string, any> = {}
    for (const f of this.filters) {
      const c = toCamelKey(f.col)
      if (f.op === 'eq') where[c] = f.val
      else if (f.op === 'neq') where[c] = { not: f.val }
      else if (f.op === 'in') where[c] = { in: f.val }
      else if (f.op === 'gte') where[c] = { gte: f.val }
      else if (f.op === 'lte') where[c] = { lte: f.val }
      else if (f.op === 'gt') where[c] = { gt: f.val }
      else if (f.op === 'lt') where[c] = { lt: f.val }
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
        let rows: any[] = await model.findMany({ where, orderBy, take })
        if (this.selectCols && this.selectCols !== '*') {
          const cols = this.selectCols.split(',').map((c) => c.trim())
          rows = rows.map((r: any) => {
            const out: Record<string, any> = {}
            for (const c of cols) out[c] = r[toCamelKey(c)]
            return out
          })
        }
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
        if (camelRows.length === 1) {
          const created = await model.create({ data: camelRows[0] })
          return { data: toSnake(created), error: null }
        }
        await model.createMany({ data: camelRows })
        if (this.selectCols) {
          const all = await model.findMany({ where })
          return { data: toSnake(all), error: null }
        }
        return { data: null, error: null }
      }
      if (this.operation === 'update') {
        const camelData = toCamel(this.updateData)
        if (this.singleMode === 'single' || this.singleMode === 'maybeSingle') {
          const existing = await model.findFirst({ where })
          if (!existing && this.singleMode === 'single') return { data: null, error: { message: 'No rows found', code: '', status: 0 } }
          if (!existing) return { data: null, error: null }
          const updated = await model.update({ where: { id: existing.id }, data: camelData })
          return { data: toSnake(updated), error: null }
        }
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
      return { data: null, error: { message: 'No operation', code: '', status: 0 } }
    } catch (err) {
      console.error(`[mock-client] ${this.table}.${this.operation} error:`, err)
      return { data: null, error: { message: err instanceof Error ? err.message : 'DB error', code: '', status: 0 } }
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any)
  }
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<any> {
    return this.execute().catch(onrejected as any)
  }
}

class MockSupabaseClient {
  from(table: string) { return new MockQueryBuilder(table) }
  auth = {
    async signInWithPassword({ email }: { email: string; password: string }): Promise<any> {
      const user = await (db as any).user.findFirst({ where: { email } })
      if (!user) return { data: { user: null, session: null }, error: { message: 'Invalid credentials', code: '', status: 0 } }
      const ts = Date.now()
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: { name: user.name }, aud: 'authenticated', role: 'authenticated', app_metadata: {}, identities: [] },
          session: {
            access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`,
            refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`,
            expires_at: Math.floor(ts / 1000) + 3600,
          },
        },
        error: null,
      }
    },
    async signUp({ email, data: meta, options }: any): Promise<any> {
      const userData = meta || options?.data
      const existing = await (db as any).user.findFirst({ where: { email } })
      if (existing) return { data: { user: null, session: null }, error: { message: 'User already exists', code: '', status: 0 } }
      const user = await (db as any).user.create({
        data: { email, name: userData?.name || email.split('@')[0], isDefault: false, settings: { create: {} }, storage: { create: { email, name: userData?.name || email.split('@')[0] } } },
      })
      const ts = Date.now()
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: { name: user.name }, aud: 'authenticated', role: 'authenticated', app_metadata: {}, identities: [] },
          session: { access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`, refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`, expires_at: Math.floor(ts / 1000) + 3600 },
        },
        error: null,
      }
    },
    async getUser(token: string): Promise<any> {
      const match = token.match(/^local\.(.+?)\.\d+\.risecos\.local/)
      if (!match) return { data: { user: null }, error: { message: 'Invalid token', code: '', status: 0 } }
      const user = await (db as any).user.findUnique({ where: { id: match[1] } })
      if (!user) return { data: { user: null }, error: { message: 'User not found', code: '', status: 0 } }
      return { data: { user: { id: user.id, email: user.email, user_metadata: { name: user.name }, aud: 'authenticated', role: 'authenticated', app_metadata: {}, identities: [] } }, error: null }
    },
    async refreshSession({ refresh_token }: { refresh_token: string }): Promise<any> {
      const match = refresh_token.match(/^local\.refresh\.(.+?)\.\d+\.risecos\.local/)
      if (!match) return { data: { user: null, session: null }, error: { message: 'Invalid refresh token', code: '', status: 0 } }
      const user = await (db as any).user.findUnique({ where: { id: match[1] } })
      if (!user) return { data: { user: null, session: null }, error: { message: 'User not found', code: '', status: 0 } }
      const ts = Date.now()
      return { data: { user: { id: user.id, email: user.email }, session: { access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`, refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`, expires_at: Math.floor(ts / 1000) + 3600 } }, error: null }
    },
    async resend(): Promise<any> { return { data: {}, error: null } },
    async signOut(): Promise<any> { return { error: null } },
  }
}

let _mockClient: MockSupabaseClient | null = null

/** Create/get a mock Supabase client backed by Prisma+SQLite (local dev). */
export function createMockClient(): MockSupabaseClient {
  if (!_mockClient) _mockClient = new MockSupabaseClient()
  return _mockClient
}
