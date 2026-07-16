import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_EMAIL } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    // Try Supabase — if not configured, return invalid session
    const { getSupabase } = await import('@/lib/supabase')
    let supabaseClient
    try {
      supabaseClient = getSupabase()
    } catch {
      // Supabase not configured — session invalid
      return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const { data, error } = await supabaseClient.auth.getUser(token)

    if (error || !data.user) {
      return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        isAdmin: data.user.email === ADMIN_EMAIL,
      },
    })
  } catch {
    return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })
  }
}