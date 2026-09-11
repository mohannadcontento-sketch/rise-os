// ============================================================
// E2E driver: usage limits + upgrade flow (Phase 4) against the
// LOCAL production server + usage-mock.
//   1. /api/rise/export ×3 → 200 (free: 3/day)
//   2. 4th export → 402 LIMIT_REACHED + usage payload
//   3. /api/rise/mcp/key POST → 403 PLAN_REQUIRED (free ≠ max)
//   4. POST subscription/requests (valid) → 200 + request row
//   5. GET user/subscription → plan + usage overview shape
// Run: bun scripts/e2e-usage-limits.ts  (APP=http://127.0.0.1:3100)
// ============================================================

const APP = process.env.APP || 'http://127.0.0.1:3100'
const TOKEN = process.env.E2E_TOKEN || ''

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✅ ${label}`)
  else {
    failures++
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

let idemSeq = 0
async function req(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  idemSeq++
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${TOKEN}`,
    'idempotency-key': `e2e-usage-${Date.now()}-${idemSeq}`,
    ...(init.headers as Record<string, string>),
  }
  return fetch(`${APP}${path}`, { ...init, headers, redirect: 'manual' })
}

async function main() {
  if (!TOKEN) {
    console.error('E2E_TOKEN required (printed by e2e-usage-mock)')
    process.exit(1)
  }

  console.log('── STEP 1: free-plan export limit (3/day) — first 3 pass ──')
  for (let i = 1; i <= 3; i++) {
    const r = await req('/api/rise/export')
    const ct = r.headers.get('content-type') || ''
    check(`export #${i} → 200 (JSON blob)`, r.status === 200 && ct.includes('json'), `${r.status} ${ct}`)
  }

  console.log('── STEP 2: 4th export → 402 LIMIT_REACHED + upgrade payload ──')
  const r4 = await req('/api/rise/export')
  const j4 = await r4.json().catch(() => ({}))
  check('export #4 → 402', r4.status === 402, String(r4.status))
  check('code = LIMIT_REACHED', j4.code === 'LIMIT_REACHED', JSON.stringify(j4).slice(0, 200))
  check('error message is Arabic (has تجدد/رقّي)', /يتجدد|رقّي/.test(String(j4.error || '')))
  check(
    'usage payload: usedDaily=3/3 + resetDailyAt',
    j4.usage?.usedDaily === 3 && j4.usage?.limitDaily === 3 && !!j4.usage?.resetDailyAt,
    JSON.stringify(j4.usage ?? {})
  )
  check('usage payload has Arabic feature label', j4.usage?.featureLabel === 'تصدير البيانات')

  console.log('── STEP 3: MCP key gated to max plan (free → 403) ──')
  const rMcp = await req('/api/rise/mcp/key', { method: 'POST' })
  const jMcp = await rMcp.json().catch(() => ({}))
  check('mcp/key → 403', rMcp.status === 403, String(rMcp.status))
  check('code = PLAN_REQUIRED + requiredPlan=max', jMcp.code === 'PLAN_REQUIRED' && jMcp.requiredPlan === 'max', JSON.stringify(jMcp).slice(0, 200))

  console.log('── STEP 4: upgrade request (manual payment v1) ──')
  const rReq = await req('/api/rise/user/subscription/requests', {
    method: 'POST',
    body: JSON.stringify({
      requestedPlan: 'plus',
      paymentMethod: 'instapay',
      reference: '30458122600781',
      note: 'دفعت الآن',
    }),
  })
  const jReq = await rReq.json().catch(() => ({}))
  check('request → 200 with pending row', rReq.status === 200 && jReq.request?.status === 'pending', `${rReq.status} ${JSON.stringify(jReq).slice(0, 200)}`)

  const rReqInvalid = await req('/api/rise/user/subscription/requests', {
    method: 'POST',
    body: JSON.stringify({ requestedPlan: 'free', paymentMethod: 'instapay', reference: '123' }),
  })
  check('invalid request rejected (400 zod)', rReqInvalid.status === 400, String(rReqInvalid.status))

  const rList = await req('/api/rise/user/subscription/requests')
  const jList = await rList.json().catch(() => ({}))
  check('my requests list has 1 pending', Array.isArray(jList.requests) && jList.requests.length === 1 && jList.requests[0].status === 'pending')

  console.log('── STEP 5: subscription overview shape (settings UI source) ──')
  const rSub = await req('/api/rise/user/subscription')
  const jSub = await rSub.json().catch(() => ({}))
  check('plan free + effectivePlan free', jSub.subscription?.plan === 'free' && jSub.effectivePlan === 'free')
  check('usage overview present with 3 features', (jSub.usage?.features?.length ?? 0) === 3, JSON.stringify(jSub.usage ?? {}).slice(0, 200))
  check('usage counts reflect 3 exports', jSub.usage?.features?.find((f: any) => f.featureKey === 'export.data')?.usedDaily === 3)
  check('plans display data attached', !!jSub.plans?.plus?.nameAr && jSub.plans.plus.priceEgp === 30)
  check('payment instructions attached', Array.isArray(jSub.payment?.steps))

  if (failures > 0) {
    console.error(`❌ USAGE-LIMITS E2E FAILED (${failures} checks)`)
    process.exit(1)
  }
  console.log('✅ USAGE-LIMITS E2E PASSED — all 17 checks')
}

main().catch((e) => {
  console.error('E2E crashed:', e.message)
  process.exit(1)
})
