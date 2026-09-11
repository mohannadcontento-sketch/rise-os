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

// FIX: Create a separate rate limiter per config so each endpoint gets
// its own sliding window. Previously there was ONE shared ratelimit with
// a fixed 5/min window — the per-endpoint `limit`/`window` values in
// RATE_LIMITS were never actually used!
const ratelimiters = new Map<string, Ratelimit>()
function getRatelimiter(limit: number, window: string): Ratelimit | null {
  if (!redis) return null
  const key = `${limit}:${window}`
  if (!ratelimiters.has(key)) {
    ratelimiters.set(key, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window as any),
    }))
  }
  return ratelimiters.get(key)!
}

// Fallback in-memory limiter for dev (when Upstash env vars are not set)
interface RateBucket { count: number; resetAt: number }
const inMemoryBuckets = new Map<string, RateBucket>()
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of inMemoryBuckets.entries()) {
    if (bucket.resetAt < now) inMemoryBuckets.delete(key)
  }
}, 60_000)

function inMemoryCheck(key: string, limit: number, windowMs: number): { success: boolean; remaining: number; reset: number } {
  const now = Date.now()
  const bucket = inMemoryBuckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    inMemoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1, reset: now + windowMs }
  }
  if (bucket.count >= limit) {
    return { success: false, remaining: 0, reset: bucket.resetAt }
  }
  bucket.count++
  return { success: true, remaining: limit - bucket.count, reset: bucket.resetAt }
}

function parseWindow(window: string): number {
  const m = window.match(/^(\d+)\s*(s|m|h|d)$/)
  if (!m) return 60_000
  const n = parseInt(m[1])
  switch (m[2]) {
    case 's': return n * 1000
    case 'm': return n * 60_000
    case 'h': return n * 3_600_000
    case 'd': return n * 86_400_000
    default: return 60_000
  }
}

interface RateLimitConfig {
  limit: number
  window: string
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/auth/login': { limit: 5, window: '1 m' },
  '/api/auth/signup': { limit: 3, window: '1 m' },
  '/api/auth/refresh': { limit: 10, window: '1 m' },
  // المرحلة 03 — مسارات الحساب الحساسة (إغراق البريد / تخمين كلمة المرور)
  '/api/auth/reset-password': { limit: 3, window: '1 m' },
  '/api/auth/update-password': { limit: 5, window: '1 m' },
  '/api/auth/delete-account': { limit: 2, window: '1 m' },
  '/api/auth/logout-all': { limit: 10, window: '1 m' },
  // المرحلة 04 — طلبات الترقية وإدارة الاشتراكات
  '/api/rise/user/subscription/requests': { limit: 3, window: '1 m' },
  '/api/rise/admin/subscriptions': { limit: 20, window: '1 m' },
  // المرحلة 05 — تطبيق قالب إيميل الاستعادة (idempotent + cron يومي):
  // حد منخفض — الـcron نفسه مرة/يوم والاستدعاء اليدوي نادر.
  '/api/rise/email-template/ensure': { limit: 5, window: '1 m' },
  '/api/error-log': { limit: 30, window: '1 m' },
  '/api/rise/export': { limit: 5, window: '1 m' },
  '/api/rise/delete-all': { limit: 2, window: '1 m' },
  '/api/rise/mcp/key': { limit: 5, window: '1 m' },
  '/api/rise/mcp/call': { limit: 60, window: '1 m' },
  // المرحلة 06 — Web Push: تجربة الإرسال ضيقة عن قصد (هي إشعار
  // حقيقي يمر بالمسار الموحد)، والتسجيل متساهل عمدًا — pwa-init
  // يعيد مزامنة الاشتراك عند كل إقلاع (multi-tab = نداءات متتالية)،
  // والـupsert idempotent by endpoint فلا خطر من التكرار.
  '/api/rise/push/test': { limit: 2, window: '1 m' },
  '/api/rise/push/subscribe': { limit: 30, window: '1 m' },
  '/api/rise/push/vapid-key': { limit: 60, window: '1 m' },
  '/api/rise/user/notification-preferences': { limit: 10, window: '1 m' },
  '/api/rise/admin/query': { limit: 10, window: '1 m' },
  // FIX: Increased from 100 to 300/min for /api/rise — the dashboard is
  // fetched by multiple components (sidebar 30s poll, dashboard on mount,
  // analytics, settings) plus useDataRefresh re-fetches. 100/min was too
  // tight and caused 429 errors during normal navigation.
  '/api/rise': { limit: 300, window: '1 m' },
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

function setSecurityHeaders(res: NextResponse, nonce: string): NextResponse {
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  const isDev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co https://api.bigmodel.cn wss://*.supabase.co https://*.upstash.io",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(process.env.NODE_ENV === 'production' ? ["upgrade-insecure-requests"] : []),
  ].join('; ')

