// ============================================================
// oauth-core.ts — طبقة OAuth 2.0 لربط ChatGPT بخادم MCP
// (المرحلة 10-ج — تفويض OAuth لأوج)
//
// لماذا هذه الطبقة؟ دوكس OpenAI الرسمية (developer-mode): ChatGPT
// يقبل لخوادم MCP البعيدة مصادقة OAuth فقط (أو بلا مصادقة /
// مختلطة) — لا يقبل مفتاح Bearer ثابت في الترويسة. خادمنا
// «مغلق بالتصميم» يرفض أي طلب بلا هوية، لذا هذه الطبقة تضيف
// مسار التفويض القياسي دون المساس بمسار rise_ القائم:
//
//   GET  ?oauth=metadata   → بيانات خادم التفويض (RFC 8414 مبسط)
//   GET  ?oauth=authorize  → 302 لصفحة الموقع العام (إدخال المفتاح)
//                            ثم 302 مع code بعد المفتاح الصالح
//   POST ?oauth=token      → code→tokens أو refresh→tokens
//   POST ?oauth=register   → تسجيل عميل ديناميكي (RFC 7591)
//   POST (بلا oauth=)      → JSON-RPC كما هو + قبول Bearer JWT
//                            بجانب Bearer rise_ (في mcp-core)
//
// ومسارات path (index.ts يوزّعها إلينا — عقد اكتشاف ChatGPT):
//   GET  /.well-known/oauth-authorization-server → نفس metadata
//   GET  /.well-known/openid-configuration       → نفس metadata
//   GET  /.well-known/oauth-protected-resource   → RFC 9728 (مؤشر AS)
//   POST /register                                 → نفس ?oauth=register
//
// لماذا هذه الإضافات؟ ChatGPT عند إضافة connector لا يعرف
// ?oauth=… أصلًا: هو يكتشف الخدمة عبر well-known (مواصفة MCP
// authorization: لاحقة المسار بعد رابط الخادم) ثم يسجّل نفسه
// ديناميكيًا عبر POST register (RFC 7591). بدون هذه المسارات
// يفشل الاكتشاف وترفض ChatGPT إضافة الخادم نهائيًا — وهو ما
// حدث في الاختبار الحي الأول قبل هذه المراجعة.
//
// التصميم (stateless قدر الإمكان):
//   • JWT موقّعة HS256 بمفتاح اشتقاقي = sha256(service_key +
//     '|awj-mcp-oauth-v1') — ثابت عبر نسخ الدالة، ولا يُفهم إلا
//     لمن يملك مفتاح الخدمة (تدويره يُبطل الرموز → إعادة تفويض).
//   • authorization code = JWT قصيرة العمر (10 دقائق) تحمل
//     user_id + client_id + redirect_uri + تحدي PKCE؛ الاستخدام
//     الواحد يُفرض بإدراج jti في mcp_oauth_codes (تعارض 23505
//     = إعادة تشغيل مرفوضة) — الهجرة 034.
//   • access_token (ساعة) + refresh_token (60 يومًا) بلا جلسات:
//     كل طلب MCP لاحق يعيد فحص الخطة والإيقاف كالمعتاد —
//     نزول المستخدم من ماكس يوقف رموز OAuth فورًا (نفس بوابة
//     rise_ بالضبط).
//   • بيانات العميل (client_id/secret) في app_config (زرع 034) —
//     نفس نمط VAPID في 028. سر العميل نص صريح بنيويًا كقيم
//     VAPID: app_config بلا سياسات RLS للقراءة العامة.
//   • تسجيل ChatGPT الديناميكي (RFC 7591): لا حالة إضافية —
//     endpoint register يعيد بيانات العميل الثابتة نفسها لكل
//     مسجل صالح (redirect_uris على نطاقات ChatGPT/OpenAI فقط).
//     مأمون لأن السر «عام بنيويًا» كقيم VAPID (أعلاه): قيمة
//     التحدي الحقيقية = PKCE + code أحادية الاستخدام + توقيع
//     JWT، لا سرّ العميل. عميل بلا سر (public) مقبول في token
//     بشرط PKCE (تحدي موجود + verifier مطابق) — وعقد refresh
//     محمي بتوقيع الرمز نفسه وربطه بالعميل (cid) وبوابة الخطة.
//   • redirect_uri المسموح: نطاقات chatgpt.com/openai.com فقط
//     (https حصرًا) — لا يمكن استخدام النقطة لإعادة توجيه
//     مهاجم إلى نطاقه، لا في authorize ولا في تسجيل DCR.
//   • لا HTML من الدالة إطلاقًا: بوابة Supabase تمنع عرض HTML
//     من الدوال على نطاق *.supabase.co المشترك (تحوّل text/html
//     إلى text/plain + sandbox CSP — حماية من صفحات الصيد)،
//     لذا صفحة إدخال المفتاح والموافقة تعيش على الموقع العام
//     (authorizePageUrl — معلنة في metadata كauthorization_endpoint
//     حسب المواصفة، وChatGPT يفتحها في نافذة التفويض مباشرة).
//     الدالة تُحيل إليها بـ302 محتفظة بكل معاملات OAuth، والموقع
//     يعيد إرسالها بنموذج GET مع api_key فيصدر code فورًا —
//     إدخال المفتاح في الصفحة هو الموافقة نفسها.
//   • ساعة وfetch قابلان للحقن — كل المنطق قابل للاختبار
//     محليًا بلا Deno.serve (انظر oauth.test.ts).
//
// عقود الأخطاء: نصوص JSON-RPC العربية في mcp-core؛ هنا أخطاء
// OAuth القياسية { error, error_description } بالإنجليزية
// (مواصفة RFC 6749 — عملاء OAuth قياسيون يفهمونها). أخطاء
// البشر (مفتاح غير صالح، خطة) تُبلَّغ لصفحة الموقع عبر معامل
// error في إعادة التوجيه — لا HTML من الدالة إطلاقًا (أعلاه).
// ============================================================

