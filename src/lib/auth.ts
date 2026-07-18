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
  } catch (err) {
    console.error('[auth] verifySupabaseToken error:', err)
    return null
  }
}

/**
 * Extract authenticated user ID from request.
 * Supports: Supabase JWT, rise_ API key.
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

    // 2. Try Supabase JWT verification
    const supabaseUserId = await verifySupabaseToken(token)
    if (supabaseUserId) {
      return supabaseUserId
    }

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
  if (isSupabaseConfigured()) return null
  return null
}

/** Alias */
export const optionalAuth = requireAuth