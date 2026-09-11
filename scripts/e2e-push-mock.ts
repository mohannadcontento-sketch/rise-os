// ============================================================
// Mock Supabase REST + Push receiver for the Phase-6 Web Push
// E2E test. Two servers:
//
//   1) HTTP  :5998  — PostgREST-compatible REST (auth/user, RPCs,
//                     app_config/push_subscriptions/notifications)
//   2) HTTPS :5999  — REAL push service endpoint receiver with a
//                     self-signed cert. The app's web-push library
//                     POSTs real encrypted payloads here (app runs
//                     with NODE_TLS_REJECT_UNAUTHORIZED=0), so the
//                     E2E exercises the actual send path:
//                     VAPID JWT header + TTL + Urgency + 410/404
//                     revocation handling.
//
// Mirrors migration 028 SQL logic exactly:
//   upsert_push_subscription (validation + 10-device cap + renewal)
//   revoke_push_subscription(_by_id)   — own-only / service_role
//   list_push_subscriptions            — masked origin
//   get/set_notification_preferences   — category defaults
//   notify_user                        — dedup + pushed_at
//   gate_push_for_notification         — prefs + rate caps + claim
//   touch / cleanup_stale              — activity + aging
//
// Driver inspection: GET /state  |  POST /__debug/age-subscription
// Run: bun scripts/e2e-push-mock.ts
// ============================================================

import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { execSync } from 'node:child_process'
import webpushDefault from 'web-push'

const wp: any = (webpushDefault as any).default ?? webpushDefault

const PORT = Number(process.env.PUSH_MOCK_PORT || 5998)
const PUSH_PORT = Number(process.env.PUSH_MOCK_PUSH_PORT || 5999)

