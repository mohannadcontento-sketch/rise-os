/** Task 25 cleanup — wipe data of every QA account created in this campaign */
const BASE = 'https://rise-os-gamma.vercel.app'
const PASSWORD = 'Test123456!'

const candidates = [
  'qa25-mthwjgmq@riseos.test',
  'qa25-1k0y2fcjy@riseos.test', // second repro run (approx id — login attempt will verify)
]
// actual accounts from this session (from run logs)
const e2eAccounts = [
  'e2e25-1788221884998@riseos.test',
  'e2e25-1788222170920@riseos.test',
  'e2e25-1788222210275@riseos.test',
  'e2e25-1788222294929@riseos.test',
  'e2e25-1788222366434@riseos.test',
  'e2e25-1788222587361@riseos.test',
]
const all = [...candidates, ...e2eAccounts]

async function api(path, opts = {}, token) {
  const res = await fetch(BASE + path, {
    ...opts,
    signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json }
}

let wiped = 0, skipped = 0
for (const email of all) {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) })
  if (login.status !== 200 || !login.json?.session?.access_token) {
    console.log(`skip ${email} (login ${login.status})`)
    skipped++
    continue
  }
  const token = login.json.session.access_token
  const del = await api('/api/rise/delete-all', {
    method: 'DELETE',
    body: JSON.stringify({ email, password: PASSWORD, confirmDelete: true }),
  }, token)
  console.log(`${del.status === 200 ? '✅ wiped' : '⚠️ status ' + del.status} ${email}`)
  if (del.status === 200) wiped++
}
console.log(`\nDone: ${wiped} wiped, ${skipped} skipped (nonexistent)`)
