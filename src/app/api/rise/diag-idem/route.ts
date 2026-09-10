import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { data } from '@/lib/data'
import { setCurrentAuthToken, getRequestAuthTokenDirect } from '@/lib/diag-token'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v8 (Task 27-c) — REMOVE after root cause found.
// variant=:
//  admin-no-auth : NO requireUser -> admin select
//  admin-auth    : requireUser -> admin select
//  admin-insert  : requireUser -> admin INSERT into request_idempotency -> cleanup
//  sb-select     : requireUser -> data.tasks.list (sb JWT SELECT)
//  sb-write      : requireUser -> data.morningLogs.upsert (sb JWT WRITE)
//  sb-select-manual : requireUser -> manual JWT client SELECT
const DIAG_TOKEN = 'diag-27c-6f4b2e91a7d84c0f'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') || 'admin-auth'

  let body: any = null
  try { body = await req.json() } catch {}
  if (body?.token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'bad token' }, { status: 403 })
  }

  const steps: string[] = []
  steps.push(`variant=${variant}`)

  if (variant === 'admin-insert') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const admin = await getSupabaseAdmin()
    const { data, error } = await admin!
      .from('request_idempotency')
      .insert({
        user_id: userId, idempotency_key: `v8-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        request_hash: 'v8', route: '/v8', method: 'POST', status: 'processing',
        response_status: null, response_body: null, response_headers: {},
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        processing_until: new Date(Date.now() + 60000).toISOString(),
        processing_token: 'v8token',
      })
      .select('id')
      .maybeSingle()
    steps.push(`admin insert: ${error ? 'ERR ' + error.message : 'ok id=' + data?.id}`)
    if (data?.id) await admin!.from('request_idempotency').delete().eq('id', data.id)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'sb-select') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const listed = await data.tasks.list(userId)
    steps.push('sb select: ok')
    return NextResponse.json({ steps, count: (listed as any)?.tasks?.length ?? 0 }, { status: 200 })
  }

  if (variant === 'sb-write') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
    const result = await data.morningLogs.upsert(userId, today, { score: 55, totalItems: 1, completedItems: 0 })
    steps.push(`sb write: ok ${JSON.stringify(result).slice(0, 80)}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'sb-select-manual') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const tk = getRequestAuthTokenDirect()
    steps.push(`token=${tk?.length || 'none'}`)
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
      global: { headers: { Authorization: `Bearer ${tk}` } },
    })
    const { data, error } = await client.from('tasks').select('id').limit(1)
    steps.push(`sb manual select: ${error ? 'ERR ' + error.message : 'ok rows=' + (data || []).length}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'admin-no-auth') {
    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ steps, err: 'no admin' }, { status: 200 })
    const { error } = await admin.from('request_idempotency').select('id').limit(1)
    steps.push(`admin select: ${error ? 'ERR ' + error.message : 'ok'}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'admin-auth') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ steps, err: 'no admin' }, { status: 200 })
    const { error } = await admin.from('request_idempotency').select('id').limit(1)
    steps.push(`admin select: ${error ? 'ERR ' + error.message : 'ok'}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'bind-manual') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    setCurrentAuthToken(req)
    steps.push(`token=${getRequestAuthTokenDirect()?.length || 'none'}`)
    const admin = await getSupabaseAdmin()
    const { error } = await admin!.from('request_idempotency').select('id').limit(1)
    steps.push(`admin select: ${error ? 'ERR ' + error.message : 'ok'}`)
    return NextResponse.json({ steps }, { status: 200 })
  }

  if (variant === 'raw-fetch') {
    const userId = await requireUser(req)
    steps.push(`userId=${userId ? 'ok' : 'null'}`)
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    try {
      const r = await fetch(base + '/rest/v1/', {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
        signal: AbortSignal.timeout(10000),
      })
      steps.push(`raw fetch: ${r.status}`)
    } catch (e: any) {
      steps.push(`raw fetch THROW: ${e?.message}`)
    }
    return NextResponse.json({ steps }, { status: 200 })
  }

  return NextResponse.json({ error: 'unknown variant' }, { status: 400 })
}
