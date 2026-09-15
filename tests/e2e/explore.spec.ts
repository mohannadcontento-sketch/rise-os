import { test, expect } from '@playwright/test'

// ============================================================
// explore.spec.ts — المرحلة ١٨: التنقل + الاستكشاف
//
// عقود الخطة (Master Plan Phase 18 + UX_FOUNDATION §3/§4):
//   ١) شريط الجوال ٥ أدوار هيكلية: الرئيسية · استكشف · + · المجتمع · حسابي
//   ٢) Explore Hub: ٤ بطاقات عوالم (٦/٣/٤/٥ = ١٨ وحدة) + بحث يفتح أي وحدة
//   ٣) كل وحدة ≤ ٢ نقرة (استكشف → عالم/بطاقة → وحدة)
//   ٤) route + refresh + back/forward: الرابط يتبع الوحدة (?module=)
//   ٥) + يفتح الإضافة السريعة من أي شاشة · حسابي → بطاقة → الإعدادات
//   ٦) keyboard: بحث الاستكشاف + Enter يفتح أول نتيجة · Escape يغلق الـsheet
//   ٧) سطح المكتب: الشريط الجانبي ٤ عوالم + المجتمع صف مستقل
//
// البيئة: dev server (وضع mock) — نفس أنماط home.spec (جلسة عبر
// الـAPI لتجنب نماذج الدخول + تخطي التعريف + موافقة الإعلانات).
// ============================================================

let userSeq = 0
const uniqueEmail = () => `e2e18-${Date.now()}-${++userSeq}@awj.test`
const TEST_PASSWORD = 'phase18-strong-pass'

const GREETING = /صباح الخير|نهارك سعيد|مساء الخير/

/** جلسة جاهزة عبر الـAPI + تخطي التعريف + موافقة الإعلانات (تحجب الشريط) */
async function login(page: import('@playwright/test').Page) {
  const email = uniqueEmail()
  let res: import('@playwright/test').APIResponse | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await page.request.post('/api/auth/signup', {
      data: { email, password: TEST_PASSWORD, name: 'مختبر المرحلة ١٨' },
    })
    if (res.ok() || res.status() !== 429) break
    await page.waitForTimeout(65000)
  }
  expect(res && res.ok(), `signup API: ${res ? res.status() : 'none'}`).toBeTruthy()

  await page.goto('/app')
  await Promise.race([
    page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 25000 }),
    page.locator('h1').filter({ hasText: GREETING }).waitFor({ state: 'visible', timeout: 25000 }),
  ]).catch(() => { /* كلاهما — الفحص التالي يقرر */ })
  const dialog = page.locator('[role="dialog"]')
  if (await dialog.isVisible().catch(() => false)) {
    const skip = page.getByRole('button', { name: 'تخطي التعريف' })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      await expect(dialog).toBeHidden({ timeout: 10000 })
    }
  }
  // نافذة موافقة الإعلانات تظهر متأخرة وتحجب منطقة الشريط
  const consent = page.locator('[aria-label="موافقة الإعلانات"]')
  await consent.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { /* Free فقط */ })
  if (await consent.isVisible().catch(() => false)) {
    await consent.getByRole('button', { name: 'موافقة' }).click()
    await consent.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  }
  await expect(page.locator('h1').filter({ hasText: GREETING })).toBeVisible({ timeout: 30000 })
}

