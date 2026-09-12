// ============================================================
// vapid-crypto.test.ts — اختبار دورة التشفير الكاملة
//
// يثبت صحة تنفيذ webpush.ts من الجهتين:
//   1) توليد زوج VAPID (نفس تمثيل app_config: عام 65B خام /
//      خاص 32B سلمار، base64url) ثم توقيع JWT والتحقق منه
//      بالمفتاح العام + فك الادعاءات (aud/exp/sub)
//   2) تشفير حمولة إلى «اشتراك» مولّد، ثم فك تشفيرها كما
//      يفعل مزود البوش الحقيقي: ECDH بالمفتاح الخاص للمتصفح
//      + المفتاح العام المؤقت من رأس Crypto-Key → نفس HKDF →
//      AES-GCM → الحمولة الأصلية نصًا (دليل تطابق RFC 8291)
//   3) sendWebPush ضد خادم مزود وهمي يتحقق من: VAPID JWT،
//      رأس Crypto-Key، TTL/Urgency، حجم الجسم وفك محتواه
// ============================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  bytesToB64Url,
  b64UrlToBytes,
  createVapidJwt,
  encryptPayload,
  sendWebPush,
} from '../../functions/_shared/webpush.ts'
import {
  generateVapidLikeKeys,
  generateSubscriptionKeys,
  decryptAes128gcm,
} from './test-keys.ts'

// ── القسم: الاختبارات ─────────────────────

