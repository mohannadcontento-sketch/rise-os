/**
 * apiFetch — centralized fetch utility for RiseOS API calls.
 * Automatically attaches the Supabase auth token from localStorage.
 * All frontend components should use this instead of raw fetch().
 */

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem('rise-auth')
    if (!stored) return {}
    const session = JSON.parse(stored)
    if (session.access_token && session.access_token !== 'guest') {
      return { 'Authorization': `Bearer ${session.access_token}` }
    }
  } catch { /* ignore parse errors */ }
  return {}
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

  return fetch(url, {
    ...options,
    headers,
  })
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