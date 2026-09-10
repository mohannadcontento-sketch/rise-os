import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'
import { AVATARS } from '@/lib/avatars'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const { avatar } = await req.json()
    if (!avatar || typeof avatar !== 'string') {
      return NextResponse.json({ error: 'الصورة الرمزية مطلوبة' }, { status: 400 })
    }
    if (!AVATARS.some(item => item.id === avatar)) {
      return NextResponse.json({ error: 'الصورة الرمزية غير صالحة' }, { status: 400 })
    }
    await data.profiles.update(userId, { avatar })
    return NextResponse.json({ success: true, avatar })
  
  })
  } catch (error) {
    console.error('[user/avatar] error:', error)
    return NextResponse.json({ error: 'Failed to update avatar' }, { status: 500 })
  }
}