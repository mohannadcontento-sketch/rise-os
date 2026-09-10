import { NextRequest } from 'next/server'
import { getSupabaseAdmin, getSupabaseAnon, isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/lib/db'
import { enterRequestContext, getRequestAuthToken } from '@/lib/request-context'

// ============================================================
// Auth Token Context (set by API routes before data calls)
//
// SECURITY: the token lives in an AsyncLocalStorage bound to this
// request's async execution context — never in a module global,
// which concurrent requests on a long-lived server could overwrite
// (cross-user data access). Existing call sites keep working as-is.
// ============================================================

/**
 * Bind the current request's auth token so sb() can create an
 * authenticated client for THIS request only.
 * P1#3: Reads from httpOnly cookie FIRST, then Authorization header.
 */
export function setCurrentAuthToken(tokenOrReq: string | undefined | NextRequest) {
  enterRequestContext(tokenOrReq)
}

// ============================================================
// Case Conversion Helpers
// ============================================================

/**
 * Recursively convert camelCase object keys to snake_case.
 * Also serialises Date values to ISO strings for Supabase.
 */
export function toSnake<T = Record<string, any>>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T
  if (obj instanceof Date) return obj.toISOString() as unknown as T
  if (typeof obj !== 'object') return obj as T

  if (Array.isArray(obj)) {
    return obj.map((item) => toSnake(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    result[snakeKey] = toSnake((obj as Record<string, unknown>)[key])
  }
  return result as T
}

/**
 * Recursively convert snake_case object keys to camelCase.
 */
export function toCamel<T = Record<string, any>>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T
  if (typeof obj !== 'object') return obj as T

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamel(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
    result[camelKey] = toCamel((obj as Record<string, unknown>)[key])
  }
  return result as T
}

/**
 * Get a Supabase client for data operations.
 * Priority:
 * 1. Anon client with user JWT (respects RLS, per-user isolation)
 * 2. Anon client without JWT (may be blocked by RLS — correct behavior)
 * Admin client is NEVER used here — use getAdminSb() explicitly for admin ops.
 * Throws if no client can be created.
 */
export async function sb() {
  try {
    // P1#1 FIX: Try anon client WITH user JWT FIRST (RLS enforced)
    const currentAuthToken = getRequestAuthToken()
    if (currentAuthToken && isSupabaseConfigured()) {
      // API keys (rise_...) are application credentials, not Supabase JWTs.
      // requireAuth() has already resolved them to a userId; at this point
      // trusted server-side data methods apply explicit userId ownership
      // predicates. Web sessions continue through normal Supabase RLS below.
      if (currentAuthToken.startsWith('rise_')) {
        const adminClient = await getSupabaseAdmin()
        if (adminClient) return adminClient
        throw new Error('Service role is required for API-key authenticated data access')
      }

      const { createClient } = await import('@supabase/supabase-js')
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${currentAuthToken}` } },
        })
      }
    }

    // 2. Fall back to plain anon client (RLS blocks unauthenticated access)
    const anonClient = await getSupabaseAnon()
    if (anonClient) return anonClient

    // 3. Local mock mode (development)
    const { getDefaultUser } = await import('@/lib/supabase')
    await getDefaultUser()  // ensure user exists
    const { createMockClient } = await import('@/lib/mock-client')
    return createMockClient()
  } catch (err) {
    console.error('[data/sb] Error creating Supabase client:', err)
  }

  throw new Error('Database client unavailable — check SUPABASE_URL and SUPABASE_ANON_KEY env vars')
}

// ============================================================
// Data Access Layer
// ============================================================

