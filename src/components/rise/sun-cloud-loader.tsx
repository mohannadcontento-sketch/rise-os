'use client'

/**
 * RiseOS Weather Loader — شمس بأشعة دوّارة وسحابتان منجرفتان.
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
