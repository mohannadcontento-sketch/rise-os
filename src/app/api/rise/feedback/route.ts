import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'
import { parseBody, feedbackSubmitSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/feedback — قناة ملاحظات البيتا (المرحلة 15)
//
// بند الخطة: «جمع Feedback داخل التطبيق». المستخدم يرسل ملاحظة
// (مشكلة/اقتراح/سؤال/أخرى) من الإعدادات ويتابع حالتها.
//
// POST { type, message, page? } → إدراج باسم المستخدم (RLS:
//   user_id = auth.uid()) عبر Idempotency-Key — إعادة الإرسال
//   الشبكي لا تُكرر الملاحظة.
// GET → آخر 20 ملاحظة للمستخدم نفسه + حالتها.
//
// التدهور الرشيق قبل تطبيق هجرة 037: POST → 503 FEEDBACK_NOT_READY
// وGET → { feedback: [], notReady: true } — الواجهة تعرض رسالة
// ودّية بدل الانهيار (نفس نمط error_logs في المسارات الإدارية).
//
// الحد: 5 طلبات/دقيقة (middleware RATE_LIMITS).
// ============================================================

function isTableMissing(err: any): boolean {
  const msg = String(err?.message || err || '')
  return (
    err?.code === '42P01' ||
    err?.code === 'PGRST205' ||
    (msg.includes('feedback') && (msg.includes('does not exist') || msg.includes('not found')))
  )
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    return withIdempotency(req, userId, async () => {
      const parsed = await parseBody(req, feedbackSubmitSchema)
      if (!parsed.ok) return parsed.response!
      const { type, message, page } = parsed.data!

      try {
        const row = await data.feedback.insert(userId, { type, message, page })
        return NextResponse.json({ ok: true, feedback: row })
      } catch (err: any) {
        if (isTableMissing(err)) {
          // هجرة 037 لم تُطبَّق بعد — قناة الملاحظات غير مفعّلة
          return NextResponse.json(
            { error: 'قناة الملاحظات لم تُفعَّل بعد — جرّب لاحقًا', code: 'FEEDBACK_NOT_READY' },
            { status: 503 },
          )
        }
        throw err
      }
    })
  } catch (error) {
    console.error('[feedback] POST error:', error)
    return NextResponse.json({ error: 'تعذر إرسال الملاحظة' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    try {
      const list = await data.feedback.listOwn(userId, 20)
      return NextResponse.json({ feedback: list })
    } catch (err: any) {
      if (isTableMissing(err)) {
        return NextResponse.json({ feedback: [], notReady: true })
      }
      throw err
    }
  } catch (error) {
    console.error('[feedback] GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل ملاحظاتك' }, { status: 500 })
  }
}
