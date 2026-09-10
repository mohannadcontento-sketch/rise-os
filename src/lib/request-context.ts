import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextRequest } from 'next/server'

/**
 * Per-request auth-token context.
 *
 * Replaces the old module-level `_currentAuthToken` global in data.ts,
 * which could leak one user's token into a concurrently-executing
 * request on a long-lived server (output: "standalone").
 *
 * `enterWith` binds the token to the current async execution context, so
 * every await/closure downstream of the call site (i.e., the rest of the
 * route handler) sees its own request's token and nothing else.
 */

interface RequestContext {
  authToken?: string
}

// CRITICAL FIX (Task 27): the server bundle can contain MULTIPLE instances of
// this module (Turbopack chunk duplication across import graphs). Each copy
// would otherwise own a SEPARATE AsyncLocalStorage, so the token bound by
// requireUser() was invisible to the data layer's sb() — every request then
// ran as role `anon` (RLS denied all writes, lists came back empty).
// Sharing ONE storage instance via globalThis makes the context identical
// for every module copy. Same pattern as the Prisma global singleton.
const globalForRequestContext = globalThis as typeof globalThis & {
  __riseRequestContextStorage?: AsyncLocalStorage<RequestContext>
}

const storage: AsyncLocalStorage<RequestContext> =
  globalForRequestContext.__riseRequestContextStorage ??
  (globalForRequestContext.__riseRequestContextStorage = new AsyncLocalStorage<RequestContext>())

export function extractRequestToken(
  tokenOrReq: string | undefined | NextRequest
): string | undefined {
  if (typeof tokenOrReq === 'string') return tokenOrReq || undefined

  if (tokenOrReq && typeof tokenOrReq === 'object' && 'cookies' in tokenOrReq) {
    const req = tokenOrReq as NextRequest
    const cookieToken = req.cookies.get('rise-access')?.value
    if (cookieToken) return cookieToken
    return req.headers.get('Authorization')?.replace('Bearer ', '') || undefined
  }

  return (tokenOrReq as string | undefined) || undefined
}

/** Bind this request's token to the current async context (call once per handler entry). */
export function enterRequestContext(
  tokenOrReq: string | undefined | NextRequest
): void {
  storage.enterWith({ authToken: extractRequestToken(tokenOrReq) })
}

/** The current request's auth token, or undefined outside any request context. */
export function getRequestAuthToken(): string | undefined {
  return storage.getStore()?.authToken
}
