import { test, expect } from '@playwright/test'

// ============================================================
// P2#10: E2E test — login flow
// Tests: login page renders, validation, successful login
// ============================================================

test.describe('Login Flow', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('RiseOS')
    await expect(page.locator('text=تسجيل الدخول')).toBeVisible()
    await expect(page.locator('input[type=email]')).toBeVisible()
    await expect(page.locator('input[type=password]')).toBeVisible()
  })

  test('rejects short password', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[type=email]', 'test@example.com')
    await page.fill('input[type=password]', 'short')
    await page.click('button[type=submit]')

    // Should show validation error
    await expect(page.locator('text=8 أحرف')).toBeVisible({ timeout: 5000 })
  })

  test('rejects invalid email format', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[type=email]', 'not-an-email')
    await page.fill('input[type=password]', 'password12345')
    await page.click('button[type=submit]')

    // Should show validation error
    await expect(page.locator('text=بريد إلكتروني غير صالح')).toBeVisible({ timeout: 5000 })
  })
})
