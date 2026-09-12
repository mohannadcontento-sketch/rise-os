import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import {
  getAdsConfig,
  selectDirectAd,
  type AdPlacementId,
  type DirectAd,
} from '@/lib/ads/config'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/rise/ads — بوابة إعلانات المرحلة 09 (Ads للـFree)
//
// القرار يجري هنا على الخادم (مبدأ الخطة: «لا نعتمد على إخفاء
// العنصر فقط؛ الـserver/entitlement layer يجب أن يعرف»):
//   1) requireUser → لا إعلانات إلا داخل الجلسة (لا صفحات عامة).
//   2) خطة المستخدم من user_subscriptions (RLS: صفه فقط) —
//      إعلان = Free فقط. Plus/Max النشط → enabled:false (reason:plan)
//      مهما عدّل المستخدم في الواجهة.
//   3) البوابة العالمية ads_enabled/env → reason:disabled.
//   4) لو مسموح: نرسل بيانات العرض — slot AdSense للplacement
//      (لو فُعّل) أو Direct Ad مرشّح (active/start/end/priority
//      تُحسم هنا — العميل لا يرى إلا الفائز).
//
// الاستجابة لا تحمل أي سر: مُعرّف الناشر يظهر في HTML الصفحات
// بطبيعته، وslot الوحدة رقم عام كذلك.
// ============================================================

/** إعلان البيت الافتراضي — ترقية أوج بلس (self-promo، ليس وحدة إعلانية) */
const HOUSE_AD: DirectAd = {
  id: 'house-upgrade-plus',
  title: 'أوج بلس — بدون إعلانات',
  description: 'حدود أعلى، تجربة أنظف، ودعم أولوية — من 30 جنيه/شهر',
  cta: 'رقي الآن',
  placement: 'all',
  active: true,
  priority: -1,
}

interface SubscriptionRow {
  plan?: string
  status?: string
  expires_at?: string | null
}

/** الخطة الفعّالة: مدفوع نشط غير منتهٍ فقط يستثني من الإعلانات */
function effectivePlan(sub: SubscriptionRow | null): 'free' | 'plus' | 'max' {
  if (!sub?.plan || sub.plan === 'free') return 'free'
  if (sub.status && sub.status !== 'active') return 'free'
  if (sub.expires_at && new Date(sub.expires_at).getTime() <= Date.now()) return 'free'
  return sub.plan === 'max' ? 'max' : 'plus'
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) {
      return NextResponse.json(
        { enabled: false, reason: 'auth' },
        { status: 401 },
      )
    }

    // ── 1. الخطة (RLS: صف المستخدم فقط — نفس مسار user/subscription) ──
    let plan: 'free' | 'plus' | 'max' = 'free'
    if (isSupabaseConfigured()) {
      const token = getAccessToken(req)
      if (token) {
        const client = await createSupabaseUserClient(token)
        if (client) {
          const { data, error } = await (client as any)
            .from('user_subscriptions')
            .select('plan, status, expires_at')
            .eq('user_id', userId)
            .maybeSingle()
          if (!error && data) plan = effectivePlan(data as SubscriptionRow)
          else if (error) console.warn('[ads] plan read degraded:', error.message)
        }
      }
    }

    // ── 2. البوابة العالمية (تشغيل/إيقاف) ──
    const config = await getAdsConfig()
    if (!config.enabled) {
      return NextResponse.json({ enabled: false, plan, reason: 'disabled' })
    }

    // ── 3. بوابة الخطة: إعلانات Free فقط ──
    if (plan !== 'free') {
      return NextResponse.json({ enabled: false, plan, reason: 'plan' })
    }

    // ── 4. جمع بيانات العرض لكل placement ──
    // AdSense slot (لو فُعّل) يتفوق على Direct Ad لنفس الموضع.
    // Direct Ad من app_config يتفوق على إعلان البيت الافتراضي.
    // تسجيل خفيف للـDirect Ads (طباعة خادم = ظاهر في سجلات Vercel —
    // نقطة امتداد مستقبلية لجدول impressions عند الحاجة).
    const placements: Record<string, { kind: 'adsense' | 'direct'; slot?: string; ad?: DirectAd }> = {}
    for (const placement of Object.keys(config.slots) as AdPlacementId[]) {
      const slot = config.slots[placement]
      if (slot) {
        placements[placement] = { kind: 'adsense', slot }
        continue
      }
      const direct = selectDirectAd(config.directAds, placement)
      if (direct) {
        console.log(`[ads] direct ad served: ${direct.id} → ${placement}`)
        placements[placement] = { kind: 'direct', ad: direct }
      } else {
        placements[placement] = { kind: 'direct', ad: HOUSE_AD }
      }
    }

    return NextResponse.json({
      enabled: true,
      plan,
      adsenseClientId: config.adsenseClientId,
      placements,
    })
  } catch (err) {
    console.error('[ads] GET failed:', (err as Error).message)
    // فشل غير متوقع → لا نعرض إعلانات (fail-closed آمن للتجربة)
    return NextResponse.json({ enabled: false, reason: 'error' }, { status: 500 })
  }
}
