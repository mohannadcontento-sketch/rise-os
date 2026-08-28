import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { setAuthCookies } from '@/lib/cookie-auth'
import { isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/auth/sync-token
// Called by AuthProvider when Supabase client refreshes the JWT.
// Syncs the fresh token to the httpOnly cookie so server-side
// API routes always see a valid, non-expired JWT.
//
// FAILS SOFT: this is a background best-effort sync — the client
// always sends the Authorization header anyway. Returning 400 here
// used to surface "Failed to load resource: 400" in the user's
// console on every refresh glitch. Any invalid/malformed payload
// now returns 200 { ok:false, skipped:true } and is only logged.
// ============================================================

const SyncSchema = z.object({
  access_token: z.string().min(50, 'invalid token'),
  refresh_token: z.string().min(20, 'invalid refresh token'),
  expires_at: z.number(),
})

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: true, skipped: true })
    }
    const body = await request.json().catch(() => null)
    const parsed = SyncSchema.safeParse(body)
    if (!parsed.success) {
      // Fail soft — never surface a console error for a background sync
      console.warn('[auth/sync-token] skipped: invalid payload')
      return NextResponse.json({ ok: true, skipped: true })
    }
    const { access_token, refresh_token, expires_at } = parsed.data

    const userCookie = request.cookies.get('rise-user')?.value
    let userInfo: any = null
    if (userCookie) {
      try { userInfo = JSON.parse(userCookie) } catch { /* ignore */ }
    }
    if (!userInfo) {
      try {
        const payload = JSON.parse(
          Buffer.from(access_token.split('.')[1], 'base64url').toString()
        )
        userInfo = {
          id: payload.sub,
          email: payload.email || '',
          name: payload.user_metadata?.name || payload.email?.split('@')[0] || 'مستخدم',
          isAdmin: payload.user_metadata?.role === 'admin' || payload.email === process.env.ADMIN_EMAIL,
          avatar: null,
        }
      } catch {
        console.warn('[auth/sync-token] skipped: cannot parse token payload')
        return NextResponse.json({ ok: true, skipped: true })
      }
    }
    const res = NextResponse.json({ ok: true })
    return setAuthCookies(res, { access_token, refresh_token, expires_at }, userInfo)
  } catch (error) {
    console.error('[auth/sync-token] error:', error)
    return NextResponse.json({ ok: true, skipped: true })
  }
}
