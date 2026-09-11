import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseBody } from '@/lib/validators'
import { RECOVERY_EMAIL_HTML, RECOVERY_EMAIL_SUBJECT } from '@/lib/email/recovery-template'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/email-template — المرحلة 05 (طلب المالك)
//
// تطبيق قالب إيميل «إعادة تعيين كلمة المرور» على Supabase
// (auth.email_templates → type='recovery') من لوحة الأدمن
// بضغطة واحدة — بدل اللصق اليدوي من الـDashboard.
//
// GET  : معاينة القالب الافتراضي (الموضوع + HTML + طوله).
// POST : { subject?, html? } (افتراضيًا قالب أوج الحالي) →
//        RPC admin_apply_recovery_email_template (SECURITY
//        DEFINER، بوابة أدمن). الاستجابة applied/reason:
//          updated           → تم التطبيق ✓
//          table_missing     → المشروع لا يملك الجدول → لصق يدوي
//          permission        → الدور لا يملك الكتابة → لصق يدوي
//          schema_mismatch   → بنية مختلفة → لصق يدوي
//        الفشل الصامت ممنوع: كل حالة لها إرشاد واضح.
// ============================================================

const ApplySchema = z.object({
  subject: z.string().max(200).optional(),
  html: z.string().min(200).max(60_000).optional(),
}).strict()

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    return NextResponse.json({
      subject: RECOVERY_EMAIL_SUBJECT,
      html: RECOVERY_EMAIL_HTML,
      contentLength: RECOVERY_EMAIL_HTML.length,
      hasConfirmationUrl: RECOVERY_EMAIL_HTML.includes('{{ .ConfirmationURL }}'),
    })
  } catch (error) {
    console.error('[admin/email-template] GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const parsed = await parseBody(request, ApplySchema)
    if (!parsed.ok || !parsed.data) return parsed.response!
    const input = parsed.data

    // المحتوى الافتراضي = قالب أوج (يسمح الأدمن بتعديل الموضوع فقط)
    const html = input.html && input.html.length >= 200 ? input.html : RECOVERY_EMAIL_HTML
    const subject = input.subject?.trim() || RECOVERY_EMAIL_SUBJECT

    if (!html.includes('{{ .ConfirmationURL }}')) {
      return NextResponse.json(
        { error: 'القالب يجب أن يحتوي على {{ .ConfirmationURL }} — بدونه يتوقف تدفق إعادة التعيين' },
        { status: 400 },
      )
    }

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })

    const { data, error } = await (admin as any).rpc('admin_apply_recovery_email_template', {
      p_content: html,
      p_subject: subject,
    })

    if (error) {
      // الهجرة 026 غير مطبقة → الدالة غير موجودة
      const msg = String(error.message || '')
      if (msg.includes('admin_apply_recovery_email_template') || msg.includes('function') || msg.includes('PGRST202')) {
        return NextResponse.json(
          {
            applied: false,
            reason: 'migration_missing',
            note: 'شغّل migration 026_phase5_notifications_center.sql في Supabase SQL Editor أولًا ثم أعد المحاولة.',
          },
          { status: 200 },
        )
      }
      console.error('[admin/email-template] RPC error:', msg)
      return NextResponse.json({ error: 'فشل تطبيق القالب: ' + msg }, { status: 500 })
    }

    const r = (data ?? {}) as { applied?: boolean; reason?: string; note?: string }

    await logAudit(request, adminId, 'email-template-apply', {
      resource: 'auth.email_templates',
      resourceId: 'recovery',
      details: {
        applied: !!r.applied,
        reason: r.reason ?? null,
        contentLength: html.length,
        subject,
      },
    })

    return NextResponse.json({
      applied: !!r.applied,
      reason: r.reason ?? 'updated',
      note: r.note ?? null,
      contentLength: html.length,
      subject,
    })
  } catch (error) {
    console.error('[admin/email-template] POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
