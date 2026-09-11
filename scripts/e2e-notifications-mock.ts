// ============================================================
// Mock Supabase REST+auth server for the local E2E notifications
// test (Phase 5). Implements just enough of PostgREST:
//   GET  /auth/v1/user                                  — resolve Bearer JWT
//   POST /rest/v1/rpc/notify_user                       — REAL dedup logic
//   POST /rest/v1/rpc/get_notifications_feed            — filters + purge + count
//   POST /rest/v1/rpc/mark_all_notifications_read       — atomic mark-all
//   POST /rest/v1/rpc/notifications_unread_count        — badge count
//   POST /rest/v1/rpc/consume_usage                     — counters + emits usage notifications (SQL mirror)
//   POST /rest/v1/rpc/admin_apply_recovery_email_template — applied:true stub
//   POST/GET/PUT/DELETE /rest/v1/notifications          — table paths (legacy + POST route)
// Run: bun scripts/e2e-notifications-mock.ts (port 5997)
// ============================================================

import { createServer } from 'node:http'

const PORT = Number(process.env.NOTIF_MOCK_PORT || 5997)

const USER = {
  id: 'e2e-user-0000-0000-0000-000000000001',
  email: 'e2e-owner@example.com',
}

const ADMIN = {
  id: 'e2e-admin-0000-0000-0000-000000000002',
  email: 'e2e-admin@example.com',
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
export const serviceToken = mintAccessToken(ADMIN.id, ADMIN.email, 'service_role')

interface Row {
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
  created_at: string
}

const VALID_TYPES = new Set([
  'info', 'success', 'warning', 'error', 'achievement', 'reminder', 'system',
  'subscription', 'usage', 'community', 'mention', 'background',
])

const notifications: Row[] = []
const idemRows: any[] = []
let seq = 0
function nextId(): string {
  seq++
  return `e2e-notif-0000-0000-0000-${String(seq).padStart(12, '0')}`
}

function bearerPayload(req: any): { sub?: string; role?: string } {
  const auth = req.headers['authorization'] || ''
  const token = String(auth).replace(/^Bearer\s+/i, '')
  // خدمة service-role: المفتاح ليس JWT — مثل Supabase تمامًا
  // (client الأدمن يرسل مفتاح الخدمة في Authorization)
  if (token.startsWith('test-service-role')) {
    return { role: 'service_role' }
  }
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString())
  } catch {
    return {}
  }
}

// ── notify_user (mirror of migration 026 SQL) ──
function notifyUser(body: any): string | null {
  const caller = bearerPayload(reqCaller)
  const isService = caller.role === 'service_role'
  const self = caller.sub === body.p_user_id
  if (!isService && !self) throw { code: 403, message: 'forbidden' }

  const type = String(body.p_type || 'info')
  if (!VALID_TYPES.has(type)) throw { code: 400, message: `type ${type} violates check` }

  const dedupKey = body.p_dedup_key ?? null
  if (dedupKey) {
    const exists = notifications.some(
      (n) => n.user_id === body.p_user_id && n.dedup_key === dedupKey
    )
    if (exists) return null // deduplicated
  }

  const row: Row = {
    id: nextId(),
    user_id: body.p_user_id,
    type,
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
    created_at: new Date().toISOString(),
  }
  notifications.push(row)
  return row.id
}

// track the current request's caller for notifyUser's auth check
let reqCaller: any = {}

// ── get_notifications_feed (mirror) ──
const ACCOUNT_TYPES = ['subscription', 'usage', 'system', 'background']
const ACTIVITY_TYPES = ['community', 'mention', 'achievement', 'success', 'reminder', 'info', 'warning', 'error']

function feed(body: any) {
  const sub = bearerPayload(reqCaller).sub
  const limit = Math.min(Math.max(Number(body.p_limit ?? 50) || 50, 1), 100)
  const filter = String(body.p_filter || 'all')
  const unreadOnly = body.p_unread_only === true

  // (أ) purge expired
  const now = Date.now()
  let purged = 0
  for (let i = notifications.length - 1; i >= 0; i--) {
    const n = notifications[i]
    if (n.user_id === sub && n.expires_at && new Date(n.expires_at).getTime() < now) {
      notifications.splice(i, 1)
      purged++
    }
  }

  // (ب) unread count
  const unreadCount = notifications.filter(
    (n) => n.user_id === sub && !n.read && (!n.expires_at || new Date(n.expires_at).getTime() >= now)
  ).length

  // (ج) filter
  const alive = notifications.filter((n) => n.user_id === sub)
  let rows = alive
  if (unreadOnly || filter === 'unread') rows = rows.filter((n) => !n.read)
  else if (filter === 'high') rows = rows.filter((n) => n.priority === 'high')
  else if (filter === 'account') rows = rows.filter((n) => ACCOUNT_TYPES.includes(n.type))
  else if (filter === 'activity') rows = rows.filter((n) => ACTIVITY_TYPES.includes(n.type))
  rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)

  return { notifications: rows, unreadCount, purged }
}

