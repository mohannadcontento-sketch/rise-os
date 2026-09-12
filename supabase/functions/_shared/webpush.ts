// ============================================================
// webpush.ts — Web Push أصيل على Edge Function (Deno)
//
// بديل مكتبة web-push داخل Supabase: تنفيذ بروتوكول التشفير
// كاملًا عبر Web Crypto (crypto.subtle) بلا أي تبعية:
//   • VAPID JWT (RFC 8292): ES256 — توقيع P-256 خام r||s وهو
//     الصيغة التي تتطلبها JOSE (Web Crypto يخرجها هكذا فعلًا)
//   • تشفير الحمولة (RFC 8291 aes128gcm): ECDH مؤقت →
//     HKDF-SHA256 بمُدخل auth_secret||shared → CEK(16)/NONCE(12)
//     ثم AES-128-GCM، والجسم: salt(16)||rs(4be)||ciphertext
//   • الرأس Crypto-Key: dh=<المفتاح العام المؤقت>
//     والرأس Authorization: vapid t=<jwt>, k=<المفتاح العام>
//
// تمثيل المفاتيح (مطابق لما تخزنه app_config/زرع الهجرة 028):
//   • عام: base64url بلا حشو لـ65 بايت خام 04||X||Y
//   • خاص: base64url بلا حشو لـ32 بايت (السلمار الخام — كما
//     تولّدها npx web-push generate-vapid-keys). نحوّله هنا إلى
//     PKCS#8 ببنية DER ثابتة (26 بايت بادئة + 32 السلمار) —
//     نفس التحويل الذي تفعله مكتبة web-push داخليًا.
//
// التحقق: supabase/tests/edge/ يشغّل round-trip كاملًا — خادم
// وهمي لمزود البوش «يفك» التشفير بمفتاح الاشتراك الخاص ويتحقق
// من توقيع VAPID بالمفتاح العام — إثبات صحة الترميز من الطرفين.
// ============================================================

// ── القسم: ترميز base64url ─────────────────────

/** بايتات مدعومة بـArrayBuffer فعلية — قابلة للتمرير لـWeb Crypto (BufferSource) */
type Bytes = Uint8Array<ArrayBuffer>

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Uint8Array → base64url بلا حشو */
export function bytesToB64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64URL_ALPHABET[b0 >> 2]
    out += B64URL_ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 === undefined) break
    out += B64URL_ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 === undefined) break
    out += B64URL_ALPHABET[b2 & 63]
  }
  return out
}

/** base64url → بايتات (يتقبل حشوًا زائدًا وأبجدية base64 قياسية) */
export function b64UrlToBytes(input: string): Bytes {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const enc = new TextEncoder()

// ── القسم: VAPID — استيراد المفاتيح وتوقيع JWT ─────────────────────

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

/** بادئة DER الثابتة لـPKCS#8 (ECPrivateKey P-256) — 26 بايت */
const PKCS8_PREFIX = new Uint8Array([
  0x30, 0x41, 0x02, 0x01, 0x00, // SEQUENCE { version 0
  0x30, 0x13, //   AlgorithmIdentifier SEQUENCE (19)
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, //   OID ecPublicKey
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, //   OID prime256v1
  0x04, 0x27, //   OCTET STRING (39) — ECPrivateKey
  0x30, 0x25, //     SEQUENCE (37)
  0x02, 0x01, 0x01, //       INTEGER 1
  0x04, 0x20, //       OCTET STRING (32) — السلمار
])

/** تحويل السلمار الخام (32B b64url) إلى PKCS#8 قابلة للاستيراد */
function scalarToPkcs8(scalar: Bytes): Bytes {
  if (scalar.length !== 32) throw new Error('المفتاح الخاص VAPID يجب أن يكون 32 بايتًا (b64url خام)')
  const out = new Uint8Array(PKCS8_PREFIX.length + 32)
  out.set(PKCS8_PREFIX, 0)
  out.set(scalar, PKCS8_PREFIX.length)
  return out
}

/** استيراد المفتاح الخاص للتوقيع ES256 */
async function importVapidSigningKey(privateKeyB64: string): Promise<CryptoKey> {
  const pkcs8 = scalarToPkcs8(b64UrlToBytes(privateKeyB64))
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/**
 * توقيع VAPID JWT (RFC 8292).
 * aud = أصل نقطة مزود البوش؛ exp = الآن + 12 ساعة؛ sub = البريد.
 */
export async function createVapidJwt(
  vapid: VapidConfig,
  pushEndpoint: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const url = new URL(pushEndpoint)
  const aud = `${url.protocol}//${url.host}`
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = {
    aud,
    exp: Math.floor(nowMs / 1000) + 12 * 3600,
    sub: vapid.subject || 'mailto:awj@awj.life',
  }
  const unsigned =
    `${bytesToB64Url(enc.encode(JSON.stringify(header)))}.${bytesToB64Url(enc.encode(JSON.stringify(claims)))}`

  const key = await importVapidSigningKey(vapid.privateKey)
  // إخراج Web Crypto لـECDSA = خام r||s (64 بايت) — صيغة JOSE فعلًا
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  if (sig.length !== 64) throw new Error('توقيع ES256 غير متوقع (ليس r||s خامًا)')
  return `${unsigned}.${bytesToB64Url(sig)}`
}

// ── القسم: HKDF (RFC 5869 — كتلة واحدة تكفي لـ16/12 بايتًا) ─────────

async function hmacSha256(key: Bytes, data: Bytes): Promise<Bytes> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data))
}

