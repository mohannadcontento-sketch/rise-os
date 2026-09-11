import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/rise/push/test — تجربة الإشعار (المرحلة 06)
//
// «زر التجربة» في الإعدادات. ينشئ إشعارًا حقيقيًا عبر نفس
// المسار الموحد (notify_user) فيظهر داخل الموقع، ثم يمر
// إرسال Push بنفس البوابة (gate → web-push → أجهزتك النشطة).
// النتيجة تشرح للمستخدم ماذا حدث بالضبط (وصل/ممنوع بالفئة/
// لا أجهزة/محدود بالمعدل).
//
// dedup: إشعارات التجربة تُمحى تلقائيًا بعد ساعة (expires_at)
// حتى لا تتراكم في المركز.
// ============================================================

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  // نفس خط الإنشاء الموحد — يشغّل Push تلقائيًا (نفس الحدث)
  const { notifyUser } = await import('@/lib/notifications-service')
  const result = await notifyUser(admin as any, {
    userId,
    type: 'system',
    title: '🔔 إشعار تجريبي من أوج',
    body: 'لو وصلك هذا على جهازك فكل شيء يعمل. سيُحذف هذا الإشعار تلقائيًا بعد ساعة.',
    icon: '🔔',
    actionUrl: 'settings',
    priority: 'normal',
    expiresAt,
    metadata: { category: 'important', test: true },
  })

  // نحتاج نتيجة الإرسال نفسها لعرضها — استعلام الادعاء يخبرنا
  // هل أُرسل Push فعلًا (pushed_at) أم منعته البوابة
  let push: Record<string, unknown> = { attempted: 0, sent: 0, revoked: 0 }
  if (result.created && result.id) {
    const { data: row } = await (admin as any)
      .from('notifications')
      .select('pushed_at')
      .eq('id', result.id)
      .single()
    push = { pushed: !!row?.pushed_at }
  }

  await logAudit(req, userId, 'push-test', {
    resource: 'notifications',
    resourceId: result.id ?? undefined,
    details: { created: result.created },
  })

  if (!result.created) {
    return NextResponse.json({
      success: false,
      reason: result.deduplicated ? 'deduplicated' : 'creation_failed',
      push,
    })
  }

  return NextResponse.json({ success: true, notificationId: result.id, push })
}
