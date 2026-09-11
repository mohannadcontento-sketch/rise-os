import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { PLANS_UI, type PlanCode } from '@/lib/billing/plans'
import { notifySelf, subscriptionExpiringMessage } from '@/lib/notifications-service'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/rise/user/subscription
// المرحلة 03: قراءة plan/status (RLS صف المستخدم فقط).
// المرحلة 04: + لوحة الاستخدام (get_usage_overview RPC — الحدود
// من plan_entitlements = المصدر الوحيد) + بيانات العرض للخطط
// + تعليمات الدفع اليدوي (متغيرات بيئة — قابلة للتغيير دون نشر).
// ============================================================

const DEFAULT_SUBSCRIPTION = { plan: 'free', status: 'active', expiresAt: null }

/** تعليمات الدفع اليدوي v1 — من env كي يعدلها المالك من Vercel دون نشر */
function paymentInstructions() {
  const instapay = process.env.PAYMENT_INSTAPAY || ''
  const vodafone = process.env.PAYMENT_VODAFONE_CASH || ''
  const etisalat = process.env.PAYMENT_ETISALAT_CASH || ''
  const steps: string[] = []
  if (instapay) steps.push(`InstaPay: حوّل إلى ${instapay}`)
  if (vodafone) steps.push(`فودافون كاش: حوّل إلى ${vodafone}`)
  if (etisalat) steps.push(`اتصالات كاش: حوّل إلى ${etisalat}`)
  if (steps.length === 0) {
    steps.push('وسائل الدفع تُعلن هنا قريبًا — راسلنا لمعرفة تفاصيل التحويل.')
  }
  steps.push('انسخ رقم عملية التحويل ثم الصقه في نموذج طلب الترقية.')
  steps.push('تراجع إدارة أوج الطلب وتُفعّل خطتك عادةً خلال ساعات.')
  return { steps, configured: !!(instapay || vodafone || etisalat) }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        subscription: DEFAULT_SUBSCRIPTION,
        usage: null,
        plans: PLANS_UI,
        payment: paymentInstructions(),
      })
    }

    const token = getAccessToken(req)
    if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

    const client = await createSupabaseUserClient(token)
    if (!client) {
      return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })
    }

    // ── 1. الخطة المخزّنة (RLS: صفه فقط) — نفس مسار المرحلة 03 ──
    const { data, error } = await (client as any)
      .from('user_subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[user/subscription] read failed:', error.message)
      return NextResponse.json({
        subscription: DEFAULT_SUBSCRIPTION,
        usage: null,
        plans: PLANS_UI,
        payment: paymentInstructions(),
      })
    }

    // ── 2. لوحة الاستخدام: RPC واحد (خطة فعّالة + حدود + عدّادات) ──
    // الهجرة 025 غير مطبقة → overview = null (عرض فقط دون عدّادات)
    let overview: any = null
    const { data: overviewData, error: overviewError } = await (client as any).rpc(
      'get_usage_overview',
    )
    if (overviewError) {
      console.warn('[user/subscription] usage overview degraded:', overviewError.message)
    } else if (overviewData) {
      overview = overviewData
    }

    const sub = (data as { plan?: string; status?: string; expires_at?: string | null } | null) ?? null

    // ── 3. المرحلة 05: إشعار «قرب انتهاء الاشتراك» (آخر 7 أيام) ──
    // إشعار ذاتي عبر notify_user (بوابة auth.uid = المستخدم). dedup
    // على تاريخ الانتهاء: واحد فقط لكل دورة اشتراك حتى لو فتح
    // الإعدادات مرات عديدة. يتجاهل بصمت لو الهجرة 026 غير مطبقة.
    if (
      sub?.plan && sub.plan !== 'free' && sub.status === 'active' && sub.expires_at
    ) {
      const msLeft = new Date(sub.expires_at).getTime() - Date.now()
      const daysLeft = Math.ceil(msLeft / 864e5)
      if (daysLeft > 0 && daysLeft <= 7) {
        await notifySelf(
          client as any,
          {
            ...subscriptionExpiringMessage(sub.plan, sub.expires_at, daysLeft),
            dedupKey: `sub-expiring:${userId}:${sub.expires_at.slice(0, 10)}`,
          },
          userId,
        )
      }
    }

    return NextResponse.json({
      subscription: {
        plan: sub?.plan || 'free',
        status: sub?.status || 'active',
        expiresAt: sub?.expires_at ?? null,
      },
      // الخطة الفعّالة (تنتهي تلقائيًا عند انتهاء الصلاحية) — للعرض
      effectivePlan: (overview?.plan ?? 'free') as PlanCode,
      usage: overview,
      plans: PLANS_UI,
      payment: paymentInstructions(),
    })
  } catch (error) {
    console.error('[user/subscription] error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
