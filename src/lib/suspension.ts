import { getSupabaseAdmin } from '@/lib/supabase'

// ============================================================
// ADMIN PRO: account suspension with a small per-instance cache.
// requireAuth checks this on every API call — a live DB hit per
// request would be too expensive, so results cache for 5 minutes
// (serverless instances each hold their own copy; worst case a
// suspension lands everywhere within TTL).
// Graceful degradation: if migration 012 isn't applied yet, the
// column is missing → treat as NOT suspended (fail open).
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

  let value = false
  try {
    const admin = await getSupabaseAdmin()
    if (admin) {
      const { data } = await (admin as any)
        .from('profiles')
        .select('suspended')
        .eq('id', userId)
        .maybeSingle()
      value = data?.suspended === true
    }
  } catch {
    value = false // column missing (migration pending) or DB hiccup → fail open
  }

  cache.set(userId, { value, ts: Date.now() })
  return value
}
