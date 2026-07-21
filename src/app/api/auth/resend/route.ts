import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'البريد مطلوب' }, { status: 400 })
    }

    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseAnon()
      if (supabase) {
        const { error } = await supabase.auth.resend({ type: 'signup', email })
        if (error) {
          return NextResponse.json({ error: 'فشل إعادة الإرسال' }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}