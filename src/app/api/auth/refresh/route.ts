import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL, getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

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
    const supabase = await getSupabaseAnon()
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
        if (!error && data.session && data.user) {
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
  let userId: string | null = null
  const mockMatch = refreshToken.match(/^local\.refresh\.(.+?)\.\d+\.risecos\.local/)
  if (mockMatch) {
    userId = mockMatch[1]
  } else {
    userId = refreshToken
  }
  const user = await db.user.findUnique({ where: { id: userId! } })
  if (!user) return { ok: false }
  const ts = Date.now()
  return {
    ok: true,
    session: {
      access_token: `local.${user.id}.${ts}.risecos.local.auth.token.payload.sig`,
      refresh_token: `local.refresh.${user.id}.${ts}.risecos.local`,
      expires_at: Math.floor(ts / 1000) + 7 * 24 * 3600,
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.email === ADMIN_EMAIL,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    let refresh_token: string | undefined = request.cookies.get('rise-refresh')?.value
    if (!refresh_token) {
      try {
        const body = await request.json()
        if (body?.refresh_token && typeof body.refresh_token === 'string' && body.refresh_token.length > 0) {
          refresh_token = body.refresh_token
        }
      } catch { /* no body */ }
    }
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
    const res = NextResponse.json({ session: result.session, user: result.user })
    return setAuthCookies(res, result.session, result.user)
  } catch (error) {
    console.error('[auth/refresh] error:', error)
    return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
  }
}
