import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/lib/db'

// ============================================================
// Server-side mutation idempotency
// ------------------------------------------------------------
// The client sends Idempotency-Key for every mutation. This module
// stores the request fingerprint + final response server-side so a
// retried request cannot execute the same mutation twice after the
// first successful completion.
//
// IMPORTANT: this is a replay/deduplication layer, not a substitute
// for DB transactions. Critical multi-write transactions are still
// hardened separately.
// ============================================================

const KEY_RE = /^[A-Za-z0-9._:-]{16,200}$/
const PROCESSING_TTL_MS = 10 * 60 * 1000
const RECORD_TTL_MS = 24 * 60 * 60 * 1000

type StoredHeaders = Record<string, string>

export interface IdempotencyContext {
  userId: string
  key: string
  requestHash: string
  route: string
  method: string
  persistResponse: boolean
  processingToken: string
}

type BeginResult =
  | { kind: 'new'; context: IdempotencyContext }
  | { kind: 'replay'; response: NextResponse }
  | { kind: 'conflict'; response: NextResponse }

function badKeyResponse(message = 'Invalid Idempotency-Key'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'INVALID_IDEMPOTENCY_KEY' },
    { status: 400 },
  )
}

function hashRequest(method: string, pathname: string, search: string, body: string): string {
  return crypto
    .createHash('sha256')
    .update(`${method}\n${pathname}\n${search}\n${body}`, 'utf8')
    .digest('hex')
}

async function requestFingerprint(req: NextRequest): Promise<{ key: string; hash: string; route: string; method: string }> {
  const rawKey = req.headers.get('Idempotency-Key')?.trim() || ''
  if (!KEY_RE.test(rawKey)) throw new Error('invalid-key')

  const method = req.method.toUpperCase()
  const url = new URL(req.url)
  const body = await req.clone().text()
  return {
    key: rawKey,
    hash: hashRequest(method, url.pathname, url.search, body),
    route: url.pathname + url.search,
    method,
  }
}

function headersFromRow(raw: unknown): Headers {
  const headers = new Headers()
  if (!raw || typeof raw !== 'object') return headers
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && k.toLowerCase() !== 'set-cookie') headers.set(k, v)
  }
  return headers
}

function responseFromRow(row: any): NextResponse {
  const headers = headersFromRow(row.response_headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', row.response_content_type || 'application/json')
  return new NextResponse(row.response_body ?? '', {
    status: Number(row.response_status || 200),
    headers,
  })
}

function responseSnapshot(response: NextResponse): { status: number; body: string; headers: StoredHeaders } {
  const headers: StoredHeaders = {}
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') headers[key] = value
  })
  return {
    status: response.status,
    body: '',
    headers,
  }
}

async function responseBody(response: NextResponse): Promise<string> {
  return await response.clone().text()
}

