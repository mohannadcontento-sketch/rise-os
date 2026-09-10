import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseIsolatedClient, isSupabaseConfigured } from '@/lib/supabase'
import { parseBody, requestPasswordResetSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/auth/reset-password
// Phase 3 — "نسيت كلمة المرور؟"
// Sends the Supabase recovery email. Always returns success-ish
// responses with generic copy so the endpoint cannot be used to
// enumerate registered addresses.
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

    const supabase = await createSupabaseIsolatedClient()
    if (!supabase) {
      return NextResponse.json({ error: 'خدمة المصادقة غير متوفرة حالياً' }, { status: 503 })
    }

    const redirectTo = `${resolveSiteUrl(req)}/auth/callback?flow=recovery`
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    // تسجيل الخطأ داخليًا فقط — لا نكشف للعميل ما إذا كان البريد مسجلًا.
    if (error) {
      console.error('[auth/reset-password] supabase error:', (error as any)?.code, error.message)
    }

    return NextResponse.json({
      success: true,
      message: 'إذا كان هذا البريد مسجلًا لدى أوج، ستصلك رسالة تحتوي رابط إعادة تعيين كلمة المرور.',
    })
  } catch (error) {
    console.error('[auth/reset-password] error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إرسال رسالة الاستعادة' }, { status: 500 })
  }
}
