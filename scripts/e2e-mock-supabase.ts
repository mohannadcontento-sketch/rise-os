// ============================================================
// Mock Supabase auth server for the local E2E recovery-flow test.
// Implements just enough of /auth/v1 to exercise our routes:
//   POST /auth/v1/recover               — records the code_challenge
//   POST /auth/v1/token?grant_type=pkce — REAL SHA-256 PKCE check
//   GET  /auth/v1/user                  — resolve Bearer JWT → user
//   PATCH /auth/v1/user                 — password update
// Run: bun scripts/e2e-mock-supabase.ts (port 5999)
// ============================================================

import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT || 5999)

const USER = {
  id: 'e2e-user-0000-0000-0000-000000000001',
  email: 'e2e-owner@example.com',
}

const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url')

function mintAccessToken(): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: USER.id,
    email: USER.email,
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.${b64url({ sig: 'mock-signature' })}`
}

function userPayload(extra: Record<string, unknown> = {}) {
  return {
    id: USER.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: USER.email,
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'مالك أوج' },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
    ...extra,
  }
}

// Recorded PKCE challenges (what /recover received).
const challenges: string[] = []
let lastAccessToken = mintAccessToken()
let passwordUpdates = 0

function json(res: any, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

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

    // ── recover (the request our /api/auth/reset-password sends) ──
    if (req.method === 'POST' && url.pathname === '/auth/v1/recover') {
      if (body.code_challenge) challenges.push(String(body.code_challenge))
      console.log(`[mock] /recover  email=${body.email} challenge=…${String(body.code_challenge).slice(-12)} (total ${challenges.length})`)
      return json(res, 200, {})
    }

    // ── pkce exchange (the call our /auth/callback makes) ──
    if (req.method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const verifier = String(body.code_verifier || '')
      const computed = createHash('sha256').update(verifier).digest('base64url')
      const ok = challenges.includes(computed)
      console.log(`[mock] /token pkce auth_code=${body.auth_code} verifier_ok=${ok}`)
      if (!ok) {
        return json(res, 400, { code: 400, error_code: 'bad_code_verifier', msg: 'Invalid PKCE code verifier' })
      }
      lastAccessToken = mintAccessToken()
      return json(res, 200, {
        access_token: lastAccessToken,
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: userPayload(),
      })
    }

    // ── user resolution (verifySupabaseToken → getUserId) ──
    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      const sub = subFromBearer(req)
      console.log(`[mock] GET /user sub=${sub}`)
      if (sub !== USER.id) return json(res, 401, { code: 401, msg: 'Invalid token' })
      return json(res, 200, userPayload())
    }

    // ── password update (auth.updateUser → PUT /auth/v1/user) ──
    if ((req.method === 'PUT' || req.method === 'PATCH') && (url.pathname === '/auth/v1/user' || url.pathname === '/auth/v1/user/')) {
      if (subFromBearer(req) !== USER.id) return json(res, 401, { code: 401, msg: 'Invalid token' })
      if (typeof body.password === 'string' && body.password.length >= 8) {
        passwordUpdates++
        console.log(`[mock] PATCH /user password update #${passwordUpdates} (len ${body.password.length})`)
        return json(res, 200, userPayload({ updated_at: new Date().toISOString() }))
      }
      return json(res, 422, { code: 422, msg: 'Password should be at least 8 characters' })
    }

    return json(res, 404, { error: 'not found', path: url.pathname })
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[mock] supabase-auth stub listening on http://127.0.0.1:${PORT}`)
})
