import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseBody } from '@/lib/validators'
import { adminPlansActionSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/plans — المرحلة 11 (الوحدة الناقصة: Plans UI)
//
// الغرض من الخطة: «تعديل الحدود والمزايا دون hard-code متكرر».
// المصدر الوحيد للـenforcement هو جدول plan_entitlements (هجرة
// 025: consume_usage يقرأه داخل قاعدة البيانات بقفل صف) —
// أي تعديل هنا يسري فورًا على القرار الخادمي بلا نشر جديد
// ولا أي كود حدود في التطبيق.
//
// GET  : الخطط (plans) + كل صفوف plan_entitlements مرتبة.
// POST : { action: 'set-entitlement', plan, featureKey, enabled,
//         dailyLimit?, monthlyLimit? } — upsert بـservice_role
//         (RLS لا write policies = التعديل مستحيل للمستخدمين).
// كل كتابة: logAudit (من عدّل ومتى والقيم قبل/بعد).
//
// حدود الأمان: dailyLimit/monthlyLimit أعداد صحيحة 0..100000
// (0 = ميزة مقفولة عمليًا؛ null = بلا سقف في ذلك البُعد).
// ============================================================

interface PlanRow {
  code: string
  name_ar: string
  price_egp: string | number
  active: boolean
  sort_order: number
}

interface EntitlementRow {
  plan_code: string
  feature_key: string
  enabled: boolean
  daily_limit: number | null
  monthly_limit: number | null
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

    const [{ data: plansRaw, error: plansError }, { data: entsRaw, error: entsError }] = await Promise.all([
      sb.from('plans').select('code, name_ar, price_egp, active, sort_order').order('sort_order'),
      sb
        .from('plan_entitlements')
        .select('plan_code, feature_key, enabled, daily_limit, monthly_limit')
        .order('plan_code')
        .order('feature_key'),
    ])

    if (plansError || entsError) {
      console.error('[admin/plans] read failed:', plansError?.message ?? entsError?.message)
      return NextResponse.json({ error: 'تعذر قراءة الخطط' }, { status: 500 })
    }

    const plans: PlanRow[] = (plansRaw ?? []).map((p: any) => ({
      code: p.code,
      name_ar: p.name_ar,
      price_egp: p.price_egp,
      active: !!p.active,
      sort_order: p.sort_order,
    }))

    const entitlements: EntitlementRow[] = (entsRaw ?? []).map((e: any) => ({
      plan_code: e.plan_code,
      feature_key: e.feature_key,
      enabled: !!e.enabled,
      daily_limit: e.daily_limit,
      monthly_limit: e.monthly_limit,
    }))

    return NextResponse.json({ plans, entitlements })
  } catch (error) {
    console.error('[admin/plans] GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const parsed = await parseBody(request, adminPlansActionSchema)
    if (!parsed.ok || !parsed.data) return parsed.response!
    const input = parsed.data

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })
    const sb = admin as any

    // القيمة الحالية (قبل التعديل) لسجل التدقيق
    const { data: before } = await sb
      .from('plan_entitlements')
      .select('enabled, daily_limit, monthly_limit')
      .eq('plan_code', input.plan)
      .eq('feature_key', input.featureKey)
      .maybeSingle()

    const { error: upsertError } = await sb
      .from('plan_entitlements')
      .upsert(
        {
          plan_code: input.plan,
          feature_key: input.featureKey,
          enabled: input.enabled,
          daily_limit: input.dailyLimit ?? null,
          monthly_limit: input.monthlyLimit ?? null,
        },
        { onConflict: 'plan_code,feature_key' },
      )

    if (upsertError) {
      console.error('[admin/plans] upsert failed:', upsertError.message)
      return NextResponse.json({ error: 'فشل حفظ الحد' }, { status: 500 })
    }

    await logAudit(request, adminId, 'plan-entitlement-set', {
      resource: 'plan_entitlements',
      resourceId: `${input.plan}:${input.featureKey}`,
      details: {
        before: before ?? null,
        after: {
          enabled: input.enabled,
          daily_limit: input.dailyLimit ?? null,
          monthly_limit: input.monthlyLimit ?? null,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: `تم حفظ حد «${input.featureKey}» لخطة ${input.plan} — يسري فورًا على القرار الخادمي.`,
    })
  } catch (error) {
    console.error('[admin/plans] POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