import { Postgrest } from './postgrest.ts'
import { resolveRiseKey, checkMaxPlanGate } from './mcp-core.ts'

// ── القسم: الثوابت ─────────────────────

/** عمر رمز التفويض (10 دقائق — استخدام واحد) */
const CODE_TTL_SEC = 600
/** عمر access token (ساعة — قصير، مع refresh) */
const ACCESS_TTL_SEC = 3600
/** عمر refresh token (60 يومًا) */
const REFRESH_TTL_SEC = 60 * 24 * 3600
/** النطاق الوحيد المدعوم */
const SCOPE = 'mcp:tools'

/** مفتاحا app_config لبيانات عميل OAuth (زرعهما 034) */
const CONFIG_CLIENT_ID = 'mcp_oauth_client_id'
const CONFIG_CLIENT_SECRET = 'mcp_oauth_client_secret'

/** نطاقات إعادة التوجيه المسموحة (ChatGPT/OpenAI حصرًا) */
const ALLOWED_REDIRECT_SUFFIXES = ['chatgpt.com', 'openai.com']

/** شكل النتيجة الموحد مع mcp-core (بلا استيراد عكسي) */
export interface OAuthHttpResult {
  status: number
  headers: Record<string, string>
  body: string | null
}

export interface OAuthTokenUser {
  ok: true
  userId: string
}
export type OAuthTokenOutcome = OAuthTokenUser | { ok: false; reason: string }

// ── القسم: base64url وJWT (HS256 عبر Web Crypto) ─────────────────────

/** ترميز base64url بلا حشو */
function b64urlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** فك base64url (متسامح مع الحشو) */
function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function enc(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text)
}
function dec(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

/** sha256 بترميز base64url — لتحدي PKCE S256 (مصدَّرة للاختبارات) */
export async function sha256B64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc(input))
  return b64urlEncode(new Uint8Array(digest))
}