test.describe('المرحلة 18 — التنقل والاستكشاف', () => {
  test('شريط الجوال: ٥ أدوار هيكلية (المهام/العادات/المخطط خرجت منه)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    // حد تسجيل الـ middleware (٣/دقيقة) قد يفرض backoff ٦٥ ثانية
    test.setTimeout(150_000)
    await login(page)

    const nav = page.locator('nav[aria-label="التنقل السريع"]')
    await expect(nav).toBeVisible({ timeout: 15000 })

    // الوجهات الخمس بالترتيب (§4.1)
    await expect(nav.getByRole('button', { name: 'الرئيسية', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'استكشف' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'إضافة سريعة' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'المجتمع', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'بطاقة حسابي' })).toBeVisible()

    // الوحدات القديمة لم تعد في الشريط (نُقلت للاستكشف/الرئيسية)
    const barText = await nav.innerText()
    for (const old of ['المهام', 'العادات', 'المخطط', 'المالية']) {
      expect(barText, `«${old}» خارج الشريط`).not.toContain(old)
    }
  })

  test('استكشف: العوالم الأربعة + ١٨ وحدة + النقاط المستقلة (≤٦ لكل عالم)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    test.setTimeout(150_000)
    await login(page)

    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'استكشف' }).click()

    // محتوى الـHub (حزمة lazy) — ننتظر البحث قبل العدّ
    const search = page.getByLabel('ابحث عن وحدة')
    await expect(search).toBeVisible({ timeout: 20000 })

    // بطاقات العوالم: ٦/٣/٤/٥ (قاعدة الـ٦ — §5)
    const worlds = page.locator('[aria-label="العوالم الأربعة"] h3')
    await expect(worlds).toHaveCount(4)
    await expect(worlds.filter({ hasText: 'أنجز' })).toContainText('٦')
    await expect(worlds.filter({ hasText: 'تطوّر' })).toContainText('٣')
    await expect(worlds.filter({ hasText: 'توازن' })).toContainText('٤')
    await expect(worlds.filter({ hasText: 'إدارة حياتي' })).toContainText('٥')

    // ١٨ زر وحدة داخل العوالم + ٣ مستقلة (الرئيسية/المجتمع/الإعدادات)
    expect(await page.locator('[aria-label="العوالم الأربعة"] button[aria-label^="افتح"]').count()).toBe(18)
    await expect(page.getByRole('button', { name: 'افتح الرئيسية' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'افتح المجتمع' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'افتح الإعدادات' })).toBeVisible()
  })

  test('عالم → وحدة (٢ نقرة) ثم back يعيد للاستكشف وforward يعيد للوحدة', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    test.setTimeout(150_000)
    await login(page)

    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'استكشف' }).click()
    await page.getByLabel('ابحث عن وحدة').waitFor({ state: 'visible', timeout: 20000 })

    // استكشف → وحدة = ٢ نقرة (§4.3)
    await page.getByRole('button', { name: 'افتح التعلم' }).click()
    await expect(page.locator('h2').filter({ hasText: 'التعلم' }).first()).toBeVisible({ timeout: 20000 })
    await expect(page).toHaveURL(/module=learning/)

    // الرجوع (pushState — بلا load event: ننتظر commit ثم الـDOM)
    await page.goBack({ waitUntil: 'commit', timeout: 15000 }).catch(() => {})
    await page.getByLabel('ابحث عن وحدة').waitFor({ state: 'visible', timeout: 15000 })
    await expect(page).toHaveURL(/module=explore/)

    // الأمام يعيد للتعلم
    await page.goForward({ waitUntil: 'commit', timeout: 15000 }).catch(() => {})
    await expect(page.locator('h2').filter({ hasText: 'التعلم' }).first()).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/module=learning/)
  })

  test('route direct load + refresh: ?module= يستعيد الوحدة النشطة', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    test.setTimeout(150_000)
    await login(page)

    // direct load: رابط عميق يفتح الوحدة مباشرة
    await page.goto('/app?module=habits')
    await expect(page.locator('h2').filter({ hasText: 'تتبع العادات' }).first())
      .toBeVisible({ timeout: 30000 })

    // تحديث بعد تنقّل: الوحدة تبقى (لا رجوع للرئيسية)
    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'استكشف' }).click()
    await page.getByLabel('ابحث عن وحدة').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByRole('button', { name: 'افتح التقويم' }).click()
    await expect(page.locator('h2').filter({ hasText: 'التقويم' }).first()).toBeVisible({ timeout: 20000 })

    await page.reload()
    await expect(page.locator('h2').filter({ hasText: 'التقويم' }).first())
      .toBeVisible({ timeout: 45000 })
    await expect(page).toHaveURL(/module=calendar/)
  })

  test('+ يفتح الإضافة السريعة من أي وحدة · Escape يغلقها', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    test.setTimeout(150_000)
    await login(page)

    // من داخل وحدة (ليس الرئيسية فقط) — + دائمًا متاح
    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'استكشف' }).click()
    await page.getByLabel('ابحث عن وحدة').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByRole('button', { name: 'افتح التعلم' }).click()
    await expect(page.locator('h2').filter({ hasText: 'التعلم' }).first()).toBeVisible({ timeout: 20000 })

    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'إضافة سريعة' }).click()
    const dialog = page.getByRole('dialog', { name: 'إضافة سريعة' })
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByRole('tab', { name: 'مهمة' })).toHaveAttribute('aria-selected', 'true')

    // Escape (مستمع الالتقاط) يغلق الـsheet من أي عنصر مركّز
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 5000 })
  })

  test('حسابي: بطاقة الحساب → الإعدادات الكاملة (حسم §9/6)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    test.setTimeout(150_000)
    await login(page)

    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'بطاقة حسابي' }).click()
    const card = page.getByRole('dialog', { name: 'حسابي' })
    await expect(card).toBeVisible({ timeout: 15000 })

    // هوية المستخدم من الجلسة (الاسم/المستوى/تسجيل الخروج)
    await expect(card.getByText('مختبر المرحلة ١٨')).toBeVisible()
    await expect(card.getByText('تسجيل الخروج', { exact: false })).toBeVisible()

    await card.getByRole('button', { name: 'افتح الإعدادات الكاملة' }).click()
    await expect(card).toBeHidden({ timeout: 5000 })
    await expect(page.locator('h2').filter({ hasText: 'الإعدادات' }).first())
      .toBeVisible({ timeout: 20000 })
    // تاب حسابي يضيء داخل الإعدادات (activeModule === settings)
    await expect(page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'بطاقة حسابي' })).toHaveAttribute('aria-current', 'page')
  })

  test('لوحة المفاتيح: بحث الاستكشاف + Enter يفتح أول نتيجة', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    test.setTimeout(150_000)
    await login(page)

    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'استكشف' }).click()
    const search = page.getByLabel('ابحث عن وحدة')
    await expect(search).toBeVisible({ timeout: 20000 })

    // كتابة جزء من اسم الوحدة → نتيجة واحدة على الأقل → Enter يفتحها
    await search.fill('تقو')
    await expect(page.getByRole('option', { name: 'افتح التقويم' })).toBeVisible({ timeout: 5000 })
    await search.press('Enter')
    await expect(page.locator('h2').filter({ hasText: 'التقويم' }).first()).toBeVisible({ timeout: 20000 })

    // بحث بلا نتائج: حالة هادئة بلا لوم (§7)
    await page.locator('nav[aria-label="التنقل السريع"]')
      .getByRole('button', { name: 'استكشف' }).click()
    await page.getByLabel('ابحث عن وحدة').fill('لا شيء بهذا الاسم')
    await expect(page.getByText('لا وحدة بهذا الاسم', { exact: false })).toBeVisible({ timeout: 5000 })
  })

  test('سطح المكتب: الشريط الجانبي ٤ بطاقات عوالم + المجتمع صف مستقل', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    test.setTimeout(150_000)
    await login(page)

    // انتظر الجلسة عبر الشريط الجانبي نفسه (بوابة الدخول تظهر لحظة)
    const sidebarNav = page.locator('aside nav')
    await expect(sidebarNav).toBeVisible({ timeout: 45000 })

    // المجموعات الأربع (أكورديون العوالم)
    const groups = sidebarNav.locator('button[aria-expanded]')
    await expect(groups.filter({ hasText: 'أنجز' })).toBeVisible({ timeout: 20000 })
    await expect(groups.filter({ hasText: 'تطوّر' })).toBeVisible()
    await expect(groups.filter({ hasText: 'توازن' })).toBeVisible()
    await expect(groups.filter({ hasText: 'إدارة حياتي' })).toBeVisible()
    await expect(groups).toHaveCount(4)

    // المجموعات القديمة اختفت (عدّ المجموعات = ٤ + عناوين العوالم أعلاه
    // يثبتان إعادة التجميع — «التنفيذ» لا يُفحص كنص فرعي لأنه يظهر
    // legitimately في تلميحة عالم أنجز «عالم الإنجاز والتنفيذ»)
    const sidebarText = await sidebarNav.innerText()
    for (const old of ['يومك', 'النمو والمعرفة', 'المال والمراجعة']) {
      expect(sidebarText, `«${old}» خارج الشريط الجانبي`).not.toContain(old)
    }

    // المجتمع: صف مستقل (ليس مجموعة) + الإعدادات أسفل
    await expect(sidebarNav.getByRole('button', { name: 'المجتمع', exact: true })).toBeVisible()
    await expect(sidebarNav.getByRole('button', { name: 'الإعدادات', exact: true })).toBeVisible()

    // فتح عالم يكشف وحداته: أنجز (٦)
    await groups.filter({ hasText: 'أنجز' }).click()
    await expect(sidebarNav.getByRole('button', { name: 'المهام', exact: true })).toBeVisible({ timeout: 5000 })
  })

  test('الرئيسية: بطاقة تشويق الاستكشف تفتح الـHub (بلا تكرار شبكة العوالم)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    test.setTimeout(150_000)
    await login(page)

    const teaser = page.getByLabel('استكشف العوالم')
    await expect(teaser).toBeVisible({ timeout: 15000 })
    await teaser.getByRole('button', { name: 'افتح مركز الاستكشف' }).click()
    await page.getByLabel('ابحث عن وحدة').waitFor({ state: 'visible', timeout: 20000 })
    await expect(page).toHaveURL(/module=explore/)
  })
})
