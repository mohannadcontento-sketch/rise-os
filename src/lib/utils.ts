import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// ============================================================
// utils.ts — دمج أصناف Tailwind (cn)
//
// الدالة الوحيدة cn: تجميع أصناف شرطية عبر clsx ثم حل تعارضات
// Tailwind بأسبقية tailwind-merge. تستخدمها كل مكونات الواجهة.
//
// المسؤوليات:
//   1) cn(...inputs) — لا شيء آخر هنا عمداً.
// ============================================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
