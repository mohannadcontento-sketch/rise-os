// ════════════════════════════════════════════════════════════
// ملف مدموج آليًا للنشر من لوحة Supabase (الوظيفة: push-dispatch)
// وُلِّد بواسطة scripts/build-dashboard-bundles.mjs — 2026-09-13 01:03:26 UTC
// لا تحرر هذا الملف يدويًا؛ عدّل المصادر ثم أعد التوليد.
//
// طريقة النشر (Dashboard):
//   1) Edge Functions → «Create a new function»
//   2) الاسم: push-dispatch (بالضبط — الرابط يعتمد عليه)
//   3) عطّل «Verify JWT with legacy secret» إن ظهر الخيار
//   4) الصق كامل هذا الملف ثم Save/Deploy
//   المصادر الأصلية:
//     _shared/postgrest.ts
//     _shared/webpush.ts
//     _shared/push-core.ts
//     push-dispatch/index.ts
// ════════════════════════════════════════════════════════════

// ──────────────────── من _shared/postgrest.ts ────────────────────
// ============================================================
// postgrest.ts — عميل PostgREST خفيف لـEdge Functions (Deno)
//
// «صفر تبعيات»: لا supabase-js ولا أي npm — فقط fetch الأصلية.
// هذا يضمن توافقًا كاملًا مع edge-runtime المقيّد على Supabase
// ويجعل المنطق قابلًا للاختبار محليًا عبر توجيه baseUrl نحو
// خادم وهمي (انظر supabase/tests/edge/mock-postgrest.ts).
//
// العقد المُستهدَف (مطابق لما تفعله مستودعات التطبيق عبر
// supabase-js، لأن Edge Function تعمل بمفتاح service_role):
//   • GET  /rest/v1/{table}?select=…&filters…  → صفوف
//   • GET  بـ Accept: vnd.pgrst.object (maybeSingle) → كائن
//     أو null عند PGRST116 (نفس معالجة postgrest-js للـ406)
//   • POST /rest/v1/rpc/{fn} بجسم JSON → ناتج الدالة
//   • POST upsert عبر ?on_conflict=… + Prefer:
//     resolution=merge-duplicates,return=representation
//   • PATCH للتحديثات الجزئية (last_used_at للمفاتيح)
//
// الأمان: كل نداء يحمل ترويستي apikey + Authorization بمفتاح
// الخدمة — PostgREST يضبط request.jwt.claim.role=service_role
// فتُتجاوز RLS؛ لذلك يفرض كل مستدعٍ ملكية user_id بنفسه
// (تنبيه موثّق في كل مكان يستدعي هذا الملف).
//
// المهلة: AbortSignal.timeout(10s) لكل نداء — لا تعليق
// دائم داخل Edge Function مهما استجاب الخادم.
// ============================================================

/** خطأ PostgREST مُغلَّف برمز الحالة (يفضَّل على رسالة fetch) */
class PostgrestError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'PostgrestError'
    this.status = status
    this.code = code
  }
}

/** شكل خطأ PostgREST القياسي في الجسم */
interface PostgrestErrorBody {
  message?: string
  code?: string
  details?: string
  hint?: string
}

interface PostgrestOptions {
  /** قاعدة المعرّف: https://<ref>.supabase.co (بلا شرطة مائلة ختامية) */
  baseUrl: string
  /** مفتاح الخدمة (service_role) — يُقرأ من متغيرات البيئة المحقونة */
  serviceKey: string
  /** fetch قابلة للاستبدال للاختبار (الافتراضي العالمية) */
  fetchImpl?: typeof fetch
}

interface QueryParams {
  /** select=... (افتراضي *) */
  select?: string
  /** فلاتر خام: { user_id: 'eq.<uuid>', date: 'eq.2026-09-13' } */
  filters?: Record<string, string>
  /** ترتيب: ['order.asc', 'date.desc'] */
  order?: string[]
  /** حد النتائج */
  limit?: number
}

// ── القسم: ترميز الاستعلام ─────────────────────

/** بناء سلسلة الاستعلام من الأجزاء (فلاتر + ترتيب + حد) */
function buildQuery(params: QueryParams): string {
  const parts: string[] = []
  parts.push(`select=${encodeURIComponent(params.select ?? '*')}`)
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  for (const o of params.order ?? []) parts.push(`order=${encodeURIComponent(o)}`)
  if (params.limit) parts.push(`limit=${params.limit}`)
  return parts.join('&')
}

