'use client'

// ============================================================
// admin-shared.tsx — القطع المشتركة بين تابات لوحة الإدارة
//
// هياكل التحميل (skeletons) التي تظهر أثناء جلب بيانات كل تاب —
// موجّهة هنا لتشاركها التابات الخمس بدل تكرارها في كل ملف.
// ============================================================

import { Skeleton } from '@/components/ui/skeleton'

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="neo-card p-4">
          <Skeleton className="h-5 w-5 mb-2 rounded" />
          <Skeleton className="h-7 w-16 mb-1" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}
