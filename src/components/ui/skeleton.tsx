import { cn } from "@/lib/utils"

// ============================================================
// ui/skeleton.tsx — هيكل تحميل أثناء انتظار البيانات
//
// عنصر shadcn/ui (Radix) مولَّد عبر CLI ومشترك عبر المشروع؛
// إعادة التوليد تطمس التعديلات المحلية — خصّص عبر cn/variants.
// ============================================================

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
