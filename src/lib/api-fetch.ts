/**
 * apiFetch — centralized fetch utility for RiseOS API calls.
 * Automatically attaches the Supabase auth token from localStorage.
 * Includes automatic token refresh on 401 responses.
 * All frontend components should use this instead of raw fetch().
 */

// Refresh lock to prevent concurrent refresh requests
let _refreshPromise: Promise<boolean> | null = null

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem('rise-auth')
    if (!stored) return {}
    const session = JSON.parse(stored)
    if (session.access_token) {
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
  // If a refresh is already in progress, wait for it
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    try {
      const stored = localStorage.getItem('rise-auth')
      if (!stored) return false

      const session = JSON.parse(stored)
      const isSupabaseSession = session.refresh_token && session.refresh_token.length > 20

      if (!isSupabaseSession) {
        // Local mode — just clear and redirect to login
        clearAuth()
        return false
      }

      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      })

      if (!res.ok) {
        clearAuth()
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

      clearAuth()
      return false
    } catch {
      clearAuth()
      return false
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

function clearAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('rise-auth')
  localStorage.removeItem('rise-user-info')
  // Dispatch logout event so the app can react
  window.dispatchEvent(new CustomEvent('rise:session-expired'))
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {})

  // Add auth header
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

  // Make the request
  let response = await fetch(url, {
    ...options,
    headers,
  })

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

      // Retry the request once
      response = await fetch(url, {
        ...options,
        headers: retryHeaders,
      })
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