import * as React from "react"

import { cn } from "@/lib/utils"

// ============================================================
// ui/textarea.tsx — مربع نص متعدد الأسطر
//
// عنصر shadcn/ui (Radix) مولَّد عبر CLI ومشترك عبر المشروع؛
// إعادة التوليد تطمس التعديلات المحلية — خصّص عبر cn/variants.
// ============================================================

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
