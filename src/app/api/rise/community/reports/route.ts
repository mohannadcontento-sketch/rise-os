import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityReportSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/reports — الإبلاغ عن محتوى (المرحلة 07)
//
// POST : بلاغ (reason + details?) — قيد فريد (reporter, target)
//        يمنع تكرار بلاغ نفس المستخدم لنفس الهدف (anti-spam).
//        البلاغ يدخل مسار المراجعة: status='open' → لوحة
//        الأدمن «المجتمع» → إخفاء/إزالة/استبعاد.
//        لا يمكن الإبلاغ عن محتواك أو عن محتوى غير موجود.
//        الاستجابة عامة دائمًا (لا نكشف من بلغ).
// ============================================================

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, communityReportSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const { targetType, targetId, reason, details } = parsed.data
  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const table = targetType === 'post' ? 'community_posts' : 'community_comments'
  const { data: target } = await (client as any)
    .from(table)
    .select('id, user_id, status')
    .eq('id', targetId)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: 'المحتوى غير موجود' }, { status: 404 })
  if (target.user_id === userId) {
    return NextResponse.json({ error: 'لا يمكن الإبلاغ عن محتواك' }, { status: 400 })
  }

  const { error } = await (client as any).from('community_reports').insert({
    reporter_id: userId,
    target_type: targetType,
    target_id: targetId,
    reason,
    details: details ?? null,
  })

  if (error) {
    if (error.message.includes('duplicate key')) {
      return NextResponse.json({ ok: true, already: true, message: 'بلاغك عن هذا المحتوى مسجل بالفعل' })
    }
    console.warn('[community/reports] insert failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تسجيل البلاغ — أعد المحاولة' }, { status: 500 })
  }

  await logAudit(req, userId, 'community-report', {
    resource: 'community_reports',
    resourceId: targetId,
    details: { targetType, reason },
  })

  return NextResponse.json({
    ok: true,
    message: 'تم استلام البلاغ — سيراجعه المشرفون قريبًا',
  }, { status: 201 })
}
