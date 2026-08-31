/**
 * Task 24 — E2E Browser Test (REAL USER) with per-action request counting
 * Target: https://rise-os-gamma.vercel.app
 * Journey: landing → signup → onboarding skip → visit ALL 21 modules →
 *          create+complete task → create habit → write journal → logout → re-login
 * Measures: every /api/* request grouped by action phase + console errors
 */
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now()
const EMAIL = `e2e-${TS}@riseos.test`
const PASSWORD = 'Test123456!'
const NAME = 'مستخدم التجربة'

const results = []          // {phase, url, status, ms}
const consoleErrors = []
let currentPhase = 'boot'
const phaseOrder = []
const screenshots = []

function track(phase, url, status, ms) {
  results.push({ phase, url, status, ms })
}

async function shoot(page, name) {
  try {
    const f = `/home/z/my-project/scripts/shots/24-${name}.png`
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiseOS-E2E/24',
  })
  const page = await ctx.newPage()

  page.on('request', (req) => {
    const u = req.url()
    if (u.includes('/api/')) {
      track(currentPhase, u.replace(BASE, '').split('?')[0], 0, 0)
    }
  })
  page.on('response', (res) => {
    const u = res.url()
    if (u.includes('/api/')) {
      const clean = u.replace(BASE, '').split('?')[0]
      const hit = results.find(r => r.url === clean && r.status === 0)
      if (hit) { hit.status = res.status(); hit.ms = Date.now() - (hit._t || Date.now()) }
    }
  })
  page.on('request', (req) => {
    const u = req.url()
    if (u.includes('/api/')) {
      const clean = u.replace(BASE, '').split('?')[0]
      const hit = [...results].reverse().find(r => r.url === clean && r.status === 0)
      if (hit) hit._t = Date.now()
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200))
  })
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)))

  const t = (fn) => fn
  const steps = []

  /** Dismiss any open dialog/overlay: Escape + close buttons */
  async function dismissOverlays() {
    for (let i = 0; i < 4; i++) {
      const overlay = page.locator('[data-slot=dialog-overlay][data-state=open], [data-state=open][aria-hidden=true]')
      if (!(await overlay.first().isVisible({ timeout: 400 }).catch(() => false))) break
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      const closeBtn = page.locator('[data-slot=dialog-close], button[aria-label*=اغلاق], button[aria-label*=close i]').first()
      if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await closeBtn.click({ force: true }).catch(() => {})
      }
      await page.waitForTimeout(400)
    }
  }

  /** Click a sidebar button, escalating to force-click when overlays intercept */
  async function clickNav(text) {
    const loc = page.locator(`button:has-text("${text}"), [role=button]:has-text("${text}"), a:has-text("${text}")`).first()
    try {
      await loc.click({ timeout: 4000 })
    } catch {
      await dismissOverlays()
      await loc.click({ timeout: 4000, force: true }).catch(async () => {
        await dismissOverlays()
        await loc.click({ timeout: 4000, force: true })
      })
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
  console.log('RiseOS E2E Browser — REAL USER JOURNEY')
  console.log(`Target: ${BASE}`)
  console.log(`Account: ${EMAIL}`)
  console.log('═'.repeat(60))

  // ── 1. Landing page ──
  await step('01-landing', async () => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2500)
    const title = await page.title()
    if (!title.includes('RiseOS')) throw new Error('bad title: ' + title)
  })
  await shoot(page, '01-landing')

  // ── 2. Go to signup ──
  await step('02-open-signup', async () => {
    // Landing has CTA "ابدأ مجاناً" or similar; fall back to direct login page
    const cta = page.locator('text=ابدأ').first()
    if (await cta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cta.click()
      await page.waitForTimeout(1500)
    }
    // switch to signup tab
    const signupTab = page.locator('text=حساب جديد').first()
    await signupTab.click({ timeout: 15000 })
    await page.waitForTimeout(600)
  })
  await shoot(page, '02-signup-form')

  // ── 3. Fill signup ──
  await step('03-signup-submit', async () => {
    await page.locator('input[type=email]').first().fill(EMAIL)
    await page.locator('input[type=password]').first().fill(PASSWORD)
    const nameInput = page.locator('input').nth(0)
    // name field appears before email on signup mode
    const inputs = page.locator('input:visible')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) {
      const type = await inputs.nth(i).getAttribute('type')
      if (!type || type === 'text') { await inputs.nth(i).fill(NAME); break }
    }
    await page.locator('button[type=submit]').first().click()
    // wait for app shell (sidebar) — up to 30s
    await page.waitForSelector('text=لوحة التحكم', { timeout: 30000 })
    await page.waitForTimeout(3000)
  })
  await shoot(page, '03-after-signup')

  // dismiss onboarding if present
  await step('04-onboarding-skip', async () => {
    for (const txt of ['يلا نبدأ', 'ابدأ', 'تم', 'فهمت', 'متابعة', 'التالي', 'خلصنا', 'انتهينا']) {
      const btn = page.locator(`button:has-text("${txt}")`).first()
      for (let i = 0; i < 6; i++) {
        if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
          await btn.click({ force: true }).catch(() => {})
          await page.waitForTimeout(700)
        } else break
      }
    }
    await dismissOverlays()
  })

  // ── 5. Visit ALL modules (request counting per module) ──
  await step('05-expand-groups', async () => {
    // sidebar groups are collapsible — expand every collapsed group first
    for (let i = 0; i < 8; i++) {
      const collapsed = page.locator('button[aria-expanded="false"]')
      const n = await collapsed.count()
      if (n === 0) break
      await collapsed.first().click({ force: true }).catch(() => {})
      await page.waitForTimeout(500)
    }
    await dismissOverlays()
  })
  const modules = [
    'الروتين الصباحي', 'المخطط اليومي', 'تتبع العادات', 'اليوميات',
    'المهام', 'المشاريع', 'الأهداف', 'العمل العميق', 'الشغل', 'التقويم',
    'الصحة', 'القراءة', 'التعلم', 'الدماغ الثاني', 'المالية',
    'مراجعة أسبوعية', 'مراجعة شهرية', 'التحليلات', 'قاعدة المعارف', 'الإعدادات',
  ]
  for (const m of modules) {
    await step(`05-nav-${m}`, async () => {
      await clickNav(m)
      await page.waitForTimeout(2200) // let module mount + fetch
    })
  }
  await shoot(page, '05-all-modules-visited')

  // ── 6. Create task via UI ──
  await step('06-create-task-ui', async () => {
    await clickNav('المهام')
    await page.waitForTimeout(1500)
    await page.locator('button:has-text("مهمة جديدة")').first().click({ timeout: 6000 })
    await page.waitForTimeout(800)
    await page.locator('input[placeholder="ماذا تريد إنجازه؟"]').fill('اختبار نهائي — مهمة آلية')
    await page.locator('button:has-text("إنشاء المهمة")').click()
    await page.waitForTimeout(2500)
    const visible = await page.locator('text=اختبار نهائي — مهمة آلية').first().isVisible({ timeout: 5000 }).catch(() => false)
    if (!visible) throw new Error('created task not visible in list')
  })
  await shoot(page, '06-task-created')

  // ── 7. Complete the task ──
  await step('07-complete-task-ui', async () => {
    const row = page.locator('text=اختبار نهائي — مهمة آلية').first()
    await row.click({ timeout: 5000 })
    await page.waitForTimeout(2500)
  })
  await shoot(page, '07-task-toggled')

  // ── 8. Create habit via UI ──
  await step('08-create-habit-ui', async () => {
    await clickNav('تتبع العادات')
    await page.waitForTimeout(1500)
    const addBtn = page.locator('button:has-text("عادة"), button:has-text("جديدة")').first()
    await addBtn.click({ timeout: 6000 })
    await page.waitForTimeout(800)
    await page.locator('input[placeholder="مثال: قراءة 30 دقيقة"]').fill('اختبار — شرب مياه')
    await page.locator('button:has-text("إضافة")').last().click()
    await page.waitForTimeout(2500)
    const visible = await page.locator('text=اختبار — شرب مياه').first().isVisible({ timeout: 5000 }).catch(() => false)
    if (!visible) throw new Error('created habit not visible')
  })
  await shoot(page, '08-habit-created')

  // ── 9. Write journal via UI ──
  await step('09-journal-ui', async () => {
    await clickNav('اليوميات')
    await page.waitForTimeout(1500)
    const ta = page.locator('textarea[placeholder*="أفكارك"]').first()
    await ta.fill('اختبار اليوميات الآلي — نهار حلو وانتاجية عالية الحمد لله.')
    const save = page.locator('button:has-text("حفظ اليوميات")').first()
    await save.click({ timeout: 5000 })
    await page.waitForTimeout(2500)
  })
  await shoot(page, '09-journal-saved')

  // ── 10. Dashboard reload (returning user sanity) ──
  await step('10-dashboard-return', async () => {
    await clickNav('لوحة التحكم')
    await page.waitForTimeout(3000)
  })
  await shoot(page, '10-dashboard-final')

  // ── 11. Hard reload (session persistence via cookie) ──
  await step('11-hard-reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=لوحة التحكم', { timeout: 20000 })
    await page.waitForTimeout(2500)
  })

  // ── 12. Logout (clear storage) → re-login as returning user ──
  await step('12-relogin', async () => {
    await ctx.clearCookies()
    await page.evaluate(() => localStorage.clear())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    // landing may interpose — open auth form via CTA if needed
    let emailInput = page.locator('input[type=email]').first()
    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      for (const cta of ['ابدأ', 'تسجيل الدخول', 'دخول', 'ابدأ مجاناً']) {
        const c = page.locator(`button:has-text("${cta}"), a:has-text("${cta}")`).first()
        if (await c.isVisible({ timeout: 1500 }).catch(() => false)) {
          await c.click({ force: true }).catch(() => {})
          await page.waitForTimeout(1500)
          break
        }
      }
    }
    emailInput = page.locator('input[type=email]').first()
    await emailInput.waitFor({ state: 'visible', timeout: 15000 })
    await emailInput.fill(EMAIL)
    await page.locator('input[type=password]').first().fill(PASSWORD)
    await page.locator('button[type=submit]').first().click()
    await page.waitForSelector('text=لوحة التحكم', { timeout: 25000 })
    await page.waitForTimeout(2000)
  })
  await shoot(page, '12-relogin-ok')

  await browser.close()

  // ── Report ──
  console.log('\n' + '═'.repeat(60))
  console.log('RESULTS — per-step')
  const passed = steps.filter(s => s.ok).length
  steps.forEach(s => console.log(` ${s.ok ? '✅' : '❌'} ${s.name} ${s.ms}ms${s.err ? ' — ' + s.err : ''}`))
  console.log(`\nSTEPS: ${passed}/${steps.length} passed`)

  console.log('\n' + '─'.repeat(60))
  console.log('API REQUESTS PER PHASE (counted from the real browser):')
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
    for (const [u, c] of Object.entries(d.urls).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`      ${c}× ${u}`)
    }
  }

  // slowest endpoints
  const withMs = results.filter(r => r.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, 10)
  console.log('\nSLOWEST API calls observed:')
  withMs.forEach(r => console.log(`  ${r.ms}ms ${r.status} ${r.url}`))

  console.log(`\nCONSOLE ERRORS: ${consoleErrors.length}`)
  const uniqErr = [...new Set(consoleErrors)].slice(0, 10)
  uniqErr.forEach(e => console.log('  ⚠ ' + e))

  fs.writeFileSync('/home/z/my-project/scripts/e2e-24-browser-results.json',
    JSON.stringify({ steps, byPhase, consoleErrors: uniqErr, screenshots }, null, 2))
  console.log('\nSaved: scripts/e2e-24-browser-results.json')

  if (passed < steps.length) process.exit(1)
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
