import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'البريد مطلوب' }, { status: 400 })
    }

    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email,
    })

    if (error) {
      return NextResponse.json({ error: 'فشل إعادة الإرسال' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}