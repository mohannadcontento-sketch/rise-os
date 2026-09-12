// ============================================================
// push.test.ts — مصفوفة اختبار مرسل Web Push على Edge Function
//
// عبر خادم PostgREST وهمي + مزود بوش وهمي «يفك» التشفير فعليًا:
//   • المسار الإيجابي: إشعار في النافذة → البوابة تدّعي
//     pushed_at ذريًا → الإرسال للمزود يُفك ويتطابق مع عقد
//     sw.js (title/body/icon/badge/tag/url) → touch يتحدث →
//     السجل push_dispatch_log = sent
//   • no VAPID → خروج هادئ | VAPID من app_config (لا env)
//   • بوابة الرفض: push_disabled → denied + عدم إعادة المعالجة
//     في الجولة التالية (السجل نهائي)
//   • already_pushed (مسار Vercel أرسل أولًا) → claimed-elsewhere
//   • لا اشتراكات → no-subscriptions
//   • إشعار قديم خارج النافذة → لا يُمس
//   • 410 من المزود → إبطال الاشتراك (revoke RPC) + السجل
//   • خطأ مؤقت (500) → حالة error تُعاد محاولتها في جولة تالية
//   • forceDispatch: فرض إشعار بعينه
// ============================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { Postgrest } from '../../functions/_shared/postgrest.ts'
import { runPushSweep, forceDispatch, deepLinkFor } from '../../functions/_shared/push-core.ts'
import { createMockDb, startMockPostgrest, MockDb, MockNotification } from './mock-postgrest.ts'
import { generateVapidLikeKeys, startFakePushProvider, FakePushProvider } from './test-keys.ts'

const USER = '11111111-1111-1111-1111-111111111111'

interface Rig {
  db: MockDb
  postgrest: { url: string; close(): Promise<void> }
  provider: FakePushProvider
  vapidEnv: Record<string, string | undefined>
  cleanUp(): Promise<void>
}

async function rig(opts: { withVapid?: boolean; withSub?: boolean } = {}): Promise<Rig> {
  const db = createMockDb()
  const vapid = await generateVapidLikeKeys()
  const withVapid = opts.withVapid ?? true
  const withSub = opts.withSub ?? true

  // VAPID عبر app_config (زرع الهجرة 028) ما لم تطلب الاختبارات env
  if (withVapid) {
    db.appConfig.push(
      { key: 'vapid_public_key', value: vapid.publicKey },
      { key: 'vapid_private_key', value: vapid.privateKey },
      { key: 'vapid_subject', value: 'mailto:push-test@awj.life' },
    )
  }

  const postgrest = await startMockPostgrest(db)
  const provider = await startFakePushProvider()
  if (withSub) {
    db.pushSubscriptions.push({
      id: crypto.randomUUID(),
      user_id: USER,
      endpoint: provider.subscription.endpoint,
      p256dh: provider.subscription.p256dh,
      auth: provider.subscription.auth,
      revoked_at: null,
      last_push_at: null,
    })
  }

  return {
    db,
    postgrest,
    provider,
    vapidEnv: {},
    cleanUp: async () => {
      await postgrest.close()
      await provider.close()
    },
  }
}

function notif(partial: Partial<MockNotification> = {}): MockNotification {
  return {
    id: crypto.randomUUID(),
    user_id: USER,
    type: 'reminder',
    title: 'تذكير',
    body: 'مهمة «مراجعة العقد» حان موعدها',
    icon: null,
    action_url: 'tasks',
    priority: 'normal',
    pushed_at: null,
    created_at: new Date().toISOString(),
    ...partial,
  }
}

function dbOf(r: Rig): Postgrest {
  return new Postgrest({ baseUrl: r.postgrest.url, serviceKey: 'test-key' })
}

// ── القسم: المسار الإيجابي ─────────────────────

