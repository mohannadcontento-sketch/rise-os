import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL, getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured, isAdminRole } from '@/lib/supabase'
import { verifySupabaseToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/auth/session
// CRITICAL FIX: This route ONLY validates — it does NOT refresh.
// Previously, this route called supabase.auth.refreshSession inline
// when the JWT was expired. That caused a RACE CONDITION:
//   1. Page mount → checkAuth() → GET /api/auth/session → inline refresh
//   2. API call 401 → apiFetch → POST /api/auth/refresh
// Both used the same single-use refresh token → one failed.
// Now, if the JWT is expired, this route returns {user: null}.
// ============================================================

async function getProfileFlags(userId: string, email: string | undefined): Promise<{ isAdmin: boolean; avatar: string | null; suspended: boolean }> {
  if (email && email === ADMIN_EMAIL) {
    return { isAdmin: true, avatar: await getAvatar(userId), suspended: false } // admin email never suspended
  }
  if (isSupabaseConfigured()) {
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const sb = admin as any
        const { data } = await sb
          .from('profiles')
          .select('role, avatar, suspended')
          .eq('id', userId)
          .maybeSingle()
        const d = data as { role?: string; avatar?: string; suspended?: boolean } | null
        return {
          isAdmin: isAdminRole(d?.role),
          avatar: d?.avatar || null,
          suspended: d?.suspended === true,
        }
      }
    } catch { /* ignore */ }
  }
  return { isAdmin: false, avatar: null, suspended: false }
}

async function getAvatar(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const admin = await getSupabaseAdmin()
    if (admin) {
      const sb = admin as any
      const { data: profile } = await sb
        .from('profiles')
        .select('avatar')
        .eq('id', userId)
        .single()
      const av = profile as { avatar?: string } | null
      return av?.avatar || null
    }
  } catch { /* ignore */ }
  return null
}

export async function GET(request: NextRequest) {
  try {
    let token = request.cookies.get('rise-access')?.value || ''
    if (!token) {
      token = request.headers.get('Authorization')?.replace('Bearer ', '') || ''
    }
    if (!token) {
      return NextResponse.json({ user: null, expires: null })
    }

    const userId = await verifySupabaseToken(token)
    if (!userId) {
      return NextResponse.json({ user: null, expires: null })
    }

    if (isSupabaseConfigured() && token.length > 50 && !token.startsWith('local.') && !token.startsWith('rise_')) {
      const supabase = await getSupabaseAnon()
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token)
          if (!error && user) {
            const { isAdmin, avatar, suspended } = await getProfileFlags(user.id, user.email)
            return NextResponse.json({
              user: {
                id: user.id,
                email: user.email,
                name: (user as any).user_metadata?.name || user.email?.split('@')[0] || 'مستخدم',
                isAdmin,
                avatar,
                suspended,
              },
              expires: new Date(((user as any).exp || 0) * 1000).toISOString() || null,
            })
          }
        } catch { /* fall through to local */ }
      }
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) return NextResponse.json({ user: null, expires: null })

    const { isAdmin, suspended } = await getProfileFlags(user.id, user.email || undefined)
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, isAdmin, suspended },
    })
  } catch {
    return NextResponse.json({ user: null, expires: null })
  }
}
