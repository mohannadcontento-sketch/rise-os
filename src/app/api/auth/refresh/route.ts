import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json()

    const { data, error } = await getSupabase().auth.refreshSession({ refresh_token })

    if (error) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة' }, { status: 401 })
    }

    return NextResponse.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}