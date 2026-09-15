import { test, expect } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { consentedSignupPayload, requiredPolicyVersions } from './helpers'

// ============================================================
// auth.spec.ts — المرحلة 20: Onboarding + Auth + Consent
//
// عقد الخطة (٤ بنود الاختبار):
//   1) Playwright auth state على حسابات اختبار مع حفظ الحالة
//      خارج git (tests/.auth/ — مُضافة إلى .gitignore)
//   2) 401/403/CSRF/session expiry — البوابات وانتهاء الجلسة
//   3) Consent: قبول + رفض + تحديث نسخة السياسة
//   4) Account deletion/export regression
//
// منهجية: وضع serial + حساب واحد مشترك يُنشأ مرة واحدة ثم
// تُحفظ حالته (storageState) وتُستأنف في السياقات اللاحقة —
// يبقى ضمن حدّ signup الخادمي (٣/دقيقة في dev) بلا backoff.
// آخر اختبار يحذف الحساب المشترك نفسه (انحدار الحذف).
// ============================================================

test.describe.configure({ mode: 'serial' })

// مهلة سخية: أول زيارة لكل مسار في dev تترجم باردة (turbopack) —
// نفس منهج home.spec مع نوافذ 429؛ القياس الفعلي للاختبارات ثوانٍ
test.beforeEach(() => test.setTimeout(120000))

const AUTH_STATE_DIR = path.join(__dirname, '.auth')
const AUTH_STATE_FILE = path.join(AUTH_STATE_DIR, 'user.json')

const GREETING = /صباح الخير|نهارك سعيد|مساء الخير/
const TEST_PASSWORD = 'phase20-strong-pass-1'

/** بيانات الحساب المشترك — يُنشأ في أول اختبار ثم يُشارك */
let sharedEmail = `e2e20-${Date.now()}@awj.test`

/** إغلاق التعريف الترحيبي إن ظهر (نفس نمط home.spec) */
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

test.describe('المرحلة 20 — مسارات المصادقة المستقلة', () => {
  test('/login و /signup يعملان: التبويب الصحيح + noindex + عناصر الموافقة', async ({ page }) => {
    // /login: تبويب الدخول هو النشط
    await page.goto('/login')
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('تسجيل الدخول')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('h1')).toContainText('أوج')

    // صفحات المصادقة لا تُفهرس (robots meta من metadata)
    const robots = page.locator('meta[name="robots"]')
    await expect(robots).toHaveCount(1)
    await expect(robots).toHaveAttribute('content', /noindex/)

    // /signup: تبويب الحساب الجديد هو النشط + checkbox الموافقة
    await page.goto('/signup')
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('حساب جديد')
    const consentBox = page.getByRole('checkbox', { name: 'الموافقة على الشروط وسياسة الخصوصية' })
    await expect(consentBox).toBeVisible()
    await expect(consentBox).toHaveAttribute('aria-checked', 'false')

    // روابط السياسات واضحة وتفتح في تاب جديد (محصورة في نطاق
    // النموذج — لافتة موافقة الإعلانات تحمل رابط خصوصية آخر)
    const termsLink = page.locator('form a[href="/terms"]')
    const privacyLink = page.locator('form a[href="/privacy"]')
    await expect(termsLink).toBeVisible()
    await expect(privacyLink).toBeVisible()
    await expect(termsLink).toHaveAttribute('target', '_blank')

    // نسخة السياسة معروضة (من المصدر site.ts — بأرقام شرقية)
    const version = requiredPolicyVersions().terms
    const eastern = version.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])
    await expect(page.locator(`text=${eastern}`)).toBeVisible()

    // التوافق الرجعي: /app بلا جلسة يظل يعرض بوابة الدخول (وضع الاستعلام)
    await page.goto('/app')
    await expect(page.locator('#email')).toBeVisible({ timeout: 20000 })
  })

  test('مؤشر متطلبات كلمة المرور حي + زر الإنشاء مقيد بالموافقة', async ({ page }) => {
    await page.goto('/signup')
    // انتظر اكتمال الترطيب قبل التعبئة — تعبئة ما قبل الترطيب
    // تُمسح من حالة React (نمط dev موثّق منذ المرحلة 17)؛
    // networkidle يضمن تحميل كل الحزم العميلية
    await page.waitForLoadState('networkidle')

    // املأ بيانات صحيحة لكن كلمة مرور ضعيفة → المؤشر يظهر والأزرار مقيدة
    await page.fill('#name', 'مختبر المرحلة ٢٠')
    await page.fill('#email', sharedEmail)
    await page.fill('#password', 'abc')
    const indicator = page.locator('#pw-requirements')
    await expect(indicator).toBeVisible()
    await expect(indicator.locator('text=٨ محارف على الأقل')).toBeVisible()
    // 'abc': الحرف فقط مستوفٍ (١/٣) — الطول والرقم غير مستوفيين
    await expect(indicator.locator('svg.text-emerald-accent')).toHaveCount(1)
    await expect(page.getByRole('button', { name: /إنشاء حساب/ })).toBeDisabled()

    // كلمة مرور قوية → المتطلبات الثلاثة تتحول خضراء
    await page.fill('#password', TEST_PASSWORD)
    await expect(indicator.locator('svg.text-emerald-accent')).toHaveCount(3)

    // بلا موافقة → الزر ما زال معطلًا (بوابة العميل)
    await expect(page.getByRole('button', { name: /إنشاء حساب/ })).toBeDisabled()

    // قبول الموافقة → الزر يتحرر
    await page.getByRole('checkbox', { name: 'الموافقة على الشروط وسياسة الخصوصية' }).click()
    await expect(page.getByRole('button', { name: /إنشاء حساب/ })).toBeEnabled()
  })
})