  res.headers.set('Content-Security-Policy', csp)

  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return res
}

// FIX: Add no-cache headers for API responses
function isStateChangingMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}

function isSameOriginOrAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  // Non-browser/API clients may omit Origin. Bearer-authenticated clients are
  // still protected by endpoint authentication; browser cookie requests carry Origin.
  if (!origin) return true
  try {
    const originUrl = new URL(origin)
    const allowed = new Set<string>([
      req.nextUrl.origin,
      ...(process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
    ])
    return allowed.has(originUrl.origin)
  } catch {
    return false
  }
}

function addNoCacheHeaders(res: NextResponse, pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.headers.set('Pragma', 'no-cache')
    res.headers.set('Expires', '0')
  }
  return res
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const nonce = btoa(globalThis.crypto.randomUUID())
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co https://api.bigmodel.cn wss://*.supabase.co https://*.upstash.io",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(process.env.NODE_ENV === 'production' ? ["upgrade-insecure-requests"] : []),
  ].join('; '))

  const withNonceRequest = (response: NextResponse) => {
    response.headers.set('x-nonce', nonce)
    return response
  }

  // CSRF defense for cookie-authenticated browser mutations.
  // API clients without Origin are still handled by endpoint auth / API keys.
  // Every Awj data/admin mutation must carry a client-generated stable idempotency key.
  // api-fetch.ts supplies it automatically, and the server-side store prevents replay/double-submit.
  if (pathname.startsWith('/api/rise') && isStateChangingMethod(req.method) && pathname !== '/api/rise/mcp/call') {
    const idempotencyKey = req.headers.get('Idempotency-Key')?.trim() || ''
    if (!idempotencyKey) {
      return setSecurityHeaders(
        withNonceRequest(NextResponse.json(
          { error: 'Idempotency-Key is required for state-changing requests', code: 'IDEMPOTENCY_KEY_REQUIRED' },
          { status: 428 },
        )),
        nonce,
      )
    }
  }

  if (pathname.startsWith('/api/') && isStateChangingMethod(req.method) && !isSameOriginOrAllowed(req)) {
    return setSecurityHeaders(
      withNonceRequest(NextResponse.json(
        { error: 'طلب غير موثوق المصدر', code: 'CSRF_BLOCKED' },
        { status: 403 }
      )),
      nonce,
    )
  }

  const rateConfig = matchRateLimit(pathname)
  if (rateConfig) {
    const ip = getClientIp(req)
    const rateKey = `ratelimit:${ip}:${pathname}`
    const windowMs = parseWindow(rateConfig.window)

    if (redis) {
      // Production: use Upstash Redis distributed rate limiter
      const limiter = getRatelimiter(rateConfig.limit, rateConfig.window)
      if (limiter) {
        const { success, limit, reset, remaining } = await limiter.limit(rateKey)
        if (!success) {
          const retryAfter = Math.ceil((reset - Date.now()) / 1000)
          return setSecurityHeaders(
            withNonceRequest(NextResponse.json(
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
            )),
            nonce,
          )
        }
      }
    } else {
      // Dev fallback: in-memory rate limiter
      const { success, remaining, reset } = inMemoryCheck(rateKey, rateConfig.limit, windowMs)
      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000)
        return setSecurityHeaders(
          withNonceRequest(NextResponse.json(
            { error: 'تجاوزت الحد المسموح من الطلبات. حاول لاحقاً.', code: 'RATE_LIMITED' },
            {
              status: 429,
              headers: {
                'Retry-After': String(retryAfter),
                'X-RateLimit-Limit': String(rateConfig.limit),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset),
              },
            })
          ),
          nonce,
        )
      }
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  setSecurityHeaders(res, nonce)
  res.headers.set('x-nonce', nonce)
  addNoCacheHeaders(res, pathname)
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|sw.js|manifest|robots.txt).*)',
  ],
}