const USER = {
  id: 'e2e-user-0000-0000-0000-000000000001',
  email: 'e2e-owner@example.com',
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

function mintAccessToken(sub: string, email: string, role: string): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub,
    email,
    role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.${b64url({ sig: 'mock-signature' })}`
}

export const accessToken = mintAccessToken(USER.id, USER.email, 'authenticated')

// ── VAPID keypair generated fresh for this mock (test-only keys) ──
const vapidKeys = wp.generateVAPIDKeys()

// ── In-memory state (mirror of the production tables) ─────────
interface SubRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  label: string | null
  user_agent: string | null
  created_at: string
  last_push_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
}

interface NotifRow {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  icon: string | null
  action_url: string | null
  metadata: Record<string, unknown>
  priority: string
  expires_at: string | null
  read: boolean
  read_at: string | null
  dedup_key: string | null
  pushed_at: string | null
  created_at: string
}

const subscriptions: SubRow[] = []
const notifications: NotifRow[] = []
const pushLog: Array<{
  device: string
  ttl: string | null
  urgency: string | null
  authorization: string | null
  bodyLength: number
  status: number
  at: string
}> = []

let prefs: Record<string, boolean> = {
  push_enabled: true,
  push_important: true,
  push_security: true,
  push_reminders: true,
  push_community: false,
  push_marketing: false,
}

let seq = 0
function nextId(_prefix: string): string {
  seq++
  // UUID صالح الشكل (zod uuid في مسار DELETE بالمعرّف)
  return `10000000-0000-4000-8000-${String(seq).padStart(12, '0')}`
}

function bearerPayload(req: any): { sub?: string; role?: string } {
  const auth = req.headers['authorization'] || ''
  const token = String(auth).replace(/^Bearer\s+/i, '')
  if (token.startsWith('test-service-role')) return { role: 'service_role' }
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString())
  } catch {
    return {}
  }
}

// ── RPC mirrors (same logic as migration 028) ─────────────────

function upsertPushSubscription(body: any): string {
  const caller = bearerPayload(reqCaller)
  const user = caller.sub
  if (!user) throw { code: 403, message: 'unauthenticated' }
  const endpoint = String(body.p_endpoint || '')
  const p256dh = String(body.p_p256dh || '')
  const auth = String(body.p_auth || '')
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048) {
    throw { code: 400, message: 'invalid_endpoint' }
  }
  if (p256dh.length < 64 || p256dh.length > 160) {
    throw { code: 400, message: 'invalid_p256dh' }
  }
  if (auth.length < 16 || auth.length > 64) {
    throw { code: 400, message: 'invalid_auth' }
  }

  const active = subscriptions.filter((s) => s.user_id === user && !s.revoked_at)
  const existing = subscriptions.find((s) => s.user_id === user && s.endpoint === endpoint)
  if (active.length >= 10 && !existing) throw { code: 400, message: 'device_limit' }

  if (existing) {
    existing.p256dh = p256dh
    existing.auth = auth
    existing.label = body.p_label ?? existing.label
    existing.revoked_at = null
    existing.revoked_reason = null
    return existing.id
  }
  const row: SubRow = {
    id: nextId('e2e-sub'),
    user_id: user,
    endpoint,
    p256dh,
    auth,
    label: body.p_label ?? null,
    user_agent: body.p_ua ?? null,
    created_at: new Date().toISOString(),
    last_push_at: null,
    revoked_at: null,
    revoked_reason: null,
  }
  subscriptions.push(row)
  return row.id
}

function revokeByEndpoint(endpoint: string, reason: string): boolean {
  const caller = bearerPayload(reqCaller)
  const isService = caller.role === 'service_role'
  const row = subscriptions.find(
    (s) => s.endpoint === endpoint && (isService || s.user_id === caller.sub) && !s.revoked_at,
  )
  if (!row) return false
  row.revoked_at = new Date().toISOString()
  row.revoked_reason = reason
  return true
}

function revokeById(id: string, reason: string): boolean {
  const caller = bearerPayload(reqCaller)
  const isService = caller.role === 'service_role'
  const row = subscriptions.find(
    (s) => s.id === id && (isService || s.user_id === caller.sub) && !s.revoked_at,
  )
  if (!row) return false
  row.revoked_at = new Date().toISOString()
  row.revoked_reason = reason
  return true
}

function listSubscriptions() {
  const caller = bearerPayload(reqCaller)
  return subscriptions
    .filter((s) => s.user_id === caller.sub)
    .sort((a, b) => (a.revoked_at ? 1 : 0) - (b.revoked_at ? 1 : 0) || b.created_at.localeCompare(a.created_at))
    .map((s) => ({
      id: s.id,
      label: s.label,
      endpoint_origin: s.endpoint.split('//')[1]?.split('/')[0] ?? '',
      created_at: s.created_at,
      last_push_at: s.last_push_at,
      revoked_at: s.revoked_at,
      revoked_reason: s.revoked_reason,
    }))
}

function getPrefs() {
  return { ...prefs }
}

function setPrefs(body: any) {
  const caller = bearerPayload(reqCaller)
  if (!caller.sub) throw { code: 403, message: 'unauthenticated' }
  const map: Array<[string, unknown]> = [
    ['push_enabled', body.p_enabled],
    ['push_important', body.p_important],
    ['push_security', body.p_security],
    ['push_reminders', body.p_reminders],
    ['push_community', body.p_community],
    ['push_marketing', body.p_marketing],
  ]
  for (const [k, v] of map) if (typeof v === 'boolean') prefs[k] = v
  return { ...prefs }
}

function notifyUser(body: any): string | null {
  const caller = bearerPayload(reqCaller)
  const isService = caller.role === 'service_role'
  const self = caller.sub === body.p_user_id
  if (!isService && !self) throw { code: 403, message: 'forbidden' }

  const dedupKey = body.p_dedup_key ?? null
  if (dedupKey) {
    const exists = notifications.some((n) => n.user_id === body.p_user_id && n.dedup_key === dedupKey)
    if (exists) return null
  }
  const row: NotifRow = {
    id: nextId('e2e-notif'),
    user_id: body.p_user_id,
    type: String(body.p_type || 'info'),
    title: String(body.p_title || '').slice(0, 200),
    body: body.p_body ?? null,
    icon: body.p_icon ?? null,
    action_url: body.p_action_url || null,
    metadata: body.p_metadata ?? {},
    priority: body.p_priority === 'high' ? 'high' : 'normal',
    expires_at: body.p_expires_at ?? null,
    read: false,
    read_at: null,
    dedup_key: dedupKey,
    pushed_at: null,
    created_at: new Date().toISOString(),
  }
  notifications.push(row)
  return row.id
}

function gatePushForNotification(body: any) {
  const caller = bearerPayload(reqCaller)
  if (caller.role !== 'service_role') throw { code: 403, message: 'permission denied for function gate_push_for_notification' }

  const n = notifications.find((r) => r.id === body.p_notification_id)
  if (!n) return { ok: false, reason: 'not_found' }

  const category =
    (n.metadata as Record<string, unknown>)['category'] as string ||
    (n.type === 'community' || n.type === 'mention'
      ? 'community'
      : n.type === 'reminder'
        ? 'reminders'
        : 'important')

  if (!prefs.push_enabled) return { ok: false, reason: 'push_disabled' }
  if (!prefs[`push_${category}`]) return { ok: false, reason: 'category_disabled', category }

  const hourAgo = Date.now() - 3600_000
  const dayAgo = Date.now() - 86400_000
  const hourCount = notifications.filter((r) => r.user_id === n.user_id && r.pushed_at && new Date(r.pushed_at).getTime() > hourAgo).length
  const dayCount = notifications.filter((r) => r.user_id === n.user_id && r.pushed_at && new Date(r.pushed_at).getTime() > dayAgo).length
  if (hourCount >= 10) return { ok: false, reason: 'rate_limited_hour' }
  if (dayCount >= 30) return { ok: false, reason: 'rate_limited_day' }

  if (n.pushed_at) return { ok: false, reason: 'already_pushed' }
  n.pushed_at = new Date().toISOString()

  return {
    ok: true,
    notification_id: n.id,
    user_id: n.user_id,
    category,
    priority: n.priority,
    title: n.title,
    body: n.body,
    icon: n.icon,
    action_url: n.action_url,
  }
}

function touchSubscription(endpoint: string): void {
  const row = subscriptions.find((s) => s.endpoint === endpoint && !s.revoked_at)
  if (row) row.last_push_at = new Date().toISOString()
}

function cleanupStale(days: number): number {
  const cutoff = Date.now() - Math.max(days, 7) * 86400_000
  let count = 0
  for (const s of subscriptions) {
    if (s.revoked_at) continue
    const last = new Date(s.last_push_at || s.created_at).getTime()
    if (last < cutoff) {
      s.revoked_at = new Date().toISOString()
      s.revoked_reason = 'stale'
      count++
    }
  }
  return count
}

// ── HTTP REST server (:5998) ───────────────────────────────────

let reqCaller: any = {}

function json(res: any, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  reqCaller = req

  let body: any = {}
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    try {
      body = raw ? JSON.parse(raw) : {}
    } catch {
      /* ignore */
    }

    // ── driver inspection ──
    if (req.method === 'GET' && url.pathname === '/state') {
      return json(res, 200, {
        subscriptions,
        notifications,
        prefs,
        pushLog,
        vapidPublicKey: vapidKeys.publicKey,
      })
    }
    if (req.method === 'POST' && url.pathname === '/__debug/age-subscription') {
      const row = subscriptions.find((s) => s.endpoint === body.endpoint)
      if (row) {
        row.created_at = new Date(Date.now() - (body.days || 40) * 86400_000).toISOString()
        row.last_push_at = null
      }
      return json(res, 200, { aged: !!row })
    }

    // ── user resolution ──
    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      const p = bearerPayload(req)
      if (!p.sub || p.sub === USER.id) {
        return json(res, 200, {
          id: USER.id, aud: 'authenticated', role: 'authenticated', email: USER.email,
          email_confirmed_at: new Date().toISOString(), phone: '',
          app_metadata: {}, user_metadata: { name: 'مالك أوج' },
          identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          is_anonymous: false,
        })
      }
      return json(res, 401, { code: 401, msg: 'Invalid token' })
    }

    // ── RPCs ──
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (req.method === 'POST' && rpc) {
      const fn = rpc[1]
      try {
        switch (fn) {
          case 'upsert_push_subscription':
            return json(res, 200, upsertPushSubscription(body))
          case 'revoke_push_subscription':
            return json(res, 200, revokeByEndpoint(String(body.p_endpoint || ''), String(body.p_reason || 'user')))
          case 'revoke_push_subscription_by_id':
            return json(res, 200, revokeById(String(body.p_id || ''), String(body.p_reason || 'user')))
          case 'list_push_subscriptions':
            return json(res, 200, listSubscriptions())
          case 'get_notification_preferences':
            return json(res, 200, getPrefs())
          case 'set_notification_preferences':
            return json(res, 200, setPrefs(body))
          case 'notify_user':
            return json(res, 200, notifyUser(body))
          case 'gate_push_for_notification':
            return json(res, 200, gatePushForNotification(body))
          case 'touch_push_subscription':
            touchSubscription(String(body.p_endpoint || ''))
            return json(res, 200, null)
          case 'cleanup_stale_push_subscriptions':
            return json(res, 200, cleanupStale(Number(body.p_days ?? 30)))
          default:
            return json(res, 404, { code: 404, message: `function ${fn} not found` })
        }
      } catch (e: any) {
        return json(res, e.code || 400, { code: e.code || 400, message: e.message || 'error' })
      }
    }

    // ── tables (PostgREST syntax subset) ──
    if (url.pathname === '/rest/v1/push_subscriptions' && req.method === 'GET') {
      let rows = [...subscriptions]
      const q = url.searchParams
      const userIdEq = q.get('user_id')
      if (userIdEq?.startsWith('eq.')) rows = rows.filter((s) => s.user_id === userIdEq.slice(3))
      const revokedEq = q.get('revoked_at')
      if (revokedEq === 'is.null') rows = rows.filter((s) => !s.revoked_at)
      return json(res, 200, rows)
    }

    if (url.pathname === '/rest/v1/notifications' && req.method === 'GET') {
      let rows = [...notifications]
      const idEq = url.searchParams.get('id')
      if (idEq?.startsWith('eq.')) rows = rows.filter((n) => n.id === idEq.slice(3))
      const accept = String(req.headers['accept'] || '')
      if (accept.includes('vnd.pgrst.object+json')) {
        return json(res, 200, rows[0] ?? null)
      }
      return json(res, 200, rows)
    }

    if (url.pathname === '/rest/v1/app_config' && req.method === 'GET') {
      const inParam = url.searchParams.get('key') || ''
      const keys = inParam
        .replace(/^in\./, '')
        .replace(/[()"']/g, '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
      const rows = [
        { key: 'vapid_public_key', value: vapidKeys.publicKey },
        { key: 'vapid_private_key', value: vapidKeys.privateKey },
        { key: 'vapid_subject', value: 'mailto:awj@awj.life' },
      ].filter((r) => keys.length === 0 || keys.includes(r.key))
      return json(res, 200, rows)
    }

    // ── catch-all: بقية الجداول (profiles للسسبنشن…) ──
    if (url.pathname.startsWith('/rest/v1/') && (req.method === 'GET' || req.method === 'POST')) {
      const sub = bearerPayload(req).sub
      if (url.pathname.startsWith('/rest/v1/profiles')) {
        return json(res, 200, { id: sub, suspended: false, role: 'user', name: 'مالك أوج', email: USER.email })
      }
      const accept = String(req.headers['accept'] || '')
      if (accept.includes('vnd.pgrst.object+json')) {
        return json(res, 200, {})
      }
      return json(res, 200, [])
    }

    return json(res, 404, { code: 404, message: `not found: ${req.method} ${url.pathname}` })
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`push-mock REST listening on http://127.0.0.1:${PORT}`)
})

