/**
 * apiFetch — centralized fetch utility for RiseOS API calls.
 * Automatically attaches the Supabase auth token from localStorage.
 * Includes automatic token refresh on 401 responses.
 * Includes request timeout (8s) to fail fast when offline.
 * Includes localStorage cache for GET requests (stale-while-revalidate).
 * All frontend components should use this instead of raw fetch().
 */

// ─── Config ───
const REQUEST_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 0 // Disabled — cache causes stale data issues

// Refresh lock to prevent concurrent refresh requests
let _refreshPromise: Promise<boolean> | null = null

// ─── Online detection ───
function isOnline(): boolean {
  if (typeof window === 'undefined') return true
  return navigator.onLine !== false
}

// ─── Cache layer (localStorage) — scoped per user ───
const CACHE_PREFIX = 'rise-cache:'

interface CacheEntry {
  data: any
  ts: number
  uid: string // user id this cache belongs to
}

function getCurrentUserId(): string {
  try {
    const info = localStorage.getItem('rise-user-info')
    if (info) return JSON.parse(info).id || ''
  } catch { /* ignore */ }
  return ''
}

function getCacheKey(url: string): string {
  return CACHE_PREFIX + getCurrentUserId() + ':' + url
}

function getCached<T = any>(url: string): T | null {
  if (typeof window === 'undefined') return null
  // FIX: Cache is DISABLED (CACHE_TTL_MS = 0). Never return cached data.
  // This prevents stale data from masking newly created/updated/deleted items.
  // The cache was causing the "task disappears after creation" bug because
  // fetchData() returned the OLD cached response (without the new task)
  // instead of hitting the server.
  if (CACHE_TTL_MS <= 0) return null
  try {
    const uid = getCurrentUserId()
    if (!uid) return null // No user = no cache
    const raw = localStorage.getItem(getCacheKey(url))
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (entry.uid && entry.uid !== uid) {
      localStorage.removeItem(getCacheKey(url))
      return null
    }
    const age = Date.now() - entry.ts
    if (age < CACHE_TTL_MS) {
      return entry.data as T
    }
    localStorage.removeItem(getCacheKey(url))
    return null
  } catch {
    return null
  }
}

function setCache(url: string, data: any): void {
  if (typeof window === 'undefined') return
  if (CACHE_TTL_MS <= 0) return // Cache disabled
  const uid = getCurrentUserId()
  if (!uid) return // Don't cache without a user
  try {
    localStorage.setItem(getCacheKey(url), JSON.stringify({ data, ts: Date.now(), uid }))
  } catch {
    // localStorage full — clear old cache entries
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
      }
      // Remove oldest half
      keys.sort((a, b) => {
        const aRaw = localStorage.getItem(a) || '{}'
        const bRaw = localStorage.getItem(b) || '{}'
        return JSON.parse(aRaw).ts - JSON.parse(bRaw).ts
      })
      keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k))
      // Try again
      localStorage.setItem(getCacheKey(url), JSON.stringify({ data, ts: Date.now() }))
    } catch { /* give up */ }
  }
}

function invalidateCache(urlPrefix?: string): void {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) {
        if (!urlPrefix || key.includes(urlPrefix)) keys.push(key)
      }
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}

/** Clear ALL cached data (used on login/logout to prevent cross-user data leaks) */
export function clearAllCache(): void {
  invalidateCache() // no prefix = clear all
}

export { invalidateCache }

// ─── Data-version token (cross-instance cache busting) ───
// Serverless note: the server-side aggregate cache (aggregate-cache.ts) lives
// in ONE function instance. A write that lands on instance A cannot bust the
// cached dashboard payload on instance B, so a read after a write could serve
// stale numbers for up to the cache TTL.
// FIX: every successful write bumps a client-side version counter stored in
// localStorage; every GET sends it as &_v=. The server includes _v in the
// aggregate cache key, so the first read after ANY mutation is a guaranteed
// cache MISS → fresh compute, even on a different instance.
const DATA_VERSION_KEY = 'rise-data-version'

