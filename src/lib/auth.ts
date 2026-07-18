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
    // 1. Try AppConfig
    const config = await db.appConfig.findUnique({ where: { key: 'app_user_id' } })
    if (config?.value) {
      const user = await db.user.findUnique({ where: { id: config.value } })
      if (user) {
        _appUserId = user.id
        return _appUserId!
      }
    }

    // 2. Try isDefault user
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

    // 3. Try first user
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

    // 4. Create new user
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
 * Returns null if the token is invalid or Supabase is not configured.
 */
export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !token || token.length < 50) return null

  try {
    const supabase = getSupabaseAnon()
    if (!supabase) return null

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      console.log(`[auth] token verify failed:`, error?.message)
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
 * Returns null for unauthenticated requests.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return null

    // 1. Check for rise_ API key (MCP / external access)
    if (token.startsWith('rise_')) {
      return await resolveUserId(token)
    }

    // 2. Try Supabase JWT verification
    const supabaseUserId = await verifySupabaseToken(token)
    if (supabaseUserId) {
      // Ensure local user record exists for this Supabase user
      await ensureLocalUserFromSupabase(supabaseUserId)
      return supabaseUserId
    }

    // 3. Check if this is a local user ID (simple auth for local mode)
    const stored = await db.user.findUnique({ where: { id: token } })
    return stored ? stored.id : null
  } catch {
    return null
  }
}

/**
 * Ensure a local user record exists for a Supabase user.
 * Syncs profile data from Supabase to local Prisma.
 */
async function ensureLocalUserFromSupabase(supabaseUserId: string): Promise<void> {
  try {
    const existing = await db.user.findUnique({ where: { id: supabaseUserId } })
    if (existing) return

    // Fetch profile from Supabase
    const admin = getSupabaseAdmin()
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
    console.log(`[auth] created local user for Supabase: ${supabaseUserId}`)
  } catch (err) {
    console.error('[auth] ensureLocalUserFromSupabase error:', err)
  }
}

/**
 * Get the effective user ID for a request.
 * Falls back to the app user if not authenticated.
 */
export async function requireAuth(req: NextRequest): Promise<string | null> {
  const userId = await getUserId(req)
  if (userId) return userId
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