import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { setCurrentAuthToken, getRequestAuthTokenDirect } from '@/lib/diag-token'
import { isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v4 (Task 27-c) — REMOVE after root cause found.
const DIAG_TOKEN = 'diag-27c-6f4b2e91a7d84c0f'

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  let body: any = null
  try { body = await req.json() } catch {}
  if (body?.token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'bad token' }, { status: 403 })
  }

  const steps: Record<string, any> = {}

  // 1. token extraction via the SAME path the data layer uses
  setCurrentAuthToken(req)
  const tk = getRequestAuthTokenDirect()
  steps.tokenExtracted = tk ? `len=${tk.length} prefix=${tk.slice(0, 10)}` : 'UNDEFINED'
  steps.looksLikeJwt = tk ? (tk.startsWith('eyJ') && tk.split('.').length === 3 ? 'yes' : `no (${tk.split('.').length} parts)`) : '-'

  // 2. decode JWT payload
  if (tk && tk.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(tk.split('.')[1], 'base64url').toString('utf8'))
      steps.jwtPayload = { role: payload.role, sub: payload.sub, exp: payload.exp, email: payload.email }
      steps.jwtSubMatchesUser = payload.sub === userId
    } catch (e: any) {
      steps.jwtPayload = `decode FAIL: ${e?.message}`
    }
  }

  // 3. manual client test: same pattern as sb()
  if (tk && isSupabaseConfigured()) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    steps.envVars = `url=${SUPABASE_URL ? 'set' : 'MISSING'} anonKey=${SUPABASE_ANON_KEY ? 'set len=' + SUPABASE_ANON_KEY.length : 'MISSING'}`
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const { createClient } = await import('@supabase/supabase-js')
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${tk}` } },
      })
      // 3a. whoami via auth
      try {
        const { data, error } = await client.auth.getUser()
        steps.clientGetUser = error ? `ERR ${error.message}` : `ok user=${data.user?.id}`
      } catch (e: any) { steps.clientGetUser = `THROW ${e?.message}` }
      // 3b. insert morning_logs (RLS test)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
      try {
        const { error } = await client.from('morning_logs').upsert(
          { user_id: userId, date: today, score: 40, total_items: 1, completed_items: 0 },
          { onConflict: 'user_id,date' }
        )
        steps.clientMorningUpsert = error ? `ERR ${error.code}: ${error.message}` : 'ok'
      } catch (e: any) { steps.clientMorningUpsert = `THROW ${e?.message}` }
      // 3c. rpc test
      try {
        const { error } = await client.rpc('create_task_with_subtasks', {
          p_user_id: userId,
          p_task: { title: `diag v4 ${Date.now()}`, status: 'todo', priority: 'medium' },
          p_subtasks: [],
        })
        steps.clientRpcCreateTask = error ? `ERR ${error.code}: ${error.message}` : 'ok'
      } catch (e: any) { steps.clientRpcCreateTask = `THROW ${e?.message}` }
      // 3d. plain insert into tasks (no RPC — RLS path)
      try {
        const { data, error } = await client.from('tasks').insert({ user_id: userId, title: `diag v4 plain ${Date.now()}`, status: 'todo' }).select('id').single()
        steps.clientPlainTaskInsert = error ? `ERR ${error.code}: ${error.message}` : `ok id=${data?.id}`
        if (data?.id) await client.from('tasks').delete().eq('id', data.id)
      } catch (e: any) { steps.clientPlainTaskInsert = `THROW ${e?.message}` }
    }
  }

  return NextResponse.json({ steps, userId }, { status: 200 })
}
