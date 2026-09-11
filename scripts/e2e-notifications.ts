// ============================================================
// E2E driver: notifications center (Phase 5) against the LOCAL
// production server + notifications-mock.
//   A) app-level (via /api/rise/notifications + /api/rise/export):
//   1. self-create (success + subscription أنواع المرحلة 05) → 200
//   2. أنواع غير صالحة → 400 (zod قبل قاعدة البيانات)
//   3. feed: filter all/unread/account/activity + unreadCount
//   4. mode=count (شارة خفيفة)
//   5. PUT {all:true} → تحديد الكل ذريًّا → count 0
//   6. export ×3 → 200 + إشعار background واحد فقط (dedup)
//   7. export #4/#5 → 402 + إشعار usage واحد فقط (dedup) priority high
//   8. filter=high → إشعار الحدود فقط
//   9. DELETE ?all=true → صفّر تام
//   B) mock-direct (عبر RPC على الموك نفسه):
//  10. ai.action: القرب من الحد (80%) → إشعار near (normal)
//  11. الحد اليومي 5 → blocked — ثم التحقق عبر feed التطبيق
// Run: bun scripts/e2e-notifications.ts  (APP=http://127.0.0.1:3100)
// ============================================================

const APP = process.env.APP || 'http://127.0.0.1:3100'
const MOCK = process.env.MOCK || 'http://127.0.0.1:5997'
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
async function req(path: string, init: RequestInit = {}): Promise<Response> {
  idemSeq++
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${TOKEN}`,
    'idempotency-key': `e2e-notif-${Date.now()}-${idemSeq}`,
    ...(init.headers as Record<string, string>),
  }
  return fetch(`${APP}${path}`, { ...init, headers, redirect: 'manual' })
}

async function rpcMock(fn: string, params: Record<string, unknown>) {
  const r = await fetch(`${MOCK}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
      apikey: 'test-anon-key-0123456789abcdef',
    },
    body: JSON.stringify(params),
  })
  return r.json().catch(() => ({}))
}

async function feed(filter = 'all') {
  const r = await req(`/api/rise/notifications?filter=${filter}&limit=100`)
  return r.json().catch(() => ({}))
}