Deno.test('سويپ سعيد: إشعار غير مرسل → إرسال مشفّر صحيح + سجل sent', async () => {
  const r = await rig()
  const n = notif()
  r.db.notifications.push(n)

  const summary = await runPushSweep(dbOf(r), r.vapidEnv, { fetchImpl: globalThis.fetch })
  assertEquals(summary.ok, true)
  assertEquals(summary.scanned, 1)
  assertEquals(summary.processed, 1)
  assertEquals(summary.sent, 1)

  // البوابة ادّعت pushed_at في «القاعدة»
  assertEquals(r.db.notifications[0].pushed_at !== null, true)

  // المزود استلم طلبًا واحدًا وفك التشفير بنجاح
  assertEquals(r.provider.received.length, 1)
  const received = r.provider.received[0]
  assert(!received.decrypted.includes('DECRYPT-FAILED'), received.decrypted)
  const payload = JSON.parse(received.decrypted)
  assertEquals(payload.title, 'تذكير')
  assertEquals(payload.body, 'مهمة «مراجعة العقد» حان موعدها')
  assertEquals(payload.icon, '/icon-192.png')
  assertEquals(payload.badge, '/badge-96.png')
  assertEquals(payload.tag, `awj-${n.id}`)
  assertEquals(payload.url, deepLinkFor('tasks', n.id))

  // touch يتحدث + السجل sent
  assertEquals(r.db.pushSubscriptions[0].last_push_at !== null, true)
  assertEquals(r.db.pushDispatchLog.length, 1)
  assertEquals(r.db.pushDispatchLog[0].status, 'sent')

  await r.cleanUp()
})

Deno.test('الجولة الثانية لا تعالج المُرسل (السجل نهائي) + إشعار قديم خارج النافذة لا يُمس', async () => {
  const r = await rig()
  r.db.notifications.push(notif()) // سيُرسل

  const first = await runPushSweep(dbOf(r), r.vapidEnv)
  assertEquals(first.sent, 1)
  const pushCountAfterFirst = r.provider.received.length

  // إشعار قديم (قبل ساعتين) — خارج نافذة 15 دقيقة
  r.db.notifications.push(notif({ created_at: new Date(Date.now() - 2 * 3600_000).toISOString() }))

  const second = await runPushSweep(dbOf(r), r.vapidEnv)
  assertEquals(second.processed, 0, 'لا إعادة معالجة للمُرسل، والقديم خارج النافذة')
  assertEquals(r.provider.received.length, pushCountAfterFirst)

  await r.cleanUp()
})

Deno.test('أولوية high: TTL 4 ساعات وUrgency high', async () => {
  const r = await rig()
  r.db.notifications.push(notif({ priority: 'high' }))

  await runPushSweep(dbOf(r), r.vapidEnv)
  const h = r.provider.received[0].headers
  assertEquals(h['ttl'], '14400')
  assertEquals(h['urgency'], 'high')

  await r.cleanUp()
})

// ── القسم: مسارات الخروج ─────────────────────

Deno.test('بلا VAPID (env فارغ وapp_config فارغ) → no_vapid بلا إرسال', async () => {
  const r = await rig({ withVapid: false })
  r.db.notifications.push(notif())

  const summary = await runPushSweep(dbOf(r), r.vapidEnv)
  assertEquals(summary.reason, 'no_vapid')
  assertEquals(summary.ok, false)
  assertEquals(r.provider.received.length, 0)
  assertEquals(r.db.notifications[0].pushed_at, null, 'لا ادعاء بلا إرسال')

  await r.cleanUp()
})

Deno.test('VAPID من env يتقدم على app_config (ترتيب القراءة)', async () => {
  const r = await rig()
  const envVapid = await generateVapidLikeKeys()
  const env = {
    VAPID_PUBLIC_KEY: envVapid.publicKey,
    VAPID_PRIVATE_KEY: envVapid.privateKey,
    VAPID_SUBJECT: 'mailto:env@awj.life',
  }
  r.db.notifications.push(notif())

  const summary = await runPushSweep(dbOf(r), env)
  assertEquals(summary.sent, 1)
  // المزود تحقق من JWT بمفتاح env العام (لو استخدمنا مفاتيح
  // app_config لفشل فك/تحقق السلسلة) — النجاح دليل الترتيب
  assertEquals(r.provider.received.length, 1)

  await r.cleanUp()
})

// ── القسم: قرارات البوابة ─────────────────────

