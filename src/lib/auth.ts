import { NextRequest } from 'next/server'
import { getSupabaseAnon, isSupabaseConfigured, resolveUserId } from '@/lib/supabase'
import { db } from '@/lib/db'

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
 * Supports: Supabase JWT, rise_ API keys, and local mode (CUID as token).
 * Returns null for any unauthenticated request.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return null

    // 1. rise_ API keys — resolved via Supabase user_api_keys table
    if (token.startsWith('rise_')) {
      return await resolveUserId(token)
    }

    // 2. Supabase JWT (must be verified, never trust the token value as a user ID)
    if (token.length >= 50) {
      return await verifySupabaseToken(token)
    }

    // 3. Local mode fallback: token is a CUID (user ID) — verify it exists in local DB
    if (!isSupabaseConfigured() && token.length > 5) {
      try {
        const user = await db.user.findUnique({ where: { id: token } })
        if (user) return user.id
      } catch {
        // DB not available
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get the effective user ID for a request.
 * Returns null if no valid Supabase JWT or API key is provided.
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  return await getUserId(req)
}

/** Alias */
export const optionalAuth = requireAuth
