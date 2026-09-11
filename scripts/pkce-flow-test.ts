// ============================================================
// PKCE recovery-flow mechanics test (Phase-3 hotfix regression)
// Run: bun scripts/pkce-flow-test.ts
//
// Verifies OUR side of the recovery flow with intercepted fetch
// (no network, deterministic):
//   1. REQUEST side  — resetPasswordForEmail on a PKCE client with
//      the capture shim: outgoing /recover body must carry a
//      s256 code_challenge, and the shim must capture
//      "<verifier>/recovery" (what we put in the httpOnly cookie).
//   2. COOKIE shape  — the captured value must be cookie-safe and
//      recognized by isRecoveryVerifier.
//   3. EXCHANGE side — a PKCE client seeded via the source shim
//      (exactly what /auth/callback does with the cookie) must send
//      auth_code + the SAME code_verifier to /token?grant_type=pkce,
//      and surface redirectType='recovery' from the exchange result.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test-project.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.anon.key.value.for.pkce.flow'

interface Intercepted {
  url: string
  method?: string
  body: Record<string, any>
}

const calls: Intercepted[] = []

const originalFetch = globalThis.fetch

async function fakeFetch(input: any, init?: any): Promise<Response> {
  const url = String(input instanceof URL ? input.toString() : input)
  const rawBody = init?.body ? String(init.body) : '{}'
  let body: Record<string, any> = {}
  try {
    body = JSON.parse(rawBody)
  } catch {
    /* non-JSON body — record empty */
  }
  calls.push({ url, method: init?.method, body })

  if (url.includes('/auth/v1/recover')) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (url.includes('/auth/v1/token?grant_type=pkce')) {
    // Simulated Supabase success for the pkce grant.
    return new Response(
      JSON.stringify({
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJleHAiOjk5OTk5OTk5OTksImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.sig',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: 'test-user-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'test@example.com',
          email_confirmed_at: new Date().toISOString(),
          user_metadata: { name: 'مستخدم تجريبي' },
          app_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}`)
  } else {
    failures++
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  globalThis.fetch = fakeFetch as any

  const { createSupabasePkceClient, createVerifierCapture, createVerifierSource, isRecoveryVerifier, isBareVerifier } =
    await import('../src/lib/auth-pkce')

  console.log('── 1) REQUEST side: resetPasswordForEmail + capture shim ──')
  const capture = createVerifierCapture()
  const requestClient = await createSupabasePkceClient(capture.storage)
  check('PKCE client created', !!requestClient)
  if (!requestClient) return finish()

  const { error: recoverError } = await requestClient!.auth.resetPasswordForEmail('test@example.com', {
    redirectTo: 'https://rise-os-gamma.vercel.app/auth/callback',
  })
  check('resetPasswordForEmail returned no error', !recoverError, recoverError?.message)

  const recoverCall = calls.find((c) => c.url.includes('/auth/v1/recover'))
  check('POST hit /auth/v1/recover', !!recoverCall)
  const sentChallenge = recoverCall?.body?.code_challenge
  check(
    'request carries a non-empty s256 code_challenge (PKCE engaged)',
    typeof sentChallenge === 'string' && sentChallenge.length >= 40 && recoverCall?.body?.code_challenge_method === 's256',
    JSON.stringify(recoverCall?.body)
  )

  console.log('── 2) COOKIE value: captured verifier shape ──')
  const verifierWithFlow = capture.getVerifier()
  check(
    'verifier captured with /recovery suffix',
    !!verifierWithFlow && isRecoveryVerifier(verifierWithFlow),
    String(verifierWithFlow)
  )
  check(
    'verifier is cookie-safe (url-safe charset + "/recovery")',
    !!verifierWithFlow && /^[A-Za-z0-9\-._~]+\/recovery$/.test(verifierWithFlow),
    String(verifierWithFlow)
  )
  if (!verifierWithFlow) return finish()

  // The exact round-trip our routes perform: cookie value → source shim.
  const cookieValue = verifierWithFlow

  console.log('── 3) EXCHANGE side: cookie → source shim → exchangeCodeForSession ──')
  calls.length = 0
  const exchangeClient = await createSupabasePkceClient(createVerifierSource(cookieValue))
  check('exchange client created', !!exchangeClient)
  if (!exchangeClient) return finish()

  const expectedVerifier = cookieValue.split('/')[0]
  const { data, error: exchangeError } = await exchangeClient!.auth.exchangeCodeForSession('test-auth-code')

  const tokenCall = calls.find((c) => c.url.includes('/auth/v1/token?grant_type=pkce'))
  check('POST hit /auth/v1/token?grant_type=pkce', !!tokenCall)
  check(
    'exchange sent the SAME code_verifier from the cookie (server-authoritative PKCE works)',
    tokenCall?.body?.code_verifier === expectedVerifier && tokenCall?.body?.auth_code === 'test-auth-code',
    JSON.stringify(tokenCall?.body)
  )
  check('exchange returned a session (tokens → httpOnly cookies in prod)', !!data?.session?.access_token, exchangeError?.message)
  check('exchange reported redirectType=recovery (flow signal from verifier)', (data as any)?.redirectType === 'recovery')
  check('exchange exposed the user', data?.user?.email === 'test@example.com')

  console.log('── 4) Negative: bare verifier is not treated as recovery ──')
  check('bare verifier rejected by isRecoveryVerifier', isBareVerifier(expectedVerifier) && !isRecoveryVerifier(expectedVerifier))

  finish()
}

function finish() {
  globalThis.fetch = originalFetch
  if (failures === 0) {
    console.log('\nALL PKCE MECHANICS CHECKS PASSED ✅')
    process.exit(0)
  } else {
    console.error(`\n${failures} CHECK(S) FAILED ❌`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('test crashed:', e)
  process.exit(1)
})