/**
 * صياغة قائمة in.() بقيم آمنة: in.("a","b") — علامات الاقتباس
 * إلزامية لقيم تحوي فواصل/مسافات، وصحيحة تمامًا للـUUID والتواريخ.
 */
function inList(values: string[]): string {
  const quoted = values.map((v) => `"${v.replace(/"/g, '\\"')}"`)
  return `in.(${quoted.join(',')})`
}

// ── القسم: العميل ─────────────────────

class Postgrest {
  private base: string
  private key: string
  private fetchImpl: typeof fetch

  constructor(opts: PostgrestOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '')
    this.key = opts.serviceKey
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  /** نداء خام — يفك الخطأ أو يعيد الجسم محلولًا */
  private async call(path: string, init: RequestInit): Promise<unknown> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.base}${path}`, init)
    } catch (err) {
      throw new PostgrestError(`تعذر الوصول لقاعدة البيانات: ${(err as Error)?.message ?? ''}`, 503)
    }

    const text = await res.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    if (!res.ok) {
      const errBody = (body ?? {}) as PostgrestErrorBody
      throw new PostgrestError(
        errBody.message ?? `فشل نداء قاعدة البيانات (${res.status})`,
        res.status,
        errBody.code,
      )
    }
    return body
  }

  /** GET صفوف — مصفوفة */
  async select(table: string, params: QueryParams = {}): Promise<unknown> {
    return this.call(`/rest/v1/${table}?${buildQuery(params)}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** GET صف واحد — null عند غيابه (PGRST116 = «لا صفوف» وليس خطأ) */
  async maybeSingle(table: string, params: QueryParams = {}): Promise<unknown> {
    try {
      return await this.call(`/rest/v1/${table}?${buildQuery(params)}`, {
        method: 'GET',
        headers: this.headers({ Accept: 'application/vnd.pgrst.object+json' }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      if (err instanceof PostgrestError && err.code === 'PGRST116') return null
      throw err
    }
  }

  /** استدعاء دالة SQL — يعيد ناتجها كما هو */
  async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    return this.call(`/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** upsert ذري — on_conflict يطابق أقواس القيود الفريدة */
  async upsert(
    table: string,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<unknown> {
    return this.call(
      `/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: 'POST',
        headers: this.headers({
          Accept: 'application/vnd.pgrst.object+json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(10_000),
      },
    )
  }

  /** تحديث جزئي (patch) — يُستخدم لـlast_used_at فقط */
  async patch(
    table: string,
    filters: Record<string, string>,
    row: Record<string, unknown>,
  ): Promise<void> {
    const qs = Object.entries(filters)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    await this.call(`/rest/v1/${table}?${qs}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** إدراج سجل (التدقيق) — بلا إعادة تمثيل */
  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    await this.call(`/rest/v1/${table}`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** حذف بفلاتر (تنظيف رموز OAuth المنتهية — أفضل جهد) */
  async delete(table: string, filters: Record<string, string>): Promise<void> {
    const qs = Object.entries(filters)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    await this.call(`/rest/v1/${table}?${qs}`, {
      method: 'DELETE',
      headers: this.headers({ Prefer: 'return=minimal' }),
      signal: AbortSignal.timeout(10_000),
    })
  }
}

// ──────────────────── من _shared/webpush.ts ────────────────────
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
function bytesToB64Url(bytes: Uint8Array): string {
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
function b64UrlToBytes(input: string): Bytes {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const enc = new TextEncoder()

// ── القسم: VAPID — استيراد المفاتيح وتوقيع JWT ─────────────────────

interface VapidConfig {
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
async function createVapidJwt(
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

interface EncryptedPush {
  /** الجسم الثنائي: salt(16) || rs(4, big-endian) || ciphertext */
  body: Bytes
  /** المفتاح العام المؤقت (b64url خام 65B) لرأس Crypto-Key: dh= */
  serverPublicKeyB64: string
}

const RS_RECORD_SIZE = 4096

/** تشفير حمولة نصية إلى اشتراك push معطى */
async function encryptPayload(
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

interface PushSubscriptionTarget {
  endpoint: string
  p256dh: string
  auth: string
}

interface SendPushOptions {
  ttlSec: number
  urgency: 'high' | 'normal'
}

type PushSendOutcome =
  | { kind: 'sent' }
  | { kind: 'expired' }
  | { kind: 'temp-fail'; status?: number; message?: string }
  | { kind: 'error'; message: string }

/**
 * إرسال push واحد لمزود الخدمة (FCM/Mozilla autopush…).
 * لا يرمي أبدًا — النتيجة للتشخيص وإدارة الاشتراكات.
 */
async function sendWebPush(
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

// ──────────────────── من _shared/push-core.ts ────────────────────
// ============================================================
// push-core.ts — مكنسة/مرسل طابور Web Push (Edge Function)
//
// الدور (مكمّل وليس بديلًا لمسار Vercel السريع):
//   • إرسال الإشعارات التي أنشأها التطبيق لكن لم يُرسِلها أحد
//     (انهيار نسخة السيرفر قبل الإرسال، فشل مؤقت للشبكة…)
//   • إرسال إشعارات أُنشئت مباشرة في القاعدة (لوحة الأدمن أو
//     SQL) — لا يوجد من يرسلها غير هذه الدالة
//   • الإرسال المجدول عبر pg_cron → pg_net (الهجرة 033)
//
// التصميم:
//   1) VAPID من env (إن وُجد) ثم app_config (زرع الهجرة 028)
//      — نفس ترتيب src/lib/push/vapid.ts
//   2) المرشّحون: notifications بلا pushed_at أُنشئت خلال آخر
//      15 دقيقة (نافذة قابلة للضبط) وغير مُسجَّل لها نتيجة نهائية
//      في push_dispatch_log
//   3) لكل مرشّح: بوابة gate_push_for_notification نفسها (ادعاء
//      ذري لـpushed_at + تفضيلات + سقوف 10/س و30/ي) — المتزامن
//      مع مسار Vercel يذوب بأمان: من يدّعي أولًا يرسل
//   4) الإرسال عبر webpush.ts الأصيل: TTL 4h/عالي 24h/عادي،
//      حمولة بعقد sw.js نفسه، 404/410 → إبطال الاشتراك
//   5) كل نتيجة تُسجَّل في push_dispatch_log (إعادة المحاولة
//      لحالة error فقط ضمن النافذة)
//
// الاستدعاء: POST من pg_cron (مصادقة Bearer بمفتاح الخدمة من
// vault أو x-cron-secret) — أو يدويًا بمفتاح الخدمة، مع
// ?notification_id=<uuid> لفرض إرسال إشعار بعينه (تشخيص).
// ============================================================


// ── القسم: الأنواع ─────────────────────

interface SweepOptions {
  /** نافذة المرشحين بالدقائق (افتراضي 15) */
  windowMin?: number
  /** سقف الإشعارات في الجولة الواحدة (افتراضي 25) */
  maxNotifications?: number
  /** fetch قابلة للاستبدال (اختبارات) */
  fetchImpl?: typeof fetch
}

interface SweepNotificationResult {
  notificationId: string
  status: 'sent' | 'denied' | 'no-subscriptions' | 'error' | 'claimed-elsewhere' | 'not-found'
  attempted: number
  sent: number
  revoked: number
  reason?: string
}

interface SweepSummary {
  ok: boolean
  reason?: 'no_vapid' | 'not_configured'
  scanned: number
  processed: number
  attempted: number
  sent: number
  revoked: number
  results: SweepNotificationResult[]
  startedAt: string
  finishedAt: string
}

// ── القسم: قراءة VAPID (env ثم app_config) ─────────────────────

async function loadVapidConfig(db: Postgrest, env: Record<string, string | undefined>): Promise<VapidConfig | null> {
  const envPublic = env.VAPID_PUBLIC_KEY ?? ''
  const envPrivate = env.VAPID_PRIVATE_KEY ?? ''
  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: env.VAPID_SUBJECT || 'mailto:awj@awj.life',
    }
  }

  try {
    const rows = ((await db.select('app_config', {
      select: 'key,value',
      filters: { key: 'in.("vapid_public_key","vapid_private_key","vapid_subject")' },
    })) ?? []) as { key: string; value: string }[]
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = String(r.value ?? '')
    if (!map.vapid_public_key || !map.vapid_private_key) return null
    return {
      publicKey: map.vapid_public_key,
      privateKey: map.vapid_private_key,
      subject: map.vapid_subject || 'mailto:awj@awj.life',
    }
  } catch (err) {
    console.warn('[push/edge] vapid read failed:', (err as Error)?.message)
    return null
  }
}

// ── القسم: رابط الفتح (عقد sw.js نفسه) ─────────────────────

/** تحويل action_url الإشعار إلى رابط فتح حقيقي للمتصفح */
function deepLinkFor(actionUrl: string | null | undefined, notificationId: string): string {
  if (!actionUrl) return `/app?notification=${notificationId}`
  if (actionUrl.startsWith('/')) return actionUrl
  return `/app?module=${encodeURIComponent(actionUrl)}&notification=${notificationId}`
}

// ── القسم: الجولة الرئيسية ─────────────────────

/**
 * جولة مكنسة واحدة. لا ترمي أبدًا — كل خطأ يظهر في الملخص.
 */
async function runPushSweep(
  db: Postgrest,
  env: Record<string, string | undefined>,
  opts: SweepOptions = {},
): Promise<SweepSummary> {
  const startedAt = new Date().toISOString()
  // ok = true فقط لجولة نظيفة بلا سبب (مرشّحون صفرويون)
  // no_vapid/not_configured = مشكلة إعداد يجب أن تظهر للمشغل
  const empty = (reason: SweepSummary['reason']): SweepSummary => ({
    ok: reason === undefined,
    reason,
    scanned: 0,
    processed: 0,
    attempted: 0,
    sent: 0,
    revoked: 0,
    results: [],
    startedAt,
    finishedAt: new Date().toISOString(),
  })

  const vapid = await loadVapidConfig(db, env)
  if (!vapid) return empty('no_vapid')
  const windowMin = opts.windowMin ?? 15
  const maxN = opts.maxNotifications ?? 25
  const since = new Date(Date.now() - windowMin * 60_000).toISOString()

  // 1) المرشحون: حديث + غير مرسَل
  let candidates: { id: string }[] = []
  try {
    candidates = ((await db.select('notifications', {
      select: 'id',
      filters: { pushed_at: 'is.null', created_at: `gte.${since}` },
      order: ['created_at.asc'],
      limit: maxN * 2,
    })) ?? []) as { id: string }[]
  } catch (err) {
    console.warn('[push/edge] candidates query failed:', (err as Error)?.message)
    return empty('not_configured')
  }
  if (candidates.length === 0) return empty(undefined)

  // 2) استبعاد من لهم نتيجة نهائية سابقة (error وحدها تُعاد محاولتها)
  const ids = candidates.map((c) => String(c.id))
  let terminal = new Set<string>()
  try {
    const logs = ((await db.select('push_dispatch_log', {
      select: 'notification_id,status',
      filters: { notification_id: `in.(${ids.map((i) => `"${i}"`).join(',')})` },
    })) ?? []) as { notification_id: string; status: string }[]
    for (const l of logs) {
      if (l.status !== 'error') terminal.add(String(l.notification_id))
    }
  } catch {
    // الجدول غير موجود بعد (قبل الهجرة 033) — نتابع بلا استبعاد
    // (الادعاء الذري في البوابة يمنع الإرسال المزدوج أصلًا)
  }
  const queue = candidates.filter((c) => !terminal.has(String(c.id))).slice(0, maxN)
  if (queue.length === 0) return { ...empty(undefined), scanned: candidates.length }

  // 3) المعالجة
  const results: SweepNotificationResult[] = []
  let attempted = 0
  let sent = 0
  let revoked = 0

  for (const candidate of queue) {
    const notificationId = String(candidate.id)
    const res = await dispatchOne(db, vapid, notificationId, opts.fetchImpl)
    results.push(res)
    attempted += res.attempted
    sent += res.sent
    revoked += res.revoked

    // التسجيل في push_dispatch_log (أفضل جهد — إخفاقه لا يوقف الجولة)
    try {
      await db.upsert(
        'push_dispatch_log',
        {
          notification_id: notificationId,
          status: res.status,
          detail: {
            attempted: res.attempted,
            sent: res.sent,
            revoked: res.revoked,
            reason: res.reason ?? null,
            channel: 'supabase-edge',
          },
        },
        'notification_id',
      )
    } catch (err) {
      console.warn('[push/edge] log write failed:', (err as Error)?.message)
    }
  }

  return {
    ok: true,
    scanned: candidates.length,
    processed: queue.length,
    attempted,
    sent,
    revoked,
    results,
    startedAt,
    finishedAt: new Date().toISOString(),
  }
}

// ── القسم: إرسال إشعار واحد ─────────────────────

interface GateResult {
  ok: boolean
  reason?: string
  user_id?: string
  title?: string
  body?: string
  priority?: string
  action_url?: string | null
}

/** إرسال إشعار واحد عبر البوابة الذرية (تكافؤ dispatch.ts) */
async function dispatchOne(
  db: Postgrest,
  vapid: VapidConfig,
  notificationId: string,
  fetchImpl?: typeof fetch,
): Promise<SweepNotificationResult> {
  const base: SweepNotificationResult = {
    notificationId,
    status: 'error',
    attempted: 0,
    sent: 0,
    revoked: 0,
  }

  // 1) البوابة (ادعاء ذري pushed_at) — المتزامن مع Vercel يذوب هنا
  let gate: GateResult
  try {
    gate = (await db.rpc('gate_push_for_notification', {
      p_notification_id: notificationId,
    })) as GateResult
  } catch (err) {
    return { ...base, reason: `gate-error:${(err as Error)?.message}` }
  }

  if (!gate || gate.ok !== true) {
    const reason = gate?.reason ?? 'unknown'
    if (reason === 'not_found') return { ...base, status: 'not-found', reason }
    if (reason === 'already_pushed') return { ...base, status: 'claimed-elsewhere', reason }
    return { ...base, status: 'denied', reason }
  }

  // 2) الاشتراكات النشطة للمستخدم
  let subs: PushSubscriptionTarget[] = []
  try {
    const rows = ((await db.select('push_subscriptions', {
      select: 'endpoint,p256dh,auth',
      filters: { user_id: `eq.${gate.user_id}`, revoked_at: 'is.null' },
      limit: 20,
    })) ?? []) as PushSubscriptionTarget[]
    subs = rows
  } catch (err) {
    return { ...base, reason: `subs-error:${(err as Error)?.message}` }
  }
  if (subs.length === 0) return { ...base, status: 'no-subscriptions', reason: 'no_subscriptions' }

  // 3) الحمولة — عقد sw.js نفسه (title/body/icon/badge/tag/url)
  const isHigh = gate.priority === 'high'
  const payload = JSON.stringify({
    title: String(gate.title ?? 'أوج'),
    body: String(gate.body ?? ''),
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: `awj-${notificationId}`,
    url: deepLinkFor(gate.action_url, notificationId),
  })

  let sent = 0
  let revoked = 0
  let lastError: string | undefined

  for (const sub of subs) {
    const outcome = await sendWebPush(
      sub,
      payload,
      vapid,
      { ttlSec: isHigh ? 4 * 3600 : 24 * 3600, urgency: isHigh ? 'high' : 'normal' },
      fetchImpl,
    )
    if (outcome.kind === 'sent') {
      sent += 1
      // نجاح → تحديث last_push_at (أفضل جهد)
      try {
        await db.rpc('touch_push_subscription', { p_endpoint: sub.endpoint })
      } catch { /* أفضل جهد */ }
    } else if (outcome.kind === 'expired') {
      // الاشتراك مات عند المزود → إبطال دائم
      revoked += 1
      try {
        await db.rpc('revoke_push_subscription', {
          p_endpoint: sub.endpoint,
          p_reason: 'expired',
        })
      } catch { /* أفضل جهد */ }
    } else if (outcome.kind === 'temp-fail') {
      // خطأ مؤقت (شبكة/مزود 500/429) — نتركه لمرات قادمة
      lastError = `temp-fail:${outcome.status ?? outcome.message ?? ''}`
    } else {
      lastError = `send-error:${outcome.message}`
    }
  }

  // لم يصل أي جهاز؟ → حالة error للرصد (ملاحظة at-most-once:
  // البوابة ادّعت pushed_at قبل الإرسال، فالإعادة الفعلية
  // مستحيلة — لكن السجل يوثّق الحقيقة للمشغل)
  if (sent === 0) {
    return {
      ...base,
      status: 'error',
      attempted: subs.length,
      sent,
      revoked,
      reason: lastError ?? 'no-delivery',
    }
  }
  return { ...base, status: 'sent', attempted: subs.length, sent, revoked }
}

/** فرض إرسال إشعار بعينه (تشخيص يدوي بمفتاح الخدمة) */
async function forceDispatch(
  db: Postgrest,
  env: Record<string, string | undefined>,
  notificationId: string,
  fetchImpl?: typeof fetch,
): Promise<SweepNotificationResult> {
  const vapid = await loadVapidConfig(db, env)
  if (!vapid) {
    return {
      notificationId,
      status: 'error',
      attempted: 0,
      sent: 0,
      revoked: 0,
      reason: 'no_vapid',
    }
  }
  const res = await dispatchOne(db, vapid, notificationId, fetchImpl)
  try {
    await db.upsert(
      'push_dispatch_log',
      {
        notification_id: notificationId,
        status: res.status,
        detail: {
          attempted: res.attempted,
          sent: res.sent,
          revoked: res.revoked,
          reason: res.reason ?? null,
          channel: 'supabase-edge-forced',
        },
      },
      'notification_id',
    )
  } catch { /* أفضل جهد */ }
  return res
}

// ──────────────────── من push-dispatch/index.ts ────────────────────
// ============================================================
// supabase/functions/push-dispatch/index.ts — مرسل Web Push
//
// نقطة الدخول: مكنسة طابور Web Push على Supabase Edge
// Functions. النواة في _shared/push-core.ts والتشفير الأصيل
// (VAPID + RFC 8291) في _shared/webpush.ts.
//
// طرق الاستدعاء:
//   1) مجدولًا: pg_cron → pg_net كل دقيقتين (الهجرة 033)
//      بمصادقة Bearer بمفتاح الخدمة (من vault) أو x-cron-secret
//   2) يدويًا: POST بمفتاح الخدمة — إجبار إشعار بعينه عبر
//      ?notification_id=<uuid> (تشخيص/اختبار)
//
// النشر — مساران:
//   أ) CLI (كامل البنية): supabase functions deploy
//      push-dispatch --no-verify-jwt
//   ب) لوحة Dashboard (ملف واحد فقط): الصق الملف المدموج
//      supabase/dist/push-dispatch.dashboard.ts — وُلّد بـ
//      scripts/build-dashboard-bundles.mjs (لا تحرره يدويًا)
//      التفاصيل الكاملة + خطوات الجدولة: supabase/DEPLOY.md
//
// متغيرات البيئة:
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (حقن تلقائي)
//   VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT (اختياري —
//   بدونها تُقرأ من app_config التي زرعتها الهجرة 028)
//   CRON_SECRET (اختياري — بديل المصادقة للمجدول)
// ============================================================


const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const db = new Postgrest({ baseUrl: supabaseUrl, serviceKey: serviceKey })

function env(): Record<string, string | undefined> {
  return {
    VAPID_PUBLIC_KEY: Deno.env.get('VAPID_PUBLIC_KEY'),
    VAPID_PRIVATE_KEY: Deno.env.get('VAPID_PRIVATE_KEY'),
    VAPID_SUBJECT: Deno.env.get('VAPID_SUBJECT'),
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** المصادقة: مفتاح الخدمة (Bearer) أو سر المجدول (x-cron-secret) */
function authorized(req: Request): boolean {
  if (!serviceKey && !cronSecret) return false // غير مهيأ = مغلق
  const auth = req.headers.get('authorization') || ''
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) return true
  return false
}

Deno.serve(
  // PORT للتشغيل المحلي والاختبارات — المنصة تدير المنفذ بنفسها
  { port: Number(Deno.env.get('PORT') || 8000) },
  async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return json({ error: 'هذه الوظيفة تقبل POST فقط' }, 405)
    }
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'الوظيفة غير مهيأة: متغيرات Supabase مفقودة' }, 500)
    }
    if (!authorized(req)) {
      return json({ error: 'غير مصرح — مطلوب مفتاح الخدمة أو سر المجدول' }, 401)
    }

    // فرض إشعار بعينه؟ (تشخيص)
    const url = new URL(req.url)
    const notificationId = url.searchParams.get('notification_id')
    if (notificationId) {
      if (!/^[0-9a-f-]{36}$/i.test(notificationId)) {
        return json({ error: 'notification_id غير صالح (uuid)' }, 400)
      }
      const result = await forceDispatch(db, env(), notificationId)
      return json({ forced: true, result })
    }

    // جولة المكنسة العادية
    try {
      const summary = await runPushSweep(db, env())
      return json(summary)
    } catch (err) {
      return json({ ok: false, error: (err as Error)?.message ?? 'خطأ غير معروف' }, 200)
    }
  },
)

