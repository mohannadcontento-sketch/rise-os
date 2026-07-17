import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
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
 * Get a Supabase client with the authenticated user's JWT in the auth context.
 * This makes RLS policies work correctly on the server side.
 * Use this in ALL API routes that handle user data.
 */
export function getSupabaseWithAuth(req: NextRequest): SupabaseClient {
  const base = getSupabase()
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')

  if (!token) {
    // No valid token — return base client (RLS will block access via anon)
    return base
  }

  // Create client with user's JWT so RLS policies can evaluate auth.uid()
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