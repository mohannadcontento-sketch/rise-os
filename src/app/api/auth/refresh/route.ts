import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL, getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    let refresh_token: string | undefined
    try {
      const body = await request.json()
      refresh_token = body?.refresh_token
    } catch { /* no body */ }

    // FIX: Also check httpOnly cookie for refresh token
    if (!refresh_token) {
      refresh_token = request.cookies.get('rise-refresh')?.value
    }

    if (!refresh_token) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    // ── Try Supabase refresh ──
    if (isSupabaseConfigured() && refresh_token.length > 20) {
      const supabase = await getSupabaseAnon()
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.refreshSession({ refresh_token })
          if (!error && data.session && data.user) {
            // Check admin role from profiles.role column
            let isAdmin = data.user.email === ADMIN_EMAIL
            try {
              const admin = await getSupabaseAdmin()
              if (admin) {
                const { data: profile } = await admin
                  .from('profiles')
                  .select('role')
                  .eq('id', data.user.id)
                  .single()
                const p = profile as { role?: string } | null
                if (p?.role === 'admin') isAdmin = true
              }
            } catch { /* ignore */ }

            const userInfo = {
              id: data.user.id,
              email: data.user.email || '',
              name: (data.user as any).user_metadata?.name || data.user.email?.split('@')[0] || 'مستخدم',
              isAdmin,
              avatar: null as string | null,
            }
            const sessionData = {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at!,
            }
            // FIX: Set new httpOnly cookies with refreshed tokens
            const { setAuthCookies } = await import('@/lib/cookie-auth')
            const res = NextResponse.json({ session: sessionData, user: userInfo })
            return setAuthCookies(res, sessionData, userInfo)
          }
        } catch (e) {
          console.error('[auth/refresh] Supabase refresh failed:', e)
        }
      }
      // If Supabase is configured but refresh failed, return 401
      // (don't fall through to Prisma — it's not available on Vercel)
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    // ── Local Fallback (mock mode) ──
    // FIX: The mock refresh_token has format `local.refresh.{userId}.{ts}.risecos.local`.
    // Previously this code passed the entire refresh_token string as a user ID to
    // db.user.findUnique, which always returned null → 401 → clearAuth() → session lost.
    // Now we extract the userId from the mock refresh_token via regex.
    let userId: string | null = null
    const mockMatch = refresh_token.match(/^local\.refresh\.(.+?)\.\d+\.risecos\.local/)
    if (mockMatch) {
      userId = mockMatch[1]
    } else {
      // Legacy: some older tokens used the raw user ID as the refresh_token
      userId = refresh_token
    }

    const user = await db.user.findUnique({ where: { id: userId! } })
    if (!user) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    // Issue a fresh mock session (7-day expiry, matching cookie-auth.ts)
    const ts = Date.now()
    const newSession = {
      access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`,
      refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`,
      expires_at: Math.floor(ts / 1000) + 7 * 24 * 3600,
    }
    const userInfo = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.email === ADMIN_EMAIL,
    }
    const { setAuthCookies } = await import('@/lib/cookie-auth')
    const res = NextResponse.json({ session: newSession, user: userInfo })
    return setAuthCookies(res, newSession, userInfo)
  } catch (error) {
    console.error('[auth/refresh] error:', error)
    return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
  }
}