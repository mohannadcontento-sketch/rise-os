import { NextRequest } from 'next/server'
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase'

// Cache the resolved app user ID per cold-start
let _appUserId: string | null | undefined = undefined // undefined = not resolved yet

/**
 * Get or create the app user via Supabase RPC.
 * This calls get_or_create_app_user() which:
 * 1. Checks AppConfig table for stored user ID
 * 2. Checks User table for isDefault = true
 * 3. Falls back to first user in User table
 * 4. Creates a new user if none exists
 *
 * Zero configuration needed — works out of the box.
 */
export async function resolveAppUserId(): Promise<string> {
  if (_appUserId !== undefined) return _appUserId as string

  try {
    const admin = getSupabaseAdmin()
    if (admin) {
      // Call the stored function — it handles everything
      const { data, error } = await admin.rpc('get_or_create_app_user')

      if (!error && data) {
        _appUserId = data as string
        console.log(`[auth] App user resolved: ${_appUserId}`)
        return _appUserId!
      }
      console.error('[auth] RPC get_or_create_app_user error:', error)
    }
  } catch (err) {
    console.error('[auth] resolveAppUserId error:', err)
  }

  // Fallback: query directly (if RPC not available yet / migration not run)
  try {
    const admin = getSupabaseAdmin()
    if (admin) {
      // Try isDefault
      const { data: defaultUser } = await admin
        .from('User')
        .select('id')
        .eq('isDefault', true)
        .limit(1)
        .single()

      if (defaultUser?.id) {
        _appUserId = defaultUser.id as string
        console.log(`[auth] App user from DB (isDefault): ${_appUserId}`)
        return _appUserId!
      }

      // Try first user
      const { data: firstUser } = await admin
        .from('User')
        .select('id')
        .limit(1)
        .single()

      if (firstUser?.id) {
        _appUserId = firstUser.id as string
        console.log(`[auth] App user from DB (first): ${_appUserId}`)
        return _appUserId!
      }
    }
  } catch (err) {
    console.error('[auth] fallback user lookup error:', err)
  }

  // Absolute last resort
  _appUserId = 'demo-user'
  console.log('[auth] WARNING: Using demo-user fallback (run supabase-migration-api-users.sql)')
  return _appUserId
}

/**
 * Extract authenticated user ID from request (real JWT).
 * Returns null for unauthenticated requests.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    if (!token) return null
    if (token.startsWith('rise_')) return null // API key, not JWT

    const supabase = getSupabase()
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

/**
 * Get the effective user ID for a request.
 * - Real JWT → use that user
 * - No auth → resolve app user from DB (auto-created if needed)
 *
 * This never returns null — the app always has a user.
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  // 1. Real auth
  const userId = await getUserId(req)
  if (userId) return userId

  // 2. API-managed user (auto-created on first call)
  return resolveAppUserId()
}

/** Alias */
export const optionalAuth = requireAuth

/**
 * Resolve default user ID (for MCP compatibility).
 * Same as resolveAppUserId.
 */
export async function resolveDefaultUserId(): Promise<string> {
  return resolveAppUserId()
}