import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured, isAdminRole } from '@/lib/supabase'
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
  if (!isSupabaseConfigured()) return { isAdmin: false, avatar: null, suspended: false }

  const admin = await getSupabaseAdmin()
  if (!admin) throw new Error('Profile verification unavailable')

  const sb = admin as any
  const { data, error } = await sb
    .from('profiles')
    .select('role, avatar, suspended')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error

  const d = data as { role?: string; avatar?: string; suspended?: boolean } | null
  return {
    isAdmin: isAdminRole(d?.role),
    avatar: d?.avatar || null,
    suspended: d?.suspended === true,
  }
}

export async function GET(request: NextRequest) {
  try {
    // Browser sessions are BFF/cookie-only. Authorization headers are reserved
    // for non-browser API-key clients and are deliberately not accepted here.
    const token = request.cookies.get('rise-access')?.value || ''
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
          if (error || !user) {
            return NextResponse.json({ user: null, expires: null })
          }

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
        } catch {
          // Production Supabase session/profile validation is fail-closed.
          return NextResponse.json({ user: null, expires: null, error: 'خدمة الجلسة غير متاحة حالياً' }, { status: 503 })
        }
      }

      return NextResponse.json({ user: null, expires: null, error: 'خدمة المصادقة غير متاحة حالياً' }, { status: 503 })
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