// ── HTTPS push receiver (:5999) — real web-push target ────────
// self-signed cert generated on the fly via openssl CLI
const CERT = execSync(
  `openssl req -x509 -newkey rsa:2048 -keyout /tmp/e2e-push-mock.key -out /tmp/e2e-push-mock.crt -days 2 -nodes -subj "/CN=127.0.0.1" 2>/dev/null && cat /tmp/e2e-push-mock.crt`,
  { encoding: 'utf8' },
)
const KEY = String(execSync('cat /tmp/e2e-push-mock.key', { encoding: 'utf8' }))

createHttpsServer({ cert: CERT, key: KEY }, (req, res) => {
  const url = new URL(req.url || '/', `https://127.0.0.1:${PUSH_PORT}`)
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const device = url.pathname.split('/').pop() || 'unknown'
    const status = device === 'dead-404' ? 404 : device === 'dead-410' ? 410 : 200
    const entry = {
      device,
      ttl: req.headers['ttl'] ?? null,
      urgency: req.headers['urgency'] ?? null,
      authorization: req.headers['authorization'] ?? null,
      bodyLength: Buffer.byteLength(raw),
      status,
      at: new Date().toISOString(),
    }
    pushLog.push(entry)
    if (status === 404) return json(res, 404, {})
    if (status === 410) return json(res, 410, { gone: true })
    return json(res, 200, { received: true })
  })
}).listen(PUSH_PORT, '127.0.0.1', () => {
  console.log(`push-mock receiver listening on https://127.0.0.1:${PUSH_PORT}`)
})

console.log('access token:', accessToken)