async function beginSupabase(userId: string, req: NextRequest, fp: Awaited<ReturnType<typeof requestFingerprint>>, persistResponse: boolean): Promise<BeginResult> {
  const admin = await getSupabaseAdmin()
  if (!admin) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('IDEMPOTENCY_STORE_UNAVAILABLE')
    }
    return beginLocal(userId, fp, persistResponse)
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const processingToken = crypto.randomBytes(24).toString('hex')

  // Clean only the caller's expired records; avoids a heavy global sweep.
  await admin
    .from('request_idempotency')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', nowIso)

  const row = {
    user_id: userId,
    idempotency_key: fp.key,
    request_hash: fp.hash,
    route: fp.route,
    method: fp.method,
    status: 'processing',
    response_status: null,
    response_body: null,
    response_headers: {},
    created_at: nowIso,
    updated_at: nowIso,
    expires_at: new Date(now.getTime() + RECORD_TTL_MS).toISOString(),
    processing_until: new Date(now.getTime() + PROCESSING_TTL_MS).toISOString(),
    processing_token: processingToken,
  }

  const { data: inserted, error: insertError } = await admin
    .from('request_idempotency')
    .insert(row)
    .select('*')
    .maybeSingle()

  if (!insertError && inserted) {
    return { kind: 'new', context: { userId, key: fp.key, requestHash: fp.hash, route: fp.route, method: fp.method, persistResponse, processingToken } }
  }

  const { data: existing, error: fetchError } = await admin
    .from('request_idempotency')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', fp.key)
    .maybeSingle()

  if (fetchError || !existing) throw new Error('IDEMPOTENCY_LOOKUP_FAILED')
  if (existing.request_hash !== fp.hash || existing.route !== fp.route || existing.method !== fp.method) {
    return {
      kind: 'conflict',
      response: NextResponse.json(
        { error: 'Idempotency-Key was already used for a different request', code: 'IDEMPOTENCY_CONFLICT' },
        { status: 409 },
      ),
    }
  }

  if (existing.status === 'completed') {
    if (!persistResponse) {
      return { kind: 'conflict', response: NextResponse.json({ error: 'This request was already completed; the secret response cannot be replayed', code: 'IDEMPOTENCY_REPLAY_UNAVAILABLE' }, { status: 409 }) }
    }
    return { kind: 'replay', response: responseFromRow(existing) }
  }

  const processingUntil = existing.processing_until ? new Date(existing.processing_until).getTime() : 0
  if (processingUntil && processingUntil > Date.now()) {
    return {
      kind: 'conflict',
      response: NextResponse.json(
        { error: 'A request with this Idempotency-Key is already being processed', code: 'IDEMPOTENCY_IN_PROGRESS' },
        { status: 409 },
      ),
    }
  }

  // A previous worker may have crashed. Reclaim the stale lease safely.
  const { data: reclaimed, error: reclaimError } = await admin
    .from('request_idempotency')
    .update({
      status: 'processing',
      updated_at: nowIso,
      processing_until: new Date(now.getTime() + PROCESSING_TTL_MS).toISOString(),
      processing_token: processingToken,
      response_status: null,
      response_body: null,
      response_headers: {},
    })
    .eq('id', existing.id)
    .eq('request_hash', fp.hash)
    .eq('status', 'processing')
    .lt('processing_until', nowIso)
    .select('*')
    .maybeSingle()

  if (reclaimError || !reclaimed) {
    return {
      kind: 'conflict',
      response: NextResponse.json(
        { error: 'Request is temporarily locked for processing', code: 'IDEMPOTENCY_LOCKED' },
        { status: 409 },
      ),
    }
  }

  return { kind: 'new', context: { userId, key: fp.key, requestHash: fp.hash, route: fp.route, method: fp.method, persistResponse, processingToken } }
}

async function beginLocal(userId: string, fp: Awaited<ReturnType<typeof requestFingerprint>>, persistResponse: boolean): Promise<BeginResult> {
  const now = new Date()
  const processingToken = crypto.randomBytes(24).toString('hex')
  await (db as any).requestIdempotency.deleteMany({ where: { userId, expiresAt: { lt: now } } })

  const existing = await (db as any).requestIdempotency.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: fp.key } },
  })

  if (!existing) {
    try {
      await (db as any).requestIdempotency.create({
        data: {
          userId,
          idempotencyKey: fp.key,
          requestHash: fp.hash,
          route: fp.route,
          method: fp.method,
          status: 'processing',
          expiresAt: new Date(now.getTime() + RECORD_TTL_MS),
          processingUntil: new Date(now.getTime() + PROCESSING_TTL_MS),
          processingToken,
        },
      })
      return { kind: 'new', context: { userId, key: fp.key, requestHash: fp.hash, route: fp.route, method: fp.method, persistResponse, processingToken } }
    } catch {
      // Fall through to lookup: another local worker won the race.
    }
  }

  const row = existing || await (db as any).requestIdempotency.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: fp.key } },
  })
  if (!row) throw new Error('IDEMPOTENCY_LOOKUP_FAILED')
  if (row.requestHash !== fp.hash || row.route !== fp.route || row.method !== fp.method) {
    return { kind: 'conflict', response: NextResponse.json({ error: 'Idempotency-Key conflict', code: 'IDEMPOTENCY_CONFLICT' }, { status: 409 }) }
  }
  if (row.status === 'completed') {
    if (!persistResponse) {
      return { kind: 'conflict', response: NextResponse.json({ error: 'This request was already completed; the secret response cannot be replayed', code: 'IDEMPOTENCY_REPLAY_UNAVAILABLE' }, { status: 409 }) }
    }
    return { kind: 'replay', response: responseFromRow({
      response_status: row.responseStatus,
      response_body: row.responseBody,
      response_headers: row.responseHeaders ? JSON.parse(row.responseHeaders) : {},
      response_content_type: 'application/json',
    }) }
  }
  const processingUntil = row.processingUntil ? new Date(row.processingUntil).getTime() : 0
  if (processingUntil > Date.now()) {
    return { kind: 'conflict', response: NextResponse.json({ error: 'Request already processing', code: 'IDEMPOTENCY_IN_PROGRESS' }, { status: 409 }) }
  }

  const reclaimed = await (db as any).requestIdempotency.updateMany({
    where: { id: row.id, status: 'processing', requestHash: fp.hash, processingUntil: { lt: now } },
    data: { status: 'processing', updatedAt: now, processingUntil: new Date(now.getTime() + PROCESSING_TTL_MS), processingToken, responseStatus: null, responseBody: null, responseHeaders: null },
  })
  if (reclaimed.count !== 1) {
    return { kind: 'conflict', response: NextResponse.json({ error: 'Request lock was claimed by another worker', code: 'IDEMPOTENCY_LOCKED' }, { status: 409 }) }
  }
  return { kind: 'new', context: { userId, key: fp.key, requestHash: fp.hash, route: fp.route, method: fp.method, persistResponse, processingToken } }
}

