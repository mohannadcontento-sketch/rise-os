// ============================================================
// E2E driver: Web Push (Phase 6) against the LOCAL production
// server + push-mock (REST :5998 + HTTPS receiver :5999).
//
// السلسلة تحت الاختبار حقيقية بالكامل:
//   route → notify_user (المسار الموحد) → dispatchPush →
//   gate (تفضيلات + سقوف + ادعاء ذري) → مكتبة web-push →
//   POST حقيقي مشفّر للمستقبِل HTTPS (VAPID JWT + TTL +
//   Urgency) → touch عند النجاح / revoke عند 410.
//
// الخطوات:
//   1.  vapid-key عام (بلا توكن) + Cache-Control
//   2.  المسارات القديمة أُزيلت → 404
//   3.  subscribe: بلا توكن 401 / جسم فارغ 400 / غير https 400 /
//       مفاتيح قصيرة 400 / سليم 200 + upsert نفس الجهاز
//   3b. تسجيل جهاز «ميت» (يرجّع 410 من المستقبِل)
//   4.  التفضيلات: افتراضيات + PUT + zod 400 + إرجاع community
//   5.  تجربة الإرسال الأولى: pushed:true + وصول فعلي للمستقبِل
//       (VAPID/TTL/Urgency/حجم المشفّر) + last_push_at + الجهاز
//       الميت أُبطل تلقائيًا (expired)
//   6.  حد التجربة 2/min → الثالثة 429
//   7.  قائمة الأجهزة: origin مقنّع + الميت revoked
//   8.  سقف 10 أجهزة → 409
//   9.  إبطال بالمعرّف (DELETE) → القائمة revoked
//   10. cron التنظيف: مهجور 40 يومًا → cleaned=1 (stale)
//   11. push_enabled=false: export يعمل (200) + إشعار داخل
//       الموقع موجود + لا POST للمستقبِل (القناة فقط تتوقف — DoD)
//   12. dedup: تكرار export → صف export-done واحد فقط (لا إرسال
//       مكرر لنفس الحدث — DoD)
// Run: bun scripts/e2e-push.ts  (APP=http://127.0.0.1:3102)
// ============================================================

import { createECDH, randomBytes } from 'node:crypto'

const APP = process.env.APP || 'http://127.0.0.1:3102'
const MOCK = process.env.MOCK || 'http://127.0.0.1:5998'
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
    'idempotency-key': `e2e-push-${Date.now()}-${idemSeq}`,
    ...(init.headers as Record<string, string>),
  }
  return fetch(`${APP}${path}`, { ...init, headers, redirect: 'manual' })
}

async function mockState() {
  const r = await fetch(`${MOCK}/state`)
  return r.json()
}

// p256dh = نقطة EC P-256 حقيقية (web-push يتحقق أنها على المنحنى)
// auth  = 16 بايت عشوائية
function makeKeys(): { p256dh: string; auth: string } {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  }
}

const USER_ID = 'e2e-user-0000-0000-0000-000000000001'

