/**
 * Task 26 — E2E Browser (REAL USER) for the owner's latest bug batch:
 *   1) الدماغ: no budget content leaks in — even AFTER saving a budget.
 *   2) القراءة: add dialog has "القائمة" picker → book lands in قائمة القراءة
 *      tab → one-tap "ابدأ القراءة الآن" moves it to للقراءة.
 *   3) المهارات: skill card renders the clean two-row level strip, +/− works,
 *      level persists after reload.
 * Measures console errors + non-2xx API calls.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = 'https://rise-os-gamma.vercel.app'
const TS = Date.now()
const EMAIL = `e2e26-${TS}@riseos.test`
const PASSWORD = 'Test123456!'
const NAME = 'مستخدم ٢٦'

const consoleErrors = []
const apiBad = []
const screenshots = []
const steps = []

async function shoot(page, name) {
  try {
    const f = `/home/z/my-project/scripts/shots/26-${name}.png`
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
    viewport: { width: 1440, height: 900 }, // desktop nav via sidebar; mobile shots at the end
    locale: 'ar-EG',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiseOS-E2E/26',
  })
  const page = await ctx.newPage()

  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      apiBad.push({ url: res.url().replace(BASE, '').split('?')[0], status: res.status() })
    }
  })
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)) })
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)))

  async function step(name, fn) {
    const t0 = Date.now()
    try {
      await fn()
      steps.push({ name, ok: true, ms: Date.now() - t0 })
      console.log(`  ✅ ${name} (${Date.now() - t0}ms)`)
    } catch (e) {
      steps.push({ name, ok: false, ms: Date.now() - t0, err: String(e).slice(0, 150) })
      console.log(`  ❌ ${name}: ${String(e).slice(0, 150)}`)
      await shoot(page, `FAIL-${name.replace(/\s/g, '_')}`)
      throw e
    }
  }

  async function dismissOverlays() {
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(250) }
  }

  async function expandGroups() {
    for (let i = 0; i < 10; i++) {
      const collapsed = page.locator('button[aria-expanded="false"]')
      const n = await collapsed.count()
      if (n === 0) break
      await collapsed.first().click({ force: true }).catch(() => {})
      await page.waitForTimeout(350)
    }
  }

  async function clickNav(text) {
    const loc = page.locator(`button:has-text("${text}"), [role=button]:has-text("${text}"), a:has-text("${text}")`).first()
    try { await loc.click({ timeout: 4000 }) } catch {
      await dismissOverlays()
      await expandGroups()
      await loc.click({ timeout: 4000, force: true }).catch(async () => {
        await dismissOverlays()
        await loc.click({ timeout: 4000, force: true })
      })
    }
    await page.waitForTimeout(700)
  }

  async function apiCheck(path) {
    return page.evaluate(async (p) => {
      let s = null
      try { s = JSON.parse(localStorage.getItem('rise-auth') || 'null') } catch {}
      const res = await fetch(p, { credentials: 'include', headers: s && s.access_token ? { Authorization: 'Bearer ' + s.access_token } : {} })
      if (!res.ok) return { status: res.status, body: null }
      return { status: res.status, body: await res.json() }
    }, path)
  }

  try {
    console.log('═'.repeat(64))
    console.log('TASK 26 — E2E BROWSER (desktop nav + mobile visual shots)')
    console.log('═'.repeat(64))

    // ── Signup (e2e-25 proven flow) ──
    await step('signup', async () => {
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
      await shoot(page, 'dashboard')
    })

    await step('onboarding-skip', async () => {
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

    // ── 1) BRAIN isolation ──
    await step('brain: clean before budget save', async () => {
      await clickNav('الدماغ الثاني')
      await page.waitForTimeout(800)
      const body = await page.textContent('body')
      if (/ميزانية المستخدم|هدف الادخار/.test(body)) throw new Error('budget rows leaked into brain')
      await shoot(page, 'brain-before')
    })

    await step('finance: save budget + savings goal', async () => {
      await clickNav('المالية')
      await page.waitForTimeout(800)
      // savings goal editable input (finance page has هدف الادخار)
      const r = await page.evaluate(async () => {
        let s = null
        try { s = JSON.parse(localStorage.getItem('rise-auth') || 'null') } catch {}
        const put = async (body) => fetch('/api/rise/budgets', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(s && s.access_token ? { Authorization: 'Bearer ' + s.access_token } : {}) }, body: JSON.stringify(body) })
        const a = await put({ budgets: [{ category: 'طعام', limit: 1200 }] })
        const b = await put({ savingsGoal: 9000 })
        return { a: a.status, b: b.status }
      })
      if (r.a !== 200 || r.b !== 200) throw new Error(`budget save failed: ${JSON.stringify(r)}`)
    })

    await step('brain: still clean AFTER budget save', async () => {
      await clickNav('الدماغ الثاني')
      await page.waitForTimeout(1200)
      const body = await page.textContent('body')
      if (/ميزانية المستخدم|هدف الادخار|طعام/.test(body)) throw new Error('budget leaked into brain after save')
      const kb = await apiCheck('/api/rise/knowledge')
      const bad = (kb.body?.items || []).filter((i) => ['budget-config', 'savings-goal'].includes(String(i.type)))
      if (bad.length) throw new Error(`server leak: ${bad.length}`)
      await shoot(page, 'brain-after-budget')
    })

    // ── 2) READING LIST ──
    await step('reading: add book to قائمة القراءة', async () => {
      await clickNav('القراءة')
      await page.waitForTimeout(700)
      await clickNav('إضافة')
      await page.waitForTimeout(500)
      await page.fill('input[placeholder*="عنوان الكتاب"]', 'فن اللامبالاة')
      await page.fill('input[placeholder*="المؤلف"], input[placeholder*="اسم المؤلف"]', 'مارك مانسون')
      await shoot(page, 'add-dialog')
      // open القائمة select (second Select in dialog)
      const triggers = page.locator('[role="dialog"] [data-slot="select-trigger"]')
      const cnt = await triggers.count()
      if (cnt < 2) throw new Error(`expected 2 selects (نوع + قائمة), got ${cnt}`)
      await triggers.nth(1).click()
      await page.waitForTimeout(400)
      await page.locator('[role="option"]:has-text("قائمة القراءة")').first().click()
      await page.waitForTimeout(300)
      await page.locator('[role="dialog"] button:has-text("إضافة للقراءة")').click()
      await page.waitForTimeout(1200)
    })

    await step('reading: قائمة القراءة tab FILLS + ابدأ القراءة works', async () => {
      await page.locator('button[role="tab"]:has-text("قائمة القراءة"), [role="tab"]:has-text("قائمة القراءة")').first().click()
      await page.waitForTimeout(800)
      const body = await page.textContent('body')
      if (!body.includes('فن اللامبالاة')) throw new Error('want_to_read book NOT in قائمة القراءة tab')
      await shoot(page, 'want-to-read-filled')
      // one-tap start reading
      await page.locator('button:has-text("ابدأ القراءة الآن")').first().click()
      await page.waitForTimeout(300)
      // server truth with polling (UI refetch is debounced + latency)
      let moved = false
      for (let i = 0; i < 10; i++) {
        const bb = await apiCheck('/api/rise/books')
        const b = (bb.body?.books || []).find((x) => x.title && x.title.includes('فن اللامبالاة'))
        if (b && b.status === 'reading') { moved = true; break }
        await page.waitForTimeout(700)
      }
      if (!moved) throw new Error('book did not move to reading on SERVER')
      // UI should reflect within a beat (debounced refetch)
      let uiMoved = false
      for (let i = 0; i < 8; i++) {
        const after = await page.textContent('body')
        if (!after.includes('ابدأ القراءة الآن')) { uiMoved = true; break }
        await page.waitForTimeout(600)
      }
      if (!uiMoved) throw new Error('UI did not reflect the move (server moved, UI stale)')
      // and now sits in للقراءة
      await page.locator('button[role="tab"]:has-text("للقراءة"), [role="tab"]:has-text("للقراءة")').first().click()
      await page.waitForTimeout(800)
      const reading = await page.textContent('body')
      if (!reading.includes('فن اللامبالاة')) throw new Error('book not in للقراءة after ابدأ القراءة')
      await shoot(page, 'now-reading')
    })

    // ── 3) SKILL LEVEL STRIP ──
    await step('skills: add skill', async () => {
      await clickNav('التعلم')
      await page.waitForTimeout(2500)
      await page.locator('button:has-text("المهارات")').first().click({ timeout: 6000 })
      await page.waitForTimeout(1200)
      await page.locator('button:has-text("مهارة جديدة")').first().click({ timeout: 6000 })
      await page.waitForTimeout(800)
      await page.locator('input[placeholder="مثال: البرمجة، التصميم..."]').fill('برمجة ٢٦')
      await page.locator('button:has-text("إضافة المهارة")').click()
      await page.waitForTimeout(2000)
      const chip = page.locator('div:has-text("برمجة ٢٦")').last()
      if (!(await chip.isVisible().catch(() => false))) throw new Error('skill card not visible')
      await shoot(page, 'skill-card')
    })

    await step('skills: level strip renders + increases + persists', async () => {
      // the strip: − dots n/5 +  — assert n/5 marker exists
      const strip = page.locator('div[dir="ltr"]:has(span.num:text("/5"))').first()
      if (!(await strip.count())) throw new Error('level strip not found in skill card')
      await page.locator('button[title="رفع المستوى"]').first().click()
      await page.waitForTimeout(1500)
      // server persistence: level 1→2
      const lvl = await apiCheck('/api/rise/knowledge?type=learning')
      const skill = (lvl.body?.items || []).find((i) => i.title && i.title.includes('برمجة ٢٦'))
      const lv = skill ? JSON.parse(skill.tags || '{}').level : null
      if (lv !== 2) throw new Error('level NOT persisted as 2 — got ' + lv)
      // mobile visual: the two-row strip must not overflow/wrap brokenly
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(1200)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 2) throw new Error(`horizontal overflow on mobile skills: ${overflow}px`)
      await shoot(page, 'skill-strip-mobile')
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.waitForTimeout(800)
    })

    // mobile visual of reading too (picker + ابدأ القراءة already exercised)
    await step('mobile visual: reading section', async () => {
      await clickNav('القراءة') // navigate while sidebar is visible (desktop)
      await page.waitForTimeout(1000)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(1500)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 2) throw new Error(`horizontal overflow on mobile reading: ${overflow}px`)
      await shoot(page, 'reading-mobile')
      await page.setViewportSize({ width: 1440, height: 900 })
    })

    // ── Health ──
    const consoleErrFiltered = consoleErrors.filter((e) => !/favicon|Image configured|third-party cookie/i.test(e))
    const badFiltered = apiBad.filter((b) => !b.url.includes('/api/error-log'))
    console.log('\n── Health ──')
    console.log(`console errors: ${consoleErrFiltered.length}${consoleErrFiltered.length ? ' → ' + JSON.stringify(consoleErrFiltered.slice(0, 5)) : ''}`)
    console.log(`non-2xx API: ${badFiltered.length}${badFiltered.length ? ' → ' + JSON.stringify(badFiltered.slice(0, 5)) : ''}`)

    const failed = steps.filter((s) => !s.ok)
    console.log('\n── Steps ──')
    for (const s of steps) console.log(`${s.ok ? '✅' : '❌'} ${s.name} (${s.ms}ms)${s.err ? ' — ' + s.err : ''}`)
    console.log(`\nSTEPS: ${steps.length - failed.length}/${steps.length}`)

    // cleanup via API (delete-all)
    const del = await page.evaluate(async ({ email, password }) => {
      let s = null
      try { s = JSON.parse(localStorage.getItem('rise-auth') || 'null') } catch {}
      const res = await fetch('/api/rise/delete-all', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(s && s.access_token ? { Authorization: 'Bearer ' + s.access_token } : {}) },
        body: JSON.stringify({ email, password, confirmDelete: true }),
      })
      return res.status
    }, { email: EMAIL, password: PASSWORD })
    console.log(`cleanup delete-all: ${del}`)

    fs.writeFileSync('/home/z/my-project/scripts/e2e-26-results.json', JSON.stringify({ steps, consoleErrors: consoleErrFiltered, apiBad: badFiltered }, null, 2))
    await browser.close()
    if (failed.length) process.exit(1)
    console.log('\nE2E 26: ALL PASS ✅')
  } catch (e) {
    console.error('E2E FAILED:', e.message)
    try { await browser.close() } catch {}
    process.exit(1)
  }
}

run()
