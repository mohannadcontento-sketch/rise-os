import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseBody } from '@/lib/validators'
import { adminSubscriptionActionSchema } from '@/lib/validators'
import { notifyUser, subscriptionApprovedMessage, subscriptionRejectedMessage, subscriptionSetPlanMessage } from '@/lib/notifications-service'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/subscriptions — المرحلة 04 (admin side)
//
// GET  : الطلبات المعلّقة + آخر 50 طلبًا مراجَعًا + خطط المستخدمين
//        النشطين (لجدول إدارة الاشتراكات).
// POST : { action }:
//   • approve  : requestId + months? (افتراضي 1) + reference?
//                → تفعيل الخطة: user_subscriptions تُحدَّث (plan,
//                status active, started_at, expires_at = +months,
//                payment_method, reference, activated_by = adminId)
//                + الطلب approved. كله بعميل service_role داخل
//                "معاملة منطقية" (خطوتان) — لا RLS على المسار.
//   • reject   : requestId + reason (يظهر للمستخدم).
//   • set-plan : userId + plan + months? + reference? — تعيين
//                يدوي مباشر (تجهيز/دعم/تجربة).
// كل إجراء يُسجَّل في audit log (من فعّل ومتى والمرجع).
// ============================================================

interface RequestRow {
  id: string
  user_id: string
  requested_plan: string
  status: string
  payment_method: string
  reference: string
  note: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  user_name?: string | null
  user_email?: string | null
}