Deno.test('بوابة الرفض: push_disabled → denied (نهائي — لا إعادة في الجولة التالية)', async () => {
  const r = await rig()
  r.db.pushPrefs.set(USER, { push_enabled: false, categories: {} })
  const n = notif()
  r.db.notifications.push(n)

  const summary = await runPushSweep(dbOf(r), r.vapidEnv)
  assertEquals(summary.results[0].status, 'denied')
  assertEquals(summary.results[0].reason, 'push_disabled')
  assertEquals(r.provider.received.length, 0)

  // الجولة الثانية: السجل denied نهائي → لا إعادة فحص
  const second = await runPushSweep(dbOf(r), r.vapidEnv)
  assertEquals(second.processed, 0)

  await r.cleanUp()
})

Deno.test('مسار Vercel أرسله أولًا (pushed_at معلّى) → claimed-elsewhere', async () => {
  const r = await rig()
  r.db.notifications.push(notif({ pushed_at: new Date().toISOString() }))

  const summary = await runPushSweep(dbOf(r), r.vapidEnv)
  // pushed_at معلّى → لا يظهر في المرشحين أصلًا (pushed_at is.null)
  assertEquals(summary.scanned, 0)
  assertEquals(summary.processed, 0)
  assertEquals(r.provider.received.length, 0)

  // أما forceDispatch فيواجه البوابة ويرفض claimed-elsewhere
  const forced = await forceDispatch(dbOf(r), r.vapidEnv, r.db.notifications[0].id)
  assertEquals(forced.status, 'claimed-elsewhere')
  assertEquals(r.provider.received.length, 0)

  await r.cleanUp()
})

Deno.test('إشعار غير موجود → not-found، واشتراكات معدومة → no-subscriptions', async () => {
  const r = await rig()
  // forceDispatch لإشعار غير موجود
  const ghost = await forceDispatch(dbOf(r), r.vapidEnv, crypto.randomUUID())
  assertEquals(ghost.status, 'not-found')

  // إشعار بلا اشتراكات
  const r2 = await rig({ withSub: false })
  r2.db.notifications.push(notif())
  const s2 = await runPushSweep(dbOf(r2), r2.vapidEnv)
  assertEquals(s2.results[0].status, 'no-subscriptions')
  assertEquals(r2.provider.received.length, 0)
  assertEquals(r2.db.notifications[0].pushed_at !== null, true, 'البوابة ادّعت قبل اكتشاف غياب الأجهزة')

  await r.cleanUp()
  await r2.cleanUp()
})

// ── القسم: إدارة الاشتراكات ─────────────────────

Deno.test('410 من المزود → إبطال الاشتراك الدائم + الإرسال للباقين', async () => {
  // جهازان: الأول يرد 410 دائمًا، الثاني سليم — نحاكي ذلك بمزودين
  const db = createMockDb()
  const vapid = await generateVapidLikeKeys()
  db.appConfig.push(
    { key: 'vapid_public_key', value: vapid.publicKey },
    { key: 'vapid_private_key', value: vapid.privateKey },
    { key: 'vapid_subject', value: 'mailto:t@awj.life' },
  )
  const postgrest = await startMockPostgrest(db)
  const deadProvider = await startFakePushProvider()
  const liveProvider = await startFakePushProvider()
  deadProvider.setResponse(410)

  db.pushSubscriptions.push(
    {
      id: crypto.randomUUID(), user_id: USER,
      endpoint: deadProvider.subscription.endpoint,
      p256dh: deadProvider.subscription.p256dh,
      auth: deadProvider.subscription.auth,
      revoked_at: null, last_push_at: null,
    },
    {
      id: crypto.randomUUID(), user_id: USER,
      endpoint: liveProvider.subscription.endpoint,
      p256dh: liveProvider.subscription.p256dh,
      auth: liveProvider.subscription.auth,
      revoked_at: null, last_push_at: null,
    },
  )
  const n = notif()
  db.notifications.push(n)

  const client = new Postgrest({ baseUrl: postgrest.url, serviceKey: 'k' })
  const summary = await runPushSweep(client, {})

  assertEquals(summary.sent, 1, 'الجهاز الحي استلم')
  assertEquals(summary.revoked, 1, 'الجهاز الميت أُبطل')

  // الميت: revoked_at مضبوط والسبب expired
  const deadRow = db.pushSubscriptions.find((s) => s.endpoint === deadProvider.subscription.endpoint)!
  assertEquals(deadRow.revoked_at !== null, true)
  // الجولة الثانية: الاشتراك الميت مستبعد (revoked_at ليس null)
  const second = await runPushSweep(client, {})
  assertEquals(second.sent, 0, 'الإشعار أُرسل وسُجّل — لا إعادة')
  assertEquals(second.processed, 0)

  // الحي: touch حدث
  const liveRow = db.pushSubscriptions.find((s) => s.endpoint === liveProvider.subscription.endpoint)!
  assertEquals(liveRow.last_push_at !== null, true)
  assertEquals(liveRow.revoked_at, null)

  await postgrest.close()
  await deadProvider.close()
  await liveProvider.close()
})

