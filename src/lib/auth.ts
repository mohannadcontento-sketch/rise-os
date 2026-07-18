import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

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
 * Extract authenticated user ID from request.
 * Returns null for unauthenticated requests.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return null
    if (token.startsWith('rise_')) return null

    // Check if this is a valid user ID stored locally (simple auth for local mode)
    const stored = await db.user.findUnique({ where: { id: token } })
    return stored ? stored.id : null
  } catch {
    return null
  }
}

/**
 * Get the effective user ID for a request.
 * In local mode, always returns the app user.
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