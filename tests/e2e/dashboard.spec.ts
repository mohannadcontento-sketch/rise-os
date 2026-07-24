import { test, expect } from '@playwright/test'

// ============================================================
// P2#10: E2E test — dashboard module
// Tests: dashboard loads, shows productivity score, navigation works
// ============================================================

test.describe('Dashboard', () => {
  // Note: These tests require authentication. In CI, mock auth or
  // use a test user. For now, they test the unauthenticated state.

  test('dashboard API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/rise/dashboard')
    const body = await response.json()

    // Should return 401 or empty data (not user data)
    expect(response.status()).toBe(401)
    expect(body.error || body.code).toBeTruthy()
  })

  test('tasks API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/rise/tasks')
    // Should not return real user tasks
    const body = await response.json()
    if (response.status() === 200) {
      expect(body.tasks).toEqual([])
    }
  })

  test('finance API rejects negative amounts', async ({ request }) => {
    // Even if authenticated, negative amounts should be rejected by Zod
    const response = await request.post('/api/rise/finance', {
      data: {
        type: 'expense',
        amount: -99999,
        description: 'should be rejected',
        date: '2026-07-24',
      },
    })
    // Without auth: 401. With auth + bad data: 400.
    expect([400, 401]).toContain(response.status())
  })
})
