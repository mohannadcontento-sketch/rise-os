import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL, getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json()
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
                if (profile?.role === 'admin') isAdmin = true
              }
            } catch { /* ignore */ }

            return NextResponse.json({
              session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
              },
              user: {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.name || data.user.email?.split('@')[0],
                isAdmin,
              },
            })
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