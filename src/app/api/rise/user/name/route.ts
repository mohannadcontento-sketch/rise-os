import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'
import { parseBody, userNameSchema } from '@/lib/validators'
import { tursoUpsertMember } from '@/lib/community-sync'

// ============================================================
// /api/rise/user/name — الإعدادات (اسم العرض)
//
// يحدّث اسم المستخدم في profiles بعد تقليم الفراغات، ثم
// يزامن لقطة العضو العام في مرآة Turso (fire-and-forget)
// ليظهر الاسم الجديد في المجتمع فوراً.
//
// المسار محمي: requireUser — الملف الشخصي للمستخدم نفسه.
// الطرق: POST { name } — يعيد { name } بعد التقليم، أو 400
//        (فراغ/تجاوز طول) / 401 / 500.
// zod: userNameSchema عبر parseBody.
// Idempotency-Key: مطلوب (withIdempotency).
// ============================================================

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const parsed = await parseBody(req, userNameSchema)
    if (!parsed.ok) return parsed.response!
    const { name } = parsed.data!
    const trimmed = name.trim()
    await data.profiles.update(userId, { name: trimmed })
    // مرآة Turso — تحديث لقطة العضو العام (fire-and-forget)
    void tursoUpsertMember(userId)
    return NextResponse.json({ name: trimmed })
  
  })
  } catch (error) {
    console.error('[user/name] error:', error)
    return NextResponse.json({ error: 'Failed to update name' }, { status: 500 })
  }
}