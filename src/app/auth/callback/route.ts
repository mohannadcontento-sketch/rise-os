import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseIsolatedClient, isSupabaseConfigured } from '@/lib/supabase'
import { setAuthCookies } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /auth/callback?code=...&flow=recovery|signup
// Phase 3 — نقطة هبوط روابط البريد (تأكيد التسجيل / استعادة كلمة المرور).
//
// يبدّل كود البريد بجلسة حقيقية (PKCE exchange) على عميل معزول،
// يضع توكنات الجلسة في كوكيز httpOnly، ثم:
//   * flow=recovery → marker cookie قصير العمر + توجيه إلى /reset-password
//   * غير ذلك      → توجيه إلى /app (تأكيد التسجيل ثم دخول مباشر)
//
// marker cookie (rise-pwd-recovery) هو ما يسمح لاحقًا لمسار
// /api/auth/update-password بتعيين كلمة مرور جديدة بدون كلمة
// المرور الحالية — إثباتًا أن الجلسة نشأت من رابط استعادة وصل
// فعلًا إلى بريد المالك.
// ============================================================

const RECOVERY_COOKIE = 'rise-pwd-recovery'
const RECOVERY_TTL_SECONDS = 10 * 60 // عشر دقائق تكفي لكتابة كلمة مرور جديدة

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  const code = url.searchParams.get('code')
  const flow = url.searchParams.get('flow') || ''

  if (!code) {
    // رابط بلا كود (زيارة يدوية / رابط قديم مستهلك) — عُد لتسجيل الدخول.
    return NextResponse.redirect(new URL('/app', url.origin))
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL('/app?authError=unsupported', url.origin))
  }

  try {
    const supabase = await createSupabaseIsolatedClient()
    if (!supabase) {
      return NextResponse.redirect(new URL('/app?authError=unavailable', url.origin))
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.session || !data.user) {
      console.error('[auth/callback] exchange failed:', error?.message)
      return NextResponse.redirect(new URL('/app?authError=expired', url.origin))
    }

    const userInfo = {
      id: data.user.id,
      email: data.user.email || '',
      name: (data.user as any).user_metadata?.name || data.user.email?.split('@')[0] || 'مستخدم',
      isAdmin: false, // تأكيد ذاتي لا يمنح أدمن أبدًا — الدور من profiles فقط
      avatar: null,
    }

    const isRecovery = flow === 'recovery'
    const target = isRecovery ? new URL('/reset-password', url.origin) : new URL('/app', url.origin)

    const res = NextResponse.redirect(target)
    setAuthCookies(
      res,
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at!,
      },
      userInfo
    )
    if (isRecovery) {
      res.cookies.set(RECOVERY_COOKIE, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: RECOVERY_TTL_SECONDS,
      })
    }
    return res
  } catch (error) {
    console.error('[auth/callback] error:', error)
    return NextResponse.redirect(new URL('/app?authError=unknown', url.origin))
  }
}
