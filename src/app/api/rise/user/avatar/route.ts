import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'
import { AVATARS } from '@/lib/avatars'
import { parseBody, avatarIdSchema } from '@/lib/validators'
import { tursoUpsertMember } from '@/lib/community-sync'

// ============================================================
// /api/rise/user/avatar — الإعدادات (الصورة الرمزية)
//
// يحدّث أفاتار المستخدم في profiles بمفتاح ثيم من AVATARS
// (24 ثيماً مثل ocean-3 — قيمة المفتاح لا رابط صورة)، ثم
// يزامن لقطة العضو العام في مرآة Turso (fire-and-forget).
//
// المسار محمي: requireUser — الملف الشخصي للمستخدم نفسه.
// الطرق: POST { avatar } — يعيد { success, avatar } أو 400
//        (معرّف ثيم غير موجود ضمن AVATARS) / 401 / 500.
// zod: avatarIdSchema عبر parseBody.
// Idempotency-Key: مطلوب (withIdempotency).
// ============================================================

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