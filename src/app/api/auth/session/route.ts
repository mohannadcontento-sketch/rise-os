import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')

    // No token — return empty session
    if (!token) {
      return NextResponse.json({ user: null, expires: null })
    }

    // In local mode, the "access_token" IS the userId
    // Validate it exists in the database
    const user = await db.user.findUnique({
      where: { id: token },
      select: { id: true, email: true, name: true },
    })

    if (!user) {
      return NextResponse.json({ user: null, expires: null })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.email === ADMIN_EMAIL,
      },
    })
  } catch {
    return NextResponse.json({ user: null, expires: null })
  }
}