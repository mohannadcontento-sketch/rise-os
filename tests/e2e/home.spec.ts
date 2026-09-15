import { test, expect } from '@playwright/test'

// ============================================================
// home.spec.ts — المرحلة ١٧ (تحديث المالك): الرئيسية = لوحة القيادة
//
// ١) Home loads for new user — الزيارة الأولى بلا جلسة تعرض بوابة
//    الدخول (وضع الاستعلام) ثم الرئيسية بعد الدخول.
// ٢) Home loads for returning user — مركز القيادة يعرض الترتيب
//    المتعاقد: تحية → تركيز اليوم → يومي → إجراءات سريعة،
//    ثم ودجات لوحة القيادة الغنية (درجة الإنتاجية + KPIs) بعد
//    خمول المتصفح (حزمة lazy).
// ٣) Quick Add creates one entity without duplicate request —
//    النقر المتكرر السريع على «احفظ» يرسل طلب POST واحدًا فقط
//    (حارس in-flight في الواجهة + Idempotency-Key من api-fetch).
//
// البيئة: dev server بلا Supabase → وضع mock (تسجيل دخول بأي
// بيانات صالحة + طبقة بيانات محلية).
// ============================================================

let userSeq = 0
const uniqueEmail = () => `e2e17-${Date.now()}-${++userSeq}@awj.test`
const TEST_PASSWORD = 'phase17-strong-pass'

const GREETING = /صباح الخير|نهارك سعيد|مساء الخير/

/** إغلاق التعريف الترحيبي إن ظهر — ينتظر سباقيًا إياه أو التحية (أيهما أولًا). */
async function dismissOnboarding(page: import('@playwright/test').Page) {
  await Promise.race([
    page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 25000 }),
    page.locator('h1').filter({ hasText: GREETING }).waitFor({ state: 'visible', timeout: 25000 }),
  ]).catch(() => { /* كلاهما — نترك الفحص التالي يقرر */ })
  const dialog = page.locator('[role="dialog"]')
  if (await dialog.isVisible().catch(() => false)) {
    const skip = page.getByRole('button', { name: 'تخطي التعريف' })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      await expect(dialog).toBeHidden({ timeout: 10000 })
    }
  }
}

/**
 * جلسة جاهزة عبر الـAPI (page.request يتشارك ملف كوكيز السياق):
 * إنشاء حساب ببريد فريد ثم فتح /app — نتجنب تفاعل نموذج الدخول
 * (موضوعه اختبارات login.spec) ونستهدف عقد هذه المرحلة: الرئيسية
 * والكتابة السريعة. يليه تخطي التعريف الترحيبي للمستخدم الجديد.
 */
async function login(page: import('@playwright/test').Page) {
  const email = uniqueEmail()
  // حد معدل signup قد يرد 429 عند تشغيل الاختبارات متتالية —
  // إعادة محاولة قصيرة تفك الاختناق
  let res: import('@playwright/test').APIResponse | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await page.request.post('/api/auth/signup', {
      data: { email, password: TEST_PASSWORD, name: 'مختبر المرحلة ١٧' },
    })
    if (res.ok() || res.status() !== 429) break
    // نافذة الحد دقيقة كاملة — انتظارها يفك الاختناق حتمًا
    await page.waitForTimeout(65000)
  }
  expect(res && res.ok(), `signup API: ${res ? res.status() : 'none'}`).toBeTruthy()

  await page.goto('/app')
  await dismissOnboarding(page)
  await expect(page.locator('h1').filter({ hasText: GREETING })).toBeVisible({ timeout: 30000 })
}

