import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// ============================================================
// Supabase Client Management
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

// ── Anon client (client-side, respects RLS) ──
let _anonClient: SupabaseClient | null = null
export function getSupabaseAnon(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!_anonClient) {
    _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return _anonClient
}

// ── Admin client (bypasses RLS) ──
let _adminClient: SupabaseClient | null = null
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!hasServiceRole()) return null
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  }
  return _adminClient
}

// ── Server-side client with user JWT (respects RLS) ──
export function getSupabaseWithAuth(req?: NextRequest): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null

  const token = req?.headers.get('Authorization')?.replace('Bearer ', '') || ''

  // If we have a real JWT token (from Supabase Auth), use it
  if (token && !token.startsWith('rise_') && token.length > 50) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })
  }

  // For rise_ API keys or no token, use admin client if available
  return getSupabaseAdmin() || getSupabaseAnon()
}

// ── Legacy compatibility ──
export function getSupabase(): SupabaseClient | null {
  return getSupabaseAnon()
}

export function isAdminAvailable(): boolean {
  return isSupabaseConfigured()
}

// ============================================================
// Error Handling
// ============================================================

/**
 * Handle API route errors gracefully.
 * Returns mock success data so the app keeps working in demo mode.
 */
export function handleRouteError(error: unknown, route: string): NextResponse {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[${route}] error:`, msg)
  return NextResponse.json({ success: true, offline: true, id: 'mock-' + Date.now() })
}

// ============================================================
// Local User Management (Prisma fallback)
// ============================================================

// Track which user IDs have already been ensured (per-cold-start cache)
const _ensuredUsers = new Set<string>()

/**
 * Ensure a user row exists in the local User table.
 * Uses Prisma. Safe to call multiple times (idempotent).
 */
export async function ensureUserExists(userId: string): Promise<boolean> {
  if (_ensuredUsers.has(userId)) return true

  try {
    const { db } = await import('@/lib/db')
    const existing = await db.user.findUnique({ where: { id } })

    if (!existing) {
      await db.user.create({
        data: {
          id: userId,
          name: userId === 'demo-user' ? 'مستخدم تجريبي' : 'مستخدم RiseOS',
          email: `${userId}@rise-os.local`,
          level: 1,
          xp: 0,
          streak: 0,
          settings: { create: {} },
        },
      })
      console.log(`[ensureUserExists] created local user: ${userId}`)
    }

    _ensuredUsers.add(userId)
    return true
  } catch (err) {
    console.error(`[ensureUserExists] error for ${userId}:`, err)
    return false
  }
}

/**
 * Resolve user ID from API key (rise_ prefix).
 * Checks Supabase first, falls back to local Prisma.
 */
export async function resolveUserId(apiKey: string): Promise<string | null> {
  if (!apiKey.startsWith('rise_')) return null

  // Try Supabase first
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { data } = await admin
        .from('user_api_keys')
        .select('user_id')
        .eq('key', apiKey)
        .single()
      if (data?.user_id) {
        // Update last_used_at
        await admin
          .from('user_api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('key', apiKey)
        return data.user_id
      }
    }
  }

  // Fallback to local Prisma
  try {
    const { db } = await import('@/lib/db')
    const record = await db.userApiKey.findUnique({ where: { key: apiKey } })
    if (record) {
      await db.userApiKey.update({
        where: { key: apiKey },
        data: { lastUsedAt: new Date() },
      })
      return record.userId
    }
  } catch (err) {
    console.error('[resolveUserId] local fallback error:', err)
  }

  return null
}

// ============================================================
// ZhipuAI JWT Token
// ============================================================

/**
 * Generate ZhipuAI JWT token
 */
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