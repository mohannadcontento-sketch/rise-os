import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon, isSupabaseConfigured, resolveUserId } from '@/lib/supabase'
import { isMockAuthEnabled, verifyMockAccessToken } from '@/lib/mock-auth'

// ============================================================
// P1#4 FIX: Authentication enforcement
// ============================================================

export class AuthError extends Error {
  statusCode: number
  constructor(message = 'مطلوب تسجيل الدخول', statusCode = 401) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}

export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!token) return null

  // 🔒 Mock authentication is strictly disabled in production.
  if (!isSupabaseConfigured()) {
    if (!isMockAuthEnabled()) {
      console.error('[CRITICAL] Supabase environment variables missing in a non-local environment!')
      return null
    }

    const verified = verifyMockAccessToken(token)
    if (!verified) return null
    try {
      const { db } = await import('@/lib/db')
      const user = await (db as any).user.findUnique({ where: { id: verified.userId } })
      return user?.id || null
    } catch { return null }
  }

  // Supabase mode: verify real JWT
  if (token.length < 50) return null

  try {
    const supabase = await getSupabaseAnon()
    if (!supabase) return null

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    return user.id
  } catch {
    return null
  }
}

export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const cookieToken = req.cookies.get('rise-access')?.value
    if (cookieToken) {
      const userId = await verifySupabaseToken(cookieToken)
      if (userId) return userId
    }

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return null

    if (token.startsWith('rise_')) {
      return await resolveUserId(token)
    }

    if (token.length >= 50) {
      return await verifySupabaseToken(token)
    }

    return null
  } catch {
    return null
  }
}

export async function requireAuth(req: NextRequest): Promise<string | null> {
  const userId = await getUserId(req)
  if (!userId) return null
  // SECURITY: suspended/unknown authorization state must fail closed.
  try {
    const { isUserSuspended } = await import('@/lib/suspension')
    if (await isUserSuspended(userId)) return null
  } catch (error) {
    console.error('[auth] suspension authorization unavailable; denying request', error)
    return null
  }
  return userId
}

export function withAuth<T = any>(
  handler: (req: NextRequest, userId: string) => Promise<T>
) {
  return async (req: NextRequest): Promise<T | NextResponse> => {
    try {
      const userId = await requireAuth(req)
      if (!userId) {
        return NextResponse.json(
          { error: 'مطلوب تسجيل الدخول', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      }
      const { setCurrentAuthToken } = await import('@/lib/data')
      // Bind cookie auth for browser requests and Authorization for API-key clients.
      setCurrentAuthToken(req)

      return await handler(req, userId)
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message, code: 'UNAUTHORIZED' }, { status: err.statusCode })
      }
      console.error('[withAuth] unexpected error:', err)
      return NextResponse.json({ error: 'حدث خطأ في الخادم', code: 'SERVER_ERROR' }, { status: 500 })
    }
  }
}

export async function optionalAuth(req: NextRequest): Promise<string | null> {
  return await getUserId(req)
}
