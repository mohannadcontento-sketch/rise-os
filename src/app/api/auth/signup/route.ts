import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_EMAIL } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'البريد وكلمة المرور مطلوبان' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
    }

    // Try Supabase — if not configured, return helpful error
    const { getSupabase } = await import('@/lib/supabase')
    let supabaseClient
    try {
      supabaseClient = getSupabase()
    } catch {
      return NextResponse.json({
        error: 'خدمة إنشاء الحساب غير متوفرة حالياً. حاول لاحقاً.',
      }, { status: 503 })
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name || email.split('@')[0],
        },
      },
    })

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return NextResponse.json({ error: 'هذا البريد مسجل بالفعل' }, { status: 409 })
      }
      return NextResponse.json({ error: 'حدث خطأ في إنشاء الحساب' }, { status: 500 })
    }

    return NextResponse.json({
      user: {
        id: data.user?.id,
        email: data.user?.email,
        isAdmin: data.user?.email === ADMIN_EMAIL,
      },
      session: data.session ? {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      } : null,
      needsConfirmation: !data.session,
    })
  } catch {
    return NextResponse.json({
      error: 'خدمة إنشاء الحساب غير متوفرة حالياً. حاول لاحقاً.',
    }, { status: 503 })
  }
}