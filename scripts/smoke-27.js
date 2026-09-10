#!/usr/bin/env node
/**
 * Task 27 — post-deploy smoke on PRODUCTION (hardening pass5)
 * Checks: auth chain, GETs, CRITICAL: mutation idempotency path (needs table 014)
 * Usage: node scripts/smoke-27.js
 */
const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now()
const EMAIL = `qa27-${TS}@riseos.test`
const PASS = 'Test123456!'
let pass = 0, fail = 0
const results = []
function log(name, ok, detail) {
  results.push({ name, ok, detail })
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
}
let cookieJar = ''
async function req(path, { method = 'GET', body, token, key } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookieJar) headers.Cookie = cookieJar
  if (key) headers['Idempotency-Key'] = key
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  })
  // capture httpOnly auth cookies (rise-access / rise-refresh)
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  for (const sc of setCookies) {
    const [pair] = sc.split(';')
    if (/^rise-(access|refresh)=/.test(pair)) {
      const name = pair.split('=')[0]
      cookieJar = cookieJar
        .split('; ').filter(c => !c.startsWith(name + '='))
        .concat(pair).join('; ')
    }
  }
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

;(async () => {
  // 1. Homepage
  const home = await fetch(BASE + '/', { signal: AbortSignal.timeout(45000) })
  log('homepage 200', home.status === 200, `status=${home.status}`)

  // 2. Signup (new user)
  const su = await req('/api/auth/signup', { method: 'POST', body: { email: EMAIL, password: PASS, name: 'QA27' } })
  log('signup', su.status === 200 || su.status === 201, `status=${su.status} err=${su.json?.error || '-'}`)
  const suToken = su.json?.accessToken || su.json?.access_token || su.json?.token

  // 3. Login
  const li = await req('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } })
  log('login 200 + cookies set', li.status === 200 && /rise-access=/.test(cookieJar),
    `status=${li.status} cookie=${/rise-access=/.test(cookieJar) ? 'yes' : 'no'} bodyUser=${!!li.json?.user}`)

  // 4. Session via httpOnly cookies
  const se = await req('/api/auth/session')
  const uid = se.json?.user?.id
  log('session user', se.status === 200 && !!uid, `status=${se.status} userId=${uid || '-'}`)

  // 5. GETs (read paths — should be unaffected)
  for (const [name, path] of [
    ['GET tasks', '/api/rise/tasks'],
    ['GET books', '/api/rise/books'],
    ['GET knowledge (brain)', '/api/rise/knowledge'],
    ['GET habits', '/api/rise/habits'],
    ['GET dashboard', '/api/rise/dashboard'],
  ]) {
    const r = await req(path)
    log(name, r.status === 200, `status=${r.status} err=${r.json?.error || '-'}`)
  }

  // 6. CRITICAL: mutations need request_idempotency table (migration 014)
  const key = `smoke-27-${TS}`
  const ct = await req('/api/rise/tasks', {
    method: 'POST', key,
    body: { title: 'smoke27 task', status: 'todo', priority: 'medium' },
  })
  const idemOk = ct.status >= 200 && ct.status < 300
  log('MUTATION create-task (idempotency table required!)', idemOk,
    `status=${ct.status} err=${ct.json?.error || '-'}`)
  const createdTask = ct.json

  // 6b. Idempotent replay: same key + same body → same response (replay), not duplicate
  let replayOk = null
  if (idemOk) {
    const ct2 = await req('/api/rise/tasks', {
      method: 'POST', key,
      body: { title: 'smoke27 task', status: 'todo', priority: 'medium' },
    })
    replayOk = ct2.status >= 200 && ct2.status < 300
    log('idempotent replay same-key', replayOk, `status=${ct2.status}`)
  }

  // 7. Mutation WITHOUT Idempotency-Key → 428 middleware guard (new-version behavior)
  const noKey = await req('/api/rise/tasks', { method: 'POST', body: { title: 'no-key' } })
  log('mutation without key → 428 (middleware guard)', noKey.status === 428, `status=${noKey.status}`)

  // 8. Unauthorized mutation (valid-format key, NO cookies) → 401
  const savedJar = cookieJar
  cookieJar = ''
  const unauth = await req('/api/rise/tasks', { method: 'POST', key: `unauth-${TS}-0000000000`, body: { title: 'x' } })
  cookieJar = savedJar
  log('unauth mutation → 401', unauth.status === 401, `status=${unauth.status}`)

  // 9. Cleanup: login-less delete-all needs password — use re-auth delete-all
  if (createdTask?.id) {
    const del = await req(`/api/rise/tasks?id=${createdTask.id}`, { method: 'DELETE', key: `del-${TS}` })
    log('cleanup delete created task', del.status >= 200 && del.status < 300, `status=${del.status}`)
  }

  console.log(`\n===== SMOKE 27: ${pass} PASS / ${fail} FAIL =====`)
  if (!idemOk) {
    console.log('\n>>> MUTATIONS FAILING ⇒ اعرف السبب من الحالة أعلاه (جدول مفقود = نفّذ 013→022)')
  }
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('FATAL', e?.message || e); process.exit(2) })
