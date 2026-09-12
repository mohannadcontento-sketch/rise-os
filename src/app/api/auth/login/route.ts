import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseIsolatedClient, getSupabaseAdmin, isSupabaseConfigured, isAdminRole } from '@/lib/supabase'
import { setAuthCookies } from '@/lib/cookie-auth'
import { isMockAuthEnabled } from '@/lib/mock-auth'

// ============================================================
// /api/auth/login — المصادقة (تسجيل الدخول)
//
// بوابة الدخول الرئيسية للمنصة: يتحقق من البريد وكلمة المرور
// عبر Supabase Auth، ثم يفحص ملف profiles من جانب الخادم
// (الدور، الأفاتار، حالة الإيقاف) قبل منح كوكيز الجلسة httpOnly.
//
// المسار عام بالضرورة: لا جلسة قبله — هو من ينشئها.
// الطرق: POST — يعيد { user } مع كوكيز الجلسة، أو 401 (بيانات
//        خاطئة) / 403 (بريد غير مؤكد) / 423 (حساب موقوف)
//        / 503 (تعذر التحقق من حالة الحساب).
// zod: LoginSchema — بريد صالح + كلمة مرور ≥ 8 محارف.
// ملاحظات: دون Supabase يعمل وضع mock المحلي (isMockAuthEnabled)،
// وأي فشل في التحقق من الملف يغلق الباب (fail-closed 503).
// ============================================================

export const dynamic = 'force-dynamic'

// P1#5: Zod validation
const LoginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
    }

    // P1#5: Validate input
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const { email, password } = parsed.data

    // ── Local Mock Mode (development without Supabase) ──
    if (!isSupabaseConfigured()) {
      if (!isMockAuthEnabled()) {
        return NextResponse.json({ error: 'المصادقة غير مُهيأة على الخادم' }, { status: 503 })
      }
      const { createMockClient } = await import('@/lib/mock-client')
      const mock = createMockClient()
      const { data: mockData, error: mockError } = await mock.auth.signInWithPassword({ email, password })
      if (mockError || !mockData.user || !mockData.session) {
        return NextResponse.json(
          { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
          { status: 401 }
        )
      }
      const userInfo = {
        id: mockData.user.id,
        email: mockData.user.email || email,
        name: (mockData.user as any).user_metadata?.name || email.split('@')[0],
        isAdmin: false,
        avatar: null,
      }
      const res = NextResponse.json({ user: userInfo })
      const { setAuthCookies } = await import('@/lib/cookie-auth')
      return setAuthCookies(res, {
        access_token: mockData.session.access_token,
        refresh_token: mockData.session.refresh_token,
        expires_at: mockData.session.expires_at,
      }, userInfo)
    }

    // ── Supabase Auth Flow (production) ──

    const supabase = await createSupabaseIsolatedClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'خدمة المصادقة غير متوفرة حالياً. يرجى المحاولة لاحقاً.' },
        { status: 503 }
      )
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        return NextResponse.json({
          error: 'البريد الإلكتروني لم يتم تأكيده بعد. تحقق من صندوق البريد.',
          errorType: 'email_not_confirmed',
        }, { status: 403 })
      }

      return NextResponse.json(
        { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 },
      )
    }

    const user = data.user
    if (!user) {
      return NextResponse.json({ error: 'فشل تسجيل الدخول' }, { status: 401 })
    }

    // Check admin role, avatar, AND suspension from the server-side profile.
    // A failure to verify account state must fail closed in production.
    let isAdmin = false
    let avatar: string | null = null
    let suspended = false
    try {
      const admin = await getSupabaseAdmin()
      if (!admin) throw new Error('profile verification unavailable')
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('role, avatar, suspended')
        .eq('id', user.id)
        .single()
      if (profileError) throw profileError
      const p = profile as { role?: string; avatar?: string; suspended?: boolean } | null
      if (isAdminRole(p?.role)) isAdmin = true
      avatar = p?.avatar || null
      suspended = p?.suspended === true
    } catch (error) {
      console.error('[auth/login] profile verification failed:', error)
      return NextResponse.json(
        { error: 'تعذر التحقق من حالة الحساب حالياً. حاول لاحقاً.' },
        { status: 503 }
      )
    }

    // ADMIN PRO: حساب موقوف — منع الدخول برسالة واضحة (423 Locked)
    if (suspended) {
      return NextResponse.json(
        { error: 'تم إيقاف هذا الحساب. تواصل مع إدارة الموقع.', code: 'SUSPENDED' },
        { status: 423 }
      )
    }

    const userInfo = {
      id: user.id,
      email: user.email || email,
      name: (user as any).user_metadata?.name || email.split('@')[0],
      isAdmin,
      avatar,
    }

    // P1#3: Set httpOnly cookies (not accessible to JS → XSS protection)
    const res = NextResponse.json({ user: userInfo })
    return setAuthCookies(res, {
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
      expires_at: data.session!.expires_at!,
    }, userInfo)
  } catch (error) {
    console.error('[auth/login] error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في تسجيل الدخول' },
      { status: 500 },
    )
  }
}
