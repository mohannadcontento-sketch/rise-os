import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_EMAIL } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'البريد وكلمة المرور مطلوبان' }, { status: 400 })
    }

    // Try Supabase — if not configured, return helpful error
    const { getSupabase } = await import('@/lib/supabase')
    let supabaseClient
    try {
      supabaseClient = getSupabase()
    } catch {
      return NextResponse.json({
        error: 'خدمة تسجيل الدخول غير متوفرة حالياً. استخدم وضع الضيف للمتابعة.',
        guestFallback: true,
      }, { status: 503 })
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      if (error.message.includes('Invalid login') || error.message.includes('Invalid credentials')) {
        return NextResponse.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, { status: 401 })
      }
      if (error.message.includes('Email not confirmed')) {
        return NextResponse.json({ error: 'البريد الإلكتروني لم يتم تأكيده بعد. يرجى التحقق من بريدك الوارد أو طلب إعادة إرسال رابط التأكيد.', errorType: 'email_not_confirmed', email }, { status: 403 })
      }
      if (error.message.includes('too many')) {
        return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        isAdmin: data.user.email === ADMIN_EMAIL,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    })
  } catch {
    return NextResponse.json({
      error: 'خدمة تسجيل الدخول غير متوفرة حالياً. استخدم وضع الضيف.',
      guestFallback: true,
    }, { status: 503 })
  }
}