/** هيكل حمولة رموزنا الثلاثة (code/access/refresh) */
interface TokenPayload {
  iss: string
  sub: string
  cid: string
  typ: 'code' | 'access' | 'refresh'
  jti: string
  iat: number
  exp: number
  scope: string
  /** code فقط: إعادة التوجيه المربوطة */
  red?: string
  /** code فقط: تحدي PKCE S256 (base64url) */
  chal?: string
}

/** توقيع JWT (HS256) — للرموز الثلاثة */
export async function signJwt(payload: TokenPayload, signingKey: string): Promise<string> {
  const header = b64urlEncode(enc(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64urlEncode(enc(JSON.stringify(payload)))
  const key = await hmacKey(signingKey)
  const sig = await crypto.subtle.sign('HMAC', key, enc(`${header}.${body}`))
  return `${header}.${body}.${b64urlEncode(new Uint8Array(sig))}`
}

/** تحقق من التوقيع والبنية — يعيد الحمولة أو سببًا نصيًا (الوقت يُحقن) */
export async function verifyJwt(
  token: string,
  signingKey: string,
  expectedIssuer: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; reason: string }> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [header, body, sig] = parts
  let head: { alg?: string }
  let payload: TokenPayload
  try {
    head = JSON.parse(dec(b64urlDecode(header)))
    payload = JSON.parse(dec(b64urlDecode(body)))
  } catch {
    return { ok: false, reason: 'bad-json' }
  }
  if (head.alg !== 'HS256') return { ok: false, reason: 'alg' }
  const key = await hmacKey(signingKey)
  const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc(`${header}.${body}`))
  if (!valid) return { ok: false, reason: 'signature' }
  if (payload.iss !== expectedIssuer) return { ok: false, reason: 'issuer' }
  if (typeof payload.exp !== 'number' || payload.exp <= 0) return { ok: false, reason: 'exp-missing' }
  if (payload.exp <= nowSec) return { ok: false, reason: 'expired' }
  if (typeof payload.sub !== 'string' || !payload.sub) return { ok: false, reason: 'sub' }
  if (payload.typ !== 'code' && payload.typ !== 'access' && payload.typ !== 'refresh') {
    return { ok: false, reason: 'typ' }
  }
  return { ok: true, payload }
}

/** مشتق مفتاح التوقيع من مفتاح الخدمة (ثابت عبر النسخ) */
export async function deriveSigningKey(serviceKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc(`${serviceKey}|awj-mcp-oauth-v1`))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── القسم: مقارنة زمنية ثابتة (بيانات العميل) ─────────────────────

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── القسم: الخادم ─────────────────────

/** خطأ OAuth قياسي (JSON — RFC 6749). لا HTML من الدالة (أعلاه) */
function jsonErr(status: number, error: string, desc: string): OAuthHttpResult {
  return {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error, error_description: desc }),
  }
}

export interface OAuthDeps {
  /** عميل PostgREST (نفس قاعدة المشروع — service_role) */
  db: Postgrest
  /** هوية المُصدر: رابط نقطة MCP كاملًا (https://…/functions/v1/mcp) */
  issuer: string
  /** مفتاح التوقيع (deriveSigningKey(serviceKey)) */
  signingKey: string
  /** رابط صفحة التفويض على الموقع العام (نموذج مفتاح rise_) —
   *  معلن في metadata كauthorization_endpoint ويفتحه ChatGPT
   *  في نافذة التفويض؛ الدالة تُحيل إليه عند غياب api_key */
  authorizePageUrl: string
  /** ساعة قابلة للحقن (اختبارات) — ثوانٍ Unix */
  now?: () => number
  /** فحص نطاق إعادة التوجيه (اختبارات تتجاوزه) */
  allowedRedirect?: (url: URL) => boolean
}

export class McpOAuth {
  private db: Postgrest
  private issuer: string
  private signingKey: string
  private authorizePageUrl: string
  private now: () => number
  private clientCache: { id: string; secret: string } | null | undefined
  private allowedRedirect: (url: URL) => boolean

  constructor(deps: OAuthDeps) {
    this.db = deps.db
    this.issuer = deps.issuer
    this.signingKey = deps.signingKey
    this.authorizePageUrl = deps.authorizePageUrl
    this.now = deps.now ?? (() => Math.floor(Date.now() / 1000))
    this.allowedRedirect = deps.allowedRedirect ?? this.defaultAllowedRedirect
  }

