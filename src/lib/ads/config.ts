// ============================================================
// ads/config.ts — إعدادات نظام الإعلانات (المرحلة 09 — Ads للـFree)
//
// قرار التصميم (نفس نمط vapid.ts — المرحلة 06):
//   الإعدادات تُحلّ بترتيب أسبقية يسمح للمالك بالتحكم دون نشر:
//     1) متغيرات البيئة (Vercel) — ADS_ENABLED / ADSENSE_CLIENT_ID /
//        ADSENSE_SLOT_HOME / ADSENSE_SLOT_COMMUNITY / ADSENSE_SLOT_TASKS
//     2) جدول app_config في Supabase (ads_enabled / adsense_client_id /
//        adsense_slot_<placement> / direct_ads) — يُقرأ بـservice_role
//        فقط (RLS بلا policies = fail-closed، مثل مفاتيح VAPID).
//     3) افتراضيات مدمجة: مُعرّف الناشر الذي سلّمه المالك
//        (ca-pub-… ليس سرًا — يظهر في HTML كل صفحة بطبيعته).
//
// البوابات الحقيقية ليست هنا:
//   • قرار «هل هذا المستخدم يرى إعلانات؟» يجري في مسار
//     /api/rise/ads من خطة user_subscriptions (خادم، لا يمكن خداعه
//     من العميل — مبدأ «لا نعتمد على إخفاء العنصر فقط»).
//   • الوحدات المعروضة: PLACEMENTS ثابتة أدناه — لا slots ديناميكية.
//
// Direct Ads (بيت/شركات لاحقًا): قائمة direct_ads في app_config
// (JSON) تحمل حقول الخطة: title/description/cta/href/image/
// placement/startAt/endAt/priority/active — selectDirectAd()
// يفلتر active + نافذة التاريخ + placement ثم يرتّب بpriority.
// AdSense له الأولوية لو فُعّل slot للplacement نفسه.
// ============================================================

export type AdPlacementId = 'home' | 'community' | 'tasks'

export interface DirectAd {
  id: string
  title: string
  description?: string
  cta?: string
  href?: string
  image?: string
  placement: AdPlacementId | 'all'
  startAt?: string | null
  endAt?: string | null
  priority?: number
  active?: boolean
}

export interface AdsConfig {
  /** البوابة العالمية — توقف كل شيء عند false (تشغيل/إيقاف الإعلان) */
  enabled: boolean
  /** مُعرّف ناشر AdSense (ca-pub-…) — ليس سرًا بحكم التصميم */
  adsenseClientId: string
  /** slot لكل placement — بدون slot نعرض Direct Ad / house banner */
  slots: Partial<Record<AdPlacementId, string>>
  /** إعلانات مباشرة من app_config (JSON) — مرشّحة على الخادم */
  directAds: DirectAd[]
}

// ── القسم: الثوابت والافتراضات ─────────────────────

/** مُعرّف ناشر AdSense — سلمّه المالك 13/9/2026 (عام بحكم التصميم) */
export const DEFAULT_ADSENSE_CLIENT_ID = 'ca-pub-7322285983808380'

/** أماكن الإعلانات الثابتة والمحدودة (مبدأ «ثابتة ومحدودة») */
export const AD_PLACEMENTS: Record<AdPlacementId, { labelAr: string; moduleHint: string }> = {
  home: { labelAr: 'الرئيسية', moduleHint: 'dashboard' },
  community: { labelAr: 'المجتمع', moduleHint: 'community' },
  tasks: { labelAr: 'المهام', moduleHint: 'tasks' },
}

/** كاش 10 دقائق (نفس سلوك vapid/turso — لا نضرب DB مع كل طلب) */
const CACHE_MS = 10 * 60 * 1000
let cached: { at: number; config: AdsConfig } | null = null

// ── القسم: القراءة من app_config (service_role فقط) ─────────────────────

async function readDbConfig(): Promise<Partial<AdsConfig> | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return null

    const keys = [
      'ads_enabled',
      'adsense_client_id',
      'adsense_slot_home',
      'adsense_slot_community',
      'adsense_slot_tasks',
      'direct_ads',
    ]
    const { data, error } = await (admin as any)
      .from('app_config')
      .select('key, value')
      .in('key', keys)

    if (error) {
      // جدول app_config غير مهيأ بعد (هجرة 028/032 غير مطبقة) — الوضع
      // الافتراضي المدمج يكفي؛ لا شيء ينكسر
      console.warn('[ads/config] app_config unavailable:', error.message)
      return null
    }

    const map: Record<string, string> = {}
    for (const row of data ?? []) map[row.key] = row.value

    let directAds: DirectAd[] = []
    if (map.direct_ads) {
      try {
        const parsed = JSON.parse(map.direct_ads)
        if (Array.isArray(parsed)) directAds = parsed
      } catch {
        console.warn('[ads/config] direct_ads JSON invalid — ignored')
      }
    }

    return {
      enabled: map.ads_enabled === undefined ? undefined : map.ads_enabled === 'true',
      adsenseClientId: map.adsense_client_id || undefined,
      slots: {
        home: map.adsense_slot_home || undefined,
        community: map.adsense_slot_community || undefined,
        tasks: map.adsense_slot_tasks || undefined,
      },
      directAds,
    }
  } catch (err) {
    console.warn('[ads/config] readDbConfig failed:', (err as Error).message)
    return null
  }
}

// ── القسم: الدالة الموحدة getAdsConfig ─────────────────────

/** الإعدادات المدمجة بعد دمج env ثم app_config */
export async function getAdsConfig(): Promise<AdsConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config

  const db = await readDbConfig()

  const config: AdsConfig = {
    // البوابة العالمية: env ADS_ENABLED ثم app_config ads_enabled ثم on
    enabled: process.env.ADS_ENABLED !== undefined
      ? process.env.ADS_ENABLED === 'true'
      : db?.enabled !== undefined
        ? !!db.enabled
        : true,
    adsenseClientId:
      process.env.ADSENSE_CLIENT_ID || db?.adsenseClientId || DEFAULT_ADSENSE_CLIENT_ID,
    slots: {
      home: process.env.ADSENSE_SLOT_HOME || db?.slots?.home || undefined,
      community: process.env.ADSENSE_SLOT_COMMUNITY || db?.slots?.community || undefined,
      tasks: process.env.ADSENSE_SLOT_TASKS || db?.slots?.tasks || undefined,
    },
    directAds: db?.directAds ?? [],
  }

  cached = { at: Date.now(), config }
  return config
}

// ── القسم: اختيار Direct Ad (active + نافذة التاريخ + priority) ─────────

/**
 * يفلتر الإعلانات المباشرة: active + داخل نافذة start/end + placement
 * مطابق (أو 'all')، ثم يختار الأعلى priority. يُنفَّذ على الخادم فقط —
 * الحقول خارج النافذة لا تصل للعميل أصلًا.
 */
export function selectDirectAd(
  ads: DirectAd[],
  placement: AdPlacementId,
  now: Date = new Date(),
): DirectAd | null {
  const eligible = ads.filter((ad) => {
    if (ad.active === false) return false
    if (ad.placement !== 'all' && ad.placement !== placement) return false
    if (ad.startAt && now < new Date(ad.startAt)) return false
    if (ad.endAt && now > new Date(ad.endAt)) return false
    return true
  })
  if (eligible.length === 0) return null
  eligible.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return eligible[0] ?? null
}

/** إبطال الكاش (اختبارات) */
export function resetAdsConfigCache(): void {
  cached = null
}
