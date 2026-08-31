/* Production E2E verification of Task 19-b:
 * 1) unified daily score — dashboard API score === productivity-score API score (was 3 conflicting formulas)
 * 2) scoreBreakdown field present (deploy proof)
 * 3) due-only habit counting — a 'weekends' habit does NOT drag a workday score
 * Run: node scripts/verify-prod-19b.js
 */
const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now().toString(36)
const EMAIL = `qa19-${TS}@riseos.test`
const PASSWORD = 'Test123456!'

function cairoDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' | ' + detail : ''}`)
}

async function api(path, opts = {}, token) {
  const res = await fetch(BASE + path, {
    ...opts,
    signal: AbortSignal.timeout(45000), // fail fast — never hang the whole run
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
  const yesterday = cairoDate(-1)
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay()
  const isWeekendCairo = dow === 5 || dow === 6 // Fri/Sat
  let v = 0
  const bump = () => { v++ }
  console.log(`Cairo today=${today} (dow=${dow}, weekend=${isWeekendCairo}) | account=${EMAIL}`)

  const su = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'قياس ١٩' }),
  })
  const token = su.json?.session?.access_token
  check('signup returns session token', !!token, `status=${su.status}`)

  const d1 = await api(`/api/rise/dashboard?date=${today}&_v=${v}`, {}, token)
  check('dashboard 200', d1.status === 200, `status=${d1.status}`)
  check('NEW FIELD scoreBreakdown present (deploy proof)', 'scoreBreakdown' in (d1.json || {}),
    `scoreBreakdown=${JSON.stringify(d1.json?.scoreBreakdown)}`)

  const h1 = await api('/api/rise/habits', {
    method: 'POST',
    body: JSON.stringify({ name: 'عادة يومية ١٩', icon: 'book', color: '#3a5a50', frequency: 'daily', targetCount: 1 }),
  }, token)
  const dailyHabitId = h1.json?.id || h1.json?.habit?.id
  check('daily habit created', !!dailyHabitId, `status=${h1.status}`)

  const h2 = await api('/api/rise/habits', {
    method: 'POST',
    body: JSON.stringify({ name: 'عادة نهاية الأسبوع ١٩', icon: 'water', color: '#3B82F6', frequency: 'weekends', targetCount: 1 }),
  }, token)
  check('weekends habit created', !!(h2.json?.id || h2.json?.habit?.id), `status=${h2.status}`)

  const t1 = await api('/api/rise/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'مهمة اختبار ١٩', dueDate: today, priority: 'medium' }),
  }, token)
  const taskId = t1.json?.id || t1.json?.task?.id
  check('task created due today', !!taskId, `status=${t1.status}`)

  if (dailyHabitId) {
    const log = await api('/api/rise/habits', {
      method: 'PUT',
      body: JSON.stringify({ habitId: dailyHabitId, date: today, completed: true }),
    }, token)
    check('daily habit completed', log.status === 200, `status=${log.status}`)
    bump()
  }
  if (taskId) {
    const done = await api('/api/rise/tasks', {
      method: 'PUT',
      body: JSON.stringify({ id: taskId, status: 'done' }),
    }, token)
    check('task completed (status=done)', done.status === 200, `status=${done.status}`)
    bump()
  }

  const dueHabitsCount = 1 + (isWeekendCairo ? 1 : 0)
  const habitsPct = (1 / dueHabitsCount) * 100
  const activity = (100 * 0.35 + habitsPct * 0.25) / 0.60
  const streakPct = (1 / 30) * 100
  const expectedScore = Math.round(activity * 0.9 + streakPct * 0.1)

  const d2 = await api(`/api/rise/dashboard?date=${today}&_v=${v}`, {}, token)
  const b = d2.json || {}
  check('DUE-ONLY habits: weekends habit excluded from denominator on a workday',
    isWeekendCairo ? b.today?.habitsTotal === 2 : b.today?.habitsTotal === 1,
    `habitsTotal=${b.today?.habitsTotal} (weekend=${isWeekendCairo})`)
  check('habitsCompleted = 1', b.today?.habitsCompleted === 1, `=${b.today?.habitsCompleted}`)
  check('streak = 1', b.user?.streak === 1, `=${b.user?.streak}`)
  check(`dashboard score = expected math (${expectedScore})`, b.productivityScore === expectedScore,
    `score=${b.productivityScore} expected=${expectedScore}`)
  check('breakdown.tasks = 100', b.scoreBreakdown?.tasks === 100, `=${b.scoreBreakdown?.tasks}`)
  check(`breakdown.habits = ${Math.round(habitsPct)}`, b.scoreBreakdown?.habits === Math.round(habitsPct),
    `=${b.scoreBreakdown?.habits}`)

  const ps1 = await api(`/api/rise/productivity-score?dates=${today}&_v=${v}`, {}, token)
  const psScore = ps1.json?.scores?.[0]?.score
  const psBreakdown = ps1.json?.scores?.[0]?.breakdown
  check(`productivity-score(today) = ${expectedScore} (was a DIFFERENT formula before)`, psScore === expectedScore,
    `score=${psScore} expected=${expectedScore}`)
  check('PARITY: dashboard score === productivity-score score', psScore === b.productivityScore,
    `dashboard=${b.productivityScore} scores-api=${psScore}`)
  check('PARITY: breakdown.habits identical in both APIs', psBreakdown?.habits === b.scoreBreakdown?.habits,
    `dashboard=${b.scoreBreakdown?.habits} scores-api=${psBreakdown?.habits}`)

  const ps2 = await api(`/api/rise/productivity-score?dates=${yesterday},${today}&_v=${v}`, {}, token)
  const todayEntry = (ps2.json?.scores || []).find(s => s.date === today)
  check('multi-date path: today entry matches dashboard score', todayEntry?.score === b.productivityScore,
    `entry=${todayEntry?.score} dashboard=${b.productivityScore}`)

  const failed = results.filter(r => !r.ok).length
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
