import { NextRequest } from 'next/server'
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase'

const DEMO_USER_ID = 'demo-user'

// Cache the resolved default user ID per cold-start
let _resolvedDefaultUserId: string | null | undefined = undefined // undefined = not resolved yet

/**
 * Resolve the default user ID for demo/MCP mode.
 * Priority:
 * 1. RISE_DEFAULT_USER_ID env var (real Supabase user UUID)
 * 2. User table with isDefault = true column
 * 3. First user in User table (fallback)
 * 4. 'demo-user' (last resort)
 */
export async function resolveDefaultUserId(): Promise<string> {
  // Return cached value if already resolved
  if (_resolvedDefaultUserId !== undefined) return _resolvedDefaultUserId as string

  // 1. Check env var first (highest priority — set in Vercel)
  const envUserId = process.env.RISE_DEFAULT_USER_ID
  if (envUserId && envUserId !== 'demo-user' && envUserId !== 'dev-user') {
    _resolvedDefaultUserId = envUserId
    console.log(`[auth] Default user from env: ${envUserId}`)
    return envUserId
  }

  // 2. Try to find from database
  try {
    const admin = getSupabaseAdmin()
    if (admin) {
      // Try isDefault column first
      const { data: defaultUser } = await admin
        .from('User')
        .select('id')
        .eq('isDefault', true)
        .limit(1)
        .single()

      if (defaultUser?.id) {
        _resolvedDefaultUserId = defaultUser.id as string
        console.log(`[auth] Default user from DB (isDefault): ${defaultUser.id}`)
        return defaultUser.id as string
      }

      // 3. Fallback: first user in the table
      const { data: firstUser } = await admin
        .from('User')
        .select('id')
        .limit(1)
        .single()

      if (firstUser?.id) {
        _resolvedDefaultUserId = firstUser.id as string
        console.log(`[auth] Default user from DB (first): ${firstUser.id}`)
        return firstUser.id as string
      }
    }
  } catch (err) {
    console.error('[auth] resolveDefaultUserId DB error:', err)
  }

  // 4. Last resort
  _resolvedDefaultUserId = DEMO_USER_ID
  console.log('[auth] Default user: demo-user (no real user found)')
  return DEMO_USER_ID
}

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
 * - If no auth → resolves the default user ID (from env, DB, or demo-user)
 *
 * This never returns null — the app is always usable.
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  // Try real auth first
  const userId = await getUserId(req)
  if (userId) return userId

  // No auth → resolve default user (env var > DB isDefault > first user > demo-user)
  return resolveDefaultUserId()
}

/** Alias for requireAuth — returns null for unauthenticated users. */
export const optionalAuth = requireAuth