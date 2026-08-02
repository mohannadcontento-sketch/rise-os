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
 * Returns true if refresh succeeded, false otherwise.
 * Uses a lock to prevent concurrent refreshes.
 */
async function tryRefreshToken(): Promise<boolean> {
  if (!isOnline()) return false
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    try {
      const stored = localStorage.getItem('rise-auth')
      const refreshToken = stored ? JSON.parse(stored).refresh_token : undefined

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
        signal: controller.signal,
        credentials: 'include',
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        // FIX: Do NOT call clearAuth() on refresh failure.
        // The httpOnly cookie (rise-access) is still valid for 7 days and
        // the mock token format never expires from the API's perspective.
        // Calling clearAuth() here was prematurely logging users out and
        // causing tasks to "disappear" (the UI lost auth state even though
        // the backend would still accept the cookie).
        return false
      }

      const data = await res.json()
      if (data.session && data.user) {
        localStorage.setItem('rise-auth', JSON.stringify(data.session))
        localStorage.setItem('rise-user-info', JSON.stringify(data.user))

        // Dispatch event so Zustand store can update
        window.dispatchEvent(new CustomEvent('rise:auth-refreshed', {
          detail: { user: data.user, session: data.session },
        }))

        return true
      }

      // FIX: Don't clearAuth() here either — just return false.
      // The cookie may still be valid even if the refresh response is malformed.
      return false
    } catch {
      // Network error or timeout — don't clear auth, keep stored session
      return false
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

function clearAuth() {
  if (typeof window === 'undefined') return
  // Clear all cached data for this user to prevent cross-user data leaks
  invalidateCache()
  localStorage.removeItem('rise-auth')
  localStorage.removeItem('rise-user-info')
  // Dispatch logout event so the app can react
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
    // Notify all components to re-fetch their data
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rise:data-changed'))
    }
  }

  // If 401 and this is an API request, try to refresh and retry
  if (response.status === 401 && url.startsWith('/api/') && authHeaders['Authorization']) {
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

async function flushQueue(): Promise<void> {
  const queue = getQueue()
  if (queue.length === 0) return

  const remaining: QueuedRequest[] = []
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

      if (!res.ok && res.status !== 408) {
        remaining.push({ ...item, retries: item.retries + 1 })
      }
      // Success or timeout → remove from queue
    } catch {
      remaining.push({ ...item, retries: item.retries + 1 })
    }
  }

  saveQueue(remaining)

  // If all succeeded and we had items, invalidate GET cache to refresh
  if (remaining.length === 0 && queue.length > 0) {
    invalidateCache()
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