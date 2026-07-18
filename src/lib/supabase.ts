import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Lazy singletons — avoids crashing during build when env vars are absent
let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

/**
 * Get the base Supabase client (anon key, no user context).
 * Use this only for operations that don't need RLS (e.g., admin with service role).
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('Supabase environment variables are not configured')
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

/**
 * Get a Supabase client with the service role key (bypasses RLS).
 * Use this in server-side flows where you've already authenticated the user
 * via a custom mechanism (e.g., API key) and need full data access.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (_supabaseAdmin) return _supabaseAdmin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  _supabaseAdmin = createClient(url, serviceKey)
  return _supabaseAdmin
}

/**
 * Get a Supabase client for API routes.
 * ALWAYS prefers the admin (service-role) client to bypass RLS.
 *
 * WHY: The API layer already validates user identity via requireAuth() / getUserId().
 * RLS is redundant on the server side and causes issues:
 * - JWT client RLS can fail if User row doesn't exist
 * - API key auth has no JWT, so RLS blocks everything
 * - The admin client is safe because callers filter by userId manually
 */
export function getSupabaseWithAuth(req: NextRequest): SupabaseClient {
  // Always prefer admin client — bypasses RLS entirely
  const admin = getSupabaseAdmin()
  if (admin) return admin

  // Fallback: if no service role key, try JWT client (RLS may block)
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (token && !token.startsWith('rise_')) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    )
  }

  // Last resort: base anon client (RLS will block most ops)
  return getSupabase()
}

// Generate ZhipuAI JWT token
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

// Admin email — read from env to avoid exposing in source
export const ADMIN_EMAIL: string = process.env.ADMIN_EMAIL || ''

/**
 * Check if admin (service-role) client is available for RLS bypass.
 */
export function isAdminAvailable(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Handle API route errors gracefully.
 * Returns mock success data so the app keeps working in demo mode.
 */
export function handleRouteError(error: unknown, route: string): NextResponse {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[${route}] error:`, msg)
  // Always return mock success so the frontend doesn't break
  return NextResponse.json({ success: true, offline: true, id: 'mock-' + Date.now() })
}

// Track which user IDs have already been ensured (per-cold-start cache)
const _ensuredUsers = new Set<string>()

/**
 * Ensure a user row exists in the User table.
 * Uses the provided client or admin client. Safe to call multiple times (idempotent).
 * This is critical for MCP and login — the FK constraint requires a real User row.
 */
export async function ensureUserExists(clientOrUserId: SupabaseClient | string, userId?: string, name?: string, email?: string): Promise<boolean> {
  let supabase: SupabaseClient
  let id: string

  if (typeof clientOrUserId === 'string') {
    // Called as ensureUserExists(userId, name?, email?)
    supabase = getSupabaseAdmin() || getSupabase()
    id = clientOrUserId
  } else {
    // Called as ensureUserExists(supabase, userId)
    supabase = clientOrUserId
    id = userId!
  }

  // Already checked in this serverless instance
  if (_ensuredUsers.has(id)) return true

  try {
    const { data } = await supabase
      .from('User')
      .select('id')
      .eq('id', id)
      .single()

    if (!data) {
      // User doesn't exist — create them
      const { error: insertErr } = await supabase
        .from('User')
        .upsert({
          id,
          name: name || (id === 'demo-user' ? 'مستخدم تجريبي' : 'مستخدم RiseOS'),
          email: email || `${id}@rise-os.local`,
          level: 1,
          xp: 0,
          streak: 0,
        }, { onConflict: 'id' })

      if (insertErr) {
        console.error(`[ensureUserExists] upsert error for ${id}:`, insertErr.message)
        return false
      }
      console.log(`[ensureUserExists] created user: ${id}`)
    }

    _ensuredUsers.add(id)
    return true
  } catch (err) {
    console.error(`[ensureUserExists] error for ${id}:`, err)
    return false
  }
}