async function main() {
  if (!TOKEN) {
    console.error('E2E_TOKEN required (printed by e2e-notifications-mock)')
    process.exit(1)
  }

  // ═════════ PART A: app-level ═════════

  console.log('── STEP 1: إنشاء إشعارات ذاتية (أنواع المرحلة 05) ──')
  const r1 = await req('/api/rise/notifications', {
    method: 'POST',
    body: JSON.stringify({ title: 'إنجاز تجريبي', body: 'مهمة اكتملت', type: 'success', icon: '🎉', actionUrl: 'tasks' }),
  })
  check('POST type=success → 200', r1.status === 200, String(r1.status))
  const r2 = await req('/api/rise/notifications', {
    method: 'POST',
    body: JSON.stringify({ title: 'إشعار اشتراك تجريبي', type: 'subscription', priority: 'high' }),
  })
  check('POST type=subscription (نوع جديد) → 200', r2.status === 200, String(r2.status))
  const j2 = await r2.json().catch(() => ({}))
  check('الإرجاع فيه isRead/priority مطبيعَين', j2.notification?.isRead === false && j2.notification?.priority === 'high', JSON.stringify(j2).slice(0, 120))

  console.log('── STEP 2: أنواع غير صالحة → 400 (zod) ──')
  const rBad = await req('/api/rise/notifications', {
    method: 'POST',
    body: JSON.stringify({ title: 'x', type: 'admin_message' }),
  })
  check('POST type=admin_message → 400', rBad.status === 400, String(rBad.status))
  const rBad2 = await req('/api/rise/notifications', {
    method: 'POST',
    body: JSON.stringify({ title: 'x', type: 'weird' }),
  })
  check('POST type=weird → 400', rBad2.status === 400, String(rBad2.status))

  console.log('── STEP 3: feed + الفلاتر + العدّاد ──')
  const fAll = await feed('all')
  check('filter=all → صفّان', fAll.notifications?.length === 2, JSON.stringify(fAll.notifications?.map((n: any) => n.type)))
  check('unreadCount = 2', fAll.unreadCount === 2, String(fAll.unreadCount))
  const fUnread = await feed('unread')
  check('filter=unread → صفّان غير مقروءين', fUnread.notifications?.length === 2)
  const fAccount = await feed('account')
  check('filter=account → subscription فقط (بدون success)', fAccount.notifications?.length === 1 && fAccount.notifications[0]?.type === 'subscription')
  const fActivity = await feed('activity')
  check('filter=activity → success فقط', fActivity.notifications?.length === 1 && fActivity.notifications[0]?.type === 'success')
  const rCount = await req('/api/rise/notifications?mode=count')
  const jCount = await rCount.json().catch(() => ({}))
  check('mode=count → unreadCount=2 (حمولة خفيفة)', jCount.unreadCount === 2 && jCount.notifications === undefined, JSON.stringify(jCount))

  console.log('── STEP 4: تحديد الكل كمقروء (ذري) ──')
  const rMark = await req('/api/rise/notifications', {
    method: 'PUT',
    body: JSON.stringify({ all: true }),
  })
  const jMark = await rMark.json().catch(() => ({}))
  check('PUT {all:true} → updated=2', rMark.status === 200 && jMark.updated === 2, JSON.stringify(jMark))
  const fAfter = await feed('all')
  check('بعد التحديد: unreadCount=0 و isRead=true', fAfter.unreadCount === 0 && fAfter.notifications?.every((n: any) => n.isRead === true))

  console.log('── STEP 5: export ×3 → 200 + إشعار background واحد (dedup) ──')
  for (let i = 1; i <= 3; i++) {
    const r = await req('/api/rise/export')
    check(`export #${i} → 200`, r.status === 200, String(r.status))
  }
  const fExp = await feed('account')
  const bgRows = (fExp.notifications || []).filter((n: any) => n.type === 'background')
  check('إشعار background واحد فقط (dedup يومي)', bgRows.length === 1, `length=${bgRows.length}`)
  check('العنوان عربي (نسخة احتياطية)', /نسخة|احتياط/.test(String(bgRows[0]?.title || '')), String(bgRows[0]?.title))

  console.log('── STEP 6: export #4/#5 → 402 + إشعار usage واحد (dedup, high) ──')
  const r4 = await req('/api/rise/export')
  const j4 = await r4.json().catch(() => ({}))
  check('export #4 → 402 LIMIT_REACHED', r4.status === 402 && j4.code === 'LIMIT_REACHED', `${r4.status} ${JSON.stringify(j4).slice(0, 120)}`)
  const r5 = await req('/api/rise/export')
  check('export #5 → 402', r5.status === 402)
  const fUsage = await feed('account')
  const usageRows = (fUsage.notifications || []).filter((n: any) => n.type === 'usage')
  check('إشعار usage واحد فقط رغم محاولتين (dedup)', usageRows.length === 1, `length=${usageRows.length}`)
  check('إشعار الحد priority=high', usageRows[0]?.priority === 'high')
  check('مضمون الإشعار يذكر الحد اليومي', /للحد اليومي|الحد اليومي/.test(String(usageRows[0]?.title || '')), String(usageRows[0]?.title))
  check('read_at لا يزال null (لم يُقرأ بعد)', usageRows[0]?.readAt === null || usageRows[0]?.readAt === undefined)

  console.log('── STEP 7: فلترة high + العدّاد بعد الاستخدام ──')
  const fHigh = await feed('high')
  const highRows = (fHigh.notifications || []).filter((n: any) => n.priority === 'high')
  check('filter=high → إشعار الحدود (وأي شيء high آخر)', highRows.length >= 1 && highRows.every((n: any) => n.priority === 'high'), `length=${highRows.length}`)
  const rCount2 = await req('/api/rise/notifications?mode=count')
  const jCount2 = await rCount2.json().catch(() => ({}))
  check('mode=count بعد الاستخدام → غير مقروء = background+usage', jCount2.unreadCount === 2, String(jCount2.unreadCount))

  console.log('── STEP 8: المسح الشامل ──')
  const rDel = await req('/api/rise/notifications?all=true', { method: 'DELETE' })
  check('DELETE ?all=true → 200', rDel.status === 200, String(rDel.status))
  const rCount3 = await req('/api/rise/notifications?mode=count')
  const jCount3 = await rCount3.json().catch(() => ({}))
  check('بعد المسح: unreadCount=0', jCount3.unreadCount === 0, String(jCount3.unreadCount))

  // ═════════ PART B: near-limit (mock-direct) ═════════

  console.log('── STEP 9: القرب من الحد اليومي ai.action (80% من 5) ──')
  // نستهلك مباشرة عبر RPC على الموك (لا مسار تطبيقي للـAI بعد —
  // التوصيل لاحقًا حسب الخطة)؛ الإشعارات تظهر في feed التطبيق.
  for (let i = 1; i <= 3; i++) {
    const r = await rpcMock('consume_usage', { p_feature_key: 'ai.action' })
    check(`ai.action #${i} → allowed`, r.allowed === true, JSON.stringify(r).slice(0, 100))
  }
  const r4ai = await rpcMock('consume_usage', { p_feature_key: 'ai.action' })
  check('ai.action #4 → allowed (4/5 = 80%)', r4ai.allowed === true && r4ai.usedDaily === 4)
  const fNear = await feed('account')
  const nearRows = (fNear.notifications || []).filter((n: any) =>
    n.type === 'usage' && (n.metadata as any)?.reason === 'near_daily'
  )
  check('إشعار «اقتربت من حدك اليومي» ظهر (normal)', nearRows.length === 1 && nearRows[0]?.priority === 'normal', `length=${nearRows.length}`)

  console.log('── STEP 10: الحد اليومي ai.action (5) → blocked + dedup ──')
  const r5ai = await rpcMock('consume_usage', { p_feature_key: 'ai.action' })
  check('ai.action #5 → allowed (5/5)', r5ai.allowed === true && r5ai.usedDaily === 5)
  const r6ai = await rpcMock('consume_usage', { p_feature_key: 'ai.action' })
  check('ai.action #6 → blocked (daily_limit)', r6ai.allowed === false && r6ai.reason === 'daily_limit')
  const r7ai = await rpcMock('consume_usage', { p_feature_key: 'ai.action' })
  check('ai.action #7 → blocked', r7ai.allowed === false)
  const fBlocked = await feed('account')
  const dailyBlocked = (fBlocked.notifications || []).filter((n: any) =>
    n.type === 'usage' && (n.metadata as any)?.reason === 'daily_limit' && (n.metadata as any)?.feature === 'ai.action'
  )
  check('إشعار حظر ai واحد فقط (dedup)', dailyBlocked.length === 1, `length=${dailyBlocked.length}`)

  console.log('')
  if (failures === 0) {
    console.log(`✅ e2e-notifications: ALL CHECKS PASS`)
  } else {
    console.error(`❌ e2e-notifications: ${failures} failure(s)`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('driver crashed:', e)
  process.exit(1)
})
