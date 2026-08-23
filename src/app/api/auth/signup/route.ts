import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAnon, isSupabaseConfigured, ADMIN_EMAIL } from '@/lib/supabase'
import { setAuthCookies } from '@/lib/cookie-auth'

export const dynamic = 'force-dynamic'

// P1#5: Zod validation + P1#11: password min 8 (was 6)
const SignupSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  name: z.string().max(100).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
    }

    // P1#5: Validate input
    const parsed = SignupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const { email, password, name } = parsed.data

    // ── Supabase Auth Flow ──
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseAnon()
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name || email.split('@')[0] || 'مستخدم' },
          },
        })

        if (error) {
          console.error('[auth/signup] Supabase error:', (error as any).message, (error as any).code, (error as any).status)
          // P1#11 FIX: Do NOT auto-login on "already registered" — return clear error
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            return NextResponse.json(
              { error: 'هذا البريد مسجل بالفعل. استخدم تسجيل الدخول.' },
              { status: 409 }
            )
          }
          return NextResponse.json({ error: `خطأ في التسجيل: ${error.message}` }, { status: 400 })
        }

        const user = data.user
        if (!user) return NextResponse.json({ error: 'فشل إنشاء الحساب' }, { status: 500 })

        if (data.session === null && user.identities?.length === 0) {
          return NextResponse.json({ error: 'هذا البريد مسجل بالفعل' }, { status: 409 })
        }

        if (!data.session && user.confirmed_at === null) {
          return NextResponse.json({ needsConfirmation: true, message: 'تم إرسال رابط تأكيد إلى بريدك الإلكتروني' })
        }

        if (data.session) {
          const userInfo = {
            id: user.id,
            email: user.email || email,
            name: (user as any).user_metadata?.name || name || email.split('@')[0],
            isAdmin: email === ADMIN_EMAIL,
          }
          // P1#3: Set httpOnly cookies
          const res = NextResponse.json({
            user: userInfo,
            session: {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at,
            },
          })
          return setAuthCookies(res, {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at!,
          }, userInfo)
        }

        return NextResponse.json({ needsConfirmation: true, message: 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني للتأكيد.' })
      }
    }

    // ── Local Fallback (mock mode) ──
    const { createMockClient } = await import('@/lib/mock-client')
    const mock = createMockClient()
    const { data: signUpData, error: signUpError } = await mock.auth.signUp({
      email, password, options: { data: { name: name || email.split('@')[0] } }
    })
    if (signUpError || !signUpData.user || !signUpData.session) {
      return NextResponse.json({ error: 'فشل إنشاء الحساب' }, { status: 500 })
    }
    const userInfo = {
      id: signUpData.user.id,
      email: signUpData.user.email || email,
      name: name || email.split('@')[0],
      isAdmin: email === ADMIN_EMAIL,
    }
    const res = NextResponse.json({
      user: userInfo,
      session: {
        access_token: signUpData.session.access_token,
        refresh_token: signUpData.session.refresh_token,
        expires_at: signUpData.session.expires_at,
      },
    })
    return setAuthCookies(res, {
      access_token: signUpData.session.access_token,
      refresh_token: signUpData.session.refresh_token,
      expires_at: signUpData.session.expires_at,
    }, userInfo)
  } catch (error) {
    console.error('[auth/signup] error:', error)
    return NextResponse.json({ error: 'حدث خطأ في إنشاء الحساب' }, { status: 500 })
  }
}
