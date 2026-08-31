/**
 * Task 24 — Load Test Harness (k6-style methodology)
 * Phases: smoke → load → stress (ramp) → spike → soak
 * Usage: node scripts/load-24.js <smoke|load|stress|spike|soak>
 *
 * Realistic journey per virtual user (VU):
 *   login → dashboard → tasks list → create task → habits list →
 *   weekly-chart → delete own task   (think time 400–1600ms between calls)
 *
 * Safety: dedicated test accounts only; error-rate guard aborts phase at >40%;
 *         stress ramps are capped at 200 VUs to protect the live service.
 */
const BASE = 'https://rise-os-gamma.vercel.app'
const fs = require('fs')
const ACCOUNTS_FILE = '/home/z/my-project/scripts/load-accounts.json'
const POOL_SIZE = 12
const PASSWORD = 'Test123456!'

const PHASES = {
  smoke: { stages: [{ vu: 1, secs: 12 }] },
  load: { stages: [{ vu: 25, secs: 90 }] },
  stress: { stages: [{ vu: 25, secs: 40 }, { vu: 50, secs: 40 }, { vu: 100, secs: 45 }, { vu: 200, secs: 45 }] },
  spike: { stages: [{ vu: 150, secs: 45 }] },
  soak: { stages: [{ vu: 15, secs: 150 }] },
}

const latencies = []   // {url, ms, status, t}
let aborted = false
const emails = []
const tokens = []

function pct(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.max(0, Math.ceil((p / 100) * s.length) - 1)
  return s[idx]
}

async function api(path, opts = {}, token) {
  const t0 = Date.now()
  let status = 0
  try {
    const res = await fetch(BASE + path, {
      ...opts,
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    })
    status = res.status
    await res.text()
  } catch (e) {
    status = -1 // network error / timeout
  }
  const ms = Date.now() - t0
  latencies.push({ url: path.split('?')[0], ms, status })
  return status
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function ensureAccounts() {
  let accs = null
  try { accs = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')) } catch { /* new */ }
  if (accs && accs.length >= 1 && accs.every(a => a.token)) return accs

  console.log(`Creating up to ${POOL_SIZE} dedicated load-test accounts (tolerant to rate limits)...`)
  accs = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const email = `load24-${i}-${Date.now().toString(36)}@riseos.test`
    let token = null
    for (let attempt = 1; attempt <= 3 && !token; attempt++) {
      try {
        const su = await fetch(BASE + '/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: PASSWORD, name: `Load ${i}` }),
          signal: AbortSignal.timeout(45000),
        })
        const j = await su.json().catch(() => null)
        token = j?.session?.access_token || null
        if (!token && su.status === 429) {
          console.log(`  ⏳ rate-limited on signup (attempt ${attempt}) — waiting 15s`)
          await sleep(15000)
        }
      } catch (e) {
        console.log(`  ⚠ signup attempt ${attempt} network error: ${String(e).slice(0, 60)}`)
        await sleep(3000)
      }
    }
    if (!token) {
      // maybe created earlier but response lost → try login
      const li = await fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD }),
        signal: AbortSignal.timeout(45000),
      }).catch(() => null)
      const lj = li ? await li.json().catch(() => null) : null
      token = lj?.session?.access_token || null
    }
    if (!token) {
      console.log(`  ✗ account ${i} skipped (rate limited) — continuing with ${accs.length} so far`)
      await sleep(2000)
      continue
    }
    emails.push(email)
    tokens.push(token)
    accs.push({ email, token })
    console.log(`  ✓ account ${i} ready (pool=${accs.length})`)
    await sleep(1200) // stay gentle on Supabase auth rate limits
    // early exit when we have at least 6 accounts and rate limits bite
    if (accs.length >= 6 && i >= 7) break
  }
  if (!accs.length) throw new Error('no load-test accounts could be provisioned')
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accs, null, 2))
  return accs
}

/** One full user journey. Returns nothing; records into latencies. */
async function journey(token) {
  // 1. login-equivalent session validation
  await api('/api/rise/dashboard', {}, token)
  await sleep(400 + Math.random() * 800)
  // 2. tasks list
  await api('/api/rise/tasks', {}, token)
  await sleep(400 + Math.random() * 800)
  // 3. create a task (write)
  const t0 = Date.now()
  let status = 0
  let taskId = null
  try {
    const res = await fetch(BASE + '/api/rise/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: `load-${Date.now()}`, dueDate: new Date().toISOString().slice(0, 10) }),
      signal: AbortSignal.timeout(30000),
    })
    status = res.status
    const j = await res.json().catch(() => null)
    taskId = j?.id || j?.task?.id || null
  } catch { status = -1 }
  latencies.push({ url: '/api/rise/tasks [POST]', ms: Date.now() - t0, status })
  await sleep(400 + Math.random() * 800)
  // 4. habits
  await api('/api/rise/habits', {}, token)
  await sleep(400 + Math.random() * 800)
  // 5. weekly chart
  await api('/api/rise/dashboard/weekly-chart', {}, token)
  await sleep(300 + Math.random() * 600)
  // 6. cleanup own task
  if (taskId) {
    await api('/api/rise/tasks?id=' + taskId, { method: 'DELETE' }, token)
  }
}