function toApiRow(r: RequestRow) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name ?? null,
    userEmail: r.user_email ?? null,
    requestedPlan: r.requested_plan,
    status: r.status,
    paymentMethod: r.payment_method,
    reference: r.reference,
    note: r.note ?? null,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at ?? null,
    rejectionReason: r.rejection_reason ?? null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })
    const sb = admin as any

    // الطلبات المعلّقة (الأقدم أولًا) + آخر 50 مراجَعًا — مع بيانات المستخدم
    const { data: pendingRaw } = await sb
      .from('subscription_requests')
      .select('*, profiles!subscription_requests_user_id_fkey(id, name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200)

    const { data: reviewedRaw } = await sb
      .from('subscription_requests')
      .select('*, profiles!subscription_requests_user_id_fkey(id, name, email)')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)

    // المشتركون غير المجانيين الحاليون (لاجهزة الإدارة) — user_subscriptions
    // تُشير بـ FK إلى auth.users (هجرة 024) فلا يوجد مسار embed إلى
    // profiles → نجلب الاثنين وندمج في الذاكرة.
    const { data: subsRaw } = await sb
      .from('user_subscriptions')
      .select('user_id, plan, status, started_at, expires_at, updated_at, payment_method, reference, activated_by')
      .neq('plan', 'free')
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(200)

    const subUserIds = (subsRaw ?? []).map((s: any) => s.user_id)
    const profileMap = new Map<string, { name: string | null; email: string | null }>()
    if (subUserIds.length > 0) {
      const { data: profileRows } = await sb
        .from('profiles')
        .select('id, name, email')
        .in('id', subUserIds)
      for (const p of profileRows ?? []) {
        profileMap.set(p.id, { name: p.name, email: p.email })
      }
    }

    const attachUser = (r: any) => ({
      ...r,
      user_name: r.profiles?.name ?? null,
      user_email: r.profiles?.email ?? null,
      profiles: undefined,
    })

    const pending = (pendingRaw ?? []).map(attachUser).map(toApiRow)
    const reviewed = (reviewedRaw ?? []).map(attachUser).map(toApiRow)

    const subscriptions = (subsRaw ?? []).map((s: any) => ({
      userId: s.user_id,
      userName: profileMap.get(s.user_id)?.name ?? null,
      userEmail: profileMap.get(s.user_id)?.email ?? null,
      plan: s.plan,
      status: s.status,
      startedAt: s.started_at,
      expiresAt: s.expires_at,
      updatedAt: s.updated_at,
      paymentMethod: s.payment_method ?? null,
      reference: s.reference ?? null,
      activatedBy: s.activated_by ?? null,
    }))

    return NextResponse.json({ pending, reviewed, subscriptions })
  } catch (error) {
    console.error('[admin/subscriptions] GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const parsed = await parseBody(request, adminSubscriptionActionSchema)
    if (!parsed.ok || !parsed.data) return parsed.response!
    const input = parsed.data

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })
    const sb = admin as any

    // ── approve ──
    if (input.action === 'approve') {
      const { data: reqRow } = await sb
        .from('subscription_requests')
        .select('*')
        .eq('id', input.requestId)
        .maybeSingle()

      if (!reqRow) {
        return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
      }
      if (reqRow.status !== 'pending') {
        return NextResponse.json({ error: 'تمت مراجعة هذا الطلب بالفعل' }, { status: 409 })
      }

      const months = input.months ?? 1
      const now = new Date().toISOString()
      const expires = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()

      // التفعيل: صف الاشتراك (UPSERT عبر service_role — RLS لا ينطبق)
      const { error: subError } = await sb
        .from('user_subscriptions')
        .upsert({
          user_id: reqRow.user_id,
          plan: reqRow.requested_plan,
          status: 'active',
          started_at: now,
          expires_at: expires,
          payment_method: reqRow.payment_method,
          reference: input.reference ?? reqRow.reference,
          activated_by: adminId,
          updated_at: now,
        })

      if (subError) {
        console.error('[admin/subscriptions] upsert failed:', subError.message)
        return NextResponse.json({ error: 'فشل تفعيل الاشتراك' }, { status: 500 })
      }

      // غلق الطلب approved
      const { error: markError } = await sb
        .from('subscription_requests')
        .update({ status: 'approved', reviewed_at: now, reviewed_by: adminId })
        .eq('id', input.requestId)

      if (markError) {
        console.error('[admin/subscriptions] mark approved failed:', markError.message)
      }

      await logAudit(request, adminId, 'subscription-approve', {
        resource: 'subscription_requests',
        resourceId: String(input.requestId),
        details: {
          userId: reqRow.user_id,
          plan: reqRow.requested_plan,
          months,
          reference: input.reference ?? reqRow.reference,
          paymentMethod: reqRow.payment_method,
        },
      })

      // المرحلة 05: إشعار المستخدم بالتفعيل (dedup على مستوى الطلب —
      // لا يتكرر لو أعاد الأدمن المراجعة/التزامن). فشل الإشعار لا
      // يفشّل الموافقة.
      await notifyUser(sb, {
        userId: reqRow.user_id,
        ...subscriptionApprovedMessage(reqRow.requested_plan, months, expires),
        dedupKey: `subreq-approved:${String(input.requestId)}`,
      })

      return NextResponse.json({
        success: true,
        message: `تم تفعيل خطة ${reqRow.requested_plan === 'max' ? 'ماكس' : 'بلس'} لمدة ${months} شهر.`,
        expiresAt: expires,
      })
    }

    // ── reject ──
    if (input.action === 'reject') {
      const { data: reqRow } = await sb
        .from('subscription_requests')
        .select('*')
        .eq('id', input.requestId)
        .maybeSingle()

      if (!reqRow) {
        return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
      }
      if (reqRow.status !== 'pending') {
        return NextResponse.json({ error: 'تمت مراجعة هذا الطلب بالفعل' }, { status: 409 })
      }

      const now = new Date().toISOString()
      const { error: markError } = await sb
        .from('subscription_requests')
        .update({
          status: 'rejected',
          reviewed_at: now,
          reviewed_by: adminId,
          rejection_reason: input.reason ?? 'لم يُقبل الدفع',
        })
        .eq('id', input.requestId)

      if (markError) {
        console.error('[admin/subscriptions] mark rejected failed:', markError.message)
        return NextResponse.json({ error: 'فشل رفض الطلب' }, { status: 500 })
      }

      await logAudit(request, adminId, 'subscription-reject', {
        resource: 'subscription_requests',
        resourceId: String(input.requestId),
        details: { userId: reqRow.user_id, plan: reqRow.requested_plan, reason: input.reason ?? '' },
      })

      // المرحلة 05: إشعار المستخدم بالرفض + السبب (dedup على الطلب)
      await notifyUser(sb, {
        userId: reqRow.user_id,
        ...subscriptionRejectedMessage(reqRow.requested_plan, input.reason ?? 'لم يُقبل الدفع'),
        dedupKey: `subreq-rejected:${String(input.requestId)}`,
      })

      return NextResponse.json({ success: true, message: 'تم رفض الطلب وإبلاغ المستخدم.' })
    }

    // ── set-plan (تعيين يدوي مباشر) ──
    // (zod refine يضمن وجودهما؛ هذا الحرس يضيّق الأنواع أيضًا)
    if (!input.userId || !input.plan) {
      return NextResponse.json({ error: 'userId و plan مطلوبان للتعيين اليدوي' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const months = input.months ?? 1
    const isFree = input.plan === 'free'
    const expires = isFree
      ? null
      : new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error: subError } = await sb
      .from('user_subscriptions')
      .upsert({
        user_id: input.userId,
        plan: input.plan,
        status: 'active',
        started_at: now,
        expires_at: expires,
        payment_method: 'manual_admin',
        reference: input.reference ?? 'admin-set',
        activated_by: adminId,
        updated_at: now,
      })

    if (subError) {
      console.error('[admin/subscriptions] set-plan failed:', subError.message)
      return NextResponse.json({ error: 'فشل تعيين الخطة' }, { status: 500 })
    }

    await logAudit(request, adminId, 'subscription-set-plan', {
      resource: 'user_subscriptions',
      resourceId: String(input.userId),
      details: { plan: input.plan, months, reference: input.reference ?? 'admin-set' },
    })

    // المرحلة 05: إشعار المستخدم بالتعيين اليدوي (dedup على المستخدم+الخطة+التاريخ)
    await notifyUser(sb, {
      userId: input.userId,
      ...subscriptionSetPlanMessage(input.plan, isFree ? null : months, isFree ? null : expires),
      dedupKey: `sub-set:${input.userId}:${input.plan}:${now.slice(0, 10)}`,
    })

    return NextResponse.json({
      success: true,
      message: `تم تعيين الخطة (${input.plan})${isFree ? '' : ` لمدة ${months} شهر`}.`,
      expiresAt: expires,
    })
  } catch (error) {
    console.error('[admin/subscriptions] POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
