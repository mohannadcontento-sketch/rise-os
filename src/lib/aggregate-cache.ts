// ============================================================
// Per-instance TTL cache for expensive aggregate endpoints
// (dashboard/summary, productivity-score).
//
// Serverless note: this Map lives inside one function instance,
// so it is best-effort — TTL bounds staleness, and write routes
// call bustAggregateCache() so a fresh read after a mutation never
// returns pre-mutation numbers even when the instance survives.
// ============================================================

interface CacheEntry { expires: number; value: unknown }

const store = new Map<string, CacheEntry>()

// Memory bound: aggregates are small JSON objects (~KBs); 2000 entries ≈ few MB max.
const MAX_ENTRIES = 2000

// 20s (was 60s): bounds how long a DIFFERENT serverless instance can serve a
// pre-mutation payload. Instant-feel after a mutation matters more than the
// extra Supabase hops, and writes also bust per-instance + send _v from the
// client which forces a cache miss on the first read after any mutation.
export const AGGREGATE_TTL_MS = 20_000

function evictIfNeeded() {
  while (store.size >= MAX_ENTRIES) {
    // Drop the soonest-to-expire entry (approximate LRU under fixed TTL).
    let oldestKey: string | null = null
    let oldest = Infinity
    for (const [k, v] of store) {
      if (v.expires < oldest) { oldest = v.expires; oldestKey = k }
    }
    if (!oldestKey) break
    store.delete(oldestKey)
  }
}

export function getCachedAggregate<T>(key: string): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expires < Date.now()) {
    store.delete(key)
    return null
  }
  return hit.value as T
}

export function setCachedAggregate(key: string, value: unknown, ttlMs = AGGREGATE_TTL_MS) {
  evictIfNeeded()
  store.set(key, { expires: Date.now() + ttlMs, value })
}

/** Invalidate every cached aggregate belonging to this user. */
export function bustAggregateCache(userId: string) {
  const prefix = `agg:${userId}:`
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

/** Cache-or-compute helper for aggregate GET handlers. */
export async function withAggregateCache<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs = AGGREGATE_TTL_MS
): Promise<T> {
  const hit = getCachedAggregate<T>(key)
  if (hit !== null) return hit
  const value = await compute()
  setCachedAggregate(key, value, ttlMs)
  return value
}
