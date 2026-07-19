import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon, getSupabaseAdmin, isSupabaseConfigured, ADMIN_EMAIL } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'البريد وكلمة المرور مطلوبان' }, { status: 400 })
    }

    // Supabase Auth Flow (only auth method)
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'خدمة المصادقة غير متوفرة حالياً. يرجى المحاولة لاحقاً.' },
        { status: 503 }
      )
    }

    const supabase = await getSupabaseAnon()
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

    // Check admin role and avatar from Supabase profiles table
    let isAdmin = email === ADMIN_EMAIL
    let avatar: string | null = null
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { data: profile } = await admin
          .from('profiles')
          .select('role, avatar')
          .eq('id', user.id)
          .single()
        if (profile?.role === 'admin') isAdmin = true
        avatar = profile?.avatar || null
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || email.split('@')[0],
        isAdmin,
        avatar,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    })
  } catch (error) {
    console.error('[auth/login] error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في تسجيل الدخول' },
      { status: 500 },
    )
  }
}
