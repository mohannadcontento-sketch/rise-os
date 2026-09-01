/**
 * Task 26 — Production verification for the owner's bug batch:
 *   1) Second Brain isolation: budget-config / savings-goal / learning-* rows
 *      share the knowledge_items table — the brain GET must WHITELIST only
 *      brain-owned types (and ?type=learning must still serve Learning).
 *   2) Reading list (قائمة القراءة): want_to_read books must be creatable,
 *      both spellings normalized, movable between lists via PUT.
 *   3) Skill level: tags JSON {level} persists via knowledge PUT.
 *   4) Regression: budgets GET still returns saved config; brain CRUD intact.
 * Cleanup: delete-all with re-auth.
 */
const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now().toString(36)
const EMAIL = `qa26-${TS}@riseos.test`
const PASSWORD = 'Test123456!'

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' | ' + String(detail).slice(0, 140) : ''}`)
  return ok
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

async function main() {
  let pass = 0, fail = 0
  const tally = (ok) => { ok ? pass++ : fail++ }

  console.log('═'.repeat(64))
  console.log('TASK 26 — PROD VERIFICATION')
  console.log('═'.repeat(64))

  // ── Setup ──
  const S = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'اختبار ٢٦' }) })
  const t = S.json?.session?.access_token
  if (!check('S1. signup', !!t, `status=${S.status}`)) process.exit(1)

  // ═══ SECTION 1 — BRAIN ISOLATION ═══
  console.log('\n── SECTION 1: Second Brain isolation ──')

  let r = await api('/api/rise/knowledge', { method: 'POST', body: JSON.stringify({ type: 'idea', title: 'فكرة دماغ نظيفة', content: 'فكرة أضيفت من الدماغ', folder: 'general', tags: null, source: null }) }, t)
  const ideaId = r.json?.id
  tally(check('B1. brain idea create', [200, 201].includes(r.status) && !!ideaId, `status=${r.status}`))

  // Finance writes budget-config + savings-goal into the SAME table
  r = await api('/api/rise/budgets', { method: 'PUT', body: JSON.stringify({ budgets: [{ category: 'طعام', limit: 1500 }, { category: 'مواصلات', limit: 400 }] }) }, t)
  tally(check('B2. budgets save (writes budget-config row)', [200, 204].includes(r.status), `status=${r.status}`))
  r = await api('/api/rise/budgets', { method: 'PUT', body: JSON.stringify({ savingsGoal: 25000 }) }, t)
  tally(check('B3. savings-goal save (writes savings-goal row)', [200, 204].includes(r.status), `status=${r.status}`))

  // Learning writes learning-* rows
  r = await api('/api/rise/knowledge', { method: 'POST', body: JSON.stringify({ type: 'learning-goal', title: 'هدف تعلم', content: 'هدف', tags: JSON.stringify({ status: 'active', progress: 10 }) }) }, t)
  tally(check('B4. learning-goal create (via knowledge)', [200, 201].includes(r.status), `status=${r.status}`))
  r = await api('/api/rise/knowledge', { method: 'POST', body: JSON.stringify({ type: 'learning-skill', title: 'مهارة اختبار', content: '', tags: JSON.stringify({ level: 3, colorIdx: 1 }) }) }, t)
  const skillId = r.json?.id
  tally(check('B5. learning-skill create', [200, 201].includes(r.status) && !!skillId, `status=${r.status}`))

  r = await api('/api/rise/knowledge', {}, t)
  const items = r.json?.items || []
  const types = [...new Set(items.map((i) => String(i.type || '')))]
  tally(check('B6. brain GET contains ONLY brain-owned types', r.status === 200 && items.length >= 1 && types.every((ty) => ['note','project','knowledge','idea','resource','bookmark','inspiration','research','design_ref'].includes(ty)), `types=[${types.join(',')}] n=${items.length}`))
  tally(check('B7. brain GET excludes budget-config', !types.includes('budget-config'), `types=[${types.join(',')}]`))
  tally(check('B8. brain GET excludes savings-goal', !types.includes('savings-goal'), `types=[${types.join(',')}]`))
  tally(check('B9. brain GET excludes learning-*', !types.some((ty) => ty.startsWith('learning')), `types=[${types.join(',')}]`))
  tally(check('B10. brain GET includes own idea', items.some((i) => i.id === ideaId), `n=${items.length}`))

  r = await api('/api/rise/knowledge?type=learning', {}, t)
  const litems = r.json?.items || []
  tally(check('B11. ?type=learning still serves Learning module', r.status === 200 && litems.some((i) => i.type === 'learning-goal') && litems.some((i) => i.type === 'learning-skill'), `n=${litems.length}`))

  // ═══ SECTION 2 — READING LIST (قائمة القراءة) ═══
  console.log('\n── SECTION 2: Reading list fill flow ──')

  r = await api('/api/rise/books', { method: 'POST', body: JSON.stringify({ title: 'كتاب في قائمة القراءة', author: 'مؤلف', type: 'book', totalPages: 320, status: 'want_to_read' }) }, t)
  const wlBook = r.json?.id
  tally(check('R1. book create with want_to_read (underscore)', [200, 201].includes(r.status) && !!wlBook, `status=${r.status}`))

  r = await api('/api/rise/books', { method: 'POST', body: JSON.stringify({ title: 'كتاب صيغة الشرطة', status: 'want-to-read' }) }, t)
  const hyphenBook = r.json?.id
  tally(check('R2. book create with want-to-read (hyphen) accepted', [200, 201].includes(r.status) && !!hyphenBook, `status=${r.status}`))

  r = await api('/api/rise/books', { method: 'POST', body: JSON.stringify({ title: 'كتاب أقرأه الآن', type: 'book', totalPages: 200 }) }, t)
  const readingBook = r.json?.id
  tally(check('R3. book create default status=reading', [200, 201].includes(r.status) && (r.json?.status === 'reading'), `status=${r.json?.status}`))

  r = await api('/api/rise/books', {}, t)
  const books = r.json?.books || []
  const wl = books.find((b) => b.id === wlBook)
  const hy = books.find((b) => b.id === hyphenBook)
  tally(check('R4. want_to_read book listed with want_to_read', wl?.status === 'want_to_read', `status=${wl?.status}`))
  tally(check('R5. hyphen spelling NORMALIZED to want_to_read', hy?.status === 'want_to_read', `status=${hy?.status}`))

  // Move between lists both ways (what the new card switcher does)
  r = await api('/api/rise/books', { method: 'PUT', body: JSON.stringify({ id: wlBook, status: 'reading', startDate: new Date().toISOString().slice(0, 10) }) }, t)
  tally(check('R6. move book: want_to_read → reading', [200, 204].includes(r.status) && (r.json?.status === 'reading'), `status=${r.json?.status}`))
  r = await api('/api/rise/books', { method: 'PUT', body: JSON.stringify({ id: readingBook, status: 'want-to-read' }) }, t)
  tally(check('R7. move book: reading → want-to-read normalized', [200, 204].includes(r.status) && (r.json?.status === 'want_to_read'), `status=${r.json?.status}`))

  // Schema still rejects garbage (Task 24 guard intact)
  r = await api('/api/rise/books', { method: 'POST', body: JSON.stringify({ title: 12345, status: 'not-a-status' }) }, t)
  tally(check('R8. garbage book payload → 400 (not 500)', r.status === 400, `status=${r.status}`))

  // ═══ SECTION 3 — SKILL LEVEL STRIP (API backing) ═══
  console.log('\n── SECTION 3: Skill level persistence ──')

  r = await api('/api/rise/knowledge', { method: 'PUT', body: JSON.stringify({ id: skillId, tags: JSON.stringify({ level: 5, colorIdx: 1 }) }) }, t)
  tally(check('K1. skill level PUT 3→5', [200, 204].includes(r.status), `status=${r.status}`))
  r = await api('/api/rise/knowledge?type=learning', {}, t)
  const skillRow = (r.json?.items || []).find((i) => i.id === skillId)
  let storedLevel = null
  try { storedLevel = JSON.parse(skillRow?.tags || '{}').level } catch {}
  tally(check('K2. level=5 persisted on server', storedLevel === 5, `level=${storedLevel}`))

  // ═══ SECTION 4 — REGRESSION ═══
  console.log('\n── SECTION 4: Regression sanity ──')

  r = await api('/api/rise/budgets', {}, t)
  tally(check('G1. budgets GET returns saved config', r.status === 200 && Array.isArray(r.json?.budgets) && r.json.budgets.length === 2 && r.json?.savingsGoal === 25000, `budgets=${(r.json?.budgets || []).length} goal=${r.json?.savingsGoal}`))

  r = await api('/api/rise/knowledge', { method: 'PUT', body: JSON.stringify({ id: ideaId, isFavorite: true }) }, t)
  tally(check('G2. brain item favorite toggle', [200, 204].includes(r.status), `status=${r.status}`))
  r = await api('/api/rise/knowledge?id=' + ideaId, { method: 'DELETE' }, t)
  tally(check('G3. brain item delete', [200, 204].includes(r.status), `status=${r.status}`))
  r = await api('/api/rise/knowledge', {}, t)
  tally(check('G4. idea gone after delete', !(r.json?.items || []).some((i) => i.id === ideaId)))

  // ═══ CLEANUP ═══
  console.log('\n── Cleanup ──')
  r = await api('/api/rise/delete-all', { method: 'DELETE', body: JSON.stringify({ email: EMAIL, password: PASSWORD, confirmDelete: true }) }, t)
  tally(check('C1. delete-all wipes QA account', r.status === 200, `status=${r.status}`))

  console.log('═'.repeat(64))
  console.log(`RESULT: ${pass}/${pass + fail} PASS${fail ? ` — ${fail} FAILED` : ' — ALL GREEN ✅'}`)
  console.log('═'.repeat(64))
  require('fs').writeFileSync('/home/z/my-project/scripts/verify-26-results.json', JSON.stringify({ pass, fail, results }, null, 2))
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
