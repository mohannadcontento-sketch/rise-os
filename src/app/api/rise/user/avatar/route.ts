import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { avatar } = await req.json()
    if (!avatar || typeof avatar !== 'string') {
      return NextResponse.json({ error: 'الصورة الرمزية مطلوبة' }, { status: 400 })
    }

    // Update Supabase profile
    if (isSupabaseConfigured()) {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { error } = await admin
          .from('profiles')
          .update({ avatar })
          .eq('id', userId)
        if (error) console.error('[user/avatar] Supabase error:', error)
      }
    }

    return NextResponse.json({ success: true, avatar })
  } catch (error) {
    console.error('[user/avatar] error:', error)
    return NextResponse.json({ error: 'Failed to update avatar' }, { status: 500 })
  }
}