import crypto from 'node:crypto'

const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60

// The mock authentication path is strictly for local development/tests.
// A process-local secret is intentionally used as a safe fallback so a
// misconfigured production deployment cannot gain a known signing secret.
let processSecret: string | null = null

export function isMockAuthEnabled(): boolean {
  return (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    && !process.env.NEXT_PUBLIC_SUPABASE_URL
    && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

function getSigningSecret(): string {
  if (process.env.MOCK_AUTH_SECRET) return process.env.MOCK_AUTH_SECRET
  if (!processSecret) processSecret = crypto.randomBytes(32).toString('hex')
  return processSecret! 
}

function safeEqualText(a: string, b: string): boolean {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb)
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url')
}

function createToken(kind: 'access' | 'refresh', userId: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const ttl = kind === 'access' ? ACCESS_TTL_SECONDS : REFRESH_TTL_SECONDS
  const exp = nowSeconds + ttl
  const payload = `local.v2.${kind}.${userId}.${exp}`
  return `${payload}.${sign(payload)}`
}

function verifyToken(token: string, kind: 'access' | 'refresh'): { userId: string; exp: number } | null {
  const match = token.match(/^local\.v2\.(access|refresh)\.([A-Za-z0-9_-]+)\.(\d+)\.([A-Za-z0-9_-]+)$/)
  if (!match || match[1] !== kind) return null

  const userId = match[2]
  const exp = Number(match[3])
  if (!Number.isSafeInteger(exp) || exp <= Math.floor(Date.now() / 1000)) return null

  const payload = `local.v2.${kind}.${userId}.${exp}`
  const expected = sign(payload)
  if (!safeEqualText(match[4], expected)) return null

  return { userId, exp }
}

export function createMockAccessToken(userId: string): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS
  return { token: createToken('access', userId, Math.floor(Date.now() / 1000)), expiresAt }
}

export function createMockRefreshToken(userId: string): string {
  return createToken('refresh', userId)
}

export function verifyMockAccessToken(token: string): { userId: string; exp: number } | null {
  return verifyToken(token, 'access')
}

export function verifyMockRefreshToken(token: string): { userId: string; exp: number } | null {
  return verifyToken(token, 'refresh')
}

export function hashMockPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('base64url')
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  }).toString('base64url')
  return `scrypt$16384$8$1$${salt}$${derivedKey}`
}

export function verifyMockPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false
  const parts = storedHash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = parts[4]
  const expected = parts[5]
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || !salt || !expected) return false

  try {
    const derived = crypto.scryptSync(password, salt, 64, {
      N: n,
      r,
      p,
      maxmem: 32 * 1024 * 1024,
    }).toString('base64url')
    return safeEqualText(derived, expected)
  } catch {
    return false
  }
}

export function assertMockAuthEnabled(): void {
  if (!isMockAuthEnabled()) {
    throw new Error('Mock authentication is disabled outside non-production local mode')
  }
}
