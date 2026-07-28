import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL, getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { verifySupabaseToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function checkAdminRole(userId: string, email: string | undefined): Promise<boolean> {
  // Check ADMIN_EMAIL env var first
  if (email && email === ADMIN_EMAIL) return true

  // Check Supabase profiles.role column
  if (isSupabaseConfigured()) {
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const sb = admin as any
        const { data } = await sb
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single()
        const d = data as { role?: string } | null
        if (d?.role === 'admin') return true
      }
    } catch { /* ignore */ }
  }

  return false
}

export async function GET(request: NextRequest) {
  try {
    // FIX: Read token from httpOnly cookie FIRST, then Authorization header.
    let token = request.cookies.get('rise-access')?.value || ''
    if (!token) {
      token = request.headers.get('Authorization')?.replace('Bearer ', '') || ''
    }
    if (!token) {
      return NextResponse.json({ user: null, expires: null })
    }

    // Use verifySupabaseToken — it handles both mock tokens and real Supabase JWTs
    let userId = await verifySupabaseToken(token)

    // FIX: If the access token is invalid (e.g. expired Supabase JWT),
    // try to refresh it using the httpOnly refresh cookie.
    // This prevents the "user appears logged out after token expiry" bug
    // where the cookie has an expired JWT but the refresh token is still valid.
    if (!userId) {
      const refreshToken = request.cookies.get('rise-refresh')?.value
      if (refreshToken) {
        try {
          // Call the refresh route's logic inline
          // ── Try Supabase refresh ──
          if (isSupabaseConfigured() && refreshToken.length > 20) {
            const supabase = await getSupabaseAnon()
            if (supabase) {
              const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
              if (!error && data.session && data.user) {
                // Refresh succeeded — set new cookies and return the user
                const { setAuthCookies } = await import('@/lib/cookie-auth')
                const isAdmin = await checkAdminRole(data.user.id, data.user.email)
                let avatar: string | null = null
                try {
                  const admin = await getSupabaseAdmin()
                  if (admin) {
                    const sb = admin as any
                    const { data: profile } = await sb
                      .from('profiles')
                      .select('avatar')
                      .eq('id', data.user.id)
                      .single()
                    const av = profile as { avatar?: string } | null
                    avatar = av?.avatar || null
                  }
                } catch { /* ignore */ }

                const userInfo = {
                  id: data.user.id,
                  email: data.user.email || '',
                  name: (data.user as any).user_metadata?.name || data.user.email?.split('@')[0] || 'مستخدم',
                  isAdmin,
                  avatar,
                }
                const sessionData = {
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                  expires_at: data.session.expires_at!,
                }
                const res = NextResponse.json({
                  user: userInfo,
                  expires: new Date(((data.user as any).exp || 0) * 1000).toISOString() || null,
                })
                return setAuthCookies(res, sessionData, userInfo)
              }
            }
          }

          // ── Local/mock refresh fallback ──
          const mockMatch = refreshToken.match(/^local\.refresh\.(.+?)\.\d+\.risecos\.local/)
          if (mockMatch) {
            userId = mockMatch[1]
          } else if (refreshToken) {
            // Legacy: raw user ID as refresh token
            userId = refreshToken
          }
        } catch { /* refresh failed — return null below */ }
      }
    }

    if (!userId) {
      return NextResponse.json({ user: null, expires: null })
    }

    // ── Supabase mode: get full user profile + avatar ──
    if (isSupabaseConfigured() && token.length > 50 && !token.startsWith('local.') && !token.startsWith('rise_')) {
      const supabase = await getSupabaseAnon()
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token)
          if (!error && user) {
            const isAdmin = await checkAdminRole(user.id, user.email)
            let avatar: string | null = null
            try {
              const admin = await getSupabaseAdmin()
              if (admin) {
                const sb = admin as any
                const { data: profile } = await sb
                  .from('profiles')
                  .select('avatar')
                  .eq('id', user.id)
                  .single()
                const av = profile as { avatar?: string } | null
                avatar = av?.avatar || null
              }
            } catch { /* ignore */ }

            return NextResponse.json({
              user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email?.split('@')[0] || 'مستخدم',
                isAdmin,
                avatar,
              },
              expires: new Date(((user as any).exp || 0) * 1000).toISOString() || null,
            })
          }
        } catch { /* fall through to local */ }
      }
    }

    // ── Local/mock mode: look up user from Prisma ──
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) return NextResponse.json({ user: null, expires: null })

    const isAdmin = await checkAdminRole(user.id, user.email)
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, isAdmin },
    })
  } catch {
    return NextResponse.json({ user: null, expires: null })
  }
}