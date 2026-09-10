import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCurrentAuthToken } from '@/lib/data'

/**
 * Unified authenticated-request setup for user API routes.
 * Keeps authentication and request-bound data context in one place.
 */
export async function requireUser(req: NextRequest): Promise<string | null> {
  const userId = await requireAuth(req)
  setCurrentAuthToken(req)
  return userId
}