Deno.test('VAPID: التوقيع ES256 قابل للتحقق + الادعاءات صحيحة', async () => {
  const vapid = await generateVapidLikeKeys()
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123XYZ'
  const now = Date.UTC(2026, 8, 13, 10, 0, 0)
  const jwt = await createVapidJwt(vapid, endpoint, now)

  // فك الأجزاء
  const [h, c, s] = jwt.split('.')
  const header = JSON.parse(new TextDecoder().decode(b64UrlToBytes(h)))
  const claims = JSON.parse(new TextDecoder().decode(b64UrlToBytes(c)))
  assertEquals(header.alg, 'ES256')
  assertEquals(header.typ, 'JWT')
  assertEquals(claims.aud, 'https://fcm.googleapis.com')
  assertEquals(claims.sub, 'mailto:test@awj.life')
  assertEquals(claims.exp, Math.floor(now / 1000) + 12 * 3600)

  // التحقق بالمفتاح العام (خام r||s — صيغة JOSE)
  const pubKey = await crypto.subtle.importKey(
    'raw',
    b64UrlToBytes(vapid.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const unsigned = new TextEncoder().encode(`${h}.${c}`)
  const sig = b64UrlToBytes(s)
  assertEquals(sig.length, 64, 'التوقيع يجب أن يكون r||s خامًا 64 بايتًا')
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    sig,
    unsigned,
  )
  assert(valid, 'توقيع VAPID JWT غير صالح')
})

Deno.test('RFC 8291: التشفير ← فك المزود يعيد الحمولة الأصلية', async () => {
  const sub = await generateSubscriptionKeys()
  const payload = JSON.stringify({
    title: 'أوج',
    body: 'مهمة «مراجعة العقد» حان موعدها',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: 'awj-test-1',
    url: '/app?module=tasks&notification=test-1',
  })

  const encrypted = await encryptPayload(payload, sub.p256dh, sub.auth)
  assertEquals(encrypted.body.length, 16 + 4 + new TextEncoder().encode(payload).length + 1 + 16, 'حجم الجسم: salt+rs+نص+فاصل+وسم')
  assert(encrypted.serverPublicKeyB64.length > 80, 'مفتاح dh عام')

  const decrypted = await decryptAes128gcm(encrypted.body, encrypted.serverPublicKeyB64, sub)
  assertEquals(decrypted, payload, 'الحمولة يجب أن تعود نصًا مطابقًا')
})

Deno.test('sendWebPush: خادم مزود وهمي يتحقق ويستلم ويشفر صحيحًا', async () => {
  const vapid = await generateVapidLikeKeys()
  const sub = await generateSubscriptionKeys()
  const received: { headers: Record<string, string>; body: Uint8Array<ArrayBuffer> }[] = []

  // مزود وهمي: 201 دائمًا + تسجيل الطلب
  const server = Deno.serve({ port: 0 }, (req) => {
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))
    return req.arrayBuffer().then((buf) => {
      received.push({ headers, body: new Uint8Array(buf) })
      return new Response(null, { status: 201 })
    })
  })
  const pushUrl = `http://127.0.0.1:${(server.addr as { port: number }).port}/push/abc`

  const payload = JSON.stringify({ title: 'أوج', body: 'اختبار', tag: 'awj-x' })
  const outcome = await sendWebPush(
    { endpoint: pushUrl, p256dh: sub.p256dh, auth: sub.auth },
    payload,
    vapid,
    { ttlSec: 4 * 3600, urgency: 'high' },
  )
  assertEquals(outcome.kind, 'sent')

  // تحقق من الطلب كما يفعل المزود الحقيقي
  const req = received[0]
  assertEquals(req.headers['ttl'], '14400')
  assertEquals(req.headers['urgency'], 'high')
  assertEquals(req.headers['content-encoding'], 'aes128gcm')
  assert(req.headers['crypto-key']?.startsWith('dh='), 'رأس Crypto-Key: dh=')

  // Authorization: vapid t=..., k=...
  const auth = req.headers['authorization'] || ''
  assert(auth.startsWith('vapid t='), 'رأس vapid')
  const jwt = auth.slice('vapid t='.length).split(',')[0]
  const kParam = auth.split('k=')[1]
  assertEquals(kParam, vapid.publicKey, 'k= المفتاح العام VAPID')

  // التحقق من توقيع الـJWT
  const [h, c, s] = jwt.split('.')
  const pubKey = await crypto.subtle.importKey(
    'raw',
    b64UrlToBytes(vapid.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    b64UrlToBytes(s),
    new TextEncoder().encode(`${h}.${c}`),
  )
  assert(valid, 'JWT المرسل غير موقع صحيحًا')
  const claims = JSON.parse(new TextDecoder().decode(b64UrlToBytes(c)))
  assertEquals(claims.aud, `http://127.0.0.1:${(server.addr as { port: number }).port}`, 'aud = أصل المزود')

  // فك الجسم بجهة المزود
  const dh = (req.headers['crypto-key'] || '').replace('dh=', '')
  const decrypted = await decryptAes128gcm(req.body, dh, sub)
  assertEquals(decrypted, payload)

  await server.shutdown()
})

Deno.test('sendWebPush: 410 = انتهاء الاشتراك، وخطأ التشفير = error', async () => {
  const vapid = await generateVapidLikeKeys()
  // مزود يرد 410
  const server = Deno.serve({ port: 0 }, () => new Response(' Gone', { status: 410 }))
  const url = `http://127.0.0.1:${(server.addr as { port: number }).port}/x`
  const out = await sendWebPush(
    { endpoint: url, p256dh: 'AAAA', auth: 'AAAAAAAAAAAAAAAAAAAAAA' },
    '{}',
    vapid,
    { ttlSec: 60, urgency: 'normal' },
  )
  // p256dh غير صالح → فشل التشفير قبل الإرسال
  assertEquals(out.kind, 'error')
  await server.shutdown()

  // مزود سليم + اشتراك سليم → 410 مع تشفير صحيح
  const sub = await generateSubscriptionKeys()
  const server2 = Deno.serve({ port: 0 }, () => new Response(null, { status: 410 }))
  const url2 = `http://127.0.0.1:${(server2.addr as { port: number }).port}/y`
  const out2 = await sendWebPush(
    { endpoint: url2, p256dh: sub.p256dh, auth: sub.auth },
    '{}',
    vapid,
    { ttlSec: 60, urgency: 'normal' },
  )
  assertEquals(out2.kind, 'expired')
  await server2.shutdown()
})
