import { test, expect } from '@playwright/test'

// ============================================================
// login.spec.ts — فحوص بوابة الدخول (أُعيدت كتابتها في المرحلة 20)
//
// كانت الاختبارات الثلاثة القديمة تفحص «/» (صفحة الهبوط) وهي
// تتوقع بوابة الدخول — توقعات متقادمة منذ المرحلة 11 فشلت
// تاريخيًا (موثّقة في جلسة المرحلة 17). بعد إضافة مساري
// /login و /signup المستقلين (المرحلة 20) تستهدف الفحوص
// المسار الصحيح وتغطي التحقق العميلي للنماذج.
// ============================================================

test.describe('بوابة الدخول — التحقق العميلي', () => {
  test('صفحة /login تعرض النموذج والتبويبات', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('أوج')
    await expect(page.locator('[role="tablist"]')).toBeVisible()
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('تسجيل الدخول')
    await expect(page.locator('input[type=email]')).toBeVisible()
    await expect(page.locator('input[type=password]')).toBeVisible()
  })

  test('يرفض كلمة المرور القصيرة برسالة واضحة', async ({ page }) => {
    await page.goto('/login')
    // انتظر الترطيب — التعبئة قبله تُمسح فيظهر خطأ البريد بدل كلمة المرور
    await page.waitForLoadState('networkidle')
    await page.fill('input[type=email]', 'test@example.com')
    await page.fill('input[type=password]', 'short')
    await page.click('button[type=submit]')

    await expect(page.locator('text=8 أحرف')).toBeVisible({ timeout: 5000 })
  })

  test('يرفض بريدًا غير صالح بلا طلب خادم', async ({ page }) => {
    let requested = false
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/login')) requested = true
    })
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.fill('input[type=email]', 'not-an-email')
    await page.fill('input[type=password]', 'password12345')
    await page.click('button[type=submit]')

    await expect(page.locator('text=بريد إلكتروني غير صالح')).toBeVisible({ timeout: 5000 })
    expect(requested).toBe(false) // التحقق العميلي منع الطلب
  })

  test('زر العين يبدّل إظهار كلمة المرور (aria-label عربي)', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.fill('input[type=password]', 'password12345')
    const toggle = page.getByRole('button', { name: 'إظهار كلمة المرور' })
    await toggle.click()
    await expect(page.locator('input[type=text]#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'إخفاء كلمة المرور' })).toBeVisible()
  })
})
