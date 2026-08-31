/* Task 20 — full real-user journey E2E against production.
 * Covers: signup → create habit/task/journal → CRUD updates → dashboard sanity
 *      → delete-all WITHOUT body (must 400) → wrong password (must 403)
 *      → correct password re-auth wipe (must 200 + counts) → verify empty
 *      → error-log telemetry accepted → admin routes denied for non-admin.
 * Run AFTER deploy: node scripts/verify-prod-20.js
 */
const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now().toString(36)
const EMAIL = `qa20-${TS}@riseos.test`
const PASSWORD = 'Test123456!'

function cairoDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400000))
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' | ' + detail : ''}`)
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
  return { status: res.status, json, text }
}

async function main() {
  const today = cairoDate(0)
  let v = 0
  const bump = () => { v++ }

  // ═══ 1) SIGNUP ═══
  const su = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'رحلة ٢٠' }),
  })
  const token = su.json?.session?.access_token
  check('1. signup works', !!token, `status=${su.status}`)

  // ═══ 2) FULL JOURNEY — habit + task + journal ═══
  const h = await api('/api/rise/habits', {
    method: 'POST',
    body: JSON.stringify({ name: 'عادة الرحلة', icon: 'book', color: '#3a5a50', frequency: 'daily', targetCount: 1 }),
  }, token)
  const habitId = h.json?.id || h.json?.habit?.id
  check('2a. habit created', !!habitId, `status=${h.status}`)

  const hlog = habitId ? await api('/api/rise/habits', {
    method: 'PUT',
    body: JSON.stringify({ habitId, date: today, completed: true }),
  }, token) : null
  check('2b. habit completed today', hlog?.status === 200, `status=${hlog?.status}`)
  bump()

  const t = await api('/api/rise/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'مهمة الرحلة', dueDate: today, priority: 'high' }),
  }, token)
  const taskId = t.json?.id || t.json?.task?.id
  check('2c. task created with dueDate', !!taskId, `status=${t.status}`)

  if (taskId) {
    const ren = await api('/api/rise/tasks', {
      method: 'PUT',
      body: JSON.stringify({ id: taskId, title: 'مهمة الرحلة (معدلة)' }),
    }, token)
    check('2d. task renamed', ren.status === 200, `status=${ren.status}`)
    const done = await api('/api/rise/tasks', {
      method: 'PUT',
      body: JSON.stringify({ id: taskId, status: 'done' }),
    }, token)
    check('2e. task completed', done.status === 200, `status=${done.status}`)
    bump()
  }

  const j = await api('/api/rise/journal', {
    method: 'POST',
    body: JSON.stringify({ date: today, content: 'يومية رحلة المستخدم الكاملة — Task 20', mood: 4 }),
  }, token)
  check('2f. journal saved', j.status === 200, `status=${j.status}`)
  bump()

  // ═══ 3) DASHBOARD SANITY before wipe ═══
  const dash = await api(`/api/rise/dashboard?date=${today}&_v=${v}`, {}, token)
  const b = dash.json || {}
  check('3a. dashboard 200', dash.status === 200, `status=${dash.status}`)
  check('3b. tasks visible before wipe (1 done task)', b.tasks?.length === 1, `tasks=${b.tasks?.length}`)
  check('3c. habits visible before wipe', b.habits?.length === 1, `habits=${b.habits?.length}`)
  check('3d. today.habitsCompleted = 1', b.today?.habitsCompleted === 1, `=${b.today?.habitsCompleted}`)
  check('3e. tasksCompleted = 1', b.today?.tasksCompleted === 1, `=${b.today?.tasksCompleted}`)
  check('3f. scoreBreakdown present (19-b regression guard)', !!b.scoreBreakdown, JSON.stringify(b.scoreBreakdown))

  // ═══ 4) DELETE-ALL FLOW (the reported bug) ═══
  const noBody = await api('/api/rise/delete-all', { method: 'DELETE' }, token)
  check('4a. delete-all without body → 400 (validation intact)', noBody.status === 400, `status=${noBody.status}`)

  const wrongPw = await api('/api/rise/delete-all', {
    method: 'DELETE',
    body: JSON.stringify({ email: EMAIL, password: 'WrongPass123!', confirmDelete: true }),
  }, token)
  check('4b. wrong password → 403 (re-auth enforced)', wrongPw.status === 403, `status=${wrongPw.status}`)

  const wrongEmail = await api('/api/rise/delete-all', {
    method: 'DELETE',
    body: JSON.stringify({ email: `other-${TS}@riseos.test`, password: PASSWORD, confirmDelete: true }),
  }, token)
  check('4c. wrong email → 403 (email must match session user)', wrongEmail.status === 403, `status=${wrongEmail.status}`)

  const wipe = await api('/api/rise/delete-all', {
    method: 'DELETE',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, confirmDelete: true }),
  }, token)
  check('4d. delete-all with correct credentials → 200 (BUG FIXED)', wipe.status === 200,
    `status=${wipe.status} body=${JSON.stringify(wipe.json)}`)
  check('4e. deleted count > 0', (wipe.json?.deleted || 0) > 0, `deleted=${wipe.json?.deleted}`)
  bump()

  // ═══ 5) VERIFY WIPE — everything empty ═══
  const dash2 = await api(`/api/rise/dashboard?date=${today}&_v=${v}`, {}, token)
  const b2 = dash2.json || {}
  check('5a. tasks empty after wipe', Array.isArray(b2.tasks) && b2.tasks.length === 0, `tasks=${b2.tasks?.length}`)
  check('5b. habits empty after wipe', Array.isArray(b2.habits) && b2.habits.length === 0, `habits=${b2.habits?.length}`)
  check('5c. today counters zeroed', (b2.today?.habitsCompleted || 0) === 0 && (b2.today?.tasksCompleted || 0) === 0,
    `habits=${b2.today?.habitsCompleted} tasks=${b2.today?.tasksCompleted}`)

  // ═══ 6) ERROR TELEMETRY ═══
  const el = await api('/api/error-log', {
    method: 'POST',
    body: JSON.stringify({ message: 'Task 20 telemetry test', url: `${BASE}/app`, context: { test: true } }),
  })
  check('6. error-log accepted (ok:true)', el.status === 200 && el.json?.ok === true, `status=${el.status}`)

  // ═══ 7) ADMIN SECURITY — non-admin must be denied ═══
  const ah = await api('/api/rise/admin/health', {}, token)
  check('7a. admin/health denied for regular user (403)', ah.status === 403, `status=${ah.status}`)
  const ae = await api('/api/rise/admin/errors', {}, token)
  check('7b. admin/errors denied for regular user (403)', ae.status === 403, `status=${ae.status}`)
  const au = await api('/api/rise/admin/users', {}, token)
  check('7c. admin/users denied for regular user (403)', au.status === 403, `status=${au.status}`)

  const failed = results.filter(r => !r.ok).length
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