/** HKDF-SHA256: استخراج ثم توسيع كتلة واحدة (T1) */
async function hkdf(ikm: Bytes, salt: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmacSha256(salt, ikm)
  // التوسيع: T(1) = HMAC(PRK, info || 0x01)
  const infoAndCounter = new Uint8Array(info.length + 1)
  infoAndCounter.set(info, 0)
  infoAndCounter[info.length] = 1
  const t1 = await hmacSha256(prk, infoAndCounter)
  return t1.slice(0, length)
}

// ── القسم: تشفير الحمولة (RFC 8291 aes128gcm) ─────────────────────

export interface EncryptedPush {
  /** الجسم الثنائي: salt(16) || rs(4, big-endian) || ciphertext */
  body: Bytes
  /** المفتاح العام المؤقت (b64url خام 65B) لرأس Crypto-Key: dh= */
  serverPublicKeyB64: string
}

const RS_RECORD_SIZE = 4096

/** تشفير حمولة نصية إلى اشتراك push معطى */
export async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authSecretB64: string,
): Promise<EncryptedPush> {
  // 1) زوج مؤقت للإرسال (ECDH P-256) — عمومي واحد لكل إرسال
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const serverPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer,
  )

  // 2) الاشتراك: استيراد المفتاح العام للمتصفح
  const clientPublicRaw = b64UrlToBytes(p256dhB64)
  if (clientPublicRaw.length !== 65 || clientPublicRaw[0] !== 0x04) {
    throw new Error('مفتاح p256dh غير صالح (متوقع 65 بايت غير مضغوط)')
  }
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  // 3) السر المشترك + auth_secret → IKM (الترتيب إلزامي: auth أولاً)
  const shared = new Uint8Array(
    (await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeys.privateKey, 256)) as ArrayBuffer,
  )
  const authSecret = b64UrlToBytes(authSecretB64)
  if (authSecret.length !== 16) throw new Error('auth secret غير صالح (متوقع 16 بايتًا)')
  const ikm = new Uint8Array(authSecret.length + shared.length)
  ikm.set(authSecret, 0)
  ikm.set(shared, authSecret.length)

  // 4) CEK/NONCE عبر HKDF بملصقات RFC 8291
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm'), 16)
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce'), 12)

  // 5) التشفير: سجل واحد — النص + محرف الفصل 0x02 (بلا حشو إضافي)
  const pt = enc.encode(plaintext)
  const plain = new Uint8Array(pt.length + 1)
  plain.set(pt, 0)
  plain[pt.length] = 0x02
  if (plain.length + 16 + 1 > RS_RECORD_SIZE) {
    throw new Error('الحمولة أكبر من سجل واحد (4079 بايتًا كحد أقصى)')
  }

  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM', length: 128 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, plain),
  )

  // 6) الجسم: salt || rs(4 big-endian) || ciphertext
  const body = new Uint8Array(16 + 4 + ciphertext.length)
  body.set(salt, 0)
  new DataView(body.buffer).setUint32(16, RS_RECORD_SIZE, false)
  body.set(ciphertext, 20)

  return { body, serverPublicKeyB64: bytesToB64Url(serverPublic) }
}

// ── القسم: الإرسال ─────────────────────

export interface PushSubscriptionTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface SendPushOptions {
  ttlSec: number
  urgency: 'high' | 'normal'
}

export type PushSendOutcome =
  | { kind: 'sent' }
  | { kind: 'expired' }
  | { kind: 'temp-fail'; status?: number; message?: string }
  | { kind: 'error'; message: string }

/**
 * إرسال push واحد لمزود الخدمة (FCM/Mozilla autopush…).
 * لا يرمي أبدًا — النتيجة للتشخيص وإدارة الاشتراكات.
 */
export async function sendWebPush(
  subscription: PushSubscriptionTarget,
  payload: string,
  vapid: VapidConfig,
  options: SendPushOptions,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PushSendOutcome> {
  try {
    let encrypted: EncryptedPush
    try {
      encrypted = await encryptPayload(payload, subscription.p256dh, subscription.auth)
    } catch (err) {
      return { kind: 'error', message: `فشل التشفير: ${(err as Error).message}` }
    }

    const jwt = await createVapidJwt(vapid, subscription.endpoint)

    const res = await fetchImpl(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(Math.max(0, Math.floor(options.ttlSec))),
        Urgency: options.urgency,
        'Content-Encoding': 'aes128gcm',
        'Crypto-Key': `dh=${encrypted.serverPublicKeyB64}`,
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        'Content-Type': 'application/octet-stream',
      },
      body: encrypted.body,
      signal: AbortSignal.timeout(8_000),
    })

    // 20x = نجاح | 404/410 = الاشتراك مات عند المزود | الباقي مؤقت
    if (res.ok) return { kind: 'sent' }
    if (res.status === 404 || res.status === 410) return { kind: 'expired' }
    return { kind: 'temp-fail', status: res.status }
  } catch (err) {
    const message = (err as Error)?.message ?? 'خطأ شبكة غير معروف'
    // انتهاء مهلة/انقطاع شبكة = مؤقت وليس دائمًا
    if (message.includes('timeout') || message.includes('Timeout') || err instanceof DOMException) {
      return { kind: 'temp-fail', message }
    }
    return { kind: 'error', message }
  }
}
