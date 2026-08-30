/**
 * RiseOS Toast Helpers — consistent save/delete notifications
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
// Trigger redeployment: Sun Aug  2 18:38:52 UTC 2026