export async function beginIdempotency(userId: string, req: NextRequest, persistResponse = true): Promise<BeginResult> {
  try {
    const fp = await requestFingerprint(req)
    return isSupabaseConfigured() ? beginSupabase(userId, req, fp, persistResponse) : beginLocal(userId, fp, persistResponse)
  } catch (error) {
    if ((error as Error)?.message === 'invalid-key') return { kind: 'conflict', response: badKeyResponse() }
    throw error
  }
}

export async function completeIdempotency(ctx: IdempotencyContext, response: NextResponse): Promise<void> {
  const snapshot = responseSnapshot(response)
  snapshot.body = ctx.persistResponse ? await responseBody(response) : ''
  if (!ctx.persistResponse) {
    // Never persist a response body for one-time secrets (e.g. API key creation).
    // A repeated identical request receives 409 rather than replaying or creating a second secret.
    snapshot.headers = {}
  }

  if (isSupabaseConfigured()) {
    const admin = await getSupabaseAdmin()
    if (!admin) throw new Error('IDEMPOTENCY_STORE_UNAVAILABLE')
    const { error } = await admin
      .from('request_idempotency')
      .update({
        status: 'completed',
        response_status: snapshot.status,
        response_body: snapshot.body,
        response_headers: snapshot.headers,
        updated_at: new Date().toISOString(),
        processing_until: null,
      })
      .eq('user_id', ctx.userId)
      .eq('idempotency_key', ctx.key)
      .eq('request_hash', ctx.requestHash)
      .eq('processing_token', ctx.processingToken)
    if (error) throw error
    return
  }

  const completed = await (db as any).requestIdempotency.updateMany({
    where: { userId: ctx.userId, idempotencyKey: ctx.key, requestHash: ctx.requestHash, processingToken: ctx.processingToken },
    data: {
      status: 'completed',
      responseStatus: snapshot.status,
      responseBody: snapshot.body,
      responseHeaders: JSON.stringify(snapshot.headers),
      updatedAt: new Date(),
      processingUntil: null,
    },
  })
  if (completed.count !== 1) throw new Error('IDEMPOTENCY_COMPLETION_LEASE_LOST')
}

export async function withIdempotency(
  req: NextRequest,
  userId: string,
  handler: () => Promise<NextResponse>,
  options: { persistResponse?: boolean } = {},
): Promise<NextResponse> {
  const persistResponse = options.persistResponse !== false
  const result = await beginIdempotency(userId, req, persistResponse)
  if (result.kind === 'replay' || result.kind === 'conflict') return result.response

  const response = await handler()
  // Record all deterministic API responses, including validation/authorization
  // failures, but never allow persistence of Set-Cookie headers.
  await completeIdempotency(result.context, response)
  return response
}
