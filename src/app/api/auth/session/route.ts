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
    // Previously this route ONLY read the Authorization header, which meant
    // it returned {user: null} whenever the frontend called it with
    // credentials:'include' (cookie sent) but no explicit Authorization header.
    // This caused checkAuth() in page.tsx to think the session was invalid
    // and repeatedly trigger refresh → eventually logging users out.
    let token = request.cookies.get('rise-access')?.value || ''
    if (!token) {
      token = request.headers.get('Authorization')?.replace('Bearer ', '') || ''
    }
    if (!token) {
      return NextResponse.json({ user: null, expires: null })
    }

    // Use verifySupabaseToken — it handles both mock tokens and real Supabase JWTs
    const userId = await verifySupabaseToken(token)
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