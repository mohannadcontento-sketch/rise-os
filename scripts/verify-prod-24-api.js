/**
 * Task 24 — Comprehensive API Test Suite (Functional + Edge Cases + Security OWASP-lite)
 * Target: production
 * Sections:
 *  A) Functional: full CRUD on every major resource + dashboards + export
 *  B) Edge cases: malformed JSON, wrong types, empty bodies, long strings,
 *     unicode/emoji, negative numbers, XSS/SQLi payloads (must not 500)
 *  C) Security: no-auth sweep (401), forged token (401), admin gate (403),
 *     IDOR cross-account isolation, cookie flags, security headers, login rate-limit
 */
const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now().toString(36)
const EMAIL_A = `qa24a-${TS}@riseos.test`
const EMAIL_B = `qa24b-${TS}@riseos.test`
const PASSWORD = 'Test123456!'

function cairoDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400000))
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail === undefined ? '' : String(detail).slice(0, 120) })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' | ' + String(detail).slice(0, 120) : ''}`)
}

async function api(path, opts = {}, token) {
  const res = await fetch(BASE + path, {
    ...opts,
    signal: AbortSignal.timeout(45000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON */ }
  return { status: res.status, json, text, headers: res.headers }
}

async function signup(email) {
  const r = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, name: 'اختبار ٢٤' }),
  })
  return { token: r.json?.session?.access_token, status: r.status }
}

async function main() {
  const today = cairoDate(0)
  let pass = 0, fail = 0
  const tally = (ok) => { ok ? pass++ : fail++ }

  console.log('═'.repeat(64))
  console.log('SECTION A — FUNCTIONAL (full user journey via API)')
  console.log('═'.repeat(64))

  const A = await signup(EMAIL_A)
  check('A1. signup account A', !!A.token, `status=${A.status}`)
  const t = A.token

  const B = await signup(EMAIL_B)
  check('A2. signup account B (for IDOR tests)', !!B.token, `status=${B.status}`)
  const tb = B.token

  // ── Tasks full CRUD (payload per tasks schema: dueDate) ──
  let r = await api('/api/rise/tasks', { method: 'POST', body: JSON.stringify({ title: 'مهمة ٢٤', description: 'وصف', priority: 'high', dueDate: today }) }, t)
  const taskId = r.json?.id || r.json?.task?.id
  check('A3. task create', r.status === 200 || r.status === 201 && !!taskId, `status=${r.status}`)
  r = await api('/api/rise/tasks', {}, t)
  check('A4. task list', r.status === 200 && Array.isArray(r.json?.tasks || r.json), `status=${r.status} n=${(r.json?.tasks || r.json || []).length}`)
  if (taskId) {
    r = await api('/api/rise/tasks', { method: 'PUT', body: JSON.stringify({ id: taskId, title: 'مهمة ٢٤ معدلة', completed: true }) }, t)
    check('A5. task update+complete', [200, 204].includes(r.status), `status=${r.status}`)
    r = await api('/api/rise/tasks?id=' + taskId, { method: 'DELETE' }, t)
    check('A6. task delete (query param)', [200, 204].includes(r.status), `status=${r.status}`)
  }

  // ── Habits ──
  r = await api('/api/rise/habits', { method: 'POST', body: JSON.stringify({ name: 'عادة ٢٤', icon: 'droplet', color: '#3a5a50', frequency: 'daily', targetCount: 1 }) }, t)
  const habitId = r.json?.id || r.json?.habit?.id
  check('A7. habit create', !!habitId, `status=${r.status}`)
  r = await api('/api/rise/habits', {}, t)
  check('A8. habit list', r.status === 200, `status=${r.status}`)
  if (habitId) {
    r = await api('/api/rise/habits', { method: 'PUT', body: JSON.stringify({ id: habitId, name: 'عادة ٢٤ معدلة' }) }, t)
    check('A9. habit update', [200, 204].includes(r.status), `status=${r.status}`)
  }

  // ── Journal (mood is int 1-5 per DB) ──
  r = await api('/api/rise/journal', { method: 'POST', body: JSON.stringify({ content: 'يوميات اختبار ٢٤ 🌟', mood: 4, date: today }) }, t)
  check('A10. journal create', [200, 201].includes(r.status), `status=${r.status}`)
  // regression: string mood must now 400 (was 500 before Task 24 fix)
  r = await api('/api/rise/journal', { method: 'POST', body: JSON.stringify({ content: 'x', mood: 'good' }) }, t)
  check('A10b. journal mood:string → 400 (was 500)', r.status === 400, `status=${r.status}`)
  r = await api('/api/rise/journal', {}, t)
  check('A11. journal list', r.status === 200, `status=${r.status}`)

  // ── Morning (allowed: score/completedItems/totalItems/startedAt/completedAt) ──
  r = await api('/api/rise/morning', { method: 'POST', body: JSON.stringify({ date: today, score: 60, completedItems: 3, totalItems: 5 }) }, t)
  check('A12. morning routine save', [200, 201].includes(r.status), `status=${r.status}`)
  // regression: empty-whitelist payload must now 400 (was 500)
  r = await api('/api/rise/morning', { method: 'POST', body: JSON.stringify({ gratitude: 'الحمد لله', water: true }) }, t)
  check('A12b. morning unknown-fields → 400 (was 500)', r.status === 400, `status=${r.status}`)

  // ── Focus (UI-shaped payload) ──
  r = await api('/api/rise/focus', { method: 'POST', body: JSON.stringify({ duration: 25, actualMin: 25, type: 'deep', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), completed: true }) }, t)
  check('A13. focus session log', [200, 201].includes(r.status), `status=${r.status}`)
  // regression: minimal payload (no startedAt) must now 200 via server default (was 500)
  r = await api('/api/rise/focus', { method: 'POST', body: JSON.stringify({ duration: 10, type: 'pomodoro' }) }, t)
  check('A13b. focus minimal payload → 200 (was 500)', [200, 201].includes(r.status), `status=${r.status}`)

  // ── Goals / Projects ──
  r = await api('/api/rise/goals', { method: 'POST', body: JSON.stringify({ title: 'هدف ٢٤', target: 100, progress: 0 }) }, t)
  check('A14. goal create', [200, 201].includes(r.status), `status=${r.status}`)
  r = await api('/api/rise/projects', { method: 'POST', body: JSON.stringify({ name: 'مشروع ٢٤', color: '#3a5a50' }) }, t)
  check('A15. project create', [200, 201].includes(r.status), `status=${r.status}`)

  // ── Finance ──
  r = await api('/api/rise/finance', { method: 'POST', body: JSON.stringify({ type: 'expense', amount: 50, description: 'قهوة', date: today }) }, t)
  check('A16. finance expense create', [200, 201].includes(r.status), `status=${r.status}`)
  r = await api('/api/rise/budgets', { method: 'PUT', body: JSON.stringify({ budgets: [{ category: 'طعام', limit: 500, month: today.slice(0, 7) }] }) }, t)
  check('A17. budget upsert (PUT array)', [200, 201].includes(r.status), `status=${r.status}`)

  // ── Dashboards + analytics ──
  r = await api('/api/rise/dashboard', {}, t)
  const dash = r.json
  check('A18. dashboard aggregate', r.status === 200 && !!dash, `status=${r.status}`)
  check('A19. dashboard scoreBreakdown present', !!dash?.scoreBreakdown || !!dash?.productivityScore, `score=${dash?.productivityScore}`)
  r = await api('/api/rise/dashboard/weekly-chart', {}, t)
  check('A20. weekly chart', r.status === 200, `status=${r.status}`)
  r = await api('/api/rise/dashboard/summary', {}, t)
  check('A21. dashboard summary', r.status === 200, `status=${r.status}`)
  r = await api('/api/rise/dashboard/recent', {}, t)
  check('A22. dashboard recent', r.status === 200, `status=${r.status}`)
  r = await api('/api/rise/productivity-score', {}, t)
  check('A23. productivity-score parity', r.status === 200, `status=${r.status}`)

  // ── User profile + export + notifications ──
  r = await api('/api/rise/user/name', { method: 'POST', body: JSON.stringify({ name: 'اسم جديد ٢٤' }) }, t)
  check('A24. user name update', [200, 201].includes(r.status), `status=${r.status}`)
  r = await api('/api/rise/notifications', {}, t)
  check('A25. notifications list', r.status === 200, `status=${r.status}`)
  r = await api('/api/rise/export', {}, t)
  check('A26. data export', r.status === 200, `status=${r.status} bytes=${r.text.length}`)
  r = await api('/api/rise/health', {}, t)
  check('A27. rise health', r.status === 200, `status=${r.status}`)
  r = await api('/api/rise/earn-xp', { method: 'POST', body: JSON.stringify({ amount: 10, reason: 'test' }) }, t)
  check('A28. earn-xp', [200, 201, 400].includes(r.status), `status=${r.status}`)

  console.log('\n' + '═'.repeat(64))
  console.log('SECTION B — EDGE CASES (must never 500 / never corrupt)')
  console.log('═'.repeat(64))

  // B1: malformed JSON
  r = await api('/api/rise/tasks', { method: 'POST', body: '{invalid json' }, t)
  check('B1. malformed JSON → 400, not 500', r.status === 400, `status=${r.status}`)
  r = await api('/api/rise/tasks', { method: 'POST', body: '' }, t)
  check('B2. empty body → 4xx', r.status >= 400 && r.status < 500, `status=${r.status}`)

  // B3: wrong types
  r = await api('/api/rise/finance', { method: 'POST', body: JSON.stringify({ type: 'expense', amount: 'kgshd', description: 123, date: today }) }, t)
  check('B3. wrong types rejected (Zod)', [400, 422].includes(r.status), `status=${r.status}`)
  r = await api('/api/rise/finance', { method: 'POST', body: JSON.stringify({ type: 'expense', amount: -50, description: 'سالب', date: today }) }, t)
  check('B4. negative amount rejected', [400, 422].includes(r.status), `status=${r.status}`)

  // B5: XSS payload stored (server stores raw; React escapes on render)
  r = await api('/api/rise/tasks', { method: 'POST', body: JSON.stringify({ title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(2)>', dueDate: today }) }, t)
  const xssId = r.json?.id || r.json?.task?.id
  check('B5. XSS payload accepted-or-rejected sanely (no 500)', r.status < 500, `status=${r.status}`)
  if (xssId) await api('/api/rise/tasks?id=' + xssId, { method: 'DELETE' }, t)

  // B6: SQL injection payloads
  r = await api('/api/rise/tasks', { method: 'POST', body: JSON.stringify({ title: "'; DROP TABLE tasks; --", dueDate: today }) }, t)
  const sqliId = r.json?.id || r.json?.task?.id
  check('B6. SQLi payload no 500 + table alive', r.status < 500, `status=${r.status}`)
  r = await api('/api/rise/tasks', {}, t)
  check('B7. tasks table still functional after SQLi', r.status === 200, `status=${r.status}`)
  if (sqliId) await api('/api/rise/tasks?id=' + sqliId, { method: 'DELETE' }, t)

  // B8: unicode + emoji + RTL
  r = await api('/api/rise/journal', { method: 'POST', body: JSON.stringify({ content: '🚀🎉 العربية 𝕏 Ω ≈ ∑ ↔️ مرحبا بالعالم', mood: 5, date: today }) }, t)
  check('B8. unicode/emoji/RTL roundtrip', [200, 201].includes(r.status), `status=${r.status}`)

  // B9: very long string (10KB)
  const long = 'ا'.repeat(10000)
  r = await api('/api/rise/tasks', { method: 'POST', body: JSON.stringify({ title: long, dueDate: today }) }, t)
  check('B9. 10KB title handled (accepted or 4xx, no 5xx)', r.status < 500, `status=${r.status}`)
  const longId = r.json?.id || r.json?.task?.id
  if (longId) await api('/api/rise/tasks?id=' + longId, { method: 'DELETE' }, t)

  // B10: delete non-existent id (query param — idempotent no-op)
  r = await api('/api/rise/tasks?id=00000000-0000-0000-0000-000000000000', { method: 'DELETE' }, t)
  check('B10. delete non-existent id → sane code', [200, 204, 404].includes(r.status), `status=${r.status}`)

  // B11: nonexistent route
  r = await api('/api/rise/does-not-exist', {}, t)
  check('B11. unknown route → 404', r.status === 404, `status=${r.status}`)

  // B12: wrong HTTP method
  r = await api('/api/rise/dashboard', { method: 'DELETE' }, t)
  check('B12. wrong method on GET route → 405 or 400', [405, 400, 404].includes(r.status), `status=${r.status}`)

  console.log('\n' + '═'.repeat(64))
  console.log('SECTION C — SECURITY (OWASP-lite)')
  console.log('═'.repeat(64))

  // C1: no-auth sweep on all protected GET routes
  const protectedGets = [
    '/api/rise/tasks', '/api/rise/habits', '/api/rise/journal', '/api/rise/morning',
    '/api/rise/focus', '/api/rise/goals', '/api/rise/projects', '/api/rise/finance',
    '/api/rise/budgets', '/api/rise/dashboard', '/api/rise/export', '/api/rise/notifications',
    '/api/rise/delete-all', '/api/rise/admin/users', '/api/rise/admin/errors',
    '/api/rise/admin/health', '/api/rise/admin/overview', '/api/rise/admin/audit',
    '/api/rise/admin/broadcast', '/api/rise/admin/stats',
  ]
  let unauthOk = 0
  const unauthBad = []
  for (const p of protectedGets) {
    r = await api(p)
    // 401/403 = auth denied; 405 = method-restricted route (delete-all=DELETE, broadcast=POST) — still deny
    if (r.status === 401 || r.status === 403 || r.status === 405) unauthOk++
    else unauthBad.push(`${p}=${r.status}`)
  }
  check('C1. all 20 protected routes deny anonymous', unauthOk === protectedGets.length, unauthBad.join(',') || 'all 401/403')

  // C2: forged token
  r = await api('/api/rise/tasks', {}, 'eyJhbGciOiJIUzI1NiJ9.FORGED.sig')
  check('C2. forged JWT rejected', r.status === 401, `status=${r.status}`)
  r = await api('/api/rise/tasks', {}, 'garbage-token')
  check('C3. garbage token rejected', r.status === 401, `status=${r.status}`)

  // C4: admin gate with regular user
  const adminRoutes = ['/api/rise/admin/users', '/api/rise/admin/errors', '/api/rise/admin/health', '/api/rise/admin/overview', '/api/rise/admin/audit', '/api/rise/admin/stats']
  let adminOk = 0
  const adminBad = []
  for (const p of adminRoutes) {
    r = await api(p, {}, t)
    if (r.status === 403) adminOk++
    else adminBad.push(`${p}=${r.status}`)
  }
  check('C4. admin routes 403 for regular user (6/6)', adminOk === adminRoutes.length, adminBad.join(',') || 'all 403')
  r = await api('/api/rise/admin/broadcast', { method: 'POST', body: JSON.stringify({ message: 'اختراق؟' }) }, t)
  check('C4b. POST broadcast as regular user → 403', r.status === 403, `status=${r.status}`)

  // C5: IDOR — account B must not see A's data; B cannot mutate A's rows
  r = await api('/api/rise/tasks', { method: 'POST', body: JSON.stringify({ title: 'مهمة المالك A', dueDate: today }) }, t)
  const aTaskId = r.json?.id || r.json?.task?.id
  r = await api('/api/rise/tasks', {}, tb)
  const bList = r.json?.tasks || r.json || []
  const leaked = Array.isArray(bList) && bList.some(x => x.title === 'مهمة المالك A')
  check('C5. IDOR: B cannot see A tasks in list', !leaked, `B list n=${Array.isArray(bList) ? bList.length : '?'}`)
  if (aTaskId) {
    r = await api('/api/rise/tasks?id=' + aTaskId, { method: 'DELETE' }, tb)
    const bAttemptStatus = r.status
    // After B's attempt, verify A still has the task (mutation must fail or no-op)
    r = await api('/api/rise/tasks', {}, t)
    const aList = r.json?.tasks || r.json || []
    const stillThere = Array.isArray(aList) && aList.some(x => x.id === aTaskId)
    check('C6. IDOR: B cannot delete A task', stillThere, `B attempt status=${bAttemptStatus}`)
    // cleanup A task via A (real owner)
    r = await api('/api/rise/tasks?id=' + aTaskId, { method: 'DELETE' }, t)
    check('C7. owner can still delete own task after IDOR attempt', [200, 204].includes(r.status), `status=${r.status}`)
  }

  // C8: cookie security flags on login
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_A, password: PASSWORD }),
  })
  const setCookie = loginRes.headers.get('set-cookie') || ''
  const cookieOk = setCookie.includes('HttpOnly') && setCookie.toLowerCase().includes('secure') && setCookie.toLowerCase().includes('samesite')
  check('C8. session cookie HttpOnly+Secure+SameSite', cookieOk, setCookie.split(';')[0] || 'no set-cookie')

  // C9: security headers on /
  const home = await fetch(BASE + '/', { signal: AbortSignal.timeout(30000) })
  const hsts = home.headers.get('strict-transport-security')
  const xcto = home.headers.get('x-content-type-options')
  const frame = home.headers.get('x-frame-options') || home.headers.get('content-security-policy')
  check('C9a. HSTS present', !!hsts, hsts || 'missing')
  check('C9b. X-Content-Type-Options nosniff', xcto === 'nosniff', xcto || 'missing')
  check('C9c. clickjacking protection (XFO/CSP frame)', !!frame, (frame || 'missing').slice(0, 60))

  // C10: login rate-limit / brute force — 401s then 429 = rate limiter ACTIVE (good)
  const pw = []
  let saw429 = false
  for (let i = 0; i < 15; i++) {
    const rr = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL_A, password: 'WrongPass' + i + '!x' }) })
    pw.push(rr.status)
    if (rr.status === 429) saw429 = true
  }
  const noSuccess = !pw.includes(200)
  check('C10. brute-force: zero successes + rate-limit engaged (429)', noSuccess && saw429, `statuses=[${pw.join(',')}]`)

  // C11: signup weak password rejection
  r = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: `weak-${TS}@riseos.test`, password: '123', name: 'ضعيف' }) })
  check('C11. weak password rejected', [400, 422].includes(r.status), `status=${r.status}`)

  // C12: signup duplicate email
  r = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: EMAIL_A, password: PASSWORD, name: 'مكرر' }) })
  check('C12. duplicate signup rejected (409/4xx)', r.status >= 400 && r.status < 500, `status=${r.status}`)

  // ── CLEANUP: delete account A + B data ──
  console.log('\n── CLEANUP ──')
  r = await api('/api/rise/delete-all', { method: 'DELETE', body: JSON.stringify({ email: EMAIL_A, password: PASSWORD, confirmDelete: true }) }, t)
  check('Z1. cleanup account A (delete-all re-auth)', r.status === 200, `status=${r.status}`)
  r = await api('/api/rise/delete-all', { method: 'DELETE', body: JSON.stringify({ email: EMAIL_B, password: PASSWORD, confirmDelete: true }) }, tb)
  check('Z2. cleanup account B (delete-all re-auth)', r.status === 200, `status=${r.status}`)

  // ── Summary ──
  pass = 0; fail = 0
  results.forEach(x => x.ok ? pass++ : fail++)
  console.log('\n' + '═'.repeat(64))
  console.log(`TOTAL: ${pass}/${results.length} passed, ${fail} failed`)
  if (fail > 0) {
    console.log('FAILED CHECKS:')
    results.filter(x => !x.ok).forEach(x => console.log(`  ✗ ${x.name} | ${x.detail}`))
  }
  require('fs').writeFileSync('/home/z/my-project/scripts/verify-24-api-results.json', JSON.stringify(results, null, 2))
  console.log('Saved: scripts/verify-24-api-results.json')
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