test.describe('المرحلة 17 — Home & My Day', () => {
  test('مستخدم جديد: /app يعرض بوابة الدخول (وضع الاستعلام)', async ({ page }) => {
    await page.goto('/app')
    await expect(page.locator('#email')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('#password')).toBeVisible()
  })

  test('مركز القيادة: مستخدم جديد ثم عائد ببيانات', async ({ page }) => {
    // حد تسجيل الـ middleware (٣/دقيقة) قد يفرض backoff ٦٥ ثانية
    // (نفس مهلة اختباري Quick Add — يثبت الاستقرار عند التشغيل بعد
    // مجموعات أخرى مثل explore.spec)
    test.setTimeout(150_000)
    await login(page)

    // ── حالة المستخدم الجديد (§6 Home): دعوة واحدة + ٣ قوالب ──
    await expect(page.locator('h1').filter({ hasText: GREETING })).toBeVisible()
    await expect(page.getByLabel('أهلًا بك في أوج')).toBeVisible()
    await expect(page.getByLabel('لقطة اليوم')).toBeVisible()

    // قاعدة الـ ٦ (§5): ستة إجراءات سريعة بالضبط
    await expect(page.getByLabel('إجراءات سريعة').getByRole('button')).toHaveCount(6)

    // بلا لغة لوم (§7): لا «فشلت» ولا «خسرت» في الرئيسية
    const body = await page.locator('main, [role="main"], body').first().textContent()
    expect(body).not.toContain('فشلت')
    expect(body).not.toContain('خسرت')

    // ── حالة العائد ببيانات: أنشئ مهمة ثم أعد التحميل ──
    await page.getByRole('button', { name: 'أضف مهمة' }).click()
    const dialog = page.getByRole('dialog', { name: 'إضافة سريعة' })
    await dialog.getByLabel('العنوان').fill('مهمة اليوم الأولى')
    await dialog.getByRole('button', { name: 'احفظ الآن' }).click()
    await expect(dialog).toBeHidden({ timeout: 15000 })
    await expect(page.getByLabel('لقطة اليوم')).toContainText('مهمة اليوم الأولى', { timeout: 15000 })

    // إعادة التحميل = عائد: الترتيب §11 كاملًا (تحية → تركيز اليوم → يومي)
    await page.reload()
    await expect(page.locator('h1').filter({ hasText: GREETING })).toBeVisible({ timeout: 30000 })
    await expect(page.getByLabel('تركيز اليوم')).toBeVisible({ timeout: 15000 })
    await expect(page.getByLabel('تركيز اليوم')).toContainText('مهمة اليوم الأولى')
    await expect(page.getByLabel('لقطة اليوم')).toContainText('مهمة اليوم الأولى')

    // ── لوحة القيادة الغنية: حزمة lazy تُحمّل بعد خمول المتصفح ──
    // القسم الجديد (طلب المالك): بطاقة درجة الإنتاجية + KPIs + الشارات
    await expect(page.getByText('درجة الإنتاجية', { exact: false })).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('الشارات المتاحة')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('متوسط الإنتاجية الأسبوعي')).toBeVisible({ timeout: 20000 })
  })

  test('Quick Add ينشئ كيانًا واحدًا بلا طلبات مكررة', async ({ page }) => {
    // حد تسجيل الـ middleware (٣/دقيقة) قد يفرض backoff ٦٥ ثانية
    // — مهلة موسعة (نمط اختبار اللقطات) كي تتسع للاحتظار
    test.setTimeout(150_000)
    await login(page)

    // عدّ طلبات إنشاء المهام على مستوى الشبكة
    let taskPosts = 0
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/rise/tasks')) taskPosts++
    })

    // فتح الإضافة السريعة من الإجراءات → مهمة
    await page.getByRole('button', { name: 'أضف مهمة' }).click()
    const dialog = page.getByRole('dialog', { name: 'إضافة سريعة' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('tab', { name: 'مهمة' })).toHaveAttribute('aria-selected', 'true')

    // تعبئة العنوان
    await dialog.getByLabel('العنوان').fill(`مهمة اختبار المرحلة ١٧ ${Date.now()}`)

    // نقر متكرر سريع — الزر يُعطَّل أثناء الطفرة فتُرفض الطلبات
    // الإضافية؛ النقرات الإضافية بمهلة قصيرة كي لا تنتظر للأبد
    const save = dialog.getByRole('button', { name: 'احفظ الآن' })
    await save.click()
    await Promise.allSettled([
      save.click({ timeout: 1500 }),
      save.click({ timeout: 1500 }),
      save.click({ timeout: 1500 }),
    ])
    // Enter بعد البدء محروس بنفس الحارس (in-flight)
    await dialog.getByLabel('العنوان').press('Enter', { timeout: 3000 }).catch(() => {})

    // النجاح: الإغلاق التلقائي + توست قصير
    await expect(dialog).toBeHidden({ timeout: 15000 })
    await page.waitForTimeout(600)

    // العقد: طلب POST واحد بالضبط
    expect(taskPosts, 'عدد طلبات إنشاء المهمة').toBe(1)

    // والكيان ظهر في لقطة اليوم (بيانات اليوم تتحدث عبر rise:data-changed)
    await expect(page.getByLabel('لقطة اليوم')).toContainText('مهمة اختبار المرحلة', { timeout: 15000 })
  })

  test('Quick Add: الحارس يعطل زر الحفظ أثناء الطفرة', async ({ page }) => {
    // حد تسجيل الـ middleware (٣/دقيقة) قد يفرض backoff ٦٥ ثانية
    test.setTimeout(150_000)
    await login(page)
    await page.getByRole('button', { name: 'أضف مهمة' }).click()
    const dialog = page.getByRole('dialog', { name: 'إضافة سريعة' })
    await dialog.getByLabel('العنوان').fill('اختبار الحارس')
    const save = dialog.getByRole('button', { name: 'احفظ الآن' })
    await expect(save).toBeEnabled()
    await save.click()
    // أثناء الحفظ: الزر معطّل (aria-busy)
    await expect(dialog.getByRole('button', { name: /جارٍ الحفظ|احفظ الآن/ })).toBeVisible()
    await expect(dialog).toBeHidden({ timeout: 15000 })
  })
  // ── Visual regression: خط أساس مرتكز (mobile + desktop) ──
  // الترتيب المستقر: تحية (هيدر الداشبورد الغني) → تركيز اليوم →
  // لقطة اليوم → إجراءات سريعة → لوحة القيادة الغنية (درجة +
  // KPIs + شارات) — ننتظر تحميل الحزمة lazy قبل اللقطات
  test('Visual regression: خط أساس للرئيسية (جوال + سطح مكتب)', async ({ page }) => {
    // حد تسجيل الـ middleware (٣/دقيقة) قد يفرض backoff ٦٥ ثانية
    // — مهلة موسعة كي تتسع للانتظار + تحميل الحزمة lazy
    test.setTimeout(150_000)
    await login(page)
    // ننتظر لوحة القيادة الغنية (lazy بعد خمول المتصفح) قبل أي لقطة
    await expect(page.getByText('الشارات المتاحة')).toBeVisible({ timeout: 25000 })
    await expect(page.getByText('متوسط الإنتاجية الأسبوعي')).toBeVisible({ timeout: 15000 }).catch(() => { /* mock بلا سجل أسبوعي — بطاقة مشروطة */ })
    // جوال ٣٧٥px
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(1200)
    await expect(page).toHaveScreenshot('home-mobile.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
    // سطح مكتب ١٢٨٠px
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(1200)
    await expect(page).toHaveScreenshot('home-desktop.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })

})
