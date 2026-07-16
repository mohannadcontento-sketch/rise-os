import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

/**
 * Extract authenticated user ID from request.
 * Returns null for unauthenticated users.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    if (!token) {
      return null
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return null
    }

    return data.user.id
  } catch {
    return null
  }
}

/**
 * Get authenticated user ID, or null if not authenticated.
 * For GET handlers: check for null and return fallback data.
 * For POST/PUT/DELETE: check for null and return 401.
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  return getUserId(req)
}

/** Alias for requireAuth — returns null for unauthenticated users. */
export const optionalAuth = requireAuth