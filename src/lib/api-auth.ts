import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCurrentAuthToken } from '@/lib/data'

/**
 * Unified authenticated-request setup for user API routes.
 * Keeps authentication and request-bound data context in one place.
 *
 * CRITICAL (Task 27 root cause): the token context MUST be bound
 * SYNCHRONOUSLY in the route's own execution context — i.e. BEFORE the
 * first await. AsyncLocalStorage.enterWith() called AFTER an await
 * (inside a resumed sub-context) does NOT propagate to the caller's
 * continuation, so the data layer's sb() saw NO token and every request
 * ran as role `anon` (RLS denied all writes; lists silently empty).
 */
export async function requireUser(req: NextRequest): Promise<string | null> {
  setCurrentAuthToken(req)
  const userId = await requireAuth(req)
  setCurrentAuthToken(req)
  return userId
}
