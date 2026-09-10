import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSupabaseIsolatedClient, getSupabaseAdmin, isSupabaseConfigured, isAdminRole } from '@/lib/supabase'
import { isMockAuthEnabled, verifyMockRefreshToken, createMockAccessToken, createMockRefreshToken } from '@/lib/mock-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/auth/refresh
// CRITICAL FIX: Server-side in-memory lock prevents race conditions.
// Supabase refresh tokens are SINGLE-USE and rotate on each refresh.
// If two concurrent refresh calls use the same refresh token, one
// succeeds and the other fails. This lock ensures only one refresh
// executes at a time; concurrent callers share the same result.
// ============================================================

const _refreshLocks = new Map<string, Promise<{ ok: boolean; session?: any; user?: any }>>()

async function doRefresh(
  refreshToken: string
): Promise<{ ok: boolean; session?: any; user?: any }> {
  if (isSupabaseConfigured() && refreshToken.length > 20) {
    const supabase = await createSupabaseIsolatedClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
        if (!error && data.session && data.user) {
          let isAdmin = false
          try {
            const admin = await getSupabaseAdmin()
            if (admin) {
              const { data: profile, error: profileError } = await admin
                .from('profiles')
                .select('role, avatar, suspended')
                .eq('id', data.user.id)
                .single()
              if (profileError) throw profileError
              const p = profile as { role?: string; suspended?: boolean } | null
              if (isAdminRole(p?.role)) isAdmin = true
              if (p?.suspended === true) return { ok: false }
            }
          } catch (error) {
            console.error('[auth/refresh] profile verification failed:', error)
            return { ok: false }
          }
          return {
            ok: true,
            session: {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at!,
            },
            user: {
              id: data.user.id,
              email: data.user.email || '',
              name: (data.user as any).user_metadata?.name || data.user.email?.split('@')[0] || 'مستخدم',
              isAdmin,
              avatar: null as string | null,
            },
          }
        }
      } catch (e) {
        console.error('[auth/refresh] Supabase refresh failed:', e)
      }
    }
    return { ok: false }
  }

  // Local Fallback (mock mode)
  if (!isMockAuthEnabled()) return { ok: false }

  const verified = verifyMockRefreshToken(refreshToken)
  if (!verified) return { ok: false }

  const user = await db.user.findUnique({ where: { id: verified.userId }, select: { id: true, email: true, name: true, role: true } })
  if (!user) return { ok: false }

  const { token: accessToken, expiresAt } = createMockAccessToken(user.id)
  return {
    ok: true,
    session: {
      access_token: accessToken,
      refresh_token: createMockRefreshToken(user.id),
      expires_at: expiresAt,
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminRole(user.role),
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const refresh_token = request.cookies.get('rise-refresh')?.value
    if (!refresh_token) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    const lockKey = refresh_token.slice(-32)
    let refreshPromise = _refreshLocks.get(lockKey)
    if (!refreshPromise) {
      refreshPromise = doRefresh(refresh_token).finally(() => {
        setTimeout(() => _refreshLocks.delete(lockKey), 2000)
      })
      _refreshLocks.set(lockKey, refreshPromise)
    }

    const result = await refreshPromise
    if (!result.ok || !result.session || !result.user) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    const { setAuthCookies } = await import('@/lib/cookie-auth')
    const res = NextResponse.json({ user: result.user })
    return setAuthCookies(res, result.session, result.user)
  } catch (error) {
    console.error('[auth/refresh] error:', error)
    return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
  }
}
