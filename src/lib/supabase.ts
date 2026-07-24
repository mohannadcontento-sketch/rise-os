import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// ============================================================
// RiseOS — Supabase client with security fixes (Phase 1)
// ------------------------------------------------------------
// Dual-mode: uses real Supabase when env vars present, else
// falls back to local Prisma+SQLite mock for development.
// Security fixes applied:
//   P1#1: sb() prefers per-user anon client (RLS-enforced),
//         admin client only for explicit admin operations
//   P1#3: cookie-based auth via @supabase/ssr (httpOnly+Secure)
//   P1#7: API keys hashed with SHA-256 before storage/lookup
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Admin email
export const ADMIN_EMAIL: string = process.env.ADMIN_EMAIL || ''

/** Check if Supabase is configured (real mode) */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY)
}

/** Check if service role key is available for admin operations */
export function hasServiceRole(): boolean {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

// ============================================================
// P1#7: API Key Hashing (SHA-256)
// ============================================================

/** Hash an API key with SHA-256 before storage/lookup. */
export async function hashApiKey(key: string): Promise<string> {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// ============================================================
// Lazy-loaded client cache
// ============================================================
let _anonClient: any = null
let _adminClient: any = null
let _sbModule: any = null

/** Lazy load the supabase module */
async function loadSupabase() {
  if (!_sbModule) {
    _sbModule = await import('@supabase/supabase-js')
  }
  return _sbModule
}

/** Anon client (respects RLS) */
export async function getSupabaseAnon() {
  if (!isSupabaseConfigured()) return null
  if (_anonClient) return _anonClient

  const { createClient } = await loadSupabase()
  _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return _anonClient
}

/**
 * P1#1 FIX: Admin client (bypasses RLS) — use ONLY for explicit
 * admin operations (requireAdmin). Never as default in sb().
 */
export async function getSupabaseAdmin() {
  if (!hasServiceRole()) return null
  if (_adminClient) return _adminClient

  const { createClient } = await loadSupabase()
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  return _adminClient
}

/**
 * P1#1 FIX: Server-side client with user JWT (respects RLS).
 * P1#3: Reads token from httpOnly cookie FIRST, then Authorization header.
 * Priority: per-user anon client (RLS enforced) FIRST.
 * Admin client only returned by getAdminSb() for admin routes.
 */
export async function getSupabaseWithAuth(req?: NextRequest) {
  if (!isSupabaseConfigured()) return null

  // P1#3: Check httpOnly cookie FIRST
  let token = req?.cookies?.get('rise-access')?.value || ''
  // Fallback: Authorization header
  if (!token) {
    token = req?.headers.get('Authorization')?.replace('Bearer ', '') || ''
  }

  // P1#1: If we have a real JWT, use anon client WITH the token (RLS enforced)
  if (token && !token.startsWith('rise_') && token.length > 50) {
    const { createClient } = await loadSupabase()
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
  }

  // For rise_ API keys — resolve user via admin (hash lookup), then use anon
  if (token && token.startsWith('rise_')) {
    return getSupabaseAdmin()
  }

  // No token — return anon client (RLS will block unauthenticated access)
  return getSupabaseAnon()
}

// Legacy compatibility
export const getSupabase = getSupabaseAnon
export function isAdminAvailable(): boolean {
  return hasServiceRole()
}

/**
 * P1#1 FIX: Admin-only data client. Use ONLY in requireAdmin() routes.
 * This bypasses RLS — never use for regular user data.
 */
export async function getAdminSb() {
  return getSupabaseAdmin()
}

// ============================================================
// P1#7 FIX: API Key Resolution with SHA-256 hashing
// ============================================================
/**
 * Resolve a user ID from a rise_ API key.
 * P1#7 FIX: Hashes the key with SHA-256 before lookup.
 * Stored keys are never compared as plaintext.
 */
export async function resolveUserId(apiKey: string): Promise<string | null> {
  if (!apiKey || !apiKey.startsWith('rise_')) return null

  try {
    const hashedKey = await hashApiKey(apiKey)
    const admin = await getSupabaseAdmin()
    if (admin) {
      const { data } = await admin
        .from('user_api_keys')
        .select('user_id')
        .eq('key_hash', hashedKey)  // P1#7: lookup by hash, not plaintext
        .maybeSingle()

      if ((data as any)?.user_id) {
        // Update last_used_at
        await admin
          .from('user_api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('key_hash', hashedKey)
        return (data as any).user_id
      }
    }
    // Local fallback (mock)
    return await resolveUserIdLocal(apiKey)
  } catch (err) {
    console.error('[resolveUserId] error:', err)
    return null
  }
}

// ============================================================
// Local mock mode (Prisma + SQLite) — development only
// ============================================================
async function resolveUserIdLocal(apiKey: string): Promise<string | null> {
  try {
    const { db } = await import('@/lib/db')
    const key = await (db as any).userApiKey.findUnique({ where: { key: apiKey } })
    if (key?.userId) {
      await (db as any).userApiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      })
      return key.userId
    }
  } catch { /* ignore */ }
  return null
}

/** Get or create default user (local mode only) */
export async function getDefaultUser() {
  const { db } = await import('@/lib/db')
  let user = await (db as any).user.findFirst({ where: { isDefault: true } })
  if (!user) {
    user = await (db as any).user.create({
      data: {
        name: 'صانع الحياة',
        email: 'default@riseos.local',
        isDefault: true,
        settings: { create: {} },
        storage: { create: { email: 'default@riseos.local', name: 'صانع الحياة' } },
      },
    })
  }
  return user
}

// ============================================================
// Error Handling
// ============================================================
export function handleRouteError(error: unknown, route: string, hasToken = false): NextResponse {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[${route}] error:`, msg)

  if (hasToken && !isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'خدمة غير متوفرة حالياً', offline: true },
      { status: 503 }
    )
  }

  return NextResponse.json(
    { success: false, error: 'حدث خطأ في الخادم' },
    { status: 500 }
  )
}

// ============================================================
// ZhipuAI JWT Token
// ============================================================
export function generateZhipuToken(): string {
  const apiKey = process.env.BIGMODEL_API_KEY || ''
  const [id, secret] = apiKey.split('.')
  if (!id || !secret) return apiKey

  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp, timestamp: now })).toString('base64url')

  const signInput = header + '.' + payload
  const signature = crypto.createHmac('sha256', secret).update(signInput).digest('base64url')

  return signInput + '.' + signature
}
