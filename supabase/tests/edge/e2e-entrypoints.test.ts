// ============================================================
// e2e-entrypoints.test.ts — تشغيل نقاط الدخول الحقيقية كعمليات
//
// أقرب شيء للنشر الحقيقي محليًا: نطلق mcp/index.ts وpush-
// dispatch/index.ts كعمليات Deno مستقلة (Deno.serve) مع
// متغيرات بيئة تشير إلى PostgREST وهمي + مزود بوش وهمي
// يعيشان في هذه العملية، ثم نضرب الوظيفتين بـHTTP فعلي:
//
//   MCP: GET→405 | JSON تالف→-32700 | بلا Bearer→401 | initialize
//        + tools/list (8) + tools/call list_tasks (بيانات حية)
//        + OAuth (10-ج): metadata + authorize/confirm→302 code
//          + token (form) + JSON-RPC بـaccess_token (الحلقة كاملة)
//   PUSH: بلا مصادقة→401 | سر خاطئ→401 | مفتاح الخدمة→جولة نظيفة
//        | force notification_id→إرسال فعلي يُفك تشفيره عند المزود
// ============================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createMockDb, startMockPostgrest } from './mock-postgrest.ts'
import { startFakePushProvider } from './test-keys.ts'
import { sha256Hex } from '../../functions/_shared/mcp-core.ts'

const TEST_KEY = 'rise_e2e_000000000000000000000001'
const USER = '44444444-4444-4444-4444-444444444444'
const SERVICE_KEY = 'e2e-service-role-key'
const E2E_CLIENT_ID = 'awj-e2e-client-01'
const E2E_CLIENT_SECRET = 'csecret_e2e_0123456789abcdef'

interface Proc {
  kill(): void
  port: number
}

async function spawnFunction(entry: string, port: number, env: Record<string, string>): Promise<Proc> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-net', '--allow-env', entry],
    env: {
      ...env,
      PORT: String(port),
      DENO_NO_UPDATE_CHECK: '1',
    },
    stdout: 'piped',
    stderr: 'piped',
  })
  const child = cmd.spawn()

  // انتظار جاهزية المنفذ (المحاولات قصيرة ومحدودة)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' }).catch(() => null)
      // النجاح أو الفشل كلاهما يعني أن الخادم يستقبل اتصالات
      const status = await tryConnect(`http://127.0.0.1:${port}/`)
      if (status !== null) return { kill: () => child.kill(), port }
    } catch { /* ليس جاهزًا بعد */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  child.kill()
  const err = await child.stderr.pipeThrough(new TextDecoderStream())
  let stderrText = ''
  for await (const chunk of err) stderrText += chunk
  throw new Error(`الوظيفة ${entry} لم تجهز خلال 15 ثانية. stderr: ${stderrText.slice(0, 500)}`)
}

async function tryConnect(url: string): Promise<number | null> {
  try {
    const res = await fetch(url)
    return res.status
  } catch {
    return null
  }
}

