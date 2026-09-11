import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase'
import { setAuthCookies } from '@/lib/cookie-auth'
import {
  createSupabasePkceClient,
  createVerifierSource,
  isRecoveryVerifier,
  isBareVerifier,
  PKCE_VERIFIER_COOKIE,
  RECOVERY_COOKIE,
  RECOVERY_TTL,
} from '@/lib/auth-pkce'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /auth/callback?code=...  (landing point of email links)
// Phase 3 hotfix — نقطة هبوط رابط استعادة كلمة المرور.
//
// THE MECHANISM (server-authoritative PKCE):
//   1. طلب الاستعادة (/api/auth/reset-password) ولّد code_verifier
//      وحفظه في كوكي httpOnly على متصفح المستخدم نفسه.
//   2. الضغط على رابط الإيميل = تنقّل top-level من نفس المتصفح →
//      الكوكي (SameSite=Lax) يصل مع الطلب إلى هذا المسار.
//   3. نبذل الكوكي كـ storage لعميل PKCE ثم نبدّل الـ code
//      بجلسة حقيقية على السيرفر — التوكنز تذهب لكوكيز httpOnly
//      فقط (لا localStorage، ولا URL).
//
// الجلسة كانت من استعادة (redirectType='recovery' من الـ verifier
// نفسه) → marker cookie قصير العمر + توجيه إلى /reset-password.
// غير ذلك → /app (تأكيد تسجيل مستقبلي ثم دخول مباشر).
//
// حالات الفشل كلها تُعرض بشكل ودّي عبر /reset-password?state=…:
//   device  — الرابط فُتح من متصفح/جهاز آخر غير الذي طُلب منه
//   expired — الكود مستهلك أو انتهت صلاحيته
//   invalid — الكوكي تالف
// ============================================================

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  const code = url.searchParams.get('code')

  if (!code) {
    // رابط بلا كود (زيارة يدوية / رابط قديم من الفلو المكسور) — عُد لتسجيل الدخول.
    return NextResponse.redirect(new URL('/app', url.origin))
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL('/app?authError=unsupported', url.origin))
  }

  const verifier = req.cookies.get(PKCE_VERIFIER_COOKIE)?.value || ''

  // الكوكي غائب → الرابط فُتح من متصفح أو جهاز مختلف عن الذي طُلب منه
  // الاستعادة. لأمان PKCE لا يمكن إتمام التبديل — نشرح ذلك بوضوح.
  if (!verifier) {
    return NextResponse.redirect(new URL('/reset-password?state=device', url.origin))
  }

  const recoveryFlavored = isRecoveryVerifier(verifier)
  if (!recoveryFlavored && !isBareVerifier(verifier)) {
    return NextResponse.redirect(new URL('/reset-password?state=invalid', url.origin))
  }

  try {
    const supabase = await createSupabasePkceClient(createVerifierSource(verifier))
    if (!supabase) {
      return NextResponse.redirect(new URL('/app?authError=unavailable', url.origin))
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    // الـ code و الـ verifier كلاهما أحادي الاستخدام — نمسح الكوكي
    // بعد أي محاولة تبديل (نجاح أو فشل) لإغلاق نافذة إعادة التشغيل.
    const cleanup = (res: NextResponse) => {
      res.cookies.delete(PKCE_VERIFIER_COOKIE)
      return res
    }

    if (error || !data.session || !data.user) {
      console.error('[auth/callback] exchange failed:', (error as any)?.code, error?.message)
      const target = recoveryFlavored
        ? '/reset-password?state=expired'
        : '/app?authError=expired'
      return cleanup(NextResponse.redirect(new URL(target, url.origin)))
    }

    // redirectType مصدره اللاحقة "/recovery" في الـ verifier الذي
    // ولّدناه نحن أثناء طلب الاستعادة — إشارة موثوقة لا يمكن للتاجر
    // (أو أي طرف) تزويرها من جانب العميل.
    const isRecovery = recoveryFlavored || (data as any)?.redirectType === 'recovery'

    const userInfo = {
      id: data.user.id,
      email: data.user.email || '',
      name: (data.user as any).user_metadata?.name || data.user.email?.split('@')[0] || 'مستخدم',
      isAdmin: false, // تأكيد ذاتي لا يمنح أدمن أبدًا — الدور من profiles فقط
      avatar: null,
    }

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
    cleanup(res)

    if (isRecovery) {
      res.cookies.set(RECOVERY_COOKIE, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: RECOVERY_TTL,
      })
    }
    return res
  } catch (error) {
    console.error('[auth/callback] error:', error)
    return NextResponse.redirect(
      new URL(recoveryFlavored ? '/reset-password?state=expired' : '/app?authError=unknown', url.origin)
    )
  }
}