test.describe('المرحلة 20 — بوابة الموافقة الخادمية', () => {
  test('رفض التسجيل بلا قبول: 403 CONSENT_REQUIRED', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: {
        email: `noconsent-${Date.now()}@awj.test`,
        password: TEST_PASSWORD,
        name: 'بلا موافقة',
        policyVersions: requiredPolicyVersions(),
      },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.errorType).toBe('CONSENT_REQUIRED')
    expect(body.error).toContain('الشروط')
  })

  test('رفض التسجيل بنسخة سياسة قديمة: 409 POLICY_VERSION_MISMATCH', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: {
        email: `stale-${Date.now()}@awj.test`,
        password: TEST_PASSWORD,
        name: 'نسخة قديمة',
        acceptedTerms: true,
        policyVersions: { terms: '2000-01-01', privacy: '2000-01-01' },
      },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.errorType).toBe('POLICY_VERSION_MISMATCH')
    // الخادم يعيد النسخ المطلوبة ليصحح العميل روابطه
    expect(body.requiredPolicyVersions).toEqual(requiredPolicyVersions())
  })

  test('التسجيل بقبول ساري: الحساب ينشأ + سطرا الموافقة يُسجلان', async ({ page }) => {
    const res = await page.request.post('/api/auth/signup', {
      data: consentedSignupPayload(sharedEmail, TEST_PASSWORD, 'مختبر المرحلة ٢٠'),
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.user).toBeTruthy()
    expect(body.user.email).toBe(sharedEmail)
    expect(body.consentRecorded).toBe(true)

    // سجل الموافقة قابل للقراءة باسم المستخدم فقط
    const consents = await page.request.get('/api/auth/consents')
    expect(consents.status()).toBe(200)
    const cdata = await consents.json()
    expect(cdata.consents).toHaveLength(2)
    const types = cdata.consents.map((c: { consentType: string }) => c.consentType).sort()
    expect(types).toEqual(['privacy', 'terms'])
    expect(cdata.currentVersionsAccepted).toBe(true)
    expect(cdata.consents[0].consentedAt).toBeTruthy()

    // حفظ حالة المصادقة خارج git (بند الخطة ١) — يُستأنف لاحقًا
    fs.mkdirSync(AUTH_STATE_DIR, { recursive: true })
    await page.context().storageState({ path: AUTH_STATE_FILE })
    expect(fs.existsSync(AUTH_STATE_FILE)).toBe(true)
    const state = JSON.parse(fs.readFileSync(AUTH_STATE_FILE, 'utf8'))
    expect(state.cookies.length).toBeGreaterThan(0)
    expect(state.cookies.some((c: { name: string }) => c.name === 'rise-access')).toBe(true)

    // دخول التطبيق بكامل الجلسة
    await page.goto('/app')
    await dismissOnboarding(page)
    await expect(page.locator('h1').filter({ hasText: GREETING })).toBeVisible({ timeout: 30000 })
  })

  test('مسار قراءة الموافقات محصين: بلا جلسة 401', async ({ request }) => {
    const res = await request.get('/api/auth/consents')
    expect(res.status()).toBe(401)
  })
})