async function main() {
  if (!TOKEN) {
    console.error('E2E_TOKEN required (printed by e2e-push-mock)')
    process.exit(1)
  }

  const keys1 = makeKeys()
  const keys2 = makeKeys()

  console.log('── STEP 1: vapid-key عام + كاش ──')
  const r1 = await fetch(`${APP}/api/rise/push/vapid-key`)
  const j1 = await r1.json().catch(() => ({}))
  check('GET vapid-key (بلا توكن) → 200', r1.status === 200, String(r1.status))
  check('configured:true + publicKey من app_config', j1.configured === true && typeof j1.publicKey === 'string' && j1.publicKey.length > 80, JSON.stringify(j1).slice(0, 120))

  console.log('── STEP 2: المسارات القديمة أُزيلت ──')
  const r2a = await fetch(`${APP}/api/rise/notifications/send`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'idempotency-key': `e2e-push-old-${Date.now()}` }, body: '{}' })
  check('POST /notifications/send → 404', r2a.status === 404, String(r2a.status))
  const r2b = await fetch(`${APP}/api/rise/notifications/push`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'idempotency-key': `e2e-push-old2-${Date.now()}` }, body: '{}' })
  check('POST /notifications/push → 404', r2b.status === 404, String(r2b.status))

  console.log('── STEP 3: subscribe (تحقق + upsert) ──')
  const unauth: Response = await fetch(`${APP}/api/rise/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `e2e-push-noauth-${Date.now()}` },
    body: JSON.stringify({ endpoint: 'https://x.example/p', keys: keys1 }),
  })
  check('بلا توكن → 401', unauth.status === 401, String(unauth.status))
  const r3a = await req('/api/rise/push/subscribe', { method: 'POST', body: '{}' })
  check('جسم فارغ → 400 (zod)', r3a.status === 400, String(r3a.status))
  const r3b = await req('/api/rise/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'http://insecure.example/p', keys: keys1 }),
  })
  check('endpoint غير https → 400', r3b.status === 400, String(r3b.status))
  const r3c = await req('/api/rise/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://127.0.0.1:5999/push/device-1', keys: { p256dh: 'short', auth: 'short' } }),
  })
  check('مفاتيح قصيرة → 400', r3c.status === 400, String(r3c.status))

  const r3d = await req('/api/rise/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://127.0.0.1:5999/push/device-1', keys: keys1, label: 'Chrome · أندرويد' }),
  })
  const j3d = await r3d.json().catch(() => ({}))
  check('سليم → 200 + subscriptionId', r3d.status === 200 && !!j3d.subscriptionId, `${r3d.status} ${JSON.stringify(j3d).slice(0, 120)}`)
  const firstId = j3d.subscriptionId

  const r3e = await req('/api/rise/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://127.0.0.1:5999/push/device-1', keys: keys2, label: 'Chrome · أندرويد (مجدّد)' }),
  })
  const j3e = await r3e.json().catch(() => ({}))
  check('نفس endpoint → نفس id (upsert بلا تكرار)', r3e.status === 200 && j3e.subscriptionId === firstId, `${r3e.status} ${JSON.stringify(j3e).slice(0, 80)}`)

  console.log('── STEP 3b: تسجيل جهاز «ميت» (يرجّع 410) ──')
  const r3f = await req('/api/rise/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://127.0.0.1:5999/push/dead-410', keys: makeKeys(), label: 'جهاز ميت' }),
  })
  check('تسجيل الجهاز الميت → 200', r3f.status === 200, String(r3f.status))

  console.log('── STEP 4: التفضيلات ──')
  const r6a = await req('/api/rise/user/notification-preferences')
  const j6a = await r6a.json().catch(() => ({}))
  check('الافتراضيات: مهم/أمان/تذكيرات مفتوحة', j6a.categories?.important === true && j6a.categories?.security === true && j6a.categories?.reminders === true, JSON.stringify(j6a))
  check('الافتراضيات: مجتمع/تسويق مغلقة (موافقة صريحة)', j6a.categories?.community === false && j6a.categories?.marketing === false, JSON.stringify(j6a))
  const r6b = await req('/api/rise/user/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify({ categories: { community: true } }),
  })
  const j6b = await r6b.json().catch(() => ({}))
  check('PUT community:true → 200 + محفوظ', r6b.status === 200 && j6b.categories?.community === true, `${r6b.status} ${JSON.stringify(j6b).slice(0, 100)}`)
  const r6c = await req('/api/rise/user/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify({ categories: {} }),
  })
  check('categories فارغة → 400 (zod)', r6c.status === 400, String(r6c.status))
  await req('/api/rise/user/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify({ categories: { community: false } }),
  })

  console.log('── STEP 5: تجربة الإرسال — السلسلة الحقيقية كاملة ──')
  const before5 = (await mockState()).pushLog.length
  const r5 = await req('/api/rise/push/test', { method: 'POST' })
  const j5 = await r5.json().catch(() => ({}))
  check('POST /push/test → 200 success', r5.status === 200 && j5.success === true, `${r5.status} ${JSON.stringify(j5).slice(0, 120)}`)
  check('push.pushed === true', j5.push?.pushed === true, JSON.stringify(j5.push))
  await new Promise((r) => setTimeout(r, 1500))
  const state5 = await mockState()
  const entries5 = state5.pushLog.slice(before5)
  check('محاولتا POST حقيقيتان (سليم + ميت)', entries5.length === 2, JSON.stringify(entries5.map((e: any) => [e.device, e.status])))
  const okEntry = entries5.find((e: any) => e.device === 'device-1')
  const deadEntry = entries5.find((e: any) => e.device === 'dead-410')
  if (okEntry) {
    check('device-1: 200 من المستقبِل', okEntry.status === 200, String(okEntry.status))
    check('device-1: payload مشفّر (طول > 100)', okEntry.bodyLength > 100, String(okEntry.bodyLength))
    check('device-1: ترويسة VAPID JWT', typeof okEntry.authorization === 'string' && okEntry.authorization.startsWith('vapid t='), String(okEntry.authorization).slice(0, 40))
    check('device-1: TTL (14400/86400)', ['14400', '86400'].includes(String(okEntry.ttl)), String(okEntry.ttl))
    check('device-1: Urgency (normal/high)', ['normal', 'high'].includes(String(okEntry.urgency)), String(okEntry.urgency))
  } else {
    check('device-1 entry موجودة', false, 'missing')
  }
  if (deadEntry) {
    check('dead-410: المستقبِل رجّع 410', deadEntry.status === 410, String(deadEntry.status))
  } else {
    check('dead-410 entry موجودة', false, 'missing')
  }
  const testNotif = state5.notifications.find((n: any) => n.id === j5.notificationId)
  check('الإشعار التجريبي له expires_at (تنظيف تلقائي)', !!testNotif?.expires_at, JSON.stringify(testNotif?.expires_at))
  const sub1 = state5.subscriptions.find((s: any) => s.endpoint.includes('device-1'))
  check('last_push_at تحدّث بعد النجاح (touch)', !!sub1?.last_push_at, JSON.stringify(sub1?.last_push_at))
  const deadRow5 = state5.subscriptions.find((s: any) => s.endpoint.includes('dead-410'))
  check('الجهاز الميت أُبطل تلقائيًا (reason=expired)', deadRow5?.revoked_reason === 'expired', JSON.stringify(deadRow5?.revoked_reason))

  console.log('── STEP 6: حد التجربة 2/min ──')
  const r6a2 = await req('/api/rise/push/test', { method: 'POST' }) // الثانية (مسموحة)
  check('الثانية خلال الدقيقة → 200', r6a2.status === 200, String(r6a2.status))
  const r6b2 = await req('/api/rise/push/test', { method: 'POST' }) // الثالثة → 429
  check('الثالثة خلال الدقيقة → 429', r6b2.status === 429, String(r6b2.status))

  console.log('── STEP 7: قائمة الأجهزة (origin مقنّع) ──')
  const r7 = await req('/api/rise/push/subscriptions')
  const j7 = await r7.json().catch(() => ({}))
  const subs: any[] = j7.subscriptions || []
  check('القائمة → 200 (جهازان: نشط + ميت)', r7.status === 200 && subs.length === 2, `${r7.status} ${subs.length}`)
  check('origin فقط (127.0.0.1) — لا مسار كامل', subs.every((s) => !s.origin.includes('/push/')), JSON.stringify(subs.map((s) => s.origin)))
  const deadListRow = subs.find((s: any) => s.label === 'جهاز ميت')
  check('الميت في القائمة: active=false', deadListRow?.active === false, JSON.stringify(deadListRow))
  const activeRow = subs.find((s: any) => s.active)
  check('النشط في القائمة: active=true + lastPushAt', activeRow?.active === true && !!activeRow?.lastPushAt, JSON.stringify(activeRow))

  console.log('── STEP 8: سقف 10 أجهزة ──')
  // نشط حاليًا: device-1 فقط (الميت أُبطل) → 9 إضافات تصل للسقف
  for (let i = 0; i < 9; i++) {
    await req('/api/rise/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: `https://127.0.0.1:5999/push/fill-${i}`,
        keys: makeKeys(),
        label: `جهاز ملء ${i}`,
      }),
    })
  }
  const r8 = await req('/api/rise/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://127.0.0.1:5999/push/device-11', keys: makeKeys() }),
  })
  check('الجهاز 11 → 409 device_limit', r8.status === 409, String(r8.status))

  console.log('── STEP 9: إبطال جهاز بالمعرّف (DELETE) ──')
  const deadSub = (await mockState()).subscriptions.find((s: any) => s.endpoint.includes('fill-1'))
  if (!deadSub) {
    check('fill-1 موجود (تمهيد الخطوة)', false, 'fill-1 subscription missing in mock state')
  } else {
  const r9 = await req('/api/rise/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ id: deadSub.id }),
  })
  const j9 = await r9.json().catch(() => ({}))
  check('DELETE بالمعرّف → 200 revoked', r9.status === 200 && j9.revoked === true, `${r9.status} ${JSON.stringify(j9).slice(0, 80)}`)
  const r9b = await req('/api/rise/push/subscriptions')
  const j9b = await r9b.json().catch(() => ({}))
  const revokedRow = (j9b.subscriptions || []).find((s: any) => s.id === deadSub.id)
  check('يظهر revoked في القائمة (active:false)', revokedRow && revokedRow.active === false, JSON.stringify(revokedRow))
  }

  console.log('── STEP 10: cron التنظيف (stale) ──')
  await fetch(`${MOCK}/__debug/age-subscription`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: 'https://127.0.0.1:5999/push/fill-2', days: 40 }),
  })
  const r10 = await fetch(`${APP}/api/rise/push/cleanup`)
  const j10 = await r10.json().catch(() => ({}))
  check('GET /push/cleanup → 200 + cleaned ≥1', r10.status === 200 && Number(j10.cleaned) >= 1, `${r10.status} ${JSON.stringify(j10)}`)
  const state10 = await mockState()
  const aged = state10.subscriptions.find((s: any) => s.endpoint.includes('fill-2'))
  check('المهجور أُبطل (reason=stale)', aged?.revoked_reason === 'stale', JSON.stringify(aged))

  console.log('── STEP 11: إيقاف القناة لا يكسر مركز الإشعارات (DoD) ──')
  const r11put = await req('/api/rise/user/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify({ pushEnabled: false }),
  })
  const j11put = await r11put.json().catch(() => ({}))
  check('PUT pushEnabled:false → 200 + محفوظ', r11put.status === 200 && j11put.pushEnabled === false, `${r11put.status} ${JSON.stringify(j11put).slice(0, 80)}`)
  const before11 = (await mockState()).pushLog.length
  const r11 = await req('/api/rise/export')
  check('export مع push_enabled=false → 200 (المسار الموحد notifyUser)', r11.status === 200, String(r11.status))
  await new Promise((r) => setTimeout(r, 1500))
  const state11 = await mockState()
  check('لم يُرسل push (القناة فقط توقفت)', state11.pushLog.length === before11, `${before11} → ${state11.pushLog.length}`)
  const today = new Date().toISOString().split('T')[0]
  const exportNotifs = state11.notifications.filter((n: any) => n.dedup_key === `export-done:${USER_ID}:${today}`)
  check('إشعار التصدير موجود داخل الموقع (DoD)', exportNotifs.length === 1, String(exportNotifs.length))
  check('pushed_at غير مضبوط (البوابة رفضت قبل الادعاء)', !exportNotifs[0]?.pushed_at, JSON.stringify(exportNotifs[0]?.pushed_at))

  console.log('── STEP 12: dedup — نفس الحدث لا يتكرر ──')
  const r12a = await req('/api/rise/export')
  const r12b = await req('/api/rise/export')
  check('تكرار export → 200 ×2', r12a.status === 200 && r12b.status === 200, `${r12a.status}/${r12b.status}`)
  await new Promise((r) => setTimeout(r, 1500))
  const state12 = await mockState()
  const exportNotifs12 = state12.notifications.filter((n: any) => n.dedup_key === `export-done:${USER_ID}:${today}`)
  check('صف export-done واحد فقط (dedup)', exportNotifs12.length === 1, String(exportNotifs12.length))
  check('لا إرسال push جديد (push ما زال موقوفًا)', state12.pushLog.length === before11, `${before11} → ${state12.pushLog.length}`)
  // إعادة التفعيل (نترك الحالة نظيفة)
  await req('/api/rise/user/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify({ pushEnabled: true }),
  })

  // ═══ الخلاصة ═══
  console.log('')
  if (failures === 0) {
    console.log('✅ e2e-push: ALL CHECKS PASS')
  } else {
    console.log(`❌ e2e-push: ${failures} FAILURES`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
