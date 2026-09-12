"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

// ============================================================
// ui/sonner.tsx — غلاف Toaster لـsonner بموضع موحد أعلى الوسط
//
// عنصر shadcn/ui (Radix) مولَّد عبر CLI ومشترك عبر المشروع؛
// إعادة التوليد تطمس التعديلات المحلية — خصّص عبر cn/variants.
// ============================================================

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
