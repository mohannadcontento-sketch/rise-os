import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

    // Check if user already exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      // Return session for existing user (same as login)
      return NextResponse.json({
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          isAdmin: email === ADMIN_EMAIL,
        },
        session: {
          access_token: existing.id,
          refresh_token: '',
          expires_at: 0,
        },
      })
    }

    // Create new user
    const user = await db.user.create({
      data: {
        email,
        name: name || email.split('@')[0] || 'مستخدم',
        settings: { create: {} },
      },
    })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: email === ADMIN_EMAIL,
      },
      session: {
        access_token: user.id,
        refresh_token: '',
        expires_at: 0,
      },
    })
  } catch (error) {
    console.error('[auth/signup] error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في إنشاء الحساب' },
      { status: 500 },
    )
  }
}