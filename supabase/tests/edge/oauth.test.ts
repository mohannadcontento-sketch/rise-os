// ============================================================
// oauth.test.ts — مصفوفة اختبار طبقة OAuth لربط ChatGPT (10-ج)
//
// 27+ فحصًا عبر خادم PostgREST وهمي (mock-postgrest.ts):
//   • metadata: بنية RFC 8414 (نقطتا authorize/token + S256)
//   • authorize: بلا redirect/نطاق ممنوع/بلا مفتاح/مفتاح مزيف/
//     خطة Free (403)/scope خاطئ/عميل خاطئ/plain PKCE — وكلها
//     تعلن الخطأ عبر 302 (مواصفة OAuth) عندما يكون redirect
//     نفسه صالحًا، و400 HTML عندما لا يكون
//   • الموافقة: صفحة عربية (200) ثم confirm=1 → 302 مع
//     code+state، وdeny=1 → access_denied
//   • token: code+PKCE صحيح → رموز + فرض الاستخدام الواحد
//     (إعادة التشغيل = invalid_grant) + verifier خاطئ +
//     redirect مختلف + بيانات عميل خاطئة (Basic وbody) +
//     grant غير مدعوم + refresh (بما فيه رفض التجديد بعد
//     النزول من ماكس!) + code منتهٍ بساعة قابلة للتقديم
//   • سلسلة MCP الكاملة: access_token حقيقي عبر handlePost
//     (initialize + tools/list + list_tasks ببيانات فعلية)،
//     ومزوّر → 401 برسالة OAuth، وrefresh كـBearer → 401،
//     والنزول من ماكس بعد إصدار الرمز → 403 + تدقيق
//     credential=oauth (البوابة لكل طلب — لا تُشترى مرة واحدة)
// ============================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { McpServer, sha256Hex } from '../../functions/_shared/mcp-core.ts'
import {
  McpOAuth,
  deriveSigningKey,
  sha256B64Url,
  signJwt,
} from '../../functions/_shared/oauth-core.ts'
import { Postgrest } from '../../functions/_shared/postgrest.ts'
import { createMockDb, startMockPostgrest, MockDb } from './mock-postgrest.ts'

// ── القسم: التجهيز ─────────────────────

const TEST_KEY = 'rise_oauth_test_key_000000000000001'
const MAX_USER = '11111111-1111-1111-1111-111111111111'
const FREE_USER = '22222222-2222-2222-2222-222222222222'
const CLIENT_ID = 'awj-test-client-0001'
const CLIENT_SECRET = 'csecret_test_abcdef0123456789'
const ISSUER = 'https://edge.test/functions/v1/mcp'
const REDIRECT = 'https://chatgpt.test/aip-42/oauth/callback'

const signingKey = await deriveSigningKey('test-service-key')

/** ساعة قابلة للتقديم (مللي ثانية) — لاختبار انتهاء الرموز */
let clockMs = 1_800_000_000_000
function advance(ms: number) {
  clockMs += ms
}

async function setup() {
  const db: MockDb = createMockDb()

  db.profiles.push(
    { id: MAX_USER, suspended: false },
    { id: FREE_USER, suspended: false },
  )
  db.apiKeys.push(
    { key_hash: await sha256Hex(TEST_KEY), user_id: MAX_USER, last_used_at: null },
    { key_hash: await sha256Hex('rise_free_key_0000000000000001'), user_id: FREE_USER, last_used_at: null },
  )
  db.userSubscriptions.push(
    { user_id: MAX_USER, plan: 'max', status: 'active', expires_at: null },
    { user_id: FREE_USER, plan: 'free', status: 'active', expires_at: null },
  )
  db.appConfig.push(
    { key: 'mcp_oauth_client_id', value: CLIENT_ID },
    { key: 'mcp_oauth_client_secret', value: CLIENT_SECRET },
  )
  db.tasks.push({
    id: 't-oauth-1', user_id: MAX_USER, title: 'مهمة تجربة OAuth', description: null,
    status: 'todo', priority: 'high', project_id: null,
    due_date: null, due_time: null, estimated_min: null, order: 0, completed_at: null,
  })

  const server = await startMockPostgrest(db)
  const dbClient = new Postgrest({ baseUrl: server.url, serviceKey: 'test-service-key' })

  const oauth = new McpOAuth({
    db: dbClient,
    issuer: ISSUER,
    signingKey,
    now: () => clockMs,
    // اختبارات: نطاق وهمي مسموح بدل chatgpt.com الحقيقي
    allowedRedirect: (u) => u.hostname === 'chatgpt.test' || u.hostname === 'chatgpt.com',
  })

  const mcp = new McpServer({
    baseUrl: server.url,
    serviceKey: 'test-service-key',
    now: () => clockMs,
    oauthTokenVerifier: (token: string) => oauth.verifyAccessTokenUser(token),
  })

  return { db, server, oauth, mcp, dbClient }
}

