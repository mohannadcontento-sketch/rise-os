import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseIsolatedClient, isSupabaseConfigured } from '@/lib/supabase'
import { parseBody, resendSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, resendSchema)
    if (!parsed.ok) return parsed.response!
    const { email } = parsed.data!

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseIsolatedClient()
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