  /** chatgpt.com / openai.com (وفروعهما) عبر https فقط */
  private defaultAllowedRedirect(url: URL): boolean {
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return ALLOWED_REDIRECT_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  }

  private t(): number {
    return this.now() >= 1e12 ? Math.floor(this.now() / 1000) : Math.floor(this.now())
  }

  /** تحميل بيانات العميل من app_config (كاش داخلي) — null = غير مهيأ */
  private async loadClient(): Promise<{ id: string; secret: string } | null> {
    if (this.clientCache !== undefined) return this.clientCache
    try {
      const rows = (await this.db.select('app_config', {
        select: 'key,value',
        filters: { key: `in.("${CONFIG_CLIENT_ID}","${CONFIG_CLIENT_SECRET}")` },
      })) as { key?: string; value?: string }[]
      const id = rows.find((r) => r.key === CONFIG_CLIENT_ID)?.value
      const secret = rows.find((r) => r.key === CONFIG_CLIENT_SECRET)?.value
      this.clientCache = id && secret ? { id, secret } : null
    } catch {
      this.clientCache = null
    }
    return this.clientCache
  }

  // ── GET ?oauth=metadata (ونفس الرد عبر مسارات well-known) ──
  metadata(): OAuthHttpResult {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({
        issuer: this.issuer,
        // صفحة التفويض على الموقع العام — مواصفة RFC 8414 تسمح
        // بأي رابط https مطلق، وChatGPT يفتحه في نافذة التفويض
        // (بوابة Supabase تمنع HTML من الدوال — انظر الترويسة)
        authorization_endpoint: this.authorizePageUrl,
        token_endpoint: `${this.issuer}?oauth=token`,
        // تسجيل ديناميكي (RFC 7591) — ChatGPT يسجّل نفسه هنا قبل التفويض
        registration_endpoint: `${this.issuer}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: [
          'client_secret_basic',
          'client_secret_post',
          // ChatGPT عميل عام (PKCE) — لا سرّ عند التبديل
          'none',
        ],
        scopes_supported: [SCOPE],
      }),
    }
  }

  // ── GET /.well-known/oauth-protected-resource (RFC 9728) ──
  // مؤشر «المورد محمي بـAS» — نسخ أحدث من عميل ChatGPT تطلبه قبل
  // metadata؛ عدم وجوده يجعلها ترجع لاكتشاف AS مباشرة، وتقديمه
  // يضمن سير الاكتشاف على كل النسخ. الرد يشير لنا كخادم تفويض.
  protectedResource(): OAuthHttpResult {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({
        resource: this.issuer,
        authorization_servers: [this.issuer],
        // الأدوات المُعرّضة عبر هذا المورد (توثيقي للعميل)
        scopes_supported: [SCOPE],
      }),
    }
  }

  // ── POST ?oauth=register (وPOST /register) — DCR حسب RFC 7591 ──
  // ChatGPT يسجّل نفسه ديناميكيًا قبل بدء التفويض. لا حالة إضافية:
  // نعيد بيانات العميل الثابتة من app_config لكل طلب تسجيل صالح
  // (redirect_uris محصورة في نطاقات ChatGPT/OpenAI https — نفس
  // فحص authorize). سرّ العميل «عام بنيويًا» (VAPID-like، أعلاه)
  // فإفلاته هنا لا يغيّر نموذج التهديد؛ الحماية الفعلية = PKCE +
  // code أحادية الاستخدام + توقيع JWT + بوابة الخطة.
  async handleRegister(rawBody: string): Promise<OAuthHttpResult> {
    const json = (status: number, obj: unknown): OAuthHttpResult => ({
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(obj),
    })
    // 1) جسم JSON — رفض أي شيء تالف فورًا (fail-closed)
    let req: { redirect_uris?: unknown; client_name?: unknown }
    try {
      req = JSON.parse(rawBody || '{}')
    } catch {
      return json(400, { error: 'invalid_client_metadata', error_description: 'body must be valid JSON' })
    }
    // 2) بيانات العميل من app_config (لم يشغّل المالك 034؟ رفض)
    const client = await this.loadClient()
    if (!client) {
      return json(503, {
        error: 'server_error',
        error_description: 'OAuth client is not configured (run migration 034)',
      })
    }
    // 3) redirect_uris: مصفوفة غير فارغة وكلها https على نطاقاتنا المسموحة
    const uris = Array.isArray(req.redirect_uris) ? req.redirect_uris : []
    if (uris.length === 0) {
      return json(400, {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris is required',
      })
    }
    for (const raw of uris) {
      if (typeof raw !== 'string') {
        return json(400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris must be strings' })
      }
      let u: URL
      try {
        u = new URL(raw)
      } catch {
        return json(400, { error: 'invalid_redirect_uri', error_description: `malformed redirect_uri: ${raw.slice(0, 80)}` })
      }
      if (!this.allowedRedirect(u)) {
        return json(400, {
          error: 'invalid_redirect_uri',
          error_description: 'only https redirect URIs on chatgpt.com / openai.com are accepted',
        })
      }
    }
    // 4) الرد: بيانات العميل الثابتة. نعلن نفسنا كعميل عام (none)
    //    ونسلّم السر أيضًا — العميل الذي يختار استخدامه (client_secret_post)
    //    يمر أيضًا: token يقبل المسارين (سر صالح أو PKCE بلا سر).
    await this.audit('mcp.oauth.registered', client.id, null)
    return json(201, {
      client_id: client.id,
      client_secret: client.secret,
      client_id_issued_at: Math.floor(this.t() * 1000),
      client_name: typeof req.client_name === 'string' ? req.client_name.slice(0, 80) : 'ChatGPT',
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    })
  }

  // ── GET ?oauth=authorize ──
  // لا HTML هنا إطلاقًا (بوابة Supabase تحوّله text/plain — الترويسة):
  // غياب المفتاح أو خطؤه → إحالة 302 لصفحة الموقع العام (تحتفظ بكل
  // معاملات OAuth فيزيد المستخدم مفتاحه ويعيد النموذج إلينا)؛ المفتاح
  // الصالح → code فورًا — إدخال المفتاح في الصفحة هو الموافقة نفسها
  // (الصفحة تشرح الممنوح قبل الإرسال، وdeny يبقى متاحًا منها).
  async handleAuthorize(url: URL): Promise<OAuthHttpResult> {
    const p = url.searchParams

    // 1) إعادة التوجيه أصلًا: إن صحّت نُبلغ الأخطاء عبرها، وإلا 400 JSON
    const redirectUriRaw = p.get('redirect_uri') ?? ''
    let redirect: URL | null = null
    try {
      const candidate = new URL(redirectUriRaw)
      redirect = this.allowedRedirect(candidate) ? candidate : null
    } catch {
      redirect = null
    }
    if (!redirect) {
      return jsonErr(400, 'invalid_request', 'redirect_uri must be an https URL on chatgpt.com or openai.com')
    }
    const back = (params: Record<string, string>): OAuthHttpResult => {
      const u = new URL(redirect!.toString())
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
      return { status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' }, body: null }
    }
    /** إحالة إلى صفحة الموقع: كل معاملات الطلب الأصلية محفوظة
     *  (بلا أعلام التحكم: oauth/api_key/error/confirm/deny) ± extra */
    const page = (extra: Record<string, string> = {}): OAuthHttpResult => {
      const u = new URL(this.authorizePageUrl)
      for (const [k, v] of p.entries()) {
        if (k === 'oauth' || k === 'api_key' || k === 'error' || k === 'confirm' || k === 'deny') continue
        u.searchParams.set(k, v)
      }
      for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v)
      return { status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' }, body: null }
    }
    const state = p.get('state') ?? ''

    // 2) معطيات OAuth الأساسية
    const responseType = p.get('response_type') ?? ''
    const clientId = p.get('client_id') ?? ''
    const challenge = p.get('code_challenge') ?? ''
    const challengeMethod = p.get('code_challenge_method') ?? ''
    // scope فارغ = غائب: بعض العملاء (ChatGPT) يرسلونه فارغًا —
    // نعامل الفراغ كغائب وننزل إلى النطاق الوحيد المدعوم
    const scopeRaw = p.get('scope') ?? ''
    const scope = scopeRaw.trim() === '' ? SCOPE : scopeRaw

    if (scope !== SCOPE) return back({ error: 'invalid_scope', state })
    if (responseType !== 'code') return back({ error: 'unsupported_response_type', state })
    if (challenge && challengeMethod !== 'S256') return back({ error: 'invalid_request', state })
    if (!challenge && challengeMethod) return back({ error: 'invalid_request', state })

    // 3) بيانات العميل (fail-closed: لم يشغّل المالك الهجرة 034)
    const client = await this.loadClient()
    if (!client) {
      return jsonErr(503, 'server_error', 'OAuth client is not configured (run migration 034)')
    }
    if (!clientId || !safeEqual(clientId, client.id)) {
      return back({ error: 'invalid_client', state })
    }

    // 4) رفض صريح من المستخدم (رابط «إلغاء» في صفحة الموقع)
    if (p.get('deny') === '1') {
      await this.audit('mcp.oauth.denied', clientId, null)
      return back({ error: 'access_denied', state })
    }

    // 5) هوية المستخدم: مفتاح rise_ (نفس سلسلة mcp-core حرفيًا).
    //    غائب؟ إحالة لصفحة الموقع — ChatGPT لا يعرف مفتاح المستخدم،
    //    فيدخله المستخدم هناك بنفسه والصفحة تعيد النموذج إلينا كاملًا.
    //    غير صالح؟ إحالة ذاتها مع error=invalid_key (يعرضه المستخدم
    //    بالعربية ويُعيد المحاولة) — المفتاح نفسه لا يُعاد توجيهه أبدًا.
    const apiKey = (p.get('api_key') ?? '').trim()
    if (!apiKey.startsWith('rise_')) return page()
    const resolved = await resolveRiseKey(this.db, apiKey)
    if (!resolved.ok) return page({ error: 'invalid_key' })

    // 6) بوابة الخطة (نفس عقد rise_: كل تفويض يعيد الفحص) — الخطأ
    //    بشري بطبيعته (ترقية الخطة) فيُعرض في صفحة الموقع
    const gate = await checkMaxPlanGate(this.db, resolved.userId)
    if (!gate.allowed) {
      await this.audit('mcp.oauth.plan_denied', clientId, resolved.userId)
      return page({ error: 'plan_required' })
    }

    // 7) إصدار code (JWT قصيرة العمر + استخدام واحد) مباشرة بعد
    //    المفتاح الصالح — لا خطوة confirm: إدخال المفتاح هو الموافقة
    const t = this.t()
    const payload: TokenPayload = {
      iss: this.issuer,
      sub: resolved.userId,
      cid: client.id,
      typ: 'code',
      jti: crypto.randomUUID(),
      iat: t,
      exp: t + CODE_TTL_SEC,
      scope,
      red: redirect.toString(),
      chal: challenge || undefined,
    }
    const code = await signJwt(payload, this.signingKey)
    await this.audit('mcp.oauth.authorized', client.id, resolved.userId)
    return back({ code, state })
  }

  // ── POST ?oauth=token ──
  async handleTokenPost(
    contentType: string,
    rawBody: string,
    reqHeaders: Record<string, string>,
  ): Promise<OAuthHttpResult> {
    const json = (status: number, obj: unknown): OAuthHttpResult => ({
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body: JSON.stringify(obj),
    })
    const oauthErr = (status: number, error: string, desc: string) =>
      json(status, { error, error_description: desc })

    // 1) تحليل الجسم: form-urlencoded (المعيار) أو JSON
    let form: Record<string, string> = {}
    const ct = (contentType || '').toLowerCase()
    if (ct.includes('application/json')) {
      try {
        form = { ...JSON.parse(rawBody) } as Record<string, string>
      } catch {
        return oauthErr(400, 'invalid_request', 'bad JSON body')
      }
    } else {
      for (const [k, v] of new URLSearchParams(rawBody).entries()) form[k] = v
    }

    // 2) بيانات العميل: Basic أصلًا ثم body
    let clientId = form['client_id'] ?? ''
    let clientSecret = form['client_secret'] ?? ''
    const basic = (reqHeaders['authorization'] || '').match(/^Basic (.+)$/)
    if (basic) {
      try {
        const [id, secret] = atob(basic[1]).split(':')
        if (id !== undefined) clientId = id
        if (secret !== undefined) clientSecret = secret
      } catch { /* نتجاهل Basic تالفًا ونفشل في المقارنة */ }
    }
    const client = await this.loadClient()
    // معرّف العميل إلزامي ومطابق دائمًا (سرّيًا كان أو عامًا).
    // سرّ مُرسل؟ يجب أن يطابق (مسار العميل السرّي كاملًا كما كان).
    // بلا سرّ؟ عميل عام (ChatGPT بعد DCR يعلن token_endpoint_auth_method
    // = none) — يُقبل بشرط PKCE في منح code (تحت) وبتوقيع الرمز
    // نفسه في منح refresh: السرّ «عام بنيويًا» أصلًا فلا يُضعف شيئًا.
    if (!client || !clientId || !safeEqual(clientId, client.id)) {
      return oauthErr(401, 'invalid_client', 'client credentials are invalid')
    }
    if (clientSecret !== '' && !safeEqual(clientSecret, client.secret)) {
      return oauthErr(401, 'invalid_client', 'client credentials are invalid')
    }
    const publicClient = clientSecret === ''

    const grantType = form['grant_type'] ?? ''

    // 3) منح رمز التفويض
    if (grantType === 'authorization_code') {
      const code = form['code'] ?? ''
      const redirectUri = form['redirect_uri'] ?? ''
      const verifier = form['code_verifier'] ?? ''
      if (!code || !redirectUri) {
        return oauthErr(400, 'invalid_request', 'code and redirect_uri are required')
      }

      const verdict = await verifyJwt(code, this.signingKey, this.issuer, this.t())
      if (!verdict.ok) return oauthErr(400, 'invalid_grant', `code is invalid (${verdict.reason})`)
      const payload = verdict.payload
      if (payload.typ !== 'code') return oauthErr(400, 'invalid_grant', 'token is not an authorization code')
      if (payload.cid !== clientId) return oauthErr(400, 'invalid_grant', 'code was issued to another client')
      if (payload.red !== redirectUri) {
        return oauthErr(400, 'invalid_grant', 'redirect_uri does not match the authorization request')
      }

      // PKCE S256 إلزامي عند وجود التحدي، وإلزامي كذلك للعميل العام
      // (بلا سرّ ولا تحدٍ = لا حماية تبديل إطلاقًا — رفض صريح)
      if (payload.chal) {
        if (!verifier) return oauthErr(400, 'invalid_request', 'code_verifier is required')
        const computed = await sha256B64Url(verifier)
        if (!safeEqual(computed, payload.chal)) {
          return oauthErr(400, 'invalid_grant', 'code_verifier does not match the challenge')
        }
      } else if (publicClient) {
        return oauthErr(400, 'invalid_request', 'code_verifier is required for public clients')
      }

      // الاستخدام الواحد: إدراج jti — التعارض = إعادة تشغيل
      try {
        await this.db.insert('mcp_oauth_codes', {
          jti: payload.jti,
          user_id: payload.sub,
          expires_at: new Date(payload.exp * 1000).toISOString(),
        })
      } catch (err) {
        const code = (err as { code?: string }).code
        const status = (err as { status?: number }).status
        if (code === '23505' || status === 409) {
          return oauthErr(400, 'invalid_grant', 'authorization code has already been used')
        }
        // فشل خادم = رفض (fail-closed — لا نصدر رموزًا بلا ضمان الاستخدام الواحد)
        return oauthErr(503, 'server_error', 'could not persist code state')
      }
      // تنظيف أفضل-جهد للرموز المنتهية (لا يفشل الطلب)
      try {
        await this.db.delete('mcp_oauth_codes', {
          expires_at: `lt.${new Date(this.t() * 1000 - 86_400_000).toISOString()}`,
        })
      } catch { /* أفضل جهد */ }

      return json(200, await this.issueTokens(payload.sub, clientId, payload.scope))
    }

    // 4) منح التجديد
    if (grantType === 'refresh_token') {
      const refreshToken = form['refresh_token'] ?? ''
      if (!refreshToken) return oauthErr(400, 'invalid_request', 'refresh_token is required')
      const verdict = await verifyJwt(refreshToken, this.signingKey, this.issuer, this.t())
      if (!verdict.ok) {
        return oauthErr(400, 'invalid_grant', `refresh token is invalid (${verdict.reason})`)
      }
      const payload = verdict.payload
      if (payload.typ !== 'refresh') {
        return oauthErr(400, 'invalid_grant', 'token is not a refresh token')
      }
      if (payload.cid !== clientId) {
        return oauthErr(400, 'invalid_grant', 'token was issued to another client')
      }

      // بوابة الخطة عند التجديد أيضًا (نزل من ماكس؟ لا تجديد)
      const gate = await checkMaxPlanGate(this.db, payload.sub)
      if (!gate.allowed) {
        await this.audit('mcp.oauth.plan_denied', clientId, payload.sub)
        return oauthErr(403, 'invalid_grant', 'subscription no longer includes MCP (max plan required)')
      }

      return json(200, await this.issueTokens(payload.sub, clientId, payload.scope))
    }

    return oauthErr(400, 'unsupported_grant_type', 'only authorization_code and refresh_token are supported')
  }

  /** إصدار زوج الرموز (access + refresh) */
  private async issueTokens(userId: string, clientId: string, scope: string): Promise<unknown> {
    const t = this.t()
    const base = {
      iss: this.issuer,
      sub: userId,
      cid: clientId,
      scope,
    }
    const access = await signJwt(
      { ...base, typ: 'access', jti: crypto.randomUUID(), iat: t, exp: t + ACCESS_TTL_SEC },
      this.signingKey,
    )
    const refresh = await signJwt(
      { ...base, typ: 'refresh', jti: crypto.randomUUID(), iat: t, exp: t + REFRESH_TTL_SEC },
      this.signingKey,
    )
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refresh,
      scope,
    }
  }

  // ── تحقق access token لمسار JSON-RPC (يُحقن في mcp-core) ──
  async verifyAccessTokenUser(token: string): Promise<OAuthTokenOutcome> {
    const verdict = await verifyJwt(token, this.signingKey, this.issuer, this.t())
    if (!verdict.ok) return { ok: false, reason: verdict.reason }
    if (verdict.payload.typ !== 'access') return { ok: false, reason: 'typ' }

    // حساب موقوف؟ (نفس فحص rise_ — fail-closed)
    try {
      const profile = (await this.db.maybeSingle('profiles', {
        select: 'suspended',
        filters: { id: `eq.${verdict.payload.sub}` },
      })) as { suspended?: boolean } | null
      if (profile?.suspended === true) return { ok: false, reason: 'suspended' }
    } catch {
      return { ok: false, reason: 'db-error' }
    }
    return { ok: true, userId: verdict.payload.sub }
  }

  /** تدقيق أحداث التفويض (أفضل جهد — لا يفشل الطلب) */
  private async audit(action: string, clientId: string, userId: string | null): Promise<void> {
    try {
      await this.db.insert('audit_logs', {
        actor_user_id: userId ?? '00000000-0000-0000-0000-000000000000',
        action,
        target_type: 'mcp_oauth',
        target_id: clientId,
        metadata: { clientId },
        ip_address: null,
        user_agent: null,
      })
    } catch { /* أفضل جهد */ }
  }
}
