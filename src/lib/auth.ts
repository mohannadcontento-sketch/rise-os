import { NextRequest } from 'next/server'
import { getSupabaseAnon, isSupabaseConfigured, resolveUserId } from '@/lib/supabase'

/**
 * Verify a Supabase JWT and return the user ID.
 */
export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !token || token.length < 50) return null

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
 * Supports: Supabase JWT, rise_ API key, local user ID.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return null

    // 1. Check for rise_ API key
    if (token.startsWith('rise_')) {
      return await resolveUserId(token)
    }

    // 2. If token is long enough, try Supabase JWT verification
    if (token.length >= 50) {
      const supabaseUserId = await verifySupabaseToken(token)
      if (supabaseUserId) {
        return supabaseUserId
      }
    }

    // 3. Local fallback: treat token as user ID (Prisma)
    // Always try this — even if Supabase is configured, user may have
    // logged in via local fallback when Supabase was unavailable
    try {
      const { db } = await import('@/lib/db')
      const user = await db.user.findUnique({ where: { id: token } })
      if (user) return user.id
    } catch { /* ignore */ }

    return null
  } catch {
    return null
  }
}

/**
 * Get the effective user ID for a request.
 * When Supabase is configured, returns null if no valid token is provided.
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  const userId = await getUserId(req)
  if (userId) return userId
  return null
}

/** Alias */
export const optionalAuth = requireAuth