import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL, getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

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
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ user: null, expires: null })
    }

    // ── Try Supabase Auth ──
    if (isSupabaseConfigured() && token.length > 50 && !token.startsWith('rise_')) {
      const supabase = await getSupabaseAnon()
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token)
          if (!error && user) {
            // Check admin from profiles.role column
            const isAdmin = await checkAdminRole(user.id, user.email)

            // Get avatar from Supabase profile
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
        } catch { /* fall through */ }
      }
    }

    // ── Local Fallback ──
    const user = await db.user.findUnique({
      where: { id: token },
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