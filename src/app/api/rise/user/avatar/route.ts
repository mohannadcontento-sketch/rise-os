import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'
import { AVATARS } from '@/lib/avatars'
import { parseBody, avatarIdSchema } from '@/lib/validators'
import { tursoUpsertMember } from '@/lib/community-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const parsed = await parseBody(req, avatarIdSchema)
    if (!parsed.ok) return parsed.response!
    const { avatar } = parsed.data!
    if (!AVATARS.some(item => item.id === avatar)) {
      return NextResponse.json({ error: 'الصورة الرمزية غير صالحة' }, { status: 400 })
    }
    await data.profiles.update(userId, { avatar })
    // مرآة Turso — تحديث لقطة العضو العام (fire-and-forget)
    void tursoUpsertMember(userId)
    return NextResponse.json({ success: true, avatar })
  
  })
  } catch (error) {
    console.error('[user/avatar] error:', error)
    return NextResponse.json({ error: 'Failed to update avatar' }, { status: 500 })
  }
}