// ── mark_all / unread_count ──
function markAll(): number {
  const sub = bearerPayload(reqCaller).sub
  let count = 0
  for (const n of notifications) {
    if (n.user_id === sub && !n.read) {
      n.read = true
      n.read_at = new Date().toISOString()
      count++
    }
  }
  return count
}

function unreadCount(): number {
  const sub = bearerPayload(reqCaller).sub
  const now = Date.now()
  return notifications.filter(
    (n) => n.user_id === sub && !n.read && (!n.expires_at || new Date(n.expires_at).getTime() >= now)
  ).length
}

// ── consume_usage (mirror of migration 026 — with notifications) ──
const LIMITS: Record<string, { enabled: boolean; daily: number | null; monthly: number | null; label: string }> = {
  'export.data': { enabled: true, daily: 3, monthly: null, label: 'تصدير البيانات' },
  'ai.action': { enabled: true, daily: 5, monthly: 60, label: 'الذكاء الاصطناعي' },
  'mcp.key': { enabled: false, daily: null, monthly: null, label: 'MCP' },
}

const usageDaily = new Map<string, number>()
const usageMonthly = new Map<string, number>()
const now = new Date()
const today = now.toISOString().slice(0, 10)
const month = today.slice(0, 8) + '01'
const resetDailyAt = new Date(now.getTime() + 864e5).toISOString()
const resetMonthlyAt = new Date(now.getTime() + 30 * 864e5).toISOString()

function emitUsage(n: {
  title: string
  body: string
  icon: string
  priority: 'normal' | 'high'
  dedupKey: string
  metadata: Record<string, unknown>
}) {
  const exists = notifications.some((r) => r.user_id === USER.id && r.dedup_key === n.dedupKey)
  if (exists) return
  notifications.push({
    id: nextId(),
    user_id: USER.id,
    type: 'usage',
    title: n.title,
    body: n.body,
    icon: n.icon,
    action_url: 'settings',
    metadata: n.metadata,
    priority: n.priority,
    expires_at: null,
    read: false,
    read_at: null,
    dedup_key: n.dedupKey,
    created_at: new Date().toISOString(),
  })
}

