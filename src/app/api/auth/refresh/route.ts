import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json()

    // In local mode, refresh_token is a userId
    if (!refresh_token) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    // Find user by ID
    const user = await db.user.findUnique({ where: { id: refresh_token } })
    if (!user) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    return NextResponse.json({
      session: {
        access_token: user.id,
        refresh_token: '',
        expires_at: 0,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.email === ADMIN_EMAIL,
      },
    })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}