import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody } from '@/lib/validators'
import { subscriptionRequestSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/user/subscription/requests — المرحلة 04 (دفع يدوي v1)
//
// GET  : قائمة طلباتي (pending/approved/rejected + سبب الرفض).
// POST : إنشاء طلب ترقية — التحقق zod ثم إدراج RLS:
//        WITH CHECK (auth.uid() = user_id AND status = 'pending'
//        AND reviewed_* IS NULL) — المستخدم لا يستطيع اختيار
//        الحالة أو انتحال مراجعة. فهرس فريد يمنع تكرار pending
//        لنفس الخطة. المراجعة (approve/reject) حكر على
//        service_role عبر /api/rise/admin/subscriptions.
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ requests: [] })
    }

    const token = getAccessToken(req)
    if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

    const client = await createSupabaseUserClient(token)
    if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

    // RLS: يرى طلباته فقط — مرتبة بالأحدث
    const { data, error } = await (client as any)
      .from('subscription_requests')
      .select('id, requested_plan, status, payment_method, reference, note, created_at, reviewed_at, rejection_reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      // الهجرة 025 غير مطبقة → لا طلبات بعد
      console.warn('[subscription/requests] list degraded:', error.message)
      return NextResponse.json({ requests: [] })
    }

    const requests = (data ?? []).map((r: any) => ({
      id: r.id,
      requestedPlan: r.requested_plan,
      status: r.status,
      paymentMethod: r.payment_method,
      reference: r.reference,
      note: r.note ?? null,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at ?? null,
      rejectionReason: r.rejection_reason ?? null,
    }))

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('[subscription/requests] GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'الاشتراكات غير مفعّلة في هذا النظام' }, { status: 503 })
    }

    const parsed = await parseBody(req, subscriptionRequestSchema)
    if (!parsed.ok || !parsed.data) return parsed.response!

    const token = getAccessToken(req)
    if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

    const client = await createSupabaseUserClient(token)
    if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

    // إدراج عبر RLS — أي محاولة تزييف (حالة/مراجعين) تُرفض على مستوى
    // الـ policy نفسها (WITH CHECK أعلاه).
    const { data, error } = await (client as any)
      .from('subscription_requests')
      .insert({
        user_id: userId,
        requested_plan: parsed.data.requestedPlan,
        payment_method: parsed.data.paymentMethod,
        reference: parsed.data.reference,
        note: parsed.data.note ?? null,
      })
      .select('id, requested_plan, status, created_at')
      .single()

    if (error) {
      // 23505 = طلب pending مكرر لنفس الخطة (الفهرس الفريد)
      if (String(error.code) === '23505') {
        return NextResponse.json(
          { error: 'لديك طلب ترقية معلّق لنفس الخطة بالفعل — بانتظار المراجعة.' },
          { status: 409 },
        )
      }
      console.error('[subscription/requests] insert failed:', error.message)
      return NextResponse.json({ error: 'تعذر إرسال الطلب — حاول لاحقًا' }, { status: 500 })
    }

    return NextResponse.json({
      request: {
        id: data.id,
        requestedPlan: data.requested_plan,
        status: data.status,
        createdAt: data.created_at,
      },
      message: 'تم إرسال طلبك! ستراجعه إدارة أوج وتفعّل خطتك عادةً خلال ساعات.',
    })
  } catch (error) {
    console.error('[subscription/requests] POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