function consumeUsage(feature: string) {
  const caller = bearerPayload(reqCaller)
  const sub = caller.sub || USER.id
  const ent = LIMITS[feature]
  if (!ent || !ent.enabled) {
    emitUsage({
      title: `«${ent?.label || feature}» غير متاحة في خطتك`,
      body: 'هذه الميزة متاحة في خطة أعلى. رقِّ خطتك من الإعدادات ← الخطة والاشتراك لتفعيلها.',
      icon: '🔒',
      priority: 'high',
      dedupKey: `usage-ent:${feature}:${today}`,
      metadata: { feature, reason: 'not_entitled', plan: 'free' },
    })
    return { allowed: false, reason: 'not_entitled', feature, plan: 'free' }
  }

  const dk = `${sub}|${today}|${feature}`
  const mk = `${sub}|${month}|${feature}`
  const ud = usageDaily.get(dk) || 0
  const um = usageMonthly.get(mk) || 0

  if (ent.daily !== null && ud >= ent.daily) {
    emitUsage({
      title: `وصلت للحد اليومي من «${ent.label}»`,
      body: `استخدمت ${ud} من ${ent.daily} اليوم. يتجدد غدًا بعد منتصف الليل (توقيت القاهرة) — أو رقِّ خطتك الآن لحدود أعلى.`,
      icon: '📊',
      priority: 'high',
      dedupKey: `usage-daily:${feature}:${today}`,
      metadata: { feature, reason: 'daily_limit', plan: 'free', usedDaily: ud, limitDaily: ent.daily },
    })
    return {
      allowed: false, reason: 'daily_limit', feature, plan: 'free',
      usedDaily: ud, limitDaily: ent.daily, usedMonthly: um, limitMonthly: ent.monthly,
      resetDailyAt, resetMonthlyAt,
    }
  }

  if (ent.monthly !== null && um >= ent.monthly) {
    emitUsage({
      title: `وصلت للحد الشهري من «${ent.label}»`,
      body: `استخدمت ${um} من ${ent.monthly} هذا الشهر. يتجدد مع بداية الشهر — أو رقِّ خطتك الآن.`,
      icon: '📊',
      priority: 'high',
      dedupKey: `usage-monthly:${feature}:${month}`,
      metadata: { feature, reason: 'monthly_limit', plan: 'free', usedMonthly: um, limitMonthly: ent.monthly },
    })
    return {
      allowed: false, reason: 'monthly_limit', feature, plan: 'free',
      usedDaily: ud, limitDaily: ent.daily, usedMonthly: um, limitMonthly: ent.monthly,
      resetDailyAt, resetMonthlyAt,
    }
  }

  usageDaily.set(dk, ud + 1)
  usageMonthly.set(mk, um + 1)

  // near-limit: 80% daily / 90% monthly — once per period
  if (ent.daily !== null && ud + 1 >= Math.ceil(0.8 * ent.daily) && ud + 1 < ent.daily) {
    emitUsage({
      title: `اقتربت من حدك اليومي — «${ent.label}»`,
      body: `استخدمت ${ud + 1} من ${ent.daily} اليوم. يمكنك الترقية في أي وقت لرفع السقف.`,
      icon: '📈',
      priority: 'normal',
      dedupKey: `usage-near-d:${feature}:${today}`,
      metadata: { feature, reason: 'near_daily', plan: 'free', usedDaily: ud + 1, limitDaily: ent.daily },
    })
  }
  if (ent.monthly !== null && um + 1 >= Math.ceil(0.9 * ent.monthly) && um + 1 < ent.monthly) {
    emitUsage({
      title: `اقتربت من حدك الشهري — «${ent.label}»`,
      body: `استخدمت ${um + 1} من ${ent.monthly} هذا الشهر. تجد لوحة الاستخدام في الإعدادات ← الخطة والاشتراك.`,
      icon: '📈',
      priority: 'normal',
      dedupKey: `usage-near-m:${feature}:${month}`,
      metadata: { feature, reason: 'near_monthly', plan: 'free', usedMonthly: um + 1, limitMonthly: ent.monthly },
    })
  }

  return {
    allowed: true, feature, plan: 'free',
    usedDaily: ud + 1, limitDaily: ent.daily,
    usedMonthly: um + 1, limitMonthly: ent.monthly,
    resetDailyAt, resetMonthlyAt,
  }
}

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
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/notify_user') {
      try {
        return json(res, 200, notifyUser(body))
      } catch (e: any) {
        return json(res, 400, { code: e.code || 400, message: e.message || 'error' })
      }
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_notifications_feed') {
      return json(res, 200, feed(body))
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/mark_all_notifications_read') {
      return json(res, 200, markAll())
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/notifications_unread_count') {
      return json(res, 200, unreadCount())
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/consume_usage') {
      return json(res, 200, consumeUsage(String(body.p_feature_key || '')))
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/admin_apply_recovery_email_template') {
      const p = bearerPayload(req)
      if (p.role !== 'service_role') return json(res, 403, { message: 'forbidden' })
      const content = String(body.p_content || '')
      if (!content.includes('{{ .ConfirmationURL }}')) {
        return json(res, 400, { message: 'missing_confirmation_url' })
      }
      return json(res, 200, {
        applied: true, reason: 'updated',
        contentLength: content.length, subjectSet: !!body.p_subject,
      })
    }

    // ── notifications table (legacy POST route + fallbacks) ──
    if (url.pathname === '/rest/v1/notifications') {
      const sub = bearerPayload(req).sub
      if (req.method === 'POST') {
        const type = String(body.type || 'info')
        if (!VALID_TYPES.has(type)) {
          return json(res, 400, { code: '23505', message: `type ${type} violates notifications_type_v2_check` })
        }
        const row: Row = {
          id: nextId(),
          user_id: body.user_id || sub,
          type,
          title: String(body.title || '').slice(0, 200),
          body: body.body ?? null,
          icon: body.icon ?? null,
          action_url: body.action_url || null,
          metadata: body.metadata ?? {},
          priority: body.priority === 'high' ? 'high' : 'normal',
          expires_at: body.expires_at ?? null,
          read: false,
          read_at: null,
          dedup_key: body.dedup_key ?? null,
          created_at: new Date().toISOString(),
        }
        notifications.push(row)
        // .select().single() يرسل Accept object+json → كائن واحد
        const accept = String(req.headers['accept'] || '')
        if (accept.includes('vnd.pgrst.object+json')) return json(res, 201, row)
        return json(res, 201, [row])
      }
      if (req.method === 'GET') {
        const mine = notifications
          .filter((n) => n.user_id === sub)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 50)
        return json(res, 200, mine)
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const rows = body.ids
          ? notifications.filter((n) => n.user_id === sub && body.ids.includes(n.id))
          : notifications.filter((n) => n.user_id === sub)
        for (const n of rows) {
          n.read = body.read ?? true
          if (n.read && !n.read_at) n.read_at = new Date().toISOString()
        }
        return json(res, 200, rows.map((n) => ({ id: n.id })))
      }
      if (req.method === 'DELETE') {
        // PostgREST: .eq('id', x) → ?id=eq.x — .in(...) → ?id=in.(a,b)
        let idFilter = url.searchParams.get('id') || ''
        if (idFilter.startsWith('eq.')) idFilter = idFilter.slice(3)
        if (idFilter.startsWith('in.(') && idFilter.endsWith(')')) {
          const ids = idFilter.slice(4, -1).split(',').map((s) => s.trim())
          for (let i = notifications.length - 1; i >= 0; i--) {
            if (notifications[i].user_id === sub && ids.includes(notifications[i].id)) notifications.splice(i, 1)
          }
          return json(res, 204, '')
        }
        if (idFilter) {
          const idx = notifications.findIndex((n) => n.user_id === sub && n.id === idFilter)
          if (idx >= 0) notifications.splice(idx, 1)
          return json(res, 204, '')
        }
        // لا فلتر id → حذف كل صفوف المستخدم (removeAll semantics)
        let removed = 0
        for (let i = notifications.length - 1; i >= 0; i--) {
          if (notifications[i].user_id === sub) { notifications.splice(i, 1); removed++ }
        }
        return json(res, 204, '')
      }
    }

    // ── request_idempotency (معامل withIdempotency في مسارات الإشعارات) ──
    if (url.pathname === '/rest/v1/request_idempotency') {
      const accept = String(req.headers['accept'] || '')
      const isObject = accept.includes('vnd.pgrst.object+json')
      if (req.method === 'DELETE') return json(res, 204, '')
      if (req.method === 'POST') {
        const row = { ...body, id: body.id || 'idem-1', status: 'processing' }
        idemRows.push(row)
        return json(res, 201, isObject ? row : [row])
      }
      if (req.method === 'GET') {
        // maybeSingle: لا سجلات مطابقة → null
        const hit = url.searchParams.get('idempotency_key')
          ? idemRows.find((r: any) => r.idempotency_key === url.searchParams.get('idempotency_key'))
          : idemRows[0]
        if (isObject) return json(res, 200, hit ?? null)
        return json(res, 200, hit ? [hit] : [])
      }
      if (req.method === 'PATCH' || req.method === 'PUT') {
        return json(res, 200, isObject ? { ...body, id: 'idem-1' } : [{ ...body, id: 'idem-1' }])
      }
    }

    // ── subscription_requests (from the user route) ──
    if (req.method === 'POST' && url.pathname === '/rest/v1/subscription_requests') {
      return json(res, 201, { id: 'req-e2e-notif-1', requested_plan: body.requested_plan, status: 'pending', created_at: new Date().toISOString() })
    }
    if (req.method === 'GET' && url.pathname === '/rest/v1/subscription_requests') {
      return json(res, 200, [])
    }

    // ── generic table GET: empty per Accept ──
    if (req.method === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      const accept = String(req.headers['accept'] || '')
      if (accept.includes('vnd.pgrst.object+json')) {
        if (url.pathname.startsWith('/rest/v1/profiles')) {
          return json(res, 200, { id: sub, suspended: false, role: 'user', name: 'مالك أوج', email: USER.email })
        }
        if (url.pathname.startsWith('/rest/v1/user_subscriptions')) {
          return json(res, 200, { plan: 'free', status: 'active', expires_at: null })
        }
        return json(res, 200, {})
      }
      return json(res, 200, [])
    }

    console.log(`[notif-mock] 404 ${req.method} ${url.pathname}`)
    return json(res, 404, { error: 'not found', path: url.pathname })
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`notifications-mock on :${PORT}`)
  console.log(`access token: ${accessToken}`)
  console.log(`service token: ${serviceToken}`)
})