/** بناء رابط authorize بمعاملاته */
function authorizeUrl(overrides: Record<string, string> = {}): string {
  const u = new URL(`${ISSUER}?oauth=authorize`)
  u.searchParams.set('api_key', TEST_KEY)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', CLIENT_ID)
  u.searchParams.set('redirect_uri', REDIRECT)
  u.searchParams.set('state', 'st-123')
  for (const [k, v] of Object.entries(overrides)) u.searchParams.set(k, v)
  return u.toString()
}

/** استخراج معاملات Location بعد 302 */
function redirectParams(res: { status: number; headers: Record<string, string> }): URL {
  assertEquals(res.status, 302, `متوقع 302، وجدنا ${res.status}`)
  const loc = res.headers['Location']
  assert(loc, 'مفقود Location')
  return new URL(loc)
}

/** مبادلة code مقابل الرموز (form-urlencoded — عقد ChatGPT) */
async function exchange(
  oauth: McpOAuth,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const body = new URLSearchParams(fields).toString()
  return oauth.handleTokenPost('application/x-www-form-urlencoded', body, headers)
}

/** المسار الكامل: موافقة → code → tokens */
async function fullFlow(oauth: McpOAuth, verifier: string) {
  const challenge = await sha256B64Url(verifier)
  const res = await oauth.handleAuthorize(new URL(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256' })), {})
  assertEquals(res.status, 200)
  const approved = await oauth.handleAuthorize(
    new URL(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256', confirm: '1' })),
    {},
  )
  const loc = redirectParams(approved)
  assertEquals(loc.searchParams.get('state'), 'st-123')
  const code = loc.searchParams.get('code')
  assert(code, 'مفقود code')
  const tokens = await exchange(oauth, {
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code!,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  })
  assertEquals(tokens.status, 200)
  return JSON.parse(tokens.body ?? '{}')
}

// ── القسم: metadata ─────────────────────

Deno.test('oauth: metadata — نقطتا authorize/token وS256 وclient_secret_basic', () => {
  const { oauth } = setupSync()
  const res = oauth.metadata()
  const meta = JSON.parse(res.body ?? '{}')
  assertEquals(res.status, 200)
  assertEquals(meta.authorization_endpoint, `${ISSUER}?oauth=authorize`)
  assertEquals(meta.token_endpoint, `${ISSUER}?oauth=token`)
  assertEquals(meta.code_challenge_methods_supported, ['S256'])
  assertEquals(meta.grant_types_supported, ['authorization_code', 'refresh_token'])
  assert(meta.token_endpoint_auth_methods_supported.includes('client_secret_basic'))
})

// ── القسم: authorize — الأخطاء ─────────────────────

Deno.test('oauth: authorize بلا redirect_uri → 400 HTML', async () => {
  const { oauth } = await setup()
  const u = new URL(`${ISSUER}?oauth=authorize`)
  u.searchParams.set('api_key', TEST_KEY)
  const res = await oauth.handleAuthorize(u, {})
  assertEquals(res.status, 400)
  assert((res.body ?? '').includes('عنوان إعادة التوجيه'))
})

Deno.test('oauth: authorize مع redirect لنطاق ممنوع → 400 (لا تسريب 302)', async () => {
  const { oauth } = await setup()
  const u = new URL(authorizeUrl({ redirect_uri: 'https://evil.example/cb' }))
  const res = await oauth.handleAuthorize(u, {})
  assertEquals(res.status, 400)
  assertEquals(res.headers['Location'], undefined)
})

Deno.test('oauth: authorize بلا api_key → 401 HTML يطلب المفتاح', async () => {
  const { oauth } = await setup()
  const u = new URL(authorizeUrl())
  u.searchParams.delete('api_key')
  const res = await oauth.handleAuthorize(u, {})
  assertEquals(res.status, 401)
  assert((res.body ?? '').includes('مفتاح'))
})

Deno.test('oauth: authorize بمفتاح مزيف → 401 HTML', async () => {
  const { oauth } = await setup()
  const res = await oauth.handleAuthorize(new URL(authorizeUrl({ api_key: 'rise_fake' })), {})
  assertEquals(res.status, 401)
})

Deno.test('oauth: authorize بمفتاح مستخدم Free → 403 + تدقيق plan_denied', async () => {
  const { oauth, db } = await setup()
  const res = await oauth.handleAuthorize(
    new URL(authorizeUrl({ api_key: 'rise_free_key_0000000000000001' })),
    {},
  )
  assertEquals(res.status, 403)
  assert(db.auditLogs.some((a) => a.action === 'mcp.oauth.plan_denied'))
})

Deno.test('oauth: authorize بعميل خاطئ → 302 invalid_client', async () => {
  const { oauth } = await setup()
  const res = await oauth.handleAuthorize(new URL(authorizeUrl({ client_id: 'wrong' })), {})
  assertEquals(redirectParams(res).searchParams.get('error'), 'invalid_client')
})

Deno.test('oauth: authorize بscope خاطئ → 302 invalid_scope', async () => {
  const { oauth } = await setup()
  const res = await oauth.handleAuthorize(new URL(authorizeUrl({ scope: 'admin' })), {})
  assertEquals(redirectParams(res).searchParams.get('error'), 'invalid_scope')
})

Deno.test('oauth: authorize بplain PKCE → 302 invalid_request (S256 حصرًا)', async () => {
  const { oauth } = await setup()
  const res = await oauth.handleAuthorize(
    new URL(authorizeUrl({ code_challenge: 'abc', code_challenge_method: 'plain' })),
    {},
  )
  assertEquals(redirectParams(res).searchParams.get('error'), 'invalid_request')
})

// ── القسم: authorize — المسار الإيجابي ─────────────────────

Deno.test('oauth: authorize سليم → صفحة موافقة عربية (200) تهرب المعاملات', async () => {
  const { oauth } = await setup()
  const res = await oauth.handleAuthorize(new URL(authorizeUrl()), {})
  assertEquals(res.status, 200)
  assert((res.headers['Content-Type'] || '').includes('text/html'))
  const html = res.body ?? ''
  assert(html.includes('تفويض ChatGPT'), 'صفحة الموافقة')
  assert(html.includes('chatgpt.test'), 'نطاق العميل ظاهر')
  assert(html.includes('st-123'), 'state ظاهر')
  assert(!html.includes('<script'), 'بلا سكربتات — CSP نظيفة')
})

Deno.test('oauth: confirm=1 → 302 code+state + تدقيق authorized', async () => {
  const { oauth, db } = await setup()
  const res = await oauth.handleAuthorize(new URL(authorizeUrl({ confirm: '1' })), {})
  const loc = redirectParams(res)
  assert(loc.searchParams.get('code'), 'code موجود')
  assertEquals(loc.searchParams.get('state'), 'st-123')
  assertEquals(loc.hostname, 'chatgpt.test')
  assertEquals(loc.pathname, '/aip-42/oauth/callback')
  assert(db.auditLogs.some((a) => a.action === 'mcp.oauth.authorized'))
})

Deno.test('oauth: deny=1 → 302 access_denied + تدقيق denied', async () => {
  const { oauth, db } = await setup()
  const res = await oauth.handleAuthorize(new URL(authorizeUrl({ deny: '1' })), {})
  assertEquals(redirectParams(res).searchParams.get('error'), 'access_denied')
  assert(db.auditLogs.some((a) => a.action === 'mcp.oauth.denied'))
})

Deno.test('oauth: api_key خبيث في HTML يُهرب (لا XSS)', async () => {
  const { oauth } = await setup()
  const res = await oauth.handleAuthorize(new URL(authorizeUrl({ api_key: 'rise_x"><script>' })), {})
  assertEquals(res.status, 401)
  assert(!(res.body ?? '').includes('<script>'))
})

// ── القسم: token — code grant ─────────────────────

Deno.test('oauth: تبديل code كامل بPKCE → رموز + سجل الاستخدام الواحد', async () => {
  const { oauth, db } = await setup()
  const tokens = await fullFlow(oauth, 'test-verifier-1234567890abcdef')
  assert(tokens.access_token)
  assert(tokens.refresh_token)
  assertEquals(tokens.token_type, 'Bearer')
  assertEquals(tokens.expires_in, 3600)
  assertEquals(tokens.scope, 'mcp:tools')
  assertEquals(db.mcpOAuthCodes.length, 1, 'jti مسجل')
  assert(db.mcpOAuthCodes[0].user_id === MAX_USER)
})

Deno.test('oauth: إعادة استخدام code → invalid_grant (الاستخدام الواحد)', async () => {
  const { oauth } = await setup()
  const verifier = 'verifier-replay-test'
  const challenge = await sha256B64Url(verifier)
  const approved = await oauth.handleAuthorize(
    new URL(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256', confirm: '1' })),
    {},
  )
  const code = redirectParams(approved).searchParams.get('code')!

  const first = await exchange(oauth, {
    grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    code, redirect_uri: REDIRECT, code_verifier: verifier,
  })
  assertEquals(first.status, 200)

  const second = await exchange(oauth, {
    grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    code, redirect_uri: REDIRECT, code_verifier: verifier,
  })
  assertEquals(second.status, 400)
  assertEquals(JSON.parse(second.body ?? '{}').error, 'invalid_grant')
})

Deno.test('oauth: PKCE verifier خاطئ → invalid_grant', async () => {
  const { oauth } = await setup()
  const challenge = await sha256B64Url('correct-verifier')
  const approved = await oauth.handleAuthorize(
    new URL(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256', confirm: '1' })),
    {},
  )
  const code = redirectParams(approved).searchParams.get('code')!
  const res = await exchange(oauth, {
    grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    code, redirect_uri: REDIRECT, code_verifier: 'WRONG-verifier',
  })
  assertEquals(res.status, 400)
  assertEquals(JSON.parse(res.body ?? '{}').error, 'invalid_grant')
})

Deno.test('oauth: تحدي بلا verifier → invalid_request', async () => {
  const { oauth } = await setup()
  const challenge = await sha256B64Url('some-verifier')
  const approved = await oauth.handleAuthorize(
    new URL(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256', confirm: '1' })),
    {},
  )
  const code = redirectParams(approved).searchParams.get('code')!
  const res = await exchange(oauth, {
    grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    code, redirect_uri: REDIRECT,
  })
  assertEquals(res.status, 400)
  assertEquals(JSON.parse(res.body ?? '{}').error, 'invalid_request')
})

Deno.test('oauth: redirect_uri مختلف عند التبديل → invalid_grant', async () => {
  const { oauth } = await setup()
  const verifier = 'verifier-redirect-test'
  const challenge = await sha256B64Url(verifier)
  const approved = await oauth.handleAuthorize(
    new URL(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256', confirm: '1' })),
    {},
  )
  const code = redirectParams(approved).searchParams.get('code')!
  const res = await exchange(oauth, {
    grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    code, redirect_uri: 'https://chatgpt.test/different/callback', code_verifier: verifier,
  })
  assertEquals(JSON.parse(res.body ?? '{}').error, 'invalid_grant')
})

Deno.test('oauth: بيانات عميل خاطئة في body → 401 invalid_client', async () => {
  const { oauth } = await setup()
  const res = await exchange(oauth, {
    grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: 'WRONG',
    code: 'whatever', redirect_uri: REDIRECT,
  })
  assertEquals(res.status, 401)
  assertEquals(JSON.parse(res.body ?? '{}').error, 'invalid_client')
})

Deno.test('oauth: بيانات عميل عبر Basic auth صحيحة → 200', async () => {
  const { oauth } = await setup()
  const verifier = 'verifier-basic-test'
  const tokens = await fullFlow(oauth, verifier)

  // Basic بدل body: refresh بBasic صحيح
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }).toString()
  const res = await oauth.handleTokenPost(
    'application/x-www-form-urlencoded',
    body,
    { authorization: `Basic ${basic}` },
  )
  assertEquals(res.status, 200)
  assert(JSON.parse(res.body ?? '{}').access_token)
})

Deno.test('oauth: Basic ببيانات خاطئة → 401 invalid_client', async () => {
  const { oauth } = await setup()
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x.y.z' }).toString()
  const res = await oauth.handleTokenPost(
    'application/x-www-form-urlencoded',
    body,
    { authorization: `Basic ${btoa(`${CLIENT_ID}:WRONG`)}` },
  )
  assertEquals(res.status, 401)
})

Deno.test('oauth: grant غير مدعوم → 400 unsupported_grant_type', async () => {
  const { oauth } = await setup()
  const res = await exchange(oauth, {
    grant_type: 'password', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
  })
  assertEquals(res.status, 400)
  assertEquals(JSON.parse(res.body ?? '{}').error, 'unsupported_grant_type')
})

Deno.test('oauth: code منتهٍ (ساعة متقدمة) → invalid_grant', async () => {
  const { oauth } = await setup()
  const challenge = await sha256B64Url('verifier-expired')
  const approved = await oauth.handleAuthorize(
    new URL(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256', confirm: '1' })),
    {},
  )
  const code = redirectParams(approved).searchParams.get('code')!
  advance(11 * 60 * 1000) // 11 دقيقة > عمر code (10)
  const res = await exchange(oauth, {
    grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    code, redirect_uri: REDIRECT, code_verifier: 'verifier-expired',
  })
  assertEquals(JSON.parse(res.body ?? '{}').error, 'invalid_grant')
  assert((JSON.parse(res.body ?? '{}').error_description ?? '').includes('expired'))
})

// ── القسم: token — refresh grant ─────────────────────

Deno.test('oauth: refresh_token سليم → رموز جديدة', async () => {
  const { oauth } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-refresh-1')
  const res = await exchange(oauth, {
    grant_type: 'refresh_token', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
  })
  assertEquals(res.status, 200)
  const fresh = JSON.parse(res.body ?? '{}')
  assert(fresh.access_token)
  assert(fresh.refresh_token)
  assert(fresh.access_token !== tokens.access_token)
})

Deno.test('oauth: refresh بعد النزول من ماكس → 403 invalid_grant + تدقيق', async () => {
  const { oauth, db } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-refresh-2')
  // نزل من ماكس بين الرمزين
  db.userSubscriptions.find((s) => s.user_id === MAX_USER)!.plan = 'free'
  const res = await exchange(oauth, {
    grant_type: 'refresh_token', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
  })
  assertEquals(res.status, 403)
  assert(db.auditLogs.some((a) => a.action === 'mcp.oauth.plan_denied'))
})

Deno.test('oauth: access token كrefresh → invalid_grant (نوع الرمز)', async () => {
  const { oauth } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-typetest')
  const res = await exchange(oauth, {
    grant_type: 'refresh_token', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: tokens.access_token,
  })
  assertEquals(JSON.parse(res.body ?? '{}').error, 'invalid_grant')
})

// ── القسم: سلسلة MCP مع رموز OAuth ─────────────────────

Deno.test('mcp+oauth: المسار الكامل — access_token عبر JSON-RPC يعمل فعليًا', async () => {
  const { oauth, mcp } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-e2e')
  const res = await mcp.handlePost({
    method: 'POST',
    headers: {
      authorization: `Bearer ${tokens.access_token}`,
      'x-forwarded-for': '9.9.9.9',
      'user-agent': 'chatgpt-test',
    },
    rawBody: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_tasks', arguments: {} },
    }),
  })
  assertEquals(res.status, 200)
  const body = JSON.parse(res.body ?? '{}')
  assert(!body.error, `لا خطأ: ${res.body}`)
  assert(body.result.content[0].text.includes('مهمة تجربة OAuth'))
})

Deno.test('mcp+oauth: token مزور (توقيع معدل) → 401 برسالة OAuth', async () => {
  const { oauth, mcp } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-tamper')
  const forged = tokens.access_token.slice(0, -3) + 'AAA'
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: `Bearer ${forged}`, 'x-forwarded-for': '9.9.9.9' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 401)
  assert((res.body ?? '').includes('رمز OAuth'))
})

Deno.test('mcp+oauth: refresh token كBearer → 401 (ليس access)', async () => {
  const { oauth, mcp } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-wrong-typ')
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.refresh_token}`, 'x-forwarded-for': '9.9.9.9' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 401)
})

Deno.test('mcp+oauth: access token منتهٍ → 401', async () => {
  const { oauth, mcp } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-exp-access')
  advance(2 * 3600 * 1000) // ساعتان > عمر access (ساعة)
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.access_token}`, 'x-forwarded-for': '9.9.9.9' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 401)
})

Deno.test('mcp+oauth: نزول المستخدم من ماكس بعد الإصدار → 403 + تدقيق oauth', async () => {
  const { oauth, mcp, db } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-plan-drop')
  db.userSubscriptions.find((s) => s.user_id === MAX_USER)!.plan = 'free'
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.access_token}`, 'x-forwarded-for': '9.9.9.9' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 403)
  const denied = db.auditLogs.find((a) => a.action === 'mcp.plan_denied')
  assert(denied, 'تدقيق موجود')
  assertEquals((denied!.metadata as Record<string, unknown>).credential, 'oauth')
})

Deno.test('mcp+oauth: token مستخدم موقوف → 401 (فحص الإيقاف في كل طلب)', async () => {
  const { oauth, mcp, db } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-suspend')
  db.profiles.find((p) => p.id === MAX_USER)!.suspended = true
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.access_token}`, 'x-forwarded-for': '9.9.9.9' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 401)
})

