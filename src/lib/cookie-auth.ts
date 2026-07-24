import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// P1#3 FIX: Cookie-based auth helpers (httpOnly + Secure + SameSite)
// ------------------------------------------------------------
// Tokens stored in httpOnly cookies — not accessible to JavaScript
// (protects against XSS token theft). SameSite=Lax prevents CSRF.
// ============================================================

const ACCESS_COOKIE = 'rise-access'
const REFRESH_COOKIE = 'rise-refresh'
const USER_COOKIE = 'rise-user'

const isProduction = process.env.NODE_ENV === 'production'

interface SessionData {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface UserInfo {
  id: string
  email: string
  name: string
  isAdmin?: boolean
  avatar?: string | null
}

/** Set auth cookies on a NextResponse (login/signup/refresh). */
export function setAuthCookies(
  res: NextResponse,
  session: SessionData,
  user: UserInfo
): NextResponse {
  // Access token: httpOnly (JS can't read), Secure (HTTPS only), SameSite=Lax (CSRF)
  res.cookies.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  })

  // Refresh token: httpOnly, longer lived
  res.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  // User info: readable by JS (for UI), NOT httpOnly
  res.cookies.set(USER_COOKIE, JSON.stringify(user), {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  })

  return res
}

/** Clear auth cookies on logout. */
export function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.delete(ACCESS_COOKIE)
  res.cookies.delete(REFRESH_COOKIE)
  res.cookies.delete(USER_COOKIE)
  return res
}

/** Read access token from request (cookie first, fallback to Authorization header). */
export function getAccessToken(req: NextRequest): string | null {
  // P1#3: Prefer httpOnly cookie
  const cookieToken = req.cookies.get(ACCESS_COOKIE)?.value
  if (cookieToken) return cookieToken

  // Fallback: Authorization header (for API keys + legacy clients)
  const authHeader = req.headers.get('Authorization') || ''
  const headerToken = authHeader.replace('Bearer ', '')
  if (headerToken) return headerToken

  return null
}

/** Read refresh token from request cookies. */
export function getRefreshToken(req: NextRequest): string | null {
  return req.cookies.get(REFRESH_COOKIE)?.value || null
}

/** Read user info from cookie (client-readable). */
export function getUserFromCookie(req: NextRequest): UserInfo | null {
  const raw = req.cookies.get(USER_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

/** Build Authorization header value from cookie for internal API calls. */
export function getAuthHeader(req: NextRequest): string {
  const token = getAccessToken(req)
  return token ? `Bearer ${token}` : ''
}