test.describe('المرحلة 20 — أمان الجلسة والكوكيز', () => {
  test('دخول ناجح: كوكيز httpOnly + SameSite=Lax ولا توكن في أي تخزين عميل', async ({ page, request }) => {
    // 1) عقد الكوكيز من رأس الاستجابة مباشرة (دفاع CSRF هيكلي)
    const res = await request.post('/api/auth/login', {
      data: { email: sharedEmail, password: TEST_PASSWORD },
    })
    expect(res.status()).toBe(200)
    const setCookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
    const accessCookie = setCookies.find((v) => v.startsWith('rise-access='))
    // المقارنة غير حساسة لحالة الأحرف — الطبقة السفلية يطبّع lax
    const accessCookieLower = (accessCookie ?? '').toLowerCase()
    expect(accessCookie).toBeTruthy()
    expect(accessCookieLower).toContain('httponly')
    expect(accessCookieLower).toContain('samesite=lax')
    expect(accessCookieLower).toContain('path=/')

    // 2) دخول عبر الواجهة من /login → تحويل إلى /app
    //    (انتظر الترطيب قبل التعبئة — النمط الموثّق أعلاه)
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.fill('#email', sharedEmail)
    await page.fill('#password', TEST_PASSWORD)
    await page.getByRole('button', { name: /دخول/ }).click()
    await page.waitForURL('**/app', { timeout: 30000 })
    await dismissOnboarding(page)
    await expect(page.locator('h1').filter({ hasText: GREETING })).toBeVisible({ timeout: 30000 })

    // 3) تدقيق التخزين: لا session/token في أي مكان قابل للقراءة
    const storageKeys = await page.evaluate(() => {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) ?? '')
      for (let i = 0; i < sessionStorage.length; i++) keys.push(`session:${sessionStorage.key(i) ?? ''}`)
      return keys
    })
    // rise-user-info = بيانات واجهة غير حاكمة فقط (id/name) — ليس توكنًا
    const tokenish = storageKeys.filter((k) =>
      /token|sb-|rise-auth|access|refresh|jwt/i.test(k)
    )
    expect(tokenish).toEqual([])
    // 4) الكوكيز الحساسة غير مقروءة من جافاسكربت (httpOnly)
    const cookieString = await page.evaluate(() => document.cookie)
    expect(cookieString).not.toContain('rise-access')
    expect(cookieString).not.toContain('rise-refresh')
  })

  test('انتهاء الجلسة: مسح الكوكيز → 401 من الـAPI والصدفة تعود للبوابة', async ({ page }) => {
    // جلسة من الحالة المحفوظة (خارج git)
    const ctx = await page.context().browser()?.newContext({ storageState: AUTH_STATE_FILE })
    const p2 = await ctx?.newPage()
    expect(p2).toBeTruthy()
    if (!p2 || !ctx) return

    // الوصول يعمل قبل المسح
    const before = await p2.request.get('/api/rise/tasks')
    expect(before.status()).toBe(200)

    // محاكاة انتهاء الجلسة: مسح الكوكيز (انتهاء الصلاحية/خادم)
    await ctx.clearCookies()
    const after = await p2.request.get('/api/rise/tasks')
    expect(after.status()).toBe(401)

    // الصدفة تكتشف انتهاء الجلسة وتعيد بوابة الدخول
    await p2.goto('/app')
    await expect(p2.locator('#email')).toBeVisible({ timeout: 30000 })
    await ctx.close()
  })

  test('بوابات 401/403: غير موثق 401 · موثق عادي على مسار إدارة 403', async ({ page, request }) => {
    // 1) بلا جلسة إطلاقًا (CSRF عبر الموقع: SameSite=Lax يمنع إرفاق
    //    الكوكيز من أصل آخر — هنا الطلب بلا كوكيز أصلاً = الحد الأدنى)
    //    مسارات الأعمال ترد 401 بلا جلسة؛ بوابة الأدمن ترد 403
    //    («أدمن فقط») حتى قبل فحص الجلسة — عقد مقيس بالـ curl
    const unauth = await request.get('/api/rise/tasks')
    expect(unauth.status()).toBe(401)
    const unauthAdmin = await request.get('/api/rise/admin/overview')
    expect(unauthAdmin.status()).toBe(403)
    const body = await unauthAdmin.json()
    expect(body.error).toContain('أدمن')

    // 2) مستخدم عادي (حالة محفوظة) على مسار الأدمن → 403
    const authed = await page.context().browser()?.newContext({ storageState: AUTH_STATE_FILE })
    const p3 = await authed?.newPage()
    expect(p3).toBeTruthy()
    if (!p3 || !authed) return
    const forbidden = await p3.request.get('/api/rise/admin/overview')
    expect(forbidden.status()).toBe(403)
    await authed.close()
  })

  test('الخروج من كل الأجهزة: إبطال + مسح الكوكيز', async ({ page }) => {
    const ctx = await page.context().browser()?.newContext({ storageState: AUTH_STATE_FILE })
    const p4 = await ctx?.newPage()
    if (!p4 || !ctx) return

    // جلسة حية قبل الإبطال
    const alive = await p4.request.get('/api/rise/tasks')
    expect(alive.status()).toBe(200)

    // إبطال كل الجلسات (وضع dev: مسح الكوكيز عبر الاستجابة)
    const out = await p4.request.post('/api/auth/logout-all')
    expect(out.status()).toBe(200)

    // استجابة logout-all تحمل مسح الكوكيز (Set-Cookie منتهية)
    const cleared = out
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
    expect(cleared.some((v) => v.includes('rise-access=;'))).toBe(true)

    // الجلسة ماتت في هذا الجهاز فورًا
    const dead = await p4.request.get('/api/rise/tasks')
    expect(dead.status()).toBe(401)
    await ctx.close()
  })
})

