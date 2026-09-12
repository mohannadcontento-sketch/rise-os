'use client'

// ============================================================
// ad-slot.tsx — المكوّن الموحّد للإعلانات (المرحلة 09 — Ads للـFree)
//
// القرار يأتي من /api/rise/ads (الخادم): خطة غير Free أو بوابة
// عالمية مطفأة → enabled:false → نرندر null فورًا — مهما حاول
// المستخدم التلاعب بالواجهة، القرار أصلاً صدر من الخادم.
//
// مسار العرض عند السماح (الأولوية):
//   1) AdSense: <ins class="adsbygoogle"> + تحميل adsbygoogle.js
//      مرة واحدة (singleton) — فقط عند دخول الـslot مجال الرؤية
//      (IntersectionObserver) حتى لا نثقل مستخدمي Free بطلبات
//      لا يرونها (الوحدات كسولة والتمرير طويل).
//   2) Direct Ad / إعلان بيت: بطاقة زجاجية بأيقونة وزر — نفس
//      عائلة بطاقات أوج، تفتح الترقية عبر rise:navigate (نفس
//      آلية الجلسات السابقة — مع validation الوحدة مجانًا).
//
// سقوف صارمة (مبدأ «max ads per page/placement»):
//   • سقف 1 إعلان في الشاشة الواحدة مضمون هيكليًا: عنصر <AdSlot>
//     الوحيد في شجرة التطبيق كله هو إدراج app/page.tsx (موضع واحد
//     بعد محتوى الوحدة — لا مصدر آخر).
//   • سقف 1 دفع AdSense لكل <ins>: حارس pushedRef (ref لا حالة —
//     لا يسبب إعادة رسم ولا يُخدَ بالمجاوعات المزدوجة في StrictMode).
//
// CSP: الحزمة موثوقة (strict-dynamic) → أي سكربت ننشئه من هنا
// موثوق تلقائيًا؛ نطاقات الإطارات/الاتصال مضافة في middleware.ts.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { apiGet } from '@/lib/api-fetch'
import type { AdPlacementId, DirectAd } from '@/lib/ads/config'

// ── القسم: أنواع استجابة الخادم ─────────────────────

interface AdsResponse {
  enabled: boolean
  plan?: 'free' | 'plus' | 'max'
  reason?: 'auth' | 'plan' | 'disabled' | 'error'
  adsenseClientId?: string
  placements?: Record<
    string,
    { kind: 'adsense' | 'direct'; slot?: string; ad?: DirectAd }
  >
}

// ── القسم: حالة الوحدة (مرة واحدة لكل تحميل صفحة) ─────────────────────

/** وعد الطلب — مشترك بين كل الslots (طلب واحد لا أكثر) */
let adsPromise: Promise<AdsResponse> | null = null

function fetchAds(): Promise<AdsResponse> {
  if (!adsPromise) {
    adsPromise = apiGet('/api/rise/ads')
      .then((r: Response) => (r.ok ? r.json() : { enabled: false }))
      .catch(() => ({ enabled: false }))
    // فشل/مهلة → enabled:false (fail-closed) — القيمة تبقى محللة
    // فلا نعيد الطلب مع كل رندر؛ إعادة المحاولة عند reload فقط
  }
  return adsPromise
}

// ── القسم: محمّل سكربت AdSense (singleton) ─────────────────────

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

let scriptPromise: Promise<void> | null = null

