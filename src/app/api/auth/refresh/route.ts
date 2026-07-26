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
        } catch { /* fall through */ }
      }
    }

    // ── Local Fallback ──
    const user = await db.user.findUnique({ where: { id: refresh_token } })
    if (!user) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    return NextResponse.json({
      session: { access_token: user.id, refresh_token: '', expires_at: 0 },
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.email === ADMIN_EMAIL },
    })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}