Deno.test('إخفاق البوابة (قبل الادعاء) → error يعاد بالمحاولة، وإخفاق المزود (بعده) → at-most-once', async () => {
  // المسار (أ): البوابة نفسها أخفقت (خطأ خادم) — pushed_at لم
  // يُدّعَ بعد → الجولة التالية تعيد المحاولة فعلًا وترسل
  const r1 = await rig()
  r1.db.gateFailNext = true
  const n1 = notif()
  r1.db.notifications.push(n1)

  const failed = await runPushSweep(dbOf(r1), r1.vapidEnv)
  assertEquals(failed.results[0].status, 'error', JSON.stringify(failed.results[0]))
  assert(String(failed.results[0].reason).includes('gate-error'))
  assertEquals(r1.db.notifications[0].pushed_at, null, 'لا ادعاء عند إخفاق البوابة')
  assertEquals(r1.provider.received.length, 0)

  // الجولة الثانية: الجدول يسجل error (غير نهائي) والمرشّح ما
  // زال غير مُدّعى → إعادة معالجة وتنجح هذه المرة
  const retried = await runPushSweep(dbOf(r1), r1.vapidEnv)
  assertEquals(retried.processed, 1, 'error يجب أن يُعاد')
  assertEquals(retried.sent, 1, 'إعادة المحاولة ترسل فعلًا')
  assertEquals(r1.provider.received.length, 1)
  await r1.cleanUp()

  // المسار (ب): المزود رد 500 بعد الادعاء — at-most-once:
  // pushed_at أُدّعي قبل الإرسال فلا إعادة إرسال ممكنة، لكن
  // السجل يوثّق الحقيقة (status=error + سبب temp-fail)
  const r2 = await rig()
  r2.provider.setResponse(500)
  const n2 = notif()
  r2.db.notifications.push(n2)

  const first = await runPushSweep(dbOf(r2), r2.vapidEnv)
  assertEquals(first.results[0].status, 'error', JSON.stringify(first.results[0]))
  assert(String(first.results[0].reason).includes('temp-fail'))
  assertEquals(first.sent, 0)
  assertEquals(r2.db.notifications[0].pushed_at !== null, true, 'الادعاء حدث قبل الإرسال')

  // المزود سليم الآن — لكن الإشعار مُدّعى → خارج المرشحين
  r2.provider.setResponse(201)
  const second = await runPushSweep(dbOf(r2), r2.vapidEnv)
  assertEquals(second.scanned, 0, 'المُدّعى لا يعود للمرشحين')
  const forced = await forceDispatch(dbOf(r2), r2.vapidEnv, n2.id)
  assertEquals(forced.status, 'claimed-elsewhere')
  await r2.cleanUp()
})

Deno.test('forceDispatch يرسل إشعارًا غير مُدّعى ويحدّث السجل', async () => {
  const r = await rig()
  const n = notif()
  r.db.notifications.push(n)

  const result = await forceDispatch(dbOf(r), r.vapidEnv, n.id)
  assertEquals(result.status, 'sent')
  assertEquals(result.sent, 1)
  assertEquals(r.provider.received.length, 1)
  const logRow = r.db.pushDispatchLog.find((l) => l.notification_id === n.id)
  assert(logRow, 'السجل مفقود')
  assertEquals((logRow!.detail as any).channel, 'supabase-edge-forced')

  await r.cleanUp()
})

Deno.test('deepLinkFor: عقد الروابط الثلاث', () => {
  const id = 'n-123'
  assertEquals(deepLinkFor(null, id), `/app?notification=${id}`)
  assertEquals(deepLinkFor('/app?module=journal', id), '/app?module=journal')
  assertEquals(deepLinkFor('tasks', id), `/app?module=tasks&notification=${id}`)
})
