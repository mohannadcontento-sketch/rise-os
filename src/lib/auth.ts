import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const DEMO_USER_ID = 'demo-user'

/**
 * Check if Supabase is configured and available.
 */
function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

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
 * Get authenticated user ID.
 * - If authenticated → returns real user ID
 * - If Supabase not configured (Vercel demo) → returns demo user ID
 * - If Supabase configured but no auth → returns null (real auth required)
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  // Try real auth first
  const userId = await getUserId(req)
  if (userId) return userId

  // Supabase not configured → return demo user so the app works as a demo
  if (!isSupabaseConfigured()) {
    return DEMO_USER_ID
  }

  // Supabase IS configured but user isn't authed → return null
  return null
}

/** Alias for requireAuth — returns null for unauthenticated users. */
export const optionalAuth = requireAuth