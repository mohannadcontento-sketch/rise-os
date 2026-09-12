'use client'

// ============================================================
// user-storage.ts — تخزين المتصفح المعزول لكل مستخدم
//
// غلاف فوق localStorage يوسم كل مفتاح بمعرّف المستخدم الحالي
// حتى لا تتسرب تفضيلات حساب إلى حساب آخر على نفس الجهاز.
//
// المسؤوليات:
//   1) اشتقاق مفاتيح موسومة (rise-user:<id>:<key>) مع حراسة SSR.
//   2) get/set/remove/clear مع تجاهل أخطاء التخزين بأمان.
// ============================================================

/**
 * Synchronous, non-secret user-scoped storage for UI state.
 * Security boundary: keys are derived from the currently authenticated user
 * metadata. We deliberately do not migrate legacy unscoped keys because their
 * ownership cannot be established safely.
 */
// ── القسم: هوية المستخدم واشتقاق المفتاح ──────────────────────────────────

function currentUserId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const parsed = JSON.parse(localStorage.getItem('rise-user-info') || '{}')
    return typeof parsed.id === 'string' ? parsed.id : ''
  } catch {
    return ''
  }
}

export function userStorageKey(key: string, userId = currentUserId()): string {
  // بلا مستخدم موثّق: نطاق unbound منفصل — القراءة/الكتابة عبر هذا الغلاف ترفضه عمداً
  if (!userId) return `rise-unbound:${key}`
  return `rise-user:${userId}:${key}`
}

// ── القسم: واجهة القراءة/الكتابة/الحذف المعزولة ──────────────────────────────────

export function getUserStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  const userId = currentUserId()
  // رفض القراءة بلا جلسة: لا قيم مشتركة تُعاد بين الحسابات
  if (!userId) return null
  try { return localStorage.getItem(userStorageKey(key, userId)) } catch { return null }
}

export function setUserStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  const userId = currentUserId()
  if (!userId) return
  try { localStorage.setItem(userStorageKey(key, userId), value) } catch { /* ignore */ }
}

export function removeUserStorage(key: string): void {
  if (typeof window === 'undefined') return
  const userId = currentUserId()
  if (!userId) return
  try { localStorage.removeItem(userStorageKey(key, userId)) } catch { /* ignore */ }
}

export function clearUserStorage(userId: string): void {
  if (typeof window === 'undefined' || !userId) return
  const prefix = `rise-user:${userId}:`
  try {
    // نجمع المفاتيح أولاً ثم نمسحها — الحذف أثناء المرور يفسد مؤشرات localStorage
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch { /* ignore */ }
}