function getDataVersion(): string {
  try { return localStorage.getItem(DATA_VERSION_KEY) || '0' } catch { return '0' }
}

function bumpDataVersion(): void {
  try { localStorage.setItem(DATA_VERSION_KEY, String(Date.now())) } catch { /* ignore */ }
}

/**
 * Force the next GET to bypass any server-side aggregate cache.
 * Used on day rollover (useToday) so the new day never reads the old day's
 * cached payload.
 */
export function bumpDataVersionExport(): void {
  bumpDataVersion()
}

// ─── Auth helpers ───

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem('rise-auth')
    if (!stored) return {}
    const session = JSON.parse(stored)
    // FIX: Don't send Authorization header if the token is a placeholder
    // from cookie-based session restore. The real auth is in the httpOnly
    // cookie (sent via credentials:'include'). Sending a fake token in the
    // header causes the API to reject the request with 401.
    if (session.access_token && session.access_token !== 'restored-from-cookie') {
      return { 'Authorization': `Bearer ${session.access_token}` }
    }
  } catch { /* ignore parse errors */ }
  return {}
}

/**
 * Attempt to refresh the Supabase session token.
 * On failure, dispatches 'rise:session-expired' (throttled) so the
 * AuthProvider can clear the auth state and show the login page.
 */
async function tryRefreshToken(): Promise<boolean> {
  if (!isOnline()) return false
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: controller.signal,
        credentials: 'include',
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        dispatchSessionExpired()
        return false
      }

      const data = await res.json()
      if (data.session && data.user) {
        localStorage.setItem('rise-auth', JSON.stringify(data.session))
        localStorage.setItem('rise-user-info', JSON.stringify(data.user))
        window.dispatchEvent(new CustomEvent('rise:auth-refreshed', {
          detail: { user: data.user, session: data.session },
        }))
        return true
      }

      dispatchSessionExpired()
      return false
    } catch {
      return false
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

// Throttle session-expired dispatch (max once per 30s)
let _lastExpiredDispatch = 0
function dispatchSessionExpired() {
  if (typeof window === 'undefined') return
  const now = Date.now()
  if (now - _lastExpiredDispatch < 30000) return
  _lastExpiredDispatch = now
  window.dispatchEvent(new CustomEvent('rise:session-expired'))
}

// ─── Main fetch with timeout + cache ───

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {})

  // P1#3: Auth via httpOnly cookie (credentials: 'include' sends cookies automatically).
  // Fallback: Authorization header from localStorage (legacy/migration).
  const authHeaders = getAuthHeaders()
  for (const [key, value] of Object.entries(authHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value)
    }
  }

  // Set Content-Type for JSON if not already set and has body
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Create abort controller with timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Merge with any existing signal
  const existingSignal = options.signal
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  // Make the request — credentials: 'include' sends httpOnly cookies (P1#3)
  // FIX: Re-added _t=<timestamp> cache-busting for GET requests.
  // Without it, the browser returns a CACHED response (stale data) even
  // with cache: 'no-store'. This was the root cause of "data doesn't
  // update until you switch tabs and come back" — the cached response
  // didn't include the newly created item.
  let fetchUrl = url
  if (!options.method || options.method === 'GET') {
    const separator = url.includes('?') ? '&' : '?'
    fetchUrl = `${url}${separator}_t=${Date.now()}`
    // _v = data version — busts the SERVER-side aggregate cache after writes
    fetchUrl += `&_v=${getDataVersion()}`
  }

  let response: Response
  try {
    response = await fetch(fetchUrl, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'include',
      cache: 'no-store', // Never use HTTP cache for API calls
    })
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err?.name === 'AbortError') {
      // Timeout — for GET requests, try to return cached data as a synthetic response
      if (options.method === 'GET' || !options.method) {
        const cached = getCached(url)
        if (cached) {
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-From-Cache': 'true' },
          })
        }
        // FIX: Return 408 (not fake 200) when no cache — prevents components
        // from overwriting their state with empty data ({ tasks: [] } etc.)
        return new Response(JSON.stringify({ error: 'timeout', message: 'انتهت مهلة الطلب' }), {
          status: 408,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // For write requests, queue and return success
      if (options.method && options.method !== 'GET') {
        enqueueRequest(url, options.method, options.body as string | undefined)
        return new Response(JSON.stringify({ success: true, offline: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Offline-Queued': 'true' },
        })
      }
      // Return a timeout error response
      return new Response(JSON.stringify({ error: 'timeout', message: 'انتهت مهلة الطلب' }), {
        status: 408,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Network error — for GET, try cache; for writes, queue for later
    if (options.method === 'GET' || !options.method) {
      const cached = getCached(url)
      if (cached) {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-From-Cache': 'true' },
        })
      }
      // FIX: Return 503 (not fake 200) when no cache — prevents components
      // from wiping their UI with empty data on transient network errors.
      // Components check `res.ok` and skip the state update on error.
      return new Response(JSON.stringify({ error: 'network', message: 'لا يوجد اتصال' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      // POST/PUT/DELETE failed — queue for offline sync
      enqueueRequest(url, options.method || 'POST', options.body as string | undefined)
    }
    return new Response(JSON.stringify({ success: true, offline: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Offline-Queued': 'true' },
    })
  }

  clearTimeout(timeoutId)

  // Cache successful GET responses
  if (response.ok && (options.method === 'GET' || !options.method)) {
    const clone = response.clone()
    clone.json().then(data => setCache(url, data)).catch(() => {})
  }

  // Invalidate cache on successful POST/PUT/DELETE
  if (response.ok && options.method && options.method !== 'GET') {
    invalidateCache()
    bumpDataVersion() // next GET carries a new _v → server cache misses → fresh data
    // Notify all components to re-fetch their data
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rise:data-changed'))
    }
  }

  // If 401 and this is an API request, try to refresh and retry.
  // FIX: Also try refresh when there's no Authorization header (cookie-based auth).
  // Previously, 401 errors from cookie-only auth never triggered refresh,
  // causing the user to be logged out after JWT expiry.
  if (response.status === 401 && url.startsWith('/api/')) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      // Get the new auth headers after refresh
      const newAuthHeaders = getAuthHeaders()
      const retryHeaders = new Headers(options.headers || {})
      for (const [key, value] of Object.entries(newAuthHeaders)) {
        retryHeaders.set(key, value)
      }
      if (options.body && !retryHeaders.has('Content-Type')) {
        retryHeaders.set('Content-Type', 'application/json')
      }

      const retryController = new AbortController()
      const retryTimeout = setTimeout(() => retryController.abort(), REQUEST_TIMEOUT_MS)

      try {
        // Retry the request once
        response = await fetch(url, {
          ...options,
          headers: retryHeaders,
          signal: retryController.signal,
          credentials: 'include',
          cache: 'no-store',
        })

        // Cache successful retry
        if (response.ok && (options.method === 'GET' || !options.method)) {
          const clone = response.clone()
          clone.json().then(data => setCache(url, data)).catch(() => {})
        }
      } catch {
        clearTimeout(retryTimeout)
        // Retry failed — try cache for GET
        if (options.method === 'GET' || !options.method) {
          const cached = getCached(url)
          if (cached) {
            return new Response(JSON.stringify(cached), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'X-From-Cache': 'true' },
            })
          }
        }
        return response
      }
      clearTimeout(retryTimeout)
    } else {
      // Refresh failed — for GET, return cached data
      if (options.method === 'GET' || !options.method) {
        const cached = getCached(url)
        if (cached) {
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-From-Cache': 'true' },
          })
        }
      }
    }
  }

  return response
}