/** تحميل adsbygoogle.js مرة واحدة عند أول slot مرئي فعلي */
function loadAdSenseScript(clientId: string): Promise<void> {
  if (scriptPromise) return scriptPromise
  const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`
  scriptPromise = new Promise<void>((resolve, reject) => {
    // layout.tsx يضع السكربت في <head> أصلاً (وسم تحقق Google الذي
    // يقرأه الزاحف من الـHTML الخام) — إن وجدناه نعتمد عليه ولا
    // ننشئ نسخة ثانية: التحميل المزدوج يسبب تحذير «Tag already
    // loaded» من AdSense ويهدر نطاق الطلبات.
    const existing = Array.from(
      document.querySelectorAll('script[src]'),
    ).find((el) => (el as HTMLScriptElement).src === src) as
      | HTMLScriptElement
      | undefined
    if (existing) {
      // اكتمل تنفيذه؟ (التنفيذ يسبق حدث load — ففحص العامود هنا
      // يغطي سباق «الحدث طار قبل تركيب المستمع»)
      if (window.adsbygoogle) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('adsbygoogle.js failed')),
      )
      return
    }
    const s = document.createElement('script')
    s.async = true
    s.crossOrigin = 'anonymous'
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('adsbygoogle.js failed'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

// ── القسم: المكوّن ─────────────────────

export function AdSlot({ placement }: { placement: AdPlacementId }) {
  const [ads, setAds] = useState<AdsResponse | null>(null)
  // متصفحات بلا IntersectionObserver (نادرة): رندر مباشر من البداية
  const [visible, setVisible] = useState(() =>
    typeof IntersectionObserver === 'undefined',
  )
  const pushedRef = useRef(false)
  const insRef = useRef<HTMLModElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // طلب واحد مشترك (أول رندر لأي slot يطلبه؛ البقية تشارك الوعد)
  useEffect(() => {
    let alive = true
    fetchAds().then((r: AdsResponse) => { if (alive) setAds(r) })
    return () => { alive = false }
  }, [])

  // كسل الرندر: لا نلمس AdSense قبل اقتراب الـslot من مجال الرؤية
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const unit = ads?.placements?.[placement]
  const isAdsense = ads?.enabled === true && unit?.kind === 'adsense' && !!unit.slot && !!ads?.adsenseClientId

  // دفع وحدة AdSense (مرة واحدة لكل ins) — بعد الرؤية + توفر العنصر
  // pushedRef: حارس بدون حالة (ref) — يمنع الدفع المزدوج في
  // StrictMode/إعادة الرندر دون إعادة رسم إضافية
  useEffect(() => {
    if (!visible || !isAdsense || !insRef.current || pushedRef.current) return
    const clientId = ads!.adsenseClientId!
    pushedRef.current = true
    loadAdSenseScript(clientId)
      .then(() => {
        try {
          ;(window.adsbygoogle = window.adsbygoogle || []).push({})
        } catch {
          // قائمة AdSense غير جاهزة — الوحدة تملأ عند توفر الإطار
        }
      })
      .catch(() => {
        // تعذر تحميل السكربت (شبكة/حجب) — لا نسقط الواجهة
      })
  }, [visible, isAdsense, ads])

  // ── القرارات المبكرة للرندر ──
  if (ads === null) return null         // القرار لم يصل بعد → لا احتياط مرئي
  if (!ads.enabled || !unit) return null // قرار الخادم: لا إعلانات

  // ── إعلان البيت / Direct Ad (عائلة بطاقات أوج الزجاجية) ──
  if (!isAdsense) {
    const ad = unit.ad
    if (!ad) return null
    return (
      <div
        ref={containerRef}
        dir="rtl"
        className="mt-6 mb-2 max-w-2xl mx-auto"
        role="complementary"
        aria-label="إعلان"
      >
        <div className="glass rounded-2xl border border-white/10 dark:border-white/5 p-4 sm:p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold/25 to-emerald-accent/25 flex items-center justify-center shrink-0" aria-hidden="true">
            <Sparkles className="w-5 h-5 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground border border-white/15 dark:border-white/10 rounded-full px-2 py-0.5 shrink-0">ترقية</span>
              <p className="text-sm font-semibold text-foreground truncate">{ad.title}</p>
            </div>
            {ad.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ad.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (ad.href) {
                window.open(ad.href, '_blank', 'noopener,noreferrer')
              } else {
                // إعلان البيت → شاشة الإعدادات/الترقية (rise:navigate
                // مع validation الوحدة — نفس آلية إشعارات Push)
                window.dispatchEvent(new CustomEvent('rise:navigate', { detail: 'settings' }))
              }
            }}
            className="shrink-0 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold px-4 py-2.5 transition-colors"
          >
            {ad.cta || 'اعرف أكثر'}
          </button>
        </div>
      </div>
    )
  }

  // ── وحدة AdSense ──
  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="mt-6 mb-2 max-w-2xl mx-auto"
      role="complementary"
      aria-label="إعلان"
    >
      <div className="glass rounded-2xl border border-white/10 dark:border-white/5 p-3">
        <p className="text-[10px] text-muted-foreground mb-2 text-center">إعلان</p>
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: 'block', minHeight: 100 }}
          data-ad-client={ads.adsenseClientId}
          data-ad-slot={unit.slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  )
}

export default AdSlot
