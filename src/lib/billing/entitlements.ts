// ============================================================
// entitlements.ts — بوابة الخادم لحدود الخطط (المرحلة 04).
//
// كل عمية "قابلة للعد" (export / AI لاحقًا / MCP) تنادي
// consumeUsage() قبل التنفيذ. القرار كله يجري داخل دالة
// consume_usage في قاعدة البيانات (قفل صف + قراءة الحدود من
// plan_entitlements) — هذا الملف مجرد ناقل ومُنسّق:
//
//   • لا حدود مبرمجة هنا (لا يمكن خداعها من العميل).
//   • consume_usage يقرأ خطة المستخدم من user_subscriptions
//     عبر effective_plan — المستخدم لا يستطيع تعديل صفه.
//   • لو الهجرة 025 غير مطبقة بعد (owner action) نتراجع بأمان
//     لسلوك ما قبل المرحلة (fail-open + تحذير في السجل)
//     أسلوب degraded-graceful نفسه المستخدم في subscription.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/cookie-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { FEATURE_LABELS } from '@/lib/billing/plans'

export interface UsageResult {
  allowed: boolean
  reason?: 'daily_limit' | 'monthly_limit' | 'not_entitled' | 'degraded'
  feature: string
  plan: 'free' | 'plus' | 'max'
  usedDaily?: number | null
  limitDaily?: number | null
  usedMonthly?: number | null
  limitMonthly?: number | null
  resetDailyAt?: string | null
  resetMonthlyAt?: string | null
}

export interface UsageOverview {
  plan: 'free' | 'plus' | 'max'
  resetDailyAt?: string | null
  resetMonthlyAt?: string | null
  features: Array<{
    featureKey: string
    enabled: boolean
    limitDaily: number | null
    limitMonthly: number | null
    usedDaily: number
    usedMonthly: number
  }>
}

const DEGRADED_OK: UsageResult = {
  allowed: true,
  reason: 'degraded',
  feature: '',
  plan: 'free',
}

/** استهلاك عملية واحدة من ميزة p_featureKey للمستخدم صاحب الجلسة */
export async function consumeUsage(
  req: NextRequest,
  featureKey: string,
): Promise<UsageResult> {
  if (!isSupabaseConfigured()) return { ...DEGRADED_OK, feature: featureKey }

  const token = getAccessToken(req)
  if (!token) return { ...DEGRADED_OK, feature: featureKey }

  const client = await createSupabaseUserClient(token)
  if (!client) return { ...DEGRADED_OK, feature: featureKey }

  const { data, error } = await (client as any).rpc('consume_usage', {
    p_feature_key: featureKey,
  })

  if (error) {
    // الهجرة 025 غير مطبقة أو خطأ مؤقت → سلوك ما قبل المرحلة
    console.warn(`[entitlements] consume_usage(${featureKey}) degraded:`, error.message)
    return { ...DEGRADED_OK, feature: featureKey }
  }

  const r = data as any
  if (!r || typeof r.allowed !== 'boolean') {
    console.warn(`[entitlements] consume_usage(${featureKey}) unexpected payload`)
    return { ...DEGRADED_OK, feature: featureKey }
  }

  return {
    allowed: r.allowed,
    reason: r.reason ?? undefined,
    feature: r.feature ?? featureKey,
    plan: r.plan ?? 'free',
    usedDaily: r.usedDaily ?? null,
    limitDaily: r.limitDaily ?? null,
    usedMonthly: r.usedMonthly ?? null,
    limitMonthly: r.limitMonthly ?? null,
    resetDailyAt: r.resetDailyAt ?? null,
    resetMonthlyAt: r.resetMonthlyAt ?? null,
  }
}

/** لوحة استخدام المستخدم الحالي (للعرض في الإعدادات) */
export async function getUsageOverview(req: NextRequest): Promise<UsageOverview | null> {
  if (!isSupabaseConfigured()) return null

  const token = getAccessToken(req)
  if (!token) return null

  const client = await createSupabaseUserClient(token)
  if (!client) return null

  const { data, error } = await (client as any).rpc('get_usage_overview')
  if (error || !data) {
    console.warn('[entitlements] get_usage_overview degraded:', error?.message)
    return null
  }

  const d = data as any
  return {
    plan: d.plan ?? 'free',
    resetDailyAt: d.resetDailyAt ?? null,
    resetMonthlyAt: d.resetMonthlyAt ?? null,
    features: (d.features ?? []).map((f: any) => ({
      featureKey: f.featureKey,
      enabled: !!f.enabled,
      limitDaily: f.limitDaily ?? null,
      limitMonthly: f.limitMonthly ?? null,
      usedDaily: f.usedDaily ?? 0,
      usedMonthly: f.usedMonthly ?? 0,
    })),
  }
}

/** رسالة عربية + استجابة 402 منظمة عند بلوغ الحد (upgrade prompt) */
export function limitReachedResponse(result: UsageResult): NextResponse {
  const featureLabel = FEATURE_LABELS[result.feature] ?? result.feature
  let message: string

  if (result.reason === 'not_entitled') {
    message = `«${featureLabel}» متاحة في خطة أعلى — رقّي حسابك لتفعيلها.`
  } else if (result.reason === 'monthly_limit') {
    message = `وصلت للحد الشهري من «${featureLabel}» (${result.usedMonthly}/${result.limitMonthly}). يتجدد مع بداية الشهر، أو رقّي خطتك الآن.`
  } else {
    message = `وصلت للحد اليومي من «${featureLabel}» (${result.usedDaily}/${result.limitDaily}). يتجدد غدًا، أو رقّي خطتك الآن.`
  }

  return NextResponse.json(
    {
      error: message,
      code: result.reason === 'not_entitled' ? 'PLAN_REQUIRED' : 'LIMIT_REACHED',
      usage: {
        feature: result.feature,
        featureLabel,
        reason: result.reason,
        plan: result.plan,
        usedDaily: result.usedDaily ?? null,
        limitDaily: result.limitDaily ?? null,
        usedMonthly: result.usedMonthly ?? null,
        limitMonthly: result.limitMonthly ?? null,
        resetDailyAt: result.resetDailyAt ?? null,
        resetMonthlyAt: result.resetMonthlyAt ?? null,
      },
    },
    { status: 402 },
  )
}

/** فحص entitlement منطقي (بدون عدّ) — مثل توفر MCP لماكس */
export async function checkEntitlement(
  req: NextRequest,
  featureKey: string,
): Promise<{ entitled: boolean; plan: string; degraded: boolean }> {
  if (!isSupabaseConfigured()) return { entitled: true, plan: 'free', degraded: true }

  const token = getAccessToken(req)
  if (!token) return { entitled: true, plan: 'free', degraded: true }

  const client = await createSupabaseUserClient(token)
  if (!client) return { entitled: true, plan: 'free', degraded: true }

  const { data, error } = await (client as any).rpc('check_entitlement', {
    p_feature_key: featureKey,
  })

  if (error || !data) {
    // الهجرة 025 غير مطبقة → سلوك ما قبل المرحلة (سماح) + تحذير
    console.warn(`[entitlements] check_entitlement(${featureKey}) degraded:`, error?.message)
    return { entitled: true, plan: 'free', degraded: true }
  }

  const r = data as { entitled?: boolean; plan?: string }
  return {
    entitled: !!r.entitled,
    plan: r.plan ?? 'free',
    degraded: false,
  }
}
