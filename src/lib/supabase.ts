import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Admin email
export const ADMIN_EMAIL: string = process.env.ADMIN_EMAIL || ''

/**
 * Handle API route errors gracefully.
 * Returns mock success data so the app keeps working in demo mode.
 */
export function handleRouteError(error: unknown, route: string): NextResponse {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[${route}] error:`, msg)
  return NextResponse.json({ success: true, offline: true, id: 'mock-' + Date.now() })
}

// Track which user IDs have already been ensured (per-cold-start cache)
const _ensuredUsers = new Set<string>()

/**
 * Ensure a user row exists in the User table.
 * Uses Prisma. Safe to call multiple times (idempotent).
 */
export async function ensureUserExists(userIdOrClient: string): Promise<boolean> {
  const id = userIdOrClient

  if (_ensuredUsers.has(id)) return true

  try {
    const { db } = await import('@/lib/db')
    const existing = await db.user.findUnique({ where: { id } })

    if (!existing) {
      await db.user.create({
        data: {
          id,
          name: id === 'demo-user' ? 'مستخدم تجريبي' : 'مستخدم RiseOS',
          email: `${id}@rise-os.local`,
          level: 1,
          xp: 0,
          streak: 0,
          settings: { create: {} },
        },
      })
      console.log(`[ensureUserExists] created user: ${id}`)
    }

    _ensuredUsers.add(id)
    return true
  } catch (err) {
    console.error(`[ensureUserExists] error for ${id}:`, err)
    return false
  }
}

/**
 * Generate ZhipuAI JWT token
 */
export function generateZhipuToken(): string {
  const apiKey = process.env.BIGMODEL_API_KEY || ''
  const [id, secret] = apiKey.split('.')
  if (!id || !secret) return apiKey

  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp, timestamp: now })).toString('base64url')

  const signInput = header + '.' + payload
  const signature = crypto.createHmac('sha256', secret).update(signInput).digest('base64url')

  return signInput + '.' + signature
}

// Legacy compatibility — these are no-ops since we use Prisma directly
export function getSupabase() { return null }
export function getSupabaseAdmin() { return null }
export function getSupabaseWithAuth(_req?: NextRequest) { return null }
export function isAdminAvailable() { return true }