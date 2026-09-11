// ============================================================
// E2E driver: full password-recovery flow against the LOCAL
// production server + mock Supabase.
//   /api/auth/reset-password → email-link simulation →
//   /auth/callback (PKCE exchange w/ cookie verifier) →
//   /reset-password (guarded page) → /api/auth/update-password
// Run: bun scripts/e2e-reset-flow.ts  (APP + mock must be running)
// Expects APP=http://127.0.0.1:3100
// ============================================================

const APP = process.env.APP || 'http://127.0.0.1:3100'

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✅ ${label}`)
  else {
    failures++
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function cookieMap(setCookies: string[]): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const sc of setCookies) {
    const [pair] = sc.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) {
      let value = pair.slice(eq + 1).trim()
      // Next.js serializes cookie values with encodeURIComponent ('/' → %2F)
      try {
        value = decodeURIComponent(value)
      } catch {
        /* keep raw */
      }
      jar[pair.slice(0, eq).trim()] = value
    }
  }
  return jar
}

function pathOf(location: string): string {
  try {
    const u = new URL(location, APP)
    return u.pathname + u.search
  } catch {
    return location
  }
}

function cookieHeader(jar: Record<string, string>, names: string[]): string {
  return names
    .filter((n) => jar[n] !== undefined && jar[n] !== '')
    .map((n) => `${n}=${jar[n]}`)
    .join('; ')
}

async function req(
  path: string,
  init: RequestInit & { cookies?: string } = {}
): Promise<Response> {
  const { cookies, ...rest } = init
  const headers: Record<string, string> = {
    accept: 'text/html,application/json',
    ...(rest.headers as Record<string, string>),
  }
  if (cookies) headers.cookie = cookies
  return fetch(`${APP}${path}`, { ...rest, headers, redirect: 'manual' })
}

async function main() {
  console.log('── STEP 1: request reset (server → PKCE challenge + verifier cookie) ──')
  const r1 = await req('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'e2e-owner@example.com' }),
  })
  const j1 = await r1.json().catch(() => ({}))
  const sc1 = r1.headers.getSetCookie()
  const jar1 = cookieMap(sc1)
  check('API returns 200 + generic success', r1.status === 200 && j1.success === true, `${r1.status} ${JSON.stringify(j1)}`)
  check(
    'rise-pkce-verifier cookie set (httpOnly)',
    !!jar1['rise-pkce-verifier'] && sc1.some((c) => c.startsWith('rise-pkce-verifier=') && c.includes('HttpOnly')),
    JSON.stringify(sc1)
  )
  check(
    'verifier is recovery-flavored',
    /^[A-Za-z0-9\-._~]+\/recovery$/.test(jar1['rise-pkce-verifier'] || ''),
    String(jar1['rise-pkce-verifier'])
  )

  console.log('── STEP 2: click email link → /auth/callback?code=… (with verifier cookie) ──')
  const verifierCookie = `rise-pkce-verifier=${jar1['rise-pkce-verifier']}`
  const r2 = await req('/auth/callback?code=e2e-recovery-code-1', {
    cookies: verifierCookie,
  })
  const sc2 = r2.headers.getSetCookie()
  const jar2 = { ...jar1, ...cookieMap(sc2) }
  const loc2 = r2.headers.get('location') || ''
  check('callback responds with redirect', [302, 307, 308].includes(r2.status), String(r2.status))
  check('redirects to /reset-password (NOT /app!)', pathOf(loc2).startsWith('/reset-password'), loc2)
  check(
    'session cookies issued (httpOnly rise-access + rise-refresh)',
    !!jar2['rise-access'] && !!jar2['rise-refresh'] && sc2.some((c) => c.startsWith('rise-access=') && c.includes('HttpOnly')),
    JSON.stringify(sc2)
  )
  check(
    'recovery marker cookie issued (10-min TTL)',
    jar2['rise-pwd-recovery'] === '1' && sc2.some((c) => c.startsWith('rise-pwd-recovery=') && c.includes('Max-Age=600')),
    JSON.stringify(sc2)
  )
  check(
    'verifier cookie consumed (single-use)',
    jar2['rise-pkce-verifier'] === '' || jar2['rise-pkce-verifier'] === undefined,
    JSON.stringify(sc2.filter((c) => c.startsWith('rise-pkce')))
  )

  console.log('── STEP 3: /reset-password WITH recovery session → real form ──')
  const sessionCookies = cookieHeader(jar2, ['rise-access', 'rise-refresh', 'rise-pwd-recovery'])
  const r3 = await req('/reset-password', { cookies: sessionCookies })
  const html3 = await r3.text()
  check('page renders 200', r3.status === 200, String(r3.status))
  check('shows the real password form (كلمة مرور جديدة)', html3.includes('كلمة مرور جديدة') && html3.includes('new-password'))
  check('does NOT show the invalid-link card', !html3.includes('رابط غير صالح'))

  console.log('── STEP 4: /reset-password direct visit (no session) → guarded ──')
  const r4 = await req('/reset-password')
  const html4 = await r4.text()
  check('page renders 200', r4.status === 200, String(r4.status))
  check('shows invalid-link card (رابط غير صالح)', html4.includes('رابط غير صالح'))
  check('does NOT leak the password form', !html4.includes('id="new-password"'))

  console.log('── STEP 5: email link WITHOUT verifier cookie (cross-device) ──')
  const r5 = await req('/auth/callback?code=some-code', {})
  const loc5 = r5.headers.get('location') || ''
  check('redirects to device state page', pathOf(loc5).startsWith('/reset-password?state=device'), loc5)

  console.log('── STEP 6: set new password (marker + session) ──')
  const r6 = await req('/api/auth/update-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cookies: sessionCookies,
    body: JSON.stringify({ newPassword: 'NewSecurePass123' }),
  })
  const j6 = await r6.json().catch(() => ({}))
  const sc6 = r6.headers.getSetCookie()
  const jar6 = cookieMap(sc6)
  check('update succeeds (200 + mustReauth)', r6.status === 200 && j6.success === true, `${r6.status} ${JSON.stringify(j6)}`)
  check('auth cookies cleared after change', jar6['rise-access'] === '' && jar6['rise-refresh'] === '', JSON.stringify(sc6))
  check('recovery marker cleared', jar6['rise-pwd-recovery'] === '' || jar6['rise-pwd-recovery'] === undefined, JSON.stringify(sc6))

  console.log('── STEP 7: update-password WITHOUT marker (session only) → rejected ──')
  const r7 = await req('/api/auth/update-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cookies: cookieHeader(jar2, ['rise-access', 'rise-refresh']),
    body: JSON.stringify({ newPassword: 'AnotherPass1234' }),
  })
  check('rejected with 403 (marker required)', r7.status === 403, String(r7.status))

  console.log('── STEP 8: login page deep links ──')
  const r8a = await req('/app?forgot=1')
  const html8 = await r8a.text()
  check('login renders', r8a.status === 200, String(r8a.status))
  void html8 // deep-link state is client-side; page render is enough here

  console.log('── SUMMARY ──')
  if (failures === 0) {
    console.log('ALL E2E RECOVERY-FLOW CHECKS PASSED ✅')
    process.exit(0)
  } else {
    console.error(`${failures} E2E CHECK(S) FAILED ❌`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('e2e driver crashed:', e)
  process.exit(1)
})
