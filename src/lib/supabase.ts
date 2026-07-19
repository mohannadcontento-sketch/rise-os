import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// ============================================================
// Supabase Client Management (lazy loading to avoid build errors)
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Admin email
export const ADMIN_EMAIL: string = process.env.ADMIN_EMAIL || ''

/** Check if Supabase is configured */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY)
}

/** Check if service role key is available for admin operations */
export function hasServiceRole(): boolean {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

// Lazy-loaded client cache
let _anonClient: ReturnType<typeof import('@supabase/supabase-js').createClient> | null = null
let _adminClient: ReturnType<typeof import('@supabase/supabase-js').createClient> | null = null
let _sbModule: typeof import('@supabase/supabase-js') | null = null

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

/** Admin client (bypasses RLS) */
export async function getSupabaseAdmin() {
  if (!hasServiceRole()) return null
  if (_adminClient) return _adminClient

  const { createClient } = await loadSupabase()
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  return _adminClient
}

/**
 * Server-side client with user JWT (respects RLS).
 * - Real JWT token → anon client with user's token (RLS enforced per user)
 * - rise_ API key → admin client to resolve user, then anon client with that user
 * - No token → anon client only (never admin — prevents RLS bypass)
 */
export async function getSupabaseWithAuth(req?: NextRequest) {
  if (!isSupabaseConfigured()) return null

  const token = req?.headers.get('Authorization')?.replace('Bearer ', '') || ''

  // If we have a real JWT token (from Supabase Auth), use it with anon client
  if (token && !token.startsWith('rise_') && token.length > 50) {
    const { createClient } = await loadSupabase()
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })
  }

  // For rise_ API keys — resolve user ID first, then return anon client with that user's context
  if (token && token.startsWith('rise_')) {
    // Return admin client so the route can do user_api_keys lookup
    // The route MUST switch to anon+userId after resolving the API key
    return getSupabaseAdmin()
  }

  // No token at all — return anon client (never admin, to prevent RLS bypass)
  return getSupabaseAnon()
}

// ── Legacy compatibility ──
export const getSupabase = getSupabaseAnon
export function isAdminAvailable(): boolean {
  return isSupabaseConfigured()
}

// ============================================================
// API Key Resolution (Supabase-only)
// ============================================================

/**
 * Resolve a user ID from a rise_ API key using the Supabase user_api_keys table.
 * Returns null if the key is invalid or not found.
 */
export async function resolveUserId(apiKey: string): Promise<string | null> {
  if (!apiKey || !apiKey.startsWith('rise_')) return null
  if (!isSupabaseConfigured()) return null

  const admin = await getSupabaseAdmin()
  if (!admin) return null

  try {
    const { data } = await admin
      .from('user_api_keys')
      .select('user_id')
      .eq('key', apiKey)
      .maybeSingle()

    if (data?.user_id) {
      await admin
        .from('user_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('key', apiKey)
      return data.user_id
    }
  } catch (err) {
    console.error('[resolveUserId] error:', err)
  }

  return null
}

// ============================================================
// Error Handling
// ============================================================

/**
 * Handle API route errors with proper HTTP status codes.
 * Returns 503 when Supabase is not configured, 500 for unexpected errors.
 */
export function handleRouteError(error: unknown, route: string, hasToken = false): NextResponse {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[${route}] error:`, msg)

  // If the caller had a token but Supabase is unreachable → 503
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
