'use client'

// ============================================================
// sun-cloud-loader.tsx — محمّل «الشمس والسحاب»
//
// مؤشر التحميل الرسمي للوحدات المحمّلة lazy: يظهر مكان الوحدة
// أثناء استيرادها (fallback في مُوجِّه الوحدات app/page.tsx)،
// ويمكن استعماله في أي انتظار عبر props (scale / label /
// className). عنصر واحد مشترك بلا حالات.
//
// البنية الداخلية:
//   1) الحاوية rl-wrap — role="status" + aria-label لقارئات
//      الشاشة، ونقاط النبض rl-dots ونص label اختياري
//   2) المشهد rl-scene — شمس بأشعة دوارة (rl-rays/rl-sun-core)
//      وسحابتان منجرفتان (خلفية وأمامية) بمقاسات ثابتة داخل
//      حاوية معزولة الاتجاه حتى لا يقلبها RTL الصفحة
//
// مبادئ UX/تقنية: كل الحركة والألوان في globals.css (.dark
// يتكيف تلقائيًا — لا منطق JS إطلاقًا)؛ المشهد aria-hidden
// والتسمية على الحاوية فقط؛ درجة الحجم عبر متغير --rl-scale.
// ============================================================

/**
 * أوج (Awj) Weather Loader — شمس بأشعة دوّارة وسحابتان منجرفتان.
 * نسخة معاد بناؤها بالكامل: مشاهد بمقاسات ثابتة داخل حاوية direction:ltr
 * (حتى لا يقلبها اتجاه الصفحة)، سحب بشكل حقيقي (قاعدة + بؤبتان)،
 * وأشعة شمس دوارة — متوافقة مع الوضع الليلي عبر globals.css (.dark).
 */

export default function SunCloudLoader({
  scale = 1,
  label = 'جاري التحميل...',
  className = '',
}: {
  scale?: number
  label?: string
  className?: string
}) {
  return (
    <div className={`rl-wrap ${className}`} role="status" aria-label={label || 'جاري التحميل'}>
      <div className="rl-scene" style={{ ['--rl-scale' as string]: scale }} aria-hidden="true">
        {/* الشمس */}
        <div className="rl-sun">
          <span className="rl-rays" />
          <span className="rl-sun-core" />
        </div>
        {/* السحابتان */}
        <span className="rl-cloud rl-cloud-back" />
        <span className="rl-cloud rl-cloud-front" />
      </div>
      {/* نقاط النبض */}
      <div className="rl-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {label ? <p className="text-xs text-muted-foreground mt-1.5">{label}</p> : null}
    </div>
  )
}
