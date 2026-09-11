import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  createSupabasePkceClient,
  createVerifierCapture,
  PKCE_VERIFIER_COOKIE,
  PKCE_VERIFIER_TTL,
} from '@/lib/auth-pkce'
import { parseBody, requestPasswordResetSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/auth/reset-password
// Phase 3 hotfix — «نسيت كلمة المرور؟» (كان المسار مكسورًا تمامًا)
//
// WHAT CHANGED (root cause): previously this route called
// resetPasswordForEmail on a server client with implicit flow, so
// Supabase sent the email WITHOUT a code_challenge; the email link
// then redirected to /auth/callback#access_token=... — tokens in a
// URL hash fragment, which never reaches the server. The reset page
// was unreachable for every user.
//
// NOW: the request runs on a PKCE-enabled client whose storage shim
// captures the generated code_verifier. The verifier travels to the
// user's browser inside an httpOnly cookie (SameSite=Lax — sent on
// the top-level navigation of an email-link click), and /auth/callback
// uses it to complete exchangeCodeForSession server-side. Tokens only
// ever land in httpOnly cookies — never in localStorage or the URL.
//
// Always returns a generic response so the endpoint cannot be used
// to enumerate registered addresses.
// ============================================================

function resolveSiteUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '')
  const forwardedHost = req.headers.get('x-forwarded-host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (forwardedHost) return `${proto}://${forwardedHost}`
  return req.nextUrl.origin
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(req, requestPasswordResetSchema)
    if (!parsed.ok) return parsed.response!
    const { email } = parsed.data!

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'استعادة كلمة المرور غير متاحة في وضع التطوير المحلي' },
        { status: 503 }
      )
    }

    // عميل PKCE + شيم تخزين يلتقط الـ code_verifier لحظة توليده.
    const { storage, getVerifier } = createVerifierCapture()
    const supabase = await createSupabasePkceClient(storage)
    if (!supabase) {
      return NextResponse.json({ error: 'خدمة المصادقة غير متوفرة حالياً' }, { status: 503 })
    }

    // redirectTo بدون أي query — مطابقة حرفية لما أضيف في Redirect URLs
    // (https://rise-os-gamma.vercel.app/auth/callback) حتى لا يرفضه
    // Supabase ويرتد إلى Site URL الافتراضي (localhost).
    const redirectTo = `${resolveSiteUrl(req)}/auth/callback`
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    // تسجيل الخطأ داخليًا فقط — لا نكشف للعميل ما إذا كان البريد مسجلًا.
    if (error) {
      console.error('[auth/reset-password] supabase error:', (error as any)?.code, error.message)
    }

    const res = NextResponse.json({
      success: true,
      message:
        'إذا كان هذا البريد مسجلًا لدى أوج، ستصلك رسالة خلال دقائق تحتوي رابط إعادة تعيين كلمة المرور. افتح الرابط في نفس هذا المتصفح لإكمال الخطوة.',
    })

    // نقل الـ verifier إلى متصفح المستخدم في كوكي httpOnly — هو ما
    // يتيح للسيرفر إتمام تبديل الكود عندما يضغط المستخدم على الرابط.
    const verifier = getVerifier()
    if (verifier) {
      res.cookies.set(PKCE_VERIFIER_COOKIE, verifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: PKCE_VERIFIER_TTL,
      })
    } else {
      // لا ينبغي أن يحدث مع flowType: 'pkce' — نتركه مسجلًا للتشخيص.
      console.error('[auth/reset-password] PKCE verifier was not generated — flow degraded')
    }

    return res
  } catch (error) {
    console.error('[auth/reset-password] error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إرسال رسالة الاستعادة' }, { status: 500 })
  }
}
