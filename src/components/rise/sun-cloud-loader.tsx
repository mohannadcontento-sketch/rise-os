'use client'

/**
 * Sun & Cloud Loader — طلب المستخدم (شمس مضيئة وسحابتان متحركتان).
 * تصميم CSS خالص بدون مكتبات — الحجم الأصلي 250×250 ويُتحكم فيه عبر scale.
 */

export default function SunCloudLoader({
  scale = 0.56,
  label = 'جاري التحميل...',
  className = '',
}: {
  scale?: number
  label?: string
  className?: string
}) {
  return (
    <div className={`scl-wrap flex-col gap-1 ${className}`} aria-label={label} role="status">
      <div className="scl" style={{ ['--scl-scale' as string]: scale }}>
        <div className="scl-cloud scl-front">
          <span className="scl-left-front" />
          <span className="scl-right-front" />
        </div>
        <span className="scl-sun scl-sunshine" />
        <span className="scl-sun" />
        <div className="scl-cloud scl-back">
          <span className="scl-left-back" />
          <span className="scl-right-back" />
        </div>
      </div>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  )
}