async function runStage(vu, secs, stageLabel) {
  console.log(`\n▶ ${stageLabel}: ${vu} VUs × ${secs}s`)
  const accs = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'))
  latencies.length = 0
  const startCount = latencies.length
  const t0 = Date.now()
  const deadline = t0 + secs * 1000

  // error-rate monitor — abort stage if >40% failures in last sample
  let stageAborted = false
  const monitor = setInterval(() => {
    const recent = latencies.slice(-60)
    if (recent.length >= 60) {
      const errRate = recent.filter(r => r.status >= 500 || r.status === -1 || r.status === 429).length / recent.length
      if (errRate > 0.4) {
        console.log(`  ⚠ GUARD: error rate ${(errRate * 100).toFixed(0)}% > 40% — aborting stage to protect service`)
        aborted = true
        stageAborted = true
      }
    }
  }, 2000)

  const workers = []
  for (let v = 0; v < vu; v++) {
    const token = accs[v % accs.length].token
    workers.push((async () => {
      // stagger start (ramp-in over first 5s to avoid thundering herd on connect)
      await sleep((v / Math.max(vu, 1)) * 5000)
      while (Date.now() < deadline && !aborted) {
        await journey(token)
      }
    })())
  }
  await Promise.all(workers)
  clearInterval(monitor)

  const dur = ((Date.now() - t0) / 1000).toFixed(1)
  const mine = latencies.slice(startCount)
  const total = mine.length
  if (!total) return
  const ok = mine.filter(r => r.status >= 200 && r.status < 300).length
  const errs = mine.filter(r => r.status >= 400 || r.status === -1).length
  const all = mine.map(r => r.ms)

  console.log(`  ⏱ duration: ${dur}s | requests: ${total} | throughput: ${(total / parseFloat(dur)).toFixed(1)} req/s`)
  console.log(`  ✔ 2xx: ${ok} (${((ok / total) * 100).toFixed(1)}%) | ✗ errors: ${errs} (${((errs / total) * 100).toFixed(1)}%)`)
  console.log(`  latency ms — p50: ${pct(all, 50)} | p90: ${pct(all, 90)} | p95: ${pct(all, 95)} | p99: ${pct(all, 99)} | max: ${Math.max(...all)}`)

  // per-endpoint breakdown
  const byUrl = {}
  for (const r of mine) {
    if (!byUrl[r.url]) byUrl[r.url] = { n: 0, ms: [], err: 0 }
    byUrl[r.url].n++
    byUrl[r.url].ms.push(r.ms)
    if (r.status >= 400 || r.status === -1) byUrl[r.url].err++
  }
  console.log('  per-endpoint:')
  for (const [u, d] of Object.entries(byUrl).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`    ${u}: n=${d.n} p50=${pct(d.ms, 50)}ms p95=${pct(d.ms, 95)}ms err=${d.err}`)
  }

  // status code histogram
  const codes = {}
  for (const r of mine) codes[r.status] = (codes[r.status] || 0) + 1
  console.log('  status codes: ' + Object.entries(codes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(' '))

  return { vu, secs, dur, total, rps: total / parseFloat(dur), ok, errs, p50: pct(all, 50), p90: pct(all, 90), p95: pct(all, 95), p99: pct(all, 99), max: Math.max(...all), byUrl, codes, stageAborted }
}

async function main() {
  const phase = process.argv[2]
  if (!PHASES[phase]) {
    console.log('Usage: node scripts/load-24.js <smoke|load|stress|spike|soak>')
    process.exit(1)
  }
  console.log('═'.repeat(64))
  console.log(`RiseOS LOAD TEST — phase: ${phase.toUpperCase()}`)
  console.log(`Target: ${BASE}`)
  console.log('═'.repeat(64))

  await ensureAccounts()

  const stageResults = []
  for (const [i, st] of PHASES[phase].stages.entries()) {
    const r = await runStage(st.vu, st.secs, `stage ${i + 1}/${PHASES[phase].stages.length}`)
    stageResults.push(r)
    if (aborted) { console.log('\n⛔ Phase halted by error-rate guard.'); break }
  }

  const clean = stageResults.filter(Boolean)
  const totalReqs = clean.reduce((a, r) => a + r.total, 0)
  const totalErrs = clean.reduce((a, r) => a + r.errs, 0)
  const worstP95 = Math.max(...clean.map(r => r.p95), 0)
  const overallErr = totalReqs ? ((totalErrs / totalReqs) * 100).toFixed(1) : '0'

  console.log('\n' + '═'.repeat(64))
  console.log(`PHASE ${phase.toUpperCase()} SUMMARY`)
  console.log(`  stages completed: ${clean.length}/${PHASES[phase].stages.length}`)
  console.log(`  total requests: ${totalReqs} | overall error rate: ${overallErr}%`)
  console.log(`  worst p95 latency: ${worstP95}ms`)
  const verdict = parseFloat(overallErr) < 1 && worstP95 < 3000 ? '✅ HEALTHY' : parseFloat(overallErr) < 5 ? '⚠️ DEGRADED' : '❌ UNHEALTHY'
  console.log(`  verdict: ${verdict}`)

  // append to results file
  const resFile = '/home/z/my-project/scripts/load-24-results.json'
  let all = {}
  try { all = JSON.parse(fs.readFileSync(resFile, 'utf8')) } catch { /* new */ }
  all[phase] = { at: new Date().toISOString(), stages: stageResults, totalReqs, totalErrs, overallErr, worstP95, verdict }
  fs.writeFileSync(resFile, JSON.stringify(all, null, 2))
  console.log(`Saved: scripts/load-24-results.json`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
