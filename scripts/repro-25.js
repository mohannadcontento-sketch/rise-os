/**
 * Task 25 — Reproduction suite for owner-reported save bugs:
 *  1) Morning routine check "reverts" (dashboard changes but checklist doesn't)
 *  2) Health save "does nothing"
 *  3) Books: save error toast but book appears later + empty reading value
 * Runs against PRODUCTION with a fresh QA account.
 */
const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now().toString(36)
const EMAIL = `qa25-${TS}@riseos.test`
const PASSWORD = 'Test123456!'

let pass = 0, fail = 0
function check(name, ok, detail) {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' | ' + String(detail).slice(0, 200) : ''}`)
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
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}

function cairoToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

async function main() {
  console.log('═'.repeat(70))
  console.log('TASK 25 BUG REPRO — morning / health / books — account:', EMAIL)
  console.log('═'.repeat(70))

  // ── signup ──
  const su = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'اختبار ٢٥' }),
  })
  const token = su.json?.session?.access_token
  check('signup ok', su.status === 200 && !!token, su.status)
  if (!token) return console.log('CANNOT CONTINUE — no token')

  const today = cairoToday()

  // ══ 1) MORNING ══
  console.log('\n── MORNING ──')
  let r = await api('/api/rise/morning', {
    method: 'POST',
    body: JSON.stringify({
      date: today, score: 20, completedItems: JSON.stringify(['wake-up']),
      totalItems: 12, startedAt: new Date().toISOString(), completedAt: null,
    }),
  }, token)
  check('morning POST item1 (no body date issues)', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)

  // immediate GET (simulates the post-write refetch storm)
  let g = await api(`/api/rise/morning?date=${today}`, {}, token)
  const items1 = JSON.parse(g.json?.todayLog?.completedItems || '[]')
  check('morning GET right after POST shows item1', g.status === 200 && items1.includes('wake-up'),
    `${g.status} items=${JSON.stringify(items1)}`)

  // second check (adds another item — the real "toggle second item" case)
  r = await api('/api/rise/morning', {
    method: 'POST',
    body: JSON.stringify({
      date: today, score: 40, completedItems: JSON.stringify(['wake-up', 'water']),
      totalItems: 12, startedAt: new Date().toISOString(), completedAt: null,
    }),
  }, token)
  check('morning POST item2 (upsert)', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)

  g = await api(`/api/rise/morning?date=${today}`, {}, token)
  const items2 = JSON.parse(g.json?.todayLog?.completedItems || '[]')
  check('morning GET shows BOTH items (no revert)', g.status === 200 && items2.includes('wake-up') && items2.includes('water'),
    `${g.status} items=${JSON.stringify(items2)}`)

  // GET with &_v= version param (exactly what the client sends)
  g = await api(`/api/rise/morning?date=${today}&_v=${Date.now()}`, {}, token)
  const items3 = JSON.parse(g.json?.todayLog?.completedItems || '[]')
  check('morning GET with _v shows BOTH items', g.status === 200 && items3.includes('wake-up') && items3.includes('water'),
    `${g.status} items=${JSON.stringify(items3)}`)

  // ══ 2) HEALTH ══
  console.log('\n── HEALTH ──')
  const healthPayload = {
    sleepHours: 8, sleepQuality: 4, waterGlasses: 6, steps: 7000, calories: 2200,
    weight: 78.5, mood: 4, energy: 4, exerciseType: 'cardio', exerciseMin: 35,
    exerciseNotes: 'تمرين جيد', date: today,
  }
  r = await api('/api/rise/health', { method: 'POST', body: JSON.stringify(healthPayload) }, token)
  check('health POST 200', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)

  g = await api('/api/rise/health', {}, token)
  const tl = g.json?.todayLog
  check('health GET todayLog exists', g.status === 200 && !!tl, `${g.status} todayLog=${tl ? 'yes' : 'null'}`)
  if (tl) {
    check('health waterGlasses persisted =6', tl.waterGlasses === 6, `got ${tl.waterGlasses}`)
    check('health sleepHours persisted =8', tl.sleepHours === 8, `got ${tl.sleepHours}`)
    check('health exerciseType persisted', tl.exerciseType === 'cardio', `got ${JSON.stringify(tl.exerciseType)}`)
    check('health exerciseNote persisted (client sends exerciseNotes!)', (tl.exerciseNote || '') === 'تمرين جيد',
      `got ${JSON.stringify(tl.exerciseNote)}`)
  }
  // second save with different values (owner: "no save or any change")
  r = await api('/api/rise/health', {
    method: 'POST',
    body: JSON.stringify({ ...healthPayload, waterGlasses: 2, sleepHours: 5, weight: null }),
  }, token)
  check('health POST #2 200 (updated values + null weight)', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)
  g = await api('/api/rise/health', {}, token)
  check('health GET reflects update (water=2, sleep=5)',
    g.json?.todayLog?.waterGlasses === 2 && g.json?.todayLog?.sleepHours === 5,
    `water=${g.json?.todayLog?.waterGlasses} sleep=${g.json?.todayLog?.sleepHours}`)

  // ══ 3) BOOKS ══
  console.log('\n── BOOKS ──')
  r = await api('/api/rise/books', {
    method: 'POST',
    body: JSON.stringify({ title: 'كتاب بلا صفحات', author: null, type: 'book', totalPages: null, status: 'reading' }),
  }, token)
  check('books POST (totalPages=null) 200', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)

  r = await api('/api/rise/books', {
    method: 'POST',
    body: JSON.stringify({ title: 'كتاب بمسار صفحات', author: 'مؤلف', type: 'book', totalPages: 300, status: 'reading' }),
  }, token)
  check('books POST (totalPages=300) 200', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)
  const bookId = r.json?.id

  g = await api('/api/rise/books', {}, token)
  const books = g.json?.books || []
  check('books GET lists 2 books immediately after POST', g.status === 200 && books.length === 2,
    `${g.status} count=${books.length}`)
  const withPages = books.find(b => b.id === bookId)
  check('book totalPages=300 persisted', withPages && withPages.totalPages === 300,
    `got ${withPages && JSON.stringify({ tp: withPages.totalPages, cp: withPages.currentPage, prog: withPages.progress })}`)
  check('book currentPage starts at 0 (not empty/undefined)', withPages && withPages.currentPage === 0,
    `got ${withPages?.currentPage}`)

  // progress update (the "قيمة القراءة" path: +10 pages)
  if (bookId) {
    r = await api('/api/rise/books', {
      method: 'PUT',
      body: JSON.stringify({ id: bookId, currentPage: 10, progress: 3.33, status: 'reading' }),
    }, token)
    check('books PUT currentPage=10 → 200', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
    g = await api('/api/rise/books', {}, token)
    const b2 = (g.json?.books || []).find(b => b.id === bookId)
    check('books GET shows currentPage=10', b2 && b2.currentPage === 10, `got ${b2?.currentPage} progress=${b2?.progress}`)
  }

  // JSON with weird types — robustness (owner misuse scenarios)
  r = await api('/api/rise/books', {
    method: 'POST',
    body: JSON.stringify({ title: 12345, totalPages: 'abc', type: 'unknown-type', status: '' }),
  }, token)
  check('books POST garbage types → no 500', r.status < 500, `${r.status} ${r.text.slice(0, 120)}`)

  console.log('\n' + '═'.repeat(70))
  console.log(`RESULT: ${pass} pass / ${fail} fail`)
  return { pass, fail, token, email: EMAIL }
}

main().then(res => {
  if (res && res.token) {
    require('fs').writeFileSync('/home/z/my-project/scripts/qa25-account.json',
      JSON.stringify({ email: res.email, password: PASSWORD, token: res.token }, null, 2))
  }
  process.exit(res && res.fail > 0 ? 1 : 0)
}).catch(e => { console.error('SUITE CRASH:', e.message); process.exit(2) })
