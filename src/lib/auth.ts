import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseAdmin, getSupabaseAnon, isSupabaseConfigured, resolveUserId } from '@/lib/supabase'

// Cache the resolved app user ID per cold-start
let _appUserId: string | null | undefined = undefined

/**
 * Get or create the app user.
 * Works without any configuration — always returns a valid userId.
 */
export async function resolveAppUserId(): Promise<string> {
  if (_appUserId !== undefined) return _appUserId as string

  try {
    const config = await db.appConfig.findUnique({ where: { key: 'app_user_id' } })
    if (config?.value) {
      const user = await db.user.findUnique({ where: { id: config.value } })
      if (user) {
        _appUserId = user.id
        return _appUserId!
      }
    }

    const defaultUser = await db.user.findFirst({ where: { isDefault: true } })
    if (defaultUser) {
      _appUserId = defaultUser.id
      await db.appConfig.upsert({
        where: { key: 'app_user_id' },
        update: { value: defaultUser.id },
        create: { key: 'app_user_id', value: defaultUser.id },
      })
      return _appUserId!
    }

    const firstUser = await db.user.findFirst({ orderBy: { createdAt: 'asc' } })
    if (firstUser) {
      _appUserId = firstUser.id
      await db.appConfig.upsert({
        where: { key: 'app_user_id' },
        update: { value: firstUser.id },
        create: { key: 'app_user_id', value: firstUser.id },
      })
      return _appUserId!
    }

    const newUser = await db.user.create({
      data: {
        name: 'مستخدم RiseOS',
        email: 'riseos-app@local',
        isDefault: true,
        settings: { create: {} },
      },
    })
    _appUserId = newUser.id
    await db.appConfig.upsert({
      where: { key: 'app_user_id' },
      update: { value: newUser.id },
      create: { key: 'app_user_id', value: newUser.id },
    })
    return _appUserId!
  } catch (err) {
    console.error('[auth] resolveAppUserId error:', err)
    _appUserId = 'demo-user'
    return _appUserId
  }
}

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

    // 2. Try Supabase JWT verification
    const supabaseUserId = await verifySupabaseToken(token)
    if (supabaseUserId) {
      await ensureLocalUserFromSupabase(supabaseUserId)
      return supabaseUserId
    }

    // 3. Check if this is a local user ID
    const stored = await db.user.findUnique({ where: { id: token } })
    return stored ? stored.id : null
  } catch {
    return null
  }
}

/**
 * Ensure a local user record exists for a Supabase user.
 */
async function ensureLocalUserFromSupabase(supabaseUserId: string): Promise<void> {
  try {
    const existing = await db.user.findUnique({ where: { id: supabaseUserId } })
    if (existing) return

    const admin = await getSupabaseAdmin()
    let name = 'مستخدم RiseOS'
    let email = ''

    if (admin) {
      const { data: profile } = await admin
        .from('profiles')
        .select('name, email')
        .eq('id', supabaseUserId)
        .single()
      if (profile) {
        name = profile.name || name
        email = profile.email || email
      }
    }

    await db.user.create({
      data: {
        id: supabaseUserId,
        name,
        email: email || `${supabaseUserId}@supabase.local`,
        settings: { create: {} },
      },
    })
  } catch (err) {
    console.error('[auth] ensureLocalUserFromSupabase error:', err)
  }
}

/**
 * Get the effective user ID for a request.
 * When Supabase is configured, returns null if no valid token is provided
 * (no fallback to a default/app user).
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  const userId = await getUserId(req)
  if (userId) return userId
  // When Supabase is configured, don't fall back to a default user —
  // the client must present a valid JWT.
  if (isSupabaseConfigured()) return null
  return resolveAppUserId()
}

/** Alias */
export const optionalAuth = requireAuth

/**
 * Resolve default user ID.
 */
export async function resolveDefaultUserId(): Promise<string> {
  return resolveAppUserId()
}