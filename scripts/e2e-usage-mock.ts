// ============================================================
// Mock Supabase REST+auth server for the local E2E usage-limits
// test (Phase 4). Implements just enough of PostgREST:
//   GET  /auth/v1/user                        — resolve Bearer JWT
//   POST /rest/v1/rpc/consume_usage           — REAL counter logic
//   POST /rest/v1/rpc/check_entitlement       — plan gating
//   POST /rest/v1/rpc/get_usage_overview      — usage overview
//   POST /rest/v1/subscription_requests       — insert (return=representation)
//   GET  /rest/v1/*                           — [] / {} by Accept
// Run: bun scripts/e2e-usage-mock.ts (port 5998)
// ============================================================

import { createServer } from 'node:http'

const PORT = Number(process.env.USAGE_MOCK_PORT || 5998)

const USER = {
  id: 'e2e-user-0000-0000-0000-000000000001',
  email: 'e2e-owner@example.com',
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

function mintAccessToken(): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: USER.id,
    email: USER.email,
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.${b64url({ sig: 'mock-signature' })}`
}

export const accessToken = mintAccessToken()

function subFromBearer(req: any): string | null {
  const auth = req.headers['authorization'] || ''
  const token = String(auth).replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString())
    return payload?.sub || null
  } catch {
    return null
  }
}

function json(res: any, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

// ── JS mirror of consume_usage (SQL): free plan, export.data 3/day ──
const LIMITS: Record<string, { enabled: boolean; daily: number | null; monthly: number | null }> = {
  'export.data': { enabled: true, daily: 3, monthly: null },
  'ai.action': { enabled: true, daily: 5, monthly: 60 },
  'mcp.key': { enabled: false, daily: null, monthly: null },
}

const usageDaily = new Map<string, number>()
const usageMonthly = new Map<string, number>()

const now = new Date()
const today = now.toISOString().slice(0, 10)
const month = today.slice(0, 8) + '01'
const resetDailyAt = new Date(now.getTime() + 864e5).toISOString()
const resetMonthlyAt = new Date(now.getTime() + 30 * 864e5).toISOString()

function consumeUsage(feature: string) {
  const ent = LIMITS[feature]
  if (!ent || !ent.enabled) {
    return { allowed: false, reason: 'not_entitled', feature, plan: 'free' }
  }
  const dk = `${USER.id}|${today}|${feature}`
  const mk = `${USER.id}|${month}|${feature}`
  const ud = usageDaily.get(dk) || 0
  const um = usageMonthly.get(mk) || 0

  if (ent.daily !== null && ud >= ent.daily) {
    return {
      allowed: false, reason: 'daily_limit', feature, plan: 'free',
      usedDaily: ud, limitDaily: ent.daily, usedMonthly: um, limitMonthly: ent.monthly,
      resetDailyAt, resetMonthlyAt,
    }
  }
  if (ent.monthly !== null && um >= ent.monthly) {
    return {
      allowed: false, reason: 'monthly_limit', feature, plan: 'free',
      usedDaily: ud, limitDaily: ent.daily, usedMonthly: um, limitMonthly: ent.monthly,
      resetDailyAt, resetMonthlyAt,
    }
  }

  usageDaily.set(dk, ud + 1)
  usageMonthly.set(mk, um + 1)
  return {
    allowed: true, feature, plan: 'free',
    usedDaily: ud + 1, limitDaily: ent.daily,
    usedMonthly: um + 1, limitMonthly: ent.monthly,
    resetDailyAt, resetMonthlyAt,
  }
}

function usageOverview() {
  return {
    plan: 'free',
    resetDailyAt: new Date(now.getTime() + 864e5).toISOString(),
    resetMonthlyAt: new Date(now.getTime() + 30 * 864e5).toISOString(),
    features: Object.entries(LIMITS).map(([key, ent]) => ({
      featureKey: key,
      enabled: ent.enabled,
      limitDaily: ent.daily,
      limitMonthly: ent.monthly,
      usedDaily: usageDaily.get(`${USER.id}|${today}|${key}`) || 0,
      usedMonthly: usageMonthly.get(`${USER.id}|${month}|${key}`) || 0,
    })),
  }
}

let requestLog: string[] = []
const insertedRequests: any[] = []

createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

  let body: any = {}
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    try {
      body = raw ? JSON.parse(raw) : {}
    } catch {
      /* ignore */
    }

    requestLog.push(`${req.method} ${url.pathname}`)

    // ── user resolution (verifySupabaseToken → getUserId) ──
    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      if (subFromBearer(req) !== USER.id) return json(res, 401, { code: 401, msg: 'Invalid token' })
      return json(res, 200, {
        id: USER.id, aud: 'authenticated', role: 'authenticated', email: USER.email,
        email_confirmed_at: new Date().toISOString(), phone: '',
        app_metadata: {}, user_metadata: { name: 'مالك أوج' },
        identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        is_anonymous: false,
      })
    }

    // ── RPCs ──
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/consume_usage') {
      return json(res, 200, consumeUsage(String(body.p_feature_key || '')))
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/check_entitlement') {
      const ent = LIMITS[String(body.p_feature_key || '')]
      return json(res, 200, {
        entitled: !!(ent && ent.enabled), plan: 'free', feature: body.p_feature_key,
      })
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_usage_overview') {
      return json(res, 200, usageOverview())
    }

    // ── subscription_requests insert (from the user route) ──
    if (req.method === 'POST' && url.pathname === '/rest/v1/subscription_requests') {
      insertedRequests.push({
        id: 'req-e2e-0001',
        requested_plan: body.requested_plan,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      return json(res, 201, {
        id: 'req-e2e-0001',
        requested_plan: body.requested_plan,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
    }

    // ── subscription_requests list (user's own) ──
    if (req.method === 'GET' && url.pathname === '/rest/v1/subscription_requests') {
      return json(res, 200, insertedRequests.map((r) => ({
        ...r,
        payment_method: 'instapay',
        reference: '30458122600781',
        note: null,
        reviewed_at: null,
        rejection_reason: null,
      })))
    }

    // ── generic table GET: empty per Accept (profiles needs suspended:false) ──
    if (req.method === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      const accept = String(req.headers['accept'] || '')
      if (accept.includes('vnd.pgrst.object+json')) {
        if (url.pathname.startsWith('/rest/v1/profiles')) {
          return json(res, 200, { id: USER.id, suspended: false, role: 'user', name: 'مالك أوج', email: USER.email })
        }
        if (url.pathname.startsWith('/rest/v1/user_subscriptions')) {
          return json(res, 200, { plan: 'free', status: 'active', expires_at: null })
        }
        return json(res, 200, {})
      }
      return json(res, 200, [])
    }

    // admin routes in this E2E are not the focus — 404 anything else
    console.log(`[usage-mock] 404 ${req.method} ${url.pathname}`)
    return json(res, 404, { error: 'not found', path: url.pathname })
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[usage-mock] supabase REST+auth stub on http://127.0.0.1:${PORT}`)
  console.log(`[usage-mock] access token: ${accessToken}`)
})

export { requestLog }
