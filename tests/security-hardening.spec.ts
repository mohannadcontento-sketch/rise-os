import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

test.describe('security hardening invariants', () => {
  test('offline queue is user-scoped and encrypted', () => {
    const api = read('src/lib/api-fetch.ts')
    const secure = read('src/lib/secure-offline-db.ts')
    const store = read('src/store/app-store.ts')
    expect(api).toContain("from '@/lib/secure-offline-db'")
    expect(api).toContain('userId: string')
    expect(secure).toContain('AES-GCM')
    expect(secure).toContain('indexedDB.open')
    expect(store).not.toContain('clearOfflineQueue(')
  })

  test('API key creation stores only hash', () => {
    const route = read('src/app/api/rise/mcp/key/route.ts')
    expect(route).toContain('key_hash: keyHash')
    expect(route).not.toContain('key: apiKey')
  })

  test('suspension check fails closed', () => {
    const suspension = read('src/lib/suspension.ts')
    const auth = read('src/lib/auth.ts')
    expect(suspension).toContain('throw error')
    expect(auth).toContain('denying request')
    expect(auth).not.toContain('fail open')
  })

  test('CSRF origin validation exists for state-changing API calls', () => {
    const middleware = read('src/middleware.ts')
    expect(middleware).toContain('isStateChangingMethod')
    expect(middleware).toContain('CSRF_BLOCKED')
  })

  test('MCP server has no module-global auth token', () => {
    const mcp = read('mini-services/mcp-server/index.ts')
    expect(mcp).not.toMatch(/let authToken\s*:/)
    expect(mcp).toContain('interface MCPAuthState')
    expect(mcp).toContain('const state: MCPAuthState')
  })

  test('browser production auth does not persist sessions to localStorage', () => {
    const supabaseClient = read('src/lib/supabase-client.ts')
    const login = read('src/components/rise/login-page.tsx')
    expect(supabaseClient).toContain('persistSession: false')
    expect(login).not.toContain("localStorage.setItem('rise-auth'")
  })

  test('admin query is allowlisted and accepts no raw SQL', () => {
    const route = read('src/app/api/rise/admin/query/route.ts')
    const migration = read('supabase/migrations/017_idempotency_lease_and_admin_fix.sql')
    expect(route).toContain('queryId')
    expect(route).not.toContain('sql:')
    expect(route).not.toContain('exec_sql')
    expect(migration).toContain('unsupported admin query')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.admin_read')
  })

  test('all Rise mutations use server-side idempotency', () => {
    const middleware = read('src/middleware.ts')
    const idempotency = read('src/lib/idempotency.ts')
    expect(middleware).toContain('IDEMPOTENCY_KEY_REQUIRED')
    expect(idempotency).toContain('request_idempotency')
    expect(idempotency).toContain('IDEMPOTENCY_CONFLICT')
  })

  test('secret API-key responses are never replay-persisted', () => {
    const route = read('src/app/api/rise/mcp/key/route.ts')
    expect(route).toContain('persistResponse: false')
  })

  test('critical XP and delete operations are database-atomic', () => {
    const migration = read('supabase/migrations/014_request_idempotency.sql')
    const xp = read('src/app/api/rise/earn-xp/route.ts')
    const wipe = read('src/app/api/rise/delete-all/route.ts')
    expect(migration).toContain('award_xp_atomic')
    expect(migration).toContain('delete_user_data_atomic')
    expect(migration).toContain("'xp_awards'")
    expect(xp).toContain("rpc('award_xp_atomic'")
    expect(wipe).toContain("rpc('delete_user_data_atomic'")
  })

  test('normal user routes use RLS data layer instead of service role', () => {
    const data = read('src/lib/data.ts')
    const budget = read('src/app/api/rise/budgets/route.ts')
    const storage = read('src/app/api/rise/storage/route.ts')
    const profile = read('src/app/api/rise/user/name/route.ts')
    expect(data).toContain('RLS-first')
    expect(budget).not.toContain('getSupabaseAdmin')
    expect(storage).not.toContain('getSupabaseAdmin')
    expect(profile).not.toContain('getSupabaseAdmin')
  })

  test('session4: composite task writes are atomic', () => {
    const data = read('src/lib/data.ts')
    const migration = read('supabase/migrations/016_atomic_composite_mutations.sql')
    expect(data).toContain('create_task_with_subtasks')
    expect(data).toContain('update_task_with_subtasks')
    expect(migration).toContain('create_task_with_subtasks')
    expect(migration).toContain('update_task_with_subtasks')
    expect(migration).toContain('DELETE FROM public.subtasks')
  })

  test('session4: stale idempotency lease cannot be reclaimed twice', () => {
    const idempotency = read('src/lib/idempotency.ts')
    const prisma = read('prisma/schema.prisma')
    const sql = read('supabase/migrations/017_idempotency_lease_and_admin_fix.sql')
    expect(idempotency).toContain('processing_token')
    expect(idempotency).toContain(".lt('processing_until', nowIso)")
    expect(idempotency).toContain(".eq('processing_token', ctx.processingToken)")
    expect(prisma).toContain('processingToken')
    expect(sql).toContain('processing_token')
  })

  test('session4: user UI local storage is scoped to the authenticated user', () => {
    const storage = read('src/lib/user-storage.ts')
    const dashboard = read('src/components/rise/dashboard.tsx')
    expect(storage).toContain('rise-user:${userId}:')
    expect(dashboard).toContain("getUserStorage('rise-favorite-quotes')")
  })
})
