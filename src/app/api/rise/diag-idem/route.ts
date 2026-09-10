import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { requireUser } from '@/lib/api-auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic (Task 27-c) — REMOVE after root cause found.
// POST { token } — token must match DIAG_TOKEN below.
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
  try {
    steps.isSupabaseConfigured = isSupabaseConfigured()
  } catch (e: any) {
    steps.isSupabaseConfigured = `THROW: ${e?.message}`
  }

  let admin: any = null
  try {
    admin = await getSupabaseAdmin()
    steps.adminClient = admin ? 'ok' : 'NULL'
  } catch (e: any) {
    steps.adminClient = `THROW: ${e?.message}`
    return NextResponse.json({ steps }, { status: 200 })
  }
  if (!admin) return NextResponse.json({ steps }, { status: 200 })

  // step 1: table reachable?
  try {
    const { data, error } = await admin.from('request_idempotency').select('id').limit(1)
    steps.selectTable = error ? `ERROR ${error.code}: ${error.message}` : `ok rows=${(data || []).length}`
  } catch (e: any) {
    steps.selectTable = `THROW: ${e?.message}`
  }

  // step 2: insert (mimic beginSupabase row)
  const now = new Date()
  const nowIso = now.toISOString()
  const processingToken = crypto.randomBytes(24).toString('hex')
  const key = `diag-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`
  const row = {
    user_id: userId,
    idempotency_key: key,
    request_hash: 'diag-hash',
    route: '/diag',
    method: 'POST',
    status: 'processing',
    response_status: null,
    response_body: null,
    response_headers: {},
    created_at: nowIso,
    updated_at: nowIso,
    expires_at: new Date(now.getTime() + 60000).toISOString(),
    processing_until: new Date(now.getTime() + 60000).toISOString(),
    processing_token: processingToken,
  }
  let insertedId: string | null = null
  try {
    const { data, error } = await admin.from('request_idempotency').insert(row).select('*').maybeSingle()
    steps.insertRow = error ? `ERROR ${error.code}: ${error.message}` : `ok id=${data?.id}`
    insertedId = data?.id || null
  } catch (e: any) {
    steps.insertRow = `THROW: ${e?.message}`
  }

  // step 3: update (mimic completeIdempotency)
  if (insertedId) {
    try {
      const { error } = await admin.from('request_idempotency')
        .update({ status: 'completed', response_status: 200, response_body: '{}', response_headers: {}, updated_at: new Date().toISOString(), processing_until: null })
        .eq('id', insertedId)
      steps.updateRow = error ? `ERROR ${error.code}: ${error.message}` : 'ok'
    } catch (e: any) {
      steps.updateRow = `THROW: ${e?.message}`
    }
    // step 4: cleanup
    try {
      const { error } = await admin.from('request_idempotency').delete().eq('id', insertedId)
      steps.deleteRow = error ? `ERROR ${error.code}: ${error.message}` : 'ok'
    } catch (e: any) {
      steps.deleteRow = `THROW: ${e?.message}`
    }
  }

  return NextResponse.json({ steps, userId }, { status: 200 })
}
