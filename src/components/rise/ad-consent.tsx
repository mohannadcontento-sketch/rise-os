'use client'

// ============================================================
// ad-consent.tsx — لافتة موافقة الإعلانات (المرحلة 13: الأمان والخصوصية)
//
// سياسة «الخصوصية أولًا»: الافتراض لكل زائر هو الإعلانات غير
// المخصصة (NPA) — يضبطه سكربت مضمن في layout.tsx قبل تحميل
// adsbygoogle.js (يقرأ localStorage تزامنيًا قبل أول طلب إعلان)،
// فلا تُخدَم إعلانات مخصصة إلا بعد موافقة صريحة.
//
// حدود القرار: يمس إعلانات Google فقط — بيانات أوج داخل التطبيق
// محلية ومشفّرة (secure-offline-db) ولا تُشارك مع أي طرف.
//
// إعادة فتح اللافتة لاحقًا (شاشة الإعدادات مثلًا):
//   window.dispatchEvent(new Event('rise:ads-consent'))
// — نفس نمط rise:navigate المتبع في الوحدات الأخرى.
// ============================================================

import { useEffect, useState } from 'react'

/** مفتاح التخزين — يقرأه أيضًا السكربت المضمن في layout.tsx */
const STORAGE_KEY = 'awj-ads-consent'

type ConsentValue = 'accepted' | 'npa'

/** قراءة القرار المخزن (null = لم يقرر المستخدم بعد) */
export function getAdsConsent(): ConsentValue | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'accepted' || v === 'npa' ? v : null
  } catch {
    // وضع التصفح الخاص / تعطل التخزين — يظل الافتراض الآمن (NPA)
    // مطبقًا من السكربت المضمن لهذه الجلسة
    return null
  }
}

/**
 * تطبيق إشارة NPA على قائمة AdSense الحية (نفس نمط Google الموثّق:
 * الخاصية توضع على قائمة adsbygoogle نفسها قبل طلب الوحدات).
 * يسري على طلبات الإعلانات اللاحقة.
 */
export function applyNonPersonalizedAds(on: boolean): void {
  try {
    const queue = (window.adsbygoogle = window.adsbygoogle || []) as unknown[] & {
      requestNonPersonalizedAds?: number
    }
    queue.requestNonPersonalizedAds = on ? 1 : 0
  } catch {
    // لا نسقط الواجهة — السكربت المضمن يضمن NPA لهذه الجلسة أصلًا
  }
}

/** حفظ القرار وتطبيقه فورًا */
export function setAdsConsent(value: ConsentValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // نطبّق على أي حال لهذه الجلسة
  }
  applyNonPersonalizedAds(value === 'npa')
}

export function AdsConsent() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // أول زيارة بلا قرار → اعرض اللافتة. الموافقة الصريحة هي
    // الاستثناء؛ الافتراض (NPA) مطبق من السكربت المضمن منذ البداية.
    if (getAdsConsent() === null) setOpen(true)
    // hook جاهز لإعادة الفتح من شاشة الإعدادات مستقبلًا
    const reopen = () => setOpen(true)
    window.addEventListener('rise:ads-consent', reopen)
    return () => window.removeEventListener('rise:ads-consent', reopen)
  }, [])

  const decide = (value: ConsentValue) => {
    setAdsConsent(value)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="موافقة الإعلانات"
      className="fixed bottom-4 start-4 end-4 z-[60] sm:end-auto sm:max-w-md"
    >
      <div className="glass rounded-2xl border border-white/10 dark:border-white/5 p-4 sm:p-5 shadow-2xl">
        <p className="text-sm font-bold text-foreground">موافقة الإعلانات</p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          الخطة المجانية تعمل بإعلانات Google AdSense، وبموافقتك قد
          تُستخدم ملفات تعريف لعرض إعلانات ملائمة لك. تقدر تختار
          «إعلانات غير مخصصة» — الاختيار يمس الإعلانات فقط: بياناتك
          داخل أوج محلية ومشفّرة ولا تُشارك مع أي طرف.
        </p>
        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => decide('npa')}
            className="flex-1 rounded-xl border border-white/15 dark:border-white/10 text-xs font-bold px-4 py-2.5 text-foreground hover:bg-white/5 transition-colors"
          >
            إعلانات غير مخصصة
          </button>
          <button
            type="button"
            onClick={() => decide('accepted')}
            className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold px-4 py-2.5 transition-colors"
          >
            موافقة
          </button>
        </div>
        <a
          href="/privacy"
          className="block text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 mt-3 text-center"
        >
          سياسة الخصوصية
        </a>
      </div>
    </div>
  )
}

export default AdsConsent