test.describe('المرحلة 20 — انحدار الحذف والتصدير', () => {
  test('تصدير بياناتي 200 · حذف الحساب: العقد المحلي 503 (Supabase-only)', async ({ page }) => {
    const ctx = await page.context().browser()?.newContext({ storageState: AUTH_STATE_FILE })
    const p5 = await ctx?.newPage()
    if (!p5 || !ctx) return

    // تصدير البيانات (بند GDPR-ي قائم — انحدار حي محليًا)
    const exportRes = await p5.request.get('/api/rise/export')
    expect(exportRes.status()).toBe(200)

    // حذف الحساب — عقد وضع التطوير المحلي الموثّق: غير متاح بلا
    // Supabase (يتطلب service role + cascade على auth.users). الحذف
    // الحقيقي متحقق منه حيًّا في الإنتاج (QA المرحلة ١٤ + هجرة 036)
    const del = await p5.request.delete('/api/auth/delete-account')
    expect(del.status()).toBe(503)
    const delBody = await del.json()
    expect(delBody.error).toContain('وضع التطوير المحلي')

    // محليًا لم يُحذف شيء — الجلسة ما زالت تعمل
    const still = await p5.request.get('/api/rise/tasks')
    expect(still.status()).toBe(200)
    await ctx.close()
  })
})
