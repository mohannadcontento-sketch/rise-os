'use client'

// ============================================================
// SectionCard — غلاف موحد لأقسام صفحة الإعدادات (المرحلة 02).
// استُخرج من settings.tsx في المرحلة 04 ليشاركه قسم
// «الخطة والاشتراك» (subscription-section.tsx) دون تكرار.
// ============================================================

import { cn } from '@/lib/utils'

export function SectionCard({
  icon: Icon,
  well,
  title,
  desc,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  well: string
  title: string
  desc?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('neo-card card-lift overflow-hidden', className)}>
      <div className="p-5 pb-4">
        <h3 className="text-base font-bold flex items-center gap-2.5">
          <span className={cn('icon-well h-7 w-7', well)}>
            <Icon className="h-4 w-4" />
          </span>
          <span>
            {title}
            {desc && (
              <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                {desc}
              </span>
            )}
          </span>
        </h3>
      </div>
      <div className="px-5 pb-5 space-y-4">{children}</div>
    </div>
  )
}
