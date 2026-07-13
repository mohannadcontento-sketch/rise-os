import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')

    if (!token || token === 'guest') {
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
        isAdmin: data.user.email === 'mhndsyd872@gmail.com',
      },
    })
  } catch {
    return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })
  }
}