import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireUser } from '@/lib/api-auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic v2 (Task 27-c) — REMOVE after root cause found.
// Replicates withIdempotency EXACTLY, two variants:
//   ?variant=a → full pattern INCLUDING response.clone().text() (suspect)
//   ?variant=b → same WITHOUT the clone-read (control)
const DIAG_TOKEN = 'diag-27c-6f4b2e91a7d84c0f'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') || 'a'

  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  let body: any = null
  try { body = await req.json() } catch {}
  if (body?.token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'bad token' }, { status: 403 })
  }

  const steps: string[] = []
  steps.push(`variant=${variant}`)

  // 1. fingerprint (mimic requestFingerprint: clone + read body text)
  let bodyText = ''
  try {
    bodyText = await req.clone().text()
    steps.push('fingerprint-clone-read: ok')
  } catch (e: any) {
    steps.push(`fingerprint-clone-read THROW: ${e?.message}`)
  }

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ steps, error: 'no admin' }, { status: 200 })
  steps.push('admin: ok')

  const now = new Date()
  const nowIso = now.toISOString()
  const processingToken = crypto.randomBytes(24).toString('hex')
  const key = `diag2-${variant}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const row = {
    user_id: userId,
    idempotency_key: key,
    request_hash: 'diag2-hash',
    route: '/diag2',
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
    steps.push(`insert: ${error ? 'ERR ' + error.message : 'ok'}`)
    insertedId = data?.id || null
  } catch (e: any) {
    steps.push(`insert THROW: ${e?.message}`)
  }

  // 2. handler (like real routes)
  const response = NextResponse.json({ ok: true, variant, bodyLen: bodyText.length })
  steps.push('handler-response: created')

  // 3. completeIdempotency pattern
  if (variant === 'a') {
    try {
      const text = await response.clone().text()
      steps.push(`clone-read: ok len=${text.length}`)
      if (insertedId) {
        await admin.from('request_idempotency').update({
          status: 'completed', response_status: 200, response_body: text,
          response_headers: {}, updated_at: new Date().toISOString(), processing_until: null,
        }).eq('id', insertedId)
        steps.push('store-response: ok')
      }
    } catch (e: any) {
      steps.push(`clone-read THROW: ${e?.message}`)
    }
  } else if (insertedId) {
    await admin.from('request_idempotency').update({
      status: 'completed', response_status: 200, response_body: '',
      response_headers: {}, updated_at: new Date().toISOString(), processing_until: null,
    }).eq('id', insertedId)
    steps.push('store-response(no-clone): ok')
  }

  // cleanup diag row
  if (insertedId) {
    await admin.from('request_idempotency').delete().eq('id', insertedId)
  }

  steps.push('returning-response')
  return response
}
