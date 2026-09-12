/**
 * أوج (Awj) Toast Helpers — consistent save/delete notifications
 * 
 * Shows a brief, non-intrusive toast at top-center that auto-dismisses.
 * Works like an alert but doesn't block the UI.
 * 
 * Usage:
 *   import { toastSaved, toastDeleted, toastError } from '@/lib/toast-helpers'
 *   toastSaved('المهمة')        // → "تم حفظ المهمة" (top-center, 2s)
 *   toastDeleted('المهمة')      // → "تم حذف المهمة" (top-center, 2s)
 *   toastError('حفظ المهمة')    // → "فشل حفظ المهمة" (top-center, 3s)
 */
import { toast } from 'sonner'

// ============================================================
// toast-helpers.ts — توست العمليات الموحّد
//
// أغلفة قصيرة فوق sonner لنجاح الحفظ/الإنشاء/الحذف وفشل العمليات،
// تفرض موضعاً واحداً (top-center) ومدداً ثابتة (نجاح ثانيتان / خطأ
// 3 ثوانٍ) وصياغة عربية موحدة — فتبقى ردود أفعال الوحدات (tasks/
// goals/health/...) متسقة بلا نصوص مبعثرة.
//
// المسؤوليات:
//   1) toastSaved/toastCreated/toastDeleted: إشعار نجاح مختصر
//      يقبل اسم الكيان اختيارياً.
//   2) toastError: مع وصف اختياري للسبب ومدة أطول للقراءة.
//
// حدود: عرض فقط — لا تقرر سياسة الأخطاء ولا تعيد المحاولة ولا
// تسجّل شيئاً.
// ============================================================

/** Show a success toast after saving data */
export function toastSaved(entity?: string): void {
  toast.success(entity ? `تم حفظ ${entity}` : 'تم الحفظ', {
    duration: 2000,
    position: 'top-center',
  })
}

/** Show a success toast after creating data */
export function toastCreated(entity?: string): void {
  toast.success(entity ? `تم إنشاء ${entity}` : 'تم الإنشاء', {
    duration: 2000,
    position: 'top-center',
  })
}

/** Show a success toast after deleting data */
export function toastDeleted(entity?: string): void {
  toast.success(entity ? `تم حذف ${entity}` : 'تم الحذف', {
    duration: 2000,
    position: 'top-center',
  })
}

/** Show an error toast when save fails */
export function toastError(action?: string, description?: string): void {
  toast.error(action ? `فشل ${action}` : 'حدث خطأ', {
    description,
    duration: 3000,
    position: 'top-center',
  })
}
