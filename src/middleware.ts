import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// P1#10: Security headers middleware (CSP, HSTS, X-Frame-Options)
// P1#6: Rate limiting (in-memory, Redis optional via env)
// ============================================================

// ─── P1#6: In-memory rate limiter ───
// For production with Redis, set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// and use @upstash/ratelimit. This in-memory limiter works for single-instance deploys.

interface RateBucket {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateBucket>()

// Clean expired entries every 60s
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateLimitMap.entries()) {
    if (bucket.resetAt < now) rateLimitMap.delete(key)
  }
}, 60_000)

interface RateLimitConfig {
  limit: number
  windowMs: number
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Auth endpoints: 5 requests per minute (brute force protection)
  '/api/auth/login': { limit: 5, windowMs: 60_000 },
  '/api/auth/signup': { limit: 3, windowMs: 60_000 },
  '/api/auth/refresh': { limit: 10, windowMs: 60_000 },
  // AI chat: 20 requests per hour (expensive resource)
  '/api/rise/ai-chat': { limit: 20, windowMs: 3_600_000 },
  // General API: 100 requests per minute
  '/api/rise': { limit: 100, windowMs: 60_000 },
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}

function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const bucket = rateLimitMap.get(key)

  if (!bucket || bucket.resetAt < now) {
    // New window
    rateLimitMap.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowMs }
  }

  if (bucket.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
  }

  bucket.count++
  return { allowed: true, remaining: config.limit - bucket.count, resetAt: bucket.resetAt }
}

function matchRateLimit(pathname: string): RateLimitConfig | null {
  // Try exact match first
  if (RATE_LIMITS[pathname]) return RATE_LIMITS[pathname]
  // Try prefix match (longest first)
  for (const prefix of Object.keys(RATE_LIMITS).sort((a, b) => b.length - a.length)) {
    if (pathname.startsWith(prefix)) return RATE_LIMITS[prefix]
  }
  return null
}

// ─── P1#10: Security headers ───
function setSecurityHeaders(res: NextResponse): NextResponse {
  // HSTS: force HTTPS for 1 year (production only)
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  // CSP: restrict resource loading
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.supabase.co https://api.bigmodel.cn wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  )

  // Prevent MIME type sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff')

  // Prevent clickjacking
  res.headers.set('X-Frame-Options', 'DENY')

  // XSS protection (legacy browsers)
  res.headers.set('X-XSS-Protection', '1; mode=block')

  // Referrer policy
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions policy
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return res
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── P1#6: Rate limiting ──
  const rateConfig = matchRateLimit(pathname)
  if (rateConfig) {
    const ip = getClientIp(req)
    const rateKey = `${ip}:${pathname}`
    const result = checkRateLimit(rateKey, rateConfig)

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
      return setSecurityHeaders(
        NextResponse.json(
          { error: 'تجاوزت الحد المسموح من الطلبات. حاول لاحقاً.', code: 'RATE_LIMITED' },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(rateConfig.limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(result.resetAt),
            },
          }
        )
      )
    }
  }

  // ── P1#10: Apply security headers to all responses ──
  const res = NextResponse.next()
  setSecurityHeaders(res)

  // Add rate limit info headers
  if (rateConfig) {
    const ip = getClientIp(req)
    const rateKey = `${ip}:${pathname}`
    const bucket = rateLimitMap.get(rateKey)
    if (bucket) {
      res.headers.set('X-RateLimit-Limit', String(rateConfig.limit))
      res.headers.set('X-RateLimit-Remaining', String(Math.max(0, rateConfig.limit - bucket.count)))
      res.headers.set('X-RateLimit-Reset', String(bucket.resetAt))
    }
  }

  return res
}

export const config = {
  matcher: [
    // Apply to all API routes and pages except static assets
    '/((?!_next/static|_next/image|favicon.ico|icon|sw.js|manifest|robots.txt).*)',
  ],
}
