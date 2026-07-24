import { test, expect } from '@playwright/test'

// ============================================================
// P2#10: E2E test — security headers
// Tests: CSP, HSTS, X-Frame-Options are present
// ============================================================

test.describe('Security Headers', () => {
  test('CSP header is present', async ({ request }) => {
    const response = await request.get('/')
    const csp = response.headers()['content-security-policy']
    expect(csp).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
  })

  test('HSTS header is present (production)', async ({ request }) => {
    const response = await request.get('/')
    // HSTS only set in production — may not be present in dev
    const hsts = response.headers()['strict-transport-security']
    if (process.env.NODE_ENV === 'production') {
      expect(hsts).toContain('max-age=31536000')
    }
  })

  test('X-Frame-Options is DENY', async ({ request }) => {
    const response = await request.get('/')
    expect(response.headers()['x-frame-options']).toBe('DENY')
  })

  test('X-Content-Type-Options is nosniff', async ({ request }) => {
    const response = await request.get('/')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
  })
})
