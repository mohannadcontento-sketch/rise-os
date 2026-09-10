import { getSupabaseAdmin } from '@/lib/supabase'

// ============================================================
// ADMIN PRO: account suspension with a small per-instance cache.
// requireAuth checks this on every API call — a live DB hit per
// request would be too expensive, so results cache for 5 minutes
// (serverless instances each hold their own copy; worst case a
// suspension lands everywhere within TTL).
// SECURITY: suspension is an authorization check, so database errors
// MUST fail closed. A missing migration or unavailable DB must never
// silently turn a suspended account into an active account.
// ============================================================

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { value: boolean; ts: number }>()

export function bustSuspensionCache(userId?: string): void {
  if (userId) cache.delete(userId)
  else cache.clear()
}

export async function isUserSuspended(userId: string): Promise<boolean> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value

  try {
    const admin = await getSupabaseAdmin()
    if (!admin) throw new Error('Suspension check unavailable: Supabase admin client is not configured')

    const { data, error } = await (admin as any)
      .from('profiles')
      .select('suspended')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw new Error(`Suspension check failed: ${error.message}`)
    const value = data?.suspended === true
    cache.set(userId, { value, ts: Date.now() })
    return value
  } catch (error) {
    console.error('[suspension] fail-closed:', error)
    throw error
  }
}
