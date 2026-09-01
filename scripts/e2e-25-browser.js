/**
 * Task 25 — E2E Browser Regression (REAL USER) for the save-reliability batch
 * Journey: signup → morning check persists after reload → health auto-save
 *          (water + notes) → book appears instantly after add → skill level
 *          stepper persists → second brain does NOT show learning content.
 * Measures: per-phase request counts + console errors.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now()
const EMAIL = `e2e25-${TS}@riseos.test`
const PASSWORD = 'Test123456!'
const NAME = 'مستخدم ٢٥'

const results = []
const consoleErrors = []
let currentPhase = 'boot'
const phaseOrder = []
const screenshots = []
const steps = []

async function shoot(page, name) {
  try {
    const f = `/home/z/my-project/scripts/shots/25-${name}.png`
    await page.screenshot({ path: f, fullPage: false })
    screenshots.push(f)
  } catch { /* ignore */ }
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ar-EG',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiseOS-E2E/25',
  })
  const page = await ctx.newPage()

  page.on('request', (req) => {
    const u = req.url()
    if (u.includes('/api/')) results.push({ phase: currentPhase, url: u.replace(BASE, '').split('?')[0], method: req.method(), status: 0, ms: 0, _t: Date.now() })
  })
  page.on('response', (res) => {
    const u = res.url()
    if (u.includes('/api/')) {
      const clean = u.replace(BASE, '').split('?')[0]
      const hit = [...results].reverse().find(r => r.url === clean && r.status === 0)
      if (hit) { hit.status = res.status(); hit.ms = Date.now() - hit._t }
    }
  })
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)) })
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)))

  // In-page API helper — mirrors the app's apiFetch identity (cookie + Bearer
  // from localStorage). Raw cookie-only fetches can 401 depending on session
  // state, which previously produced false-negative verifications.
  async function apiCheck(path) {
    return page.evaluate(async (p) => {
      let s = null
      try { s = JSON.parse(localStorage.getItem('rise-auth') || 'null') } catch {}
      const res = await fetch(p, {
        credentials: 'include',
        headers: s && s.access_token ? { Authorization: 'Bearer ' + s.access_token } : {},
      })
      if (!res.ok) return { status: res.status, body: null }
      return { status: res.status, body: await res.json() }
    }, path)
  }

  async function dismissOverlays() {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
    }
  }

  async function clickNav(text) {
    const loc = page.locator(`button:has-text("${text}"), [role=button]:has-text("${text}"), a:has-text("${text}")`).first()
    try {
      await loc.click({ timeout: 4000 })
    } catch {
      await dismissOverlays()
      // sidebar groups may be collapsed (fresh after reload) — expand, retry
      await expandGroups()
      await loc.click({ timeout: 4000, force: true }).catch(async () => {
        await dismissOverlays()
        await loc.click({ timeout: 4000, force: true })
      })
    }
  }

  async function expandGroups() {
    for (let i = 0; i < 8; i++) {
      const collapsed = page.locator('button[aria-expanded="false"]')
      const n = await collapsed.count()
      if (n === 0) break
      await collapsed.first().click({ force: true }).catch(() => {})
      await page.waitForTimeout(400)
    }
  }

  async function step(name, fn) {
    currentPhase = name
    if (!phaseOrder.includes(name)) phaseOrder.push(name)
    const t0 = Date.now()
    try {
      await fn()
      steps.push({ name, ok: true, ms: Date.now() - t0 })
      console.log(`  ✅ ${name} (${Date.now() - t0}ms)`)
    } catch (e) {
      steps.push({ name, ok: false, ms: Date.now() - t0, err: String(e).slice(0, 150) })
      console.log(`  ❌ ${name}: ${String(e).slice(0, 150)}`)
      await shoot(page, `FAIL-${name}`)
      throw e
    }
  }

  console.log('═'.repeat(60))
  console.log('RiseOS E2E v25 — SAVE-RELIABILITY REGRESSION')
  console.log(`Account: ${EMAIL}`)
  console.log('═'.repeat(60))

  // 1. signup
  await step('01-signup', async () => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2500)
    const cta = page.locator('text=ابدأ').first()
    if (await cta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cta.click()
      await page.waitForTimeout(1200)
    }
    await page.locator('text=حساب جديد').first().click({ timeout: 15000 })
    await page.locator('input[type=email]').first().fill(EMAIL)
    await page.locator('input[type=password]').first().fill(PASSWORD)
    const inputs = page.locator('input:visible')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) {
      const type = await inputs.nth(i).getAttribute('type')
      if (!type || type === 'text') { await inputs.nth(i).fill(NAME); break }
    }
    await page.locator('button[type=submit]').first().click()
    await page.waitForSelector('text=لوحة التحكم', { timeout: 30000 })
    await page.waitForTimeout(2500)
  })
  await shoot(page, '01-signed-in')

  await step('02-onboarding-skip', async () => {
    for (const txt of ['يلا نبدأ', 'ابدأ', 'تم', 'فهمت', 'متابعة', 'التالي', 'خلصنا', 'انتهينا']) {
      const btn = page.locator(`button:has-text("${txt}")`).first()
      for (let i = 0; i < 6; i++) {
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click({ force: true }).catch(() => {})
          await page.waitForTimeout(600)
        } else break
      }
    }
    await dismissOverlays()
  })

  // 2. MORNING: check item → reload → still checked
  const MORNING_ITEM = 'الاستيقاظ في الموعد'
  await step('10-morning-check', async () => {
    await clickNav('الروتين الصباحي')
    await page.waitForTimeout(2500)
    const row = page.locator(`text=${MORNING_ITEM}`).first()
    await row.click({ timeout: 8000 })
    await page.waitForTimeout(2500) // allow save
  })
  await shoot(page, '10-morning-checked')
  await step('11-morning-persists-after-reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=لوحة التحكم', { timeout: 20000 })
    await clickNav('الروتين الصباحي')
    await page.waitForTimeout(3000)
    // Server truth via in-page API (app identity)
    const log = await apiCheck('/api/rise/morning')
    if (log.status !== 200) throw new Error('morning GET failed: ' + log.status)
    const items = JSON.parse(log.body?.todayLog?.completedItems || '[]')
    if (!items.includes('wake-up')) throw new Error('morning check did NOT persist: ' + JSON.stringify(items))
  })

  // 3. HEALTH: water drops → auto-save → verify server state; notes too
  await step('20-health-water-autosave', async () => {
    await clickNav('الصحة')
    await page.waitForTimeout(3000)
    const drops = page.locator('button:has-text("💧")')
    const count = await drops.count()
    if (count < 8) throw new Error('expected 8 water drops, got ' + count)
    await drops.nth(2).click({ force: true }) // set water = 3
    await page.waitForTimeout(1800) // auto-save debounce 900ms + request
    const log = await apiCheck('/api/rise/health')
    const water = log.body?.todayLog?.waterGlasses
    if (water !== 3) throw new Error('health auto-save failed — waterGlasses=' + water + ' status=' + log.status)
  })
  await shoot(page, '20-health-water')
  await step('21-health-notes-autosave', async () => {
    const notes = page.locator('input[placeholder="ملاحظات إضافية..."]')
    await notes.fill('ملاحظة تمرين الآلي ٢٥')
    await page.waitForTimeout(1800)
    const log = await apiCheck('/api/rise/health')
    const note = log.body?.todayLog?.exerciseNote || ''
    if (!note.includes('ملاحظة تمرين الآلي')) throw new Error('exercise note NOT persisted: ' + JSON.stringify(note))
    // form must NOT have rolled back
    const val = await notes.inputValue()
    if (!val.includes('ملاحظة تمرين الآلي')) throw new Error('notes input lost after autosave')
  })
  await step('22-health-persists-after-reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=لوحة التحكم', { timeout: 20000 })
    await clickNav('الصحة')
    await page.waitForTimeout(3000)
    const log = await apiCheck('/api/rise/health')
    if (log.body?.todayLog?.waterGlasses !== 3) throw new Error('water reverted after reload: ' + log.body?.todayLog?.waterGlasses)
  })
  await shoot(page, '22-health-reloaded')

  // 4. BOOKS: add book → appears INSTANTLY (no reload)
  const BOOK_TITLE = 'كتاب الاختبار الآلي ٢٥'
  await step('30-book-appears-instantly', async () => {
    await clickNav('القراءة')
    await page.waitForTimeout(2500)
    await page.locator('button:has-text("إضافة")').first().click({ timeout: 8000 })
    await page.waitForTimeout(800)
    await page.locator('input[placeholder="عنوان الكتاب أو المقال"]').fill(BOOK_TITLE)
    await page.locator('input[placeholder="العدد الإجمالي للصفحات"]').fill('250')
    await page.locator('button:has-text("إضافة للقراءة")').click()
    await page.waitForTimeout(1500)
    // MUST be visible immediately — no reload, no re-entry
    const visible = await page.locator(`text=${BOOK_TITLE}`).first().isVisible({ timeout: 4000 }).catch(() => false)
    if (!visible) throw new Error('book NOT visible immediately after add (optimistic add failed)')
  })
  await shoot(page, '30-book-instant')
  await step('31-book-persists-after-reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=لوحة التحكم', { timeout: 20000 })
    await clickNav('القراءة')
    await page.waitForTimeout(3000)
    const visible = await page.locator(`text=${BOOK_TITLE}`).first().isVisible({ timeout: 6000 }).catch(() => false)
    if (!visible) throw new Error('book missing after reload')
  })

  // 5. SKILLS: add skill → level stepper + → reload → persisted
  const SKILL_NAME = 'مهارة الآلي ٢٥'
  await step('40-skill-add-and-level-up', async () => {
    await clickNav('التعلم')
    await page.waitForTimeout(2500)
    await page.locator('button:has-text("المهارات")').first().click({ timeout: 6000 })
    await page.waitForTimeout(1200)
    await page.locator('button:has-text("مهارة جديدة")').first().click({ timeout: 6000 })
    await page.waitForTimeout(800)
    await page.locator('input[placeholder="مثال: البرمجة، التصميم..."]').fill(SKILL_NAME)
    await page.locator('button:has-text("إضافة المهارة")').click()
    await page.waitForTimeout(2000)
    const chip = page.locator(`div:has-text("${SKILL_NAME}")`).last()
    if (!(await chip.isVisible().catch(() => false))) throw new Error('skill chip not visible')
    // click the "+" stepper (title attribute)
    const plus = page.locator(`button[title="رفع المستوى"]`).first()
    await plus.click({ timeout: 5000 })
    await page.waitForTimeout(1500)
    const lvl = await apiCheck('/api/rise/knowledge?type=learning')
    const skill = ((lvl.body?.items) || []).find(i => i.title && i.title.includes('مهارة الآلي'))
    const lv = skill ? JSON.parse(skill.tags || '{}').level : null
    if (lv !== 2) throw new Error('skill level NOT persisted as 2 — got ' + lv)
  })
  await shoot(page, '40-skill-level')

  // 6. COURSE → SECOND BRAIN must NOT show it
  const COURSE_NAME = 'دورة الآلي ٢٥'
  await step('50-course-add', async () => {
    await clickNav('التعلم')
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("الدورات")').first().click({ timeout: 6000 })
    await page.waitForTimeout(1200)
    await page.locator('button:has-text("دورة جديدة")').first().click({ timeout: 6000 }).catch(async () => {
      // fallback: any button containing دورة
      await page.locator('button:has-text("دورة")').first().click({ force: true })
    })
    await page.waitForTimeout(800)
    await page.locator('input[placeholder="مثال: React Advanced"]').fill(COURSE_NAME)
    await page.locator('button:has-text("إضافة الدورة")').click()
    await page.waitForTimeout(2000)
  })
  await step('51-second-brain-excludes-learning', async () => {
    await clickNav('الدماغ الثاني')
    await page.waitForTimeout(3000)
    const leaked = await page.locator(`text=${COURSE_NAME}`).first().isVisible({ timeout: 4000 }).catch(() => false)
    if (leaked) throw new Error('LEAK: learning course appears in Second Brain')
    const skillLeak = await page.locator(`text=${SKILL_NAME}`).first().isVisible({ timeout: 2000 }).catch(() => false)
    if (skillLeak) throw new Error('LEAK: learning skill appears in Second Brain')
  })
  await shoot(page, '51-brain-clean')

  // 7. Final dashboard sanity + hard reload
  await step('60-final-dashboard-reload', async () => {
    await clickNav('لوحة التحكم')
    await page.waitForTimeout(2500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=لوحة التحكم', { timeout: 20000 })
    await page.waitForTimeout(2500)
  })
  await shoot(page, '60-final')

  await browser.close()

  // ── report ──
  console.log('\n' + '═'.repeat(60))
  const passed = steps.filter(s => s.ok).length
  steps.forEach(s => console.log(` ${s.ok ? '✅' : '❌'} ${s.name} ${s.ms}ms${s.err ? ' — ' + s.err : ''}`))
  console.log(`\nSTEPS: ${passed}/${steps.length} passed`)

  console.log('\nAPI REQUESTS PER PHASE:')
  const byPhase = {}
  for (const r of results) {
    if (!byPhase[r.phase]) byPhase[r.phase] = { total: 0, ok: 0, err: 0, urls: {} }
    byPhase[r.phase].total++
    if (r.status >= 200 && r.status < 300) byPhase[r.phase].ok++
    else if (r.status > 0) byPhase[r.phase].err++
    byPhase[r.phase].urls[r.url] = (byPhase[r.phase].urls[r.url] || 0) + 1
  }
  for (const [ph, d] of Object.entries(byPhase)) {
    console.log(`  ${ph}: ${d.total} req (${d.ok} ok, ${d.err} non-2xx)`)
    for (const [u, c] of Object.entries(d.urls).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`      ${c}× ${u}`)
    }
  }
  console.log(`\nCONSOLE ERRORS: ${consoleErrors.length}`)
  ;[...new Set(consoleErrors)].slice(0, 10).forEach(e => console.log('  ⚠ ' + e))

  fs.writeFileSync('/home/z/my-project/scripts/e2e-25-results.json',
    JSON.stringify({ steps, byPhase, consoleErrors: [...new Set(consoleErrors)], screenshots }, null, 2))
  console.log('\nSaved: scripts/e2e-25-results.json')

  if (passed < steps.length) process.exit(1)
}

run().catch(e => {
  console.error('FATAL:', e.message)
  // Dump what the browser actually sent per phase — invaluable on failure
  const byPhase = {}
  for (const r of results) {
    if (!byPhase[r.phase]) byPhase[r.phase] = []
    byPhase[r.phase].push(`${r.method} ${r.status || '?'} ${r.url}`)
  }
  for (const [ph, reqs] of Object.entries(byPhase)) {
    console.log(`\n[${ph}]`)
    reqs.slice(0, 12).forEach(q => console.log('   ' + q))
  }
  process.exit(1)
})