/**
 * Convenience wrappers
 */
export async function apiGet(url: string) {
  return apiFetch(url, { method: 'GET' })
}

export async function apiPost(url: string, body?: unknown) {
  return apiFetch(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiPut(url: string, body?: unknown) {
  return apiFetch(url, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiDelete(url: string) {
  return apiFetch(url, { method: 'DELETE' })
}

/**
 * Check if a response came from the offline cache.
 */
export function isFromCache(response: Response): boolean {
  return response.headers.get('X-From-Cache') === 'true'
}

// ─── Offline Write Queue ───
const QUEUE_KEY = 'rise-offline-queue'
const MAX_QUEUE_SIZE = 50

interface QueuedRequest {
  id: string
  url: string
  method: string
  body: string | undefined
  timestamp: number
  retries: number
}

function getQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch { return [] }
}

function saveQueue(queue: QueuedRequest[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch { /* ignore */ }
}

function enqueueRequest(url: string, method: string, body: string | undefined): void {
  const queue = getQueue()
  // FIX: a double-click while offline used to enqueue the SAME write twice
  // (twoXP awards / two creates after reconnect). Skip exact duplicates.
  if (queue.some(q => q.url === url && q.method === method && q.body === body)) return
  if (queue.length >= MAX_QUEUE_SIZE) queue.shift() // Remove oldest
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    method,
    body,
    timestamp: Date.now(),
    retries: 0,
  })
  saveQueue(queue)
}

// Give up on a queued request after this many transient failures — prevents
// an undead request from blocking the queue forever.
const MAX_QUEUE_RETRIES = 20

async function flushQueue(): Promise<void> {
  const queue = getQueue()
  if (queue.length === 0) return

  const remaining: QueuedRequest[] = []
  let changed = false // any request resolved (sent OR permanently dropped)
  const authHeaders = getAuthHeaders()

  for (const item of queue) {
    try {
      const headers = new Headers(authHeaders)
      headers.set('Content-Type', 'application/json')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const res = await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body,
        signal: controller.signal,
        // FIX: credentials:'include' is REQUIRED so the server receives the
        // httpOnly auth cookie. Without it, the server returns 401 and the
        // queued request is silently dropped — data is lost forever.
        credentials: 'include',
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        changed = true // success → remove from queue
      } else if (
        (res.status === 408 || res.status === 429 || res.status >= 500) &&
        item.retries < MAX_QUEUE_RETRIES
      ) {
        // Transient failure — retry next cycle.
        // FIX: timeouts (408) used to be REMOVED here as if they had
        // succeeded, losing the mutation even though the server may never
        // have processed it.
        remaining.push({ ...item, retries: item.retries + 1 })
      } else if (res.status === 408 || res.status === 429 || res.status >= 500) {
        console.warn(
          `[apiFetch] Dropping queued ${item.method} ${item.url} after ${item.retries} transient failures`
        )
        changed = true
      } else {
        // Permanent 4xx rejection — retrying can never succeed. Drop it,
        // log loudly, and refresh the UI so it reflects server state.
        console.error(
          `[apiFetch] Server permanently rejected queued ${item.method} ${item.url}: ${res.status}`
        )
        changed = true
      }
    } catch {
      // Network still down — retry next cycle.
      remaining.push({ ...item, retries: item.retries + 1 })
    }
  }

  saveQueue(remaining)

  // FIX: components were never told that queued writes landed, so their
  // state stayed stale until the next poll. Notify them to re-fetch.
  if (changed) {
    invalidateCache()
    bumpDataVersion() // same cross-instance bust as online writes
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rise:data-changed'))
    }
  }
}

// Auto-flush when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Small delay to let the connection stabilize
    setTimeout(flushQueue, 1000)
  })

  // Also flush on page load if online
  if (navigator.onLine) {
    setTimeout(flushQueue, 2000)
  }
}