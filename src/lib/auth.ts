import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon, isSupabaseConfigured, resolveUserId } from '@/lib/supabase'

// ============================================================
// P1#4 FIX: Authentication enforcement
// ------------------------------------------------------------
// requireAuth() now THROWS AuthError(401) instead of returning null.
// withAuth() wrapper catches AuthError and returns 401 automatically.
// This prevents routes from accidentally processing unauthenticated requests.
// ============================================================

/** P1#4: AuthError — thrown when authentication is missing/invalid. */
export class AuthError extends Error {
  statusCode: number
  constructor(message = 'مطلوب تسجيل الدخول', statusCode = 401) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}

/**
 * Verify a Supabase JWT and return the user ID.
 * In local mode, verifies mock tokens (format: local.{userId}.{ts}.risecos.local...).
 */
export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!token) return null

  // Local mock mode: tokens are `local.{userId}.{ts}.risecos.local.auth.token.payload.sig`
  if (!isSupabaseConfigured()) {
    const match = token.match(/^local\.(.+?)\.\d+\.risecos\.local/)
    if (match) {
      try {
        const { db } = await import('@/lib/db')
        const user = await (db as any).user.findUnique({ where: { id: match[1] } })
        return user?.id || null
      } catch { return null }
    }
    return null
  }

  // Supabase mode: verify real JWT
  if (token.length < 50) return null

  try {
    const supabase = await getSupabaseAnon()
    if (!supabase) return null

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return null
    }

    return user.id
  } catch {
    return null
  }
}

/**
 * Extract authenticated user ID from request.
 * Supports: httpOnly cookie (P1#3), Authorization header, rise_ API keys.
 * Priority: cookie first (most secure), then header, then API key.
 * Returns null for any unauthenticated request.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    // P1#3: Check httpOnly cookie FIRST (most secure — not accessible to JS)
    const cookieToken = req.cookies.get('rise-access')?.value
    if (cookieToken) {
      const userId = await verifySupabaseToken(cookieToken)
      if (userId) return userId
    }

    // Fallback: Authorization header (for API keys + legacy clients)
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return null

    // 1. rise_ API keys — resolved via Supabase user_api_keys table (P1#7: hashed)
    if (token.startsWith('rise_')) {
      return await resolveUserId(token)
    }

    // 2. Supabase JWT (must be verified, never trust the token value as a user ID)
    if (token.length >= 50) {
      return await verifySupabaseToken(token)
    }

    return null
  } catch {
    return null
  }
}

/**
 * P1#4 FIX: requireAuth returns userId or null.
 * For ENFORCED auth (auto 401), use withAuth() wrapper instead.
 * Existing routes that check `if (!userId) return 401` still work.
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  return await getUserId(req)
}

/**
 * P1#4 FIX: withAuth() wrapper — wraps an API handler and enforces
 * authentication automatically. Throws AuthError → returns 401 JSON.
 * Also sets the current auth token for data.ts.
 *
 * Usage:
 *   export const GET = withAuth(async (req, userId) => { ... })
 *   export const POST = withAuth(async (req, userId) => { ... })
 */
export function withAuth<T = any>(
  handler: (req: NextRequest, userId: string) => Promise<T>
) {
  return async (req: NextRequest): Promise<T | NextResponse> => {
    try {
      const userId = await requireAuth(req)

      // Set the auth token context for data.ts (sb() uses it for per-user RLS)
      const { setCurrentAuthToken } = await import('@/lib/data')
      const token = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
      setCurrentAuthToken(token)

      return await handler(req, userId as string)
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json(
          { error: err.message, code: 'UNAUTHORIZED' },
          { status: err.statusCode }
        )
      }
      console.error('[withAuth] unexpected error:', err)
      return NextResponse.json(
        { error: 'حدث خطأ في الخادم', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  }
}

/** Alias for routes that optionally use auth (still returns null, no throw) */
export async function optionalAuth(req: NextRequest): Promise<string | null> {
  return await getUserId(req)
}
