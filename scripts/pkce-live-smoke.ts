// ============================================================
// Live smoke: verify the DEPLOYED reset-password API runs the
// PKCE hotfix. The Supabase URL/anon key never appear in client
// chunks in this app (server-only auth), so the correct probe is
// the API itself: a recovery request for a nonexistent address
// must answer 200 (anti-enumeration) AND set the httpOnly
// `rise-pkce-verifier` cookie with a "<verifier>/recovery" value.
// Run: bun scripts/pkce-live-smoke.ts
// ============================================================

const SITE = process.env.SITE || 'https://rise-os-gamma.vercel.app'

async function main() {
  const res = await fetch(`${SITE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'definitely-not-a-real-user-9182@example.com' }),
    redirect: 'manual',
  })
  const body = await res.json().catch(() => ({}))
  const setCookies = res.headers.getSetCookie?.() || []

  const verifierCookie = setCookies.find((c) => c.startsWith('rise-pkce-verifier='))
  const value = verifierCookie
    ? decodeURIComponent(verifierCookie.split(';')[0].slice('rise-pkce-verifier='.length))
    : ''

  console.log('status:', res.status)
  console.log('body:', JSON.stringify(body).slice(0, 160))
  console.log('verifier cookie:', verifierCookie ? 'present' : 'MISSING')

  let failures = 0
  const check = (label: string, ok: boolean) => {
    if (ok) console.log(`  ✅ ${label}`)
    else {
      failures++
      console.error(`  ❌ ${label}`)
    }
  }

  check('API answers 200 generic success (anti-enumeration)', res.status === 200 && body.success === true)
  check('rise-pkce-verifier cookie set (httpOnly)', !!verifierCookie && verifierCookie.includes('HttpOnly'))
  check(
    'verifier is recovery-flavored "<verifier>/recovery"',
    /^[A-Za-z0-9\-._~]+\/recovery$/.test(value)
  )
  check(
    'cookie TTL ≈ 1h (Max-Age=3600)',
    !!verifierCookie && /max-age=3600/i.test(verifierCookie)
  )

  if (failures > 0) {
    console.error('❌ LIVE SMOKE FAILED — deployment does not run the PKCE hotfix yet')
    process.exit(1)
  }
  console.log('✅ LIVE SMOKE PASSED — deployed API registers a PKCE challenge and carries the verifier cookie')
}

main().catch((e) => {
  console.error('smoke crashed:', e.message)
  process.exit(1)
})