Deno.test('mcp+oauth: JWT صالح التوقيع لكن بمُصدر غريب → 401 (issuer مقيد)', async () => {
  const { oauth, mcp } = await setup()
  // رمز موقعة بمفتاحنا لكن iss مختلف (خادم آخر سرق المفتاح مستحيل —
  // اختبار العمق الدفاعي)
  const rogue = await signJwt(
    {
      iss: 'https://evil.test/functions/v1/mcp', sub: MAX_USER, cid: CLIENT_ID,
      typ: 'access', jti: crypto.randomUUID(), iat: Math.floor(clockMs / 1000),
      exp: Math.floor(clockMs / 1000) + 3600, scope: 'mcp:tools',
    },
    signingKey,
  )
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: `Bearer ${rogue}`, 'x-forwarded-for': '9.9.9.9' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 401)
})

Deno.test('mcp+oauth: كلمة مرور صحيحة لكن مفتاح توقيع مختلف → 401', async () => {
  const { oauth, mcp } = await setup()
  const tokens = await fullFlow(oauth, 'verifier-key-test')
  // نعيد تسجيل access بمفتاح آخر (محاكاة تدوير مفاجئ)
  const otherKey = await deriveSigningKey('different-service-key')
  const reSigned = await signJwt(
    {
      iss: ISSUER, sub: MAX_USER, cid: CLIENT_ID, typ: 'access',
      jti: crypto.randomUUID(), iat: Math.floor(clockMs / 1000),
      exp: Math.floor(clockMs / 1000) + 3600, scope: 'mcp:tools',
    },
    otherKey,
  )
  assertEquals(tokens.access_token !== reSigned, true)
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: `Bearer ${reSigned}`, 'x-forwarded-for': '9.9.9.9' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 401)
})

// ── القسم: setup متزامن للاختبارات الخفيفة ─────────────────────

/** نسخة خفيفة: إنشاء oauth فوق قاعدة فارغة (بلا خادم — للأخطاء الأولى) */
function setupSync(): { oauth: McpOAuth } {
  const db = createMockDb()
  db.appConfig.push(
    { key: 'mcp_oauth_client_id', value: CLIENT_ID },
    { key: 'mcp_oauth_client_secret', value: CLIENT_SECRET },
  )
  // db فارغ → نتجنب الخادم الوهمي بالكامل؟ لا: loadClient يحتاج PostgREST.
  // نبني Postgrest فوق خادم وهمي متزامن-التجهيز غير متاح — لذا نستدعي
  // الإعداد غير المتزامن من الاختبارات الفعلية؛ هذا الاختبار الوحيد
  // يحتاج metadata فقط (لا يقرأ القاعدة) → Postgrest وهمي بلا use.
  const stubDb = new Postgrest({ baseUrl: 'http://127.0.0.1:9', serviceKey: 'x' })
  const oauth = new McpOAuth({
    db: stubDb,
    issuer: ISSUER,
    signingKey,
    now: () => clockMs,
    allowedRedirect: () => true,
  })
  return { oauth }
}