Deno.test('e2e: الوظيفتان تعملان كعمليات حية عبر HTTP', async () => {
  // ── العالم: قاعدة وهمية + مزود بوش وهمي + بيانات ──
  const db = createMockDb()
  db.profiles.push({ id: USER, suspended: false })
  db.apiKeys.push({ key_hash: await sha256Hex(TEST_KEY), user_id: USER, last_used_at: null })
  db.userSubscriptions.push({ user_id: USER, plan: 'max', status: 'active', expires_at: null })
  db.tasks.push({
    id: 'e2e-t1', user_id: USER, title: 'مهمة الاختبار الشامل', description: null,
    status: 'todo', priority: 'high', project_id: null, due_date: null, due_time: null,
    estimated_min: 15, order: 0, completed_at: null,
  })

  // VAPID في app_config (كما زرعتها الهجرة 028)
  const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', vapidPair.publicKey))
  const privJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey)
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  db.appConfig.push(
    { key: 'vapid_public_key', value: b64(pubRaw) },
    { key: 'vapid_private_key', value: privJwk.d! },
    { key: 'vapid_subject', value: 'mailto:e2e@awj.life' },
    // بيانات عميل OAuth (كما زرعها 034)
    { key: 'mcp_oauth_client_id', value: E2E_CLIENT_ID },
    { key: 'mcp_oauth_client_secret', value: E2E_CLIENT_SECRET },
  )

  const postgrest = await startMockPostgrest(db)
  const provider = await startFakePushProvider()
  db.pushSubscriptions.push({
    id: crypto.randomUUID(),
    user_id: USER,
    endpoint: provider.subscription.endpoint,
    p256dh: provider.subscription.p256dh,
    auth: provider.subscription.auth,
    revoked_at: null,
    last_push_at: null,
  })

  // إشعار جاهز للإرسال في النافذة
  const notificationId = crypto.randomUUID()
  db.notifications.push({
    id: notificationId,
    user_id: USER,
    type: 'reminder',
    title: 'تذكير e2e',
    body: 'إشعار يُرسل عبر الوظيفة الحية',
    icon: null,
    action_url: 'tasks',
    priority: 'normal',
    pushed_at: null,
    created_at: new Date().toISOString(),
  })

  const commonEnv = {
    SUPABASE_URL: postgrest.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  }

  // ── إطلاق الوظيفتين ──
  const mcpProc = await spawnFunction('supabase/functions/mcp/index.ts', 8761, commonEnv)
  const pushProc = await spawnFunction('supabase/functions/push-dispatch/index.ts', 8762, {
    ...commonEnv,
    CRON_SECRET: 'e2e-cron-secret',
  })

  try {
    // ═══ MCP: البروتوكول عبر HTTP حقيقي ═══
    // GET → 405 (بلا SSE)
    const getRes = await fetch(`http://127.0.0.1:8761/`)
    assertEquals(getRes.status, 405)
    const getCors = getRes.headers.get('access-control-allow-origin')
    assertEquals(getCors, '*')

    // OPTIONS → 204
    const optRes = await fetch(`http://127.0.0.1:8761/`, { method: 'OPTIONS' })
    assertEquals(optRes.status, 204)

    // JSON تالف → 400
    const badJson = await fetch(`http://127.0.0.1:8761/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{oops',
    })
    assertEquals(badJson.status, 400)
    assertEquals((await badJson.json()).error.code, -32700)

    // بلا Bearer → 401
    const noAuth = await fetch(`http://127.0.0.1:8761/`, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    })
    assertEquals(noAuth.status, 401)

    // المصافحة الكاملة + الأدوات + استدعاء حقيقي
    const init = await (await fetch(`http://127.0.0.1:8761/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_KEY}` },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      }),
    })).json()
    assertEquals(init.result.serverInfo.name, 'awj-mcp')

    const tools = await (await fetch(`http://127.0.0.1:8761/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_KEY}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })).json()
    assertEquals(tools.result.tools.length, 8)

    const call = await (await fetch(`http://127.0.0.1:8761/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_KEY}` },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'list_tasks', arguments: {} },
      }),
    })).json()
    assertEquals(call.result.isError, false)
    const tasks = call.result.structuredContent.tasks
    assertEquals(tasks.length, 1)
    assertEquals(tasks[0].title, 'مهمة الاختبار الشامل')

    // مفتاح خاطئ → 401
    const badKey = await fetch(`http://127.0.0.1:8761/`, {
      method: 'POST',
      headers: { Authorization: 'Bearer rise_wrongwrongwrongwrong000000' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }),
    })
    assertEquals(badKey.status, 401)

    // ═══ OAuth (10-ج): الحلقة كاملة عبر HTTP حقيقي ═══
    // metadata → بيانات خادم التفويض
    const metaRes = await fetch(`http://127.0.0.1:8761/?oauth=metadata`)
    assertEquals(metaRes.status, 200)
    const meta = await metaRes.json()
    assert(String(meta.authorization_endpoint).includes('?oauth=authorize'))
    assert(String(meta.token_endpoint).includes('?oauth=token'))

    // authorize بلا مفتاح → 401 HTML
    const noKey = await fetch(`http://127.0.0.1:8761/?oauth=authorize&response_type=code&client_id=${E2E_CLIENT_ID}&redirect_uri=${encodeURIComponent('https://chatgpt.com/aip-1/oauth/callback')}`)
    assertEquals(noKey.status, 401)
    assertEquals((noKey.headers.get('content-type') || '').includes('text/html'), true)

    // السيرفر الحقيقي يسمح بنطاقات ChatGPT فقط — نستخدم chatgpt.com
    const redirect = encodeURIComponent('https://chatgpt.com/aip-1/oauth/callback')
    const verifier = 'e2e-verifier-0123456789abcdef'
    const challengeB64 = btoa(String.fromCharCode(...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const approveRes = await fetch(
      `http://127.0.0.1:8761/?oauth=authorize&api_key=${TEST_KEY}&response_type=code&client_id=${E2E_CLIENT_ID}&redirect_uri=${redirect}&state=e2e-state&code_challenge=${challengeB64}&code_challenge_method=S256&confirm=1`,
      { redirect: 'manual' },
    )
    assertEquals(approveRes.status, 302)
    const loc = new URL(approveRes.headers.get('location')!)
    assertEquals(loc.hostname, 'chatgpt.com')
    assertEquals(loc.searchParams.get('state'), 'e2e-state')
    const code = loc.searchParams.get('code')!
    assert(code)

    // token (form-urlencoded — عقد ChatGPT) → رموز
    const tokenRes = await fetch(`http://127.0.0.1:8761/?oauth=token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: E2E_CLIENT_ID,
        client_secret: E2E_CLIENT_SECRET,
        code,
        redirect_uri: 'https://chatgpt.com/aip-1/oauth/callback',
        code_verifier: verifier,
      }).toString(),
    })
    if (tokenRes.status !== 200) {
      throw new Error(`token endpoint فشل: ${await tokenRes.text()}`)
    }
    const tokens = await tokenRes.json()
    assert(tokens.access_token)
    assert(tokens.refresh_token)

    // JSON-RPC بـaccess_token (مصادقة OAuth عبر الخادم الحي)
    const viaOauth = await (await fetch(`http://127.0.0.1:8761/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' }),
    })).json()
    assertEquals(viaOauth.result.tools.length, 8)

    // grant غير مدعوم عبر HTTP → 400
    const badGrant = await fetch(`http://127.0.0.1:8761/?oauth=token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password', client_id: E2E_CLIENT_ID, client_secret: E2E_CLIENT_SECRET,
      }).toString(),
    })
    assertEquals(badGrant.status, 400)
    assertEquals((await badGrant.json()).error, 'unsupported_grant_type')

    // ═══ PUSH-DISPATCH: المصادقة والإرسال الحي ═══
    // بلا مصادقة → 401
    const pushNoAuth = await fetch(`http://127.0.0.1:8762/`, { method: 'POST', body: '{}' })
    assertEquals(pushNoAuth.status, 401)

    // سر خاطئ → 401
    const pushBadSecret = await fetch(`http://127.0.0.1:8762/`, {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong-secret' },
      body: '{}',
    })
    assertEquals(pushBadSecret.status, 401)

    // GET → 405
    const pushGet = await fetch(`http://127.0.0.1:8762/`)
    assertEquals(pushGet.status, 405)

    // جولة كاملة بمفتاح الخدمة → الإشعار المزروع يُرسل ويُفك تشفيره
    const sweepRes = await fetch(`http://127.0.0.1:8762/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      body: '{}',
    })
    assertEquals(sweepRes.status, 200)
    const sweep = await sweepRes.json()
    assertEquals(sweep.ok, true)
    assertEquals(sweep.processed, 1)
    assertEquals(sweep.sent, 1)

    // المزود الوهمي استلم الإشعار وفكه بنجاح
    assertEquals(provider.received.length, 1)
    assert(!provider.received[0].decrypted.includes('DECRYPT-FAILED'), provider.received[0].decrypted)
    const payload = JSON.parse(provider.received[0].decrypted)
    assertEquals(payload.title, 'تذكير e2e')
    assertEquals(payload.url, `/app?module=tasks&notification=${notificationId}`)

    // الجولة الثانية نظيفة (لا إعادة إرسال)
    const sweep2 = await (await fetch(`http://127.0.0.1:8762/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      body: '{}',
    })).json()
    assertEquals(sweep2.processed, 0)
    assertEquals(provider.received.length, 1)

    // المصادقة عبر سر المجدول تعمل أيضًا
    const cronSweep = await fetch(`http://127.0.0.1:8762/`, {
      method: 'POST',
      headers: { 'x-cron-secret': 'e2e-cron-secret' },
      body: '{}',
    })
    assertEquals(cronSweep.status, 200)

    // force dispatch لإشعار غير موجود → not-found (لا يرمي)
    const forced = await (await fetch(
      `http://127.0.0.1:8762/?notification_id=${crypto.randomUUID()}`,
      { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}` } },
    )).json()
    assertEquals(forced.forced, true)
    assertEquals(forced.result.status, 'not-found')

    // notification_id غير صالح → 400
    const badUuid = await fetch(`http://127.0.0.1:8762/?notification_id=not-a-uuid`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    })
    assertEquals(badUuid.status, 400)

    // last_used_at تحدّث للمفتاح (المصادقة مرّت عبر HTTP حقيقي)
    assert(db.apiKeys[0].last_used_at, 'last_used_at لم يتحدث')
  } finally {
    mcpProc.kill()
    pushProc.kill()
    await postgrest.close()
    await provider.close()
  }
})
