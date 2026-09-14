import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseBody, adminFeedbackActionSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/feedback — تاب «ملاحظات البيتا» (المرحلة 15)
//
// GET  → آخر 200 ملاحظة + أسماء أصحابها (profiles) + إحصاءات
//        الحالة/النوع/آخر 24 ساعة — كلها بحساب واحد من العينة
//        (نفس فلسفة admin/errors: لا استعلامات إضافية).
// POST → { action: 'set-status', id, status } — تحديث حالة
//        ملاحظة (new/read/handled) عبر service role. عند
//        «handled» يُختم handled_at تلقائيًا. كل تعديل يمرّ
//        بـlogAudit (من/متى/قبل/بعد).
//
// RLS: الجدول بلا سياسات UPDATE للمستخدمين — التعديل ممكن فقط
// هنا عبر service role. القيم المسموحة مقيّدة بـCHECK في القاعدة
// نفسها (هجرة 037) + zod قبل الوصول.
//
// الحد: 30 طلبًا/دقيقة (middleware RATE_LIMITS).
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })
    const sb = admin as any

    const { data: rows, error } = await sb
      .from('feedback')
      .select('id, user_id, type, message, page, status, created_at, handled_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      // 42P01/PGRST205 = الجدول غير موجود (هجرة 037 غير مطبقة)
      console.warn('[admin/feedback] query error:', error.message)
      return NextResponse.json({
        feedback: [],
        counts: { new: 0, read: 0, handled: 0, last24h: 0, byType: {} },
        tableMissing: true,
      })
    }

    // أسماء أصحاب الملاحظات — دفعة واحدة
    const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id))] as string[]
    const nameById = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: profs, error: profsError } = await sb
        .from('profiles')
        .select('id, name')
        .in('id', userIds)
      if (!profsError && profs) {
        for (const p of profs) nameById.set(p.id, p.name || 'بدون اسم')
      }
    }

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const counts = { new: 0, read: 0, handled: 0, last24h: 0, byType: {} as Record<string, number> }
    for (const r of rows ?? []) {
      counts[r.status as 'new' | 'read' | 'handled'] = (counts as any)[r.status] + 1
      counts.byType[r.type] = (counts.byType[r.type] || 0) + 1
      if (r.created_at >= since24h) counts.last24h += 1
    }

    return NextResponse.json({
      feedback: (rows ?? []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        userName: nameById.get(r.user_id) ?? null,
        type: r.type,
        message: r.message,
        page: r.page,
        status: r.status,
        createdAt: r.created_at,
        handledAt: r.handled_at,
      })),
      counts,
      tableMissing: false,
    })
  } catch (error) {
    console.error('[admin/feedback] GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل الملاحظات' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const parsed = await parseBody(request, adminFeedbackActionSchema)
    if (!parsed.ok || !parsed.data) return parsed.response!
    const input = parsed.data

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })
    const sb = admin as any

    // القيمة قبل التعديل لسجل التدقيق
    const { data: before } = await sb
      .from('feedback')
      .select('id, status, handled_at')
      .eq('id', input.id)
      .maybeSingle()
    if (!before) {
      return NextResponse.json({ error: 'الملاحظة غير موجودة' }, { status: 404 })
    }

    const { error: updateError } = await sb
      .from('feedback')
      .update({
        status: input.status,
        handled_at: input.status === 'handled' ? new Date().toISOString() : before.handled_at,
      })
      .eq('id', input.id)

    if (updateError) {
      console.error('[admin/feedback] update failed:', updateError.message)
      return NextResponse.json({ error: 'فشل تحديث الحالة' }, { status: 500 })
    }

    await logAudit(request, adminId, 'feedback-status-set', {
      resource: 'feedback',
      resourceId: input.id,
      details: {
        before: { status: before.status, handled_at: before.handled_at },
        after: { status: input.status },
      },
    })

    return NextResponse.json({ ok: true, id: input.id, status: input.status })
  } catch (error) {
    console.error('[admin/feedback] POST error:', error)
    return NextResponse.json({ error: 'تعذر تحديث الحالة' }, { status: 500 })
  }
}
