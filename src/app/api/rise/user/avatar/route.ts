import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getSupabaseWithAuth, isSupabaseConfigured, handleRouteError } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { avatar } = await req.json()
    if (!avatar || typeof avatar !== 'string') {
      return NextResponse.json({ error: 'الصورة الرمزية مطلوبة' }, { status: 400 })
    }

    // Update local Prisma
    await db.user.update({
      where: { id: userId },
      data: { avatar },
    })

    // Also update Supabase if available
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseWithAuth(req)
      if (supabase) {
        await supabase
          .from('user_settings')
          .update({ avatar_url: avatar })
          .eq('id', userId)
          .then(() => {}).catch(() => {})
      }
    }

    return NextResponse.json({ success: true, avatar })
  } catch (error) {
    return handleRouteError(error, 'user-avatar')
  }
}