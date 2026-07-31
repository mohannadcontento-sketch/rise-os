import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ============================================================
// P1#6: Rate limiting (Upstash Redis for distributed serverless)
// P1#10: Security headers middleware
// ============================================================

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 m'), // Default: 5 requests per minute
    })
  : null

interface RateLimitConfig {
  limit: number
  window: string
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/auth/login': { limit: 5, window: '1 m' },
  '/api/auth/signup': { limit: 3, window: '1 m' },
  '/api/auth/refresh': { limit: 10, window: '1 m' },
  '/api/rise/ai-chat': { limit: 20, window: '1 h' },
  '/api/rise': { limit: 100, window: '1 m' },
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}

function matchRateLimit(pathname: string): RateLimitConfig | null {
  if (RATE_LIMITS[pathname]) return RATE_LIMITS[pathname]
  for (const prefix of Object.keys(RATE_LIMITS).sort((a, b) => b.length - a.length)) {
    if (pathname.startsWith(prefix)) return RATE_LIMITS[prefix]
  }
  return null
}

function setSecurityHeaders(res: NextResponse): NextResponse {
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Removed 'unsafe-eval' for better security
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.supabase.co https://api.bigmodel.cn wss://*.supabase.co https://*.upstash.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  )

  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return res
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const rateConfig = matchRateLimit(pathname)
  if (rateConfig && ratelimit) {
    const ip = getClientIp(req)
    const rateKey = `ratelimit:${ip}:${pathname}`
    const { success, limit, reset, remaining } = await ratelimit.limit(rateKey)

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000)
      return setSecurityHeaders(
        NextResponse.json(
          { error: 'تجاوزت الحد المسموح من الطلبات. حاول لاحقاً.', code: 'RATE_LIMITED' },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Reset': String(reset),
            },
          }
        )
      )
    }
  }

  const res = NextResponse.next()
  setSecurityHeaders(res)
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|sw.js|manifest|robots.txt).*)',
  ],
}
