import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCurrentAuthToken } from '@/lib/data'

// ============================================================
// api-auth.ts — بوابة المصادقة لمسارات /api/rise/**
//
// الغرض: كل مسار أعمال يبدأ بـ requireUser(req) — تُرجع معرّف
// المستخدم أو null (فشل المصادقة) فيرد المسار 401 فوراً.
//
// المسؤوليات:
//   1) ربط توكن الجلسة بسياق الطلب (setCurrentAuthToken) — قبل أي await
//   2) التحقق من الجلسة عبر requireAuth (كوكيز httpOnly)
//
// ملاحظة: مسارات الإدارة تستخدم requireAdmin من '@/lib/audit.ts'
// (يفحص الدور ثم يفوّض عبر requireUser).
// ============================================================
/**
 * Unified authenticated-request setup for user API routes.
 * Keeps authentication and request-bound data context in one place.
 *
 * CRITICAL (Task 27 root cause): the token context MUST be bound
 * SYNCHRONOUSLY in the route's own execution context — i.e. BEFORE the
 * first await. AsyncLocalStorage.enterWith() called AFTER an await
 * (inside a resumed sub-context) does NOT propagate to the caller's
 * continuation, so the data layer's sb() saw NO token and every request
 * ran as role `anon` (RLS denied all writes; lists silently empty).
 */
// ── القسم: requireUser — حارس مسارات المستخدم ─────────────────
export async function requireUser(req: NextRequest): Promise<string | null> {
  // ربط التوكن بالسياق قبل أول await — إلزامي: الربط بعد await
  // (في سياق فرعي مستأنف) لا ينتشر إلى تكملة المسار فيرى sb() الدور anon
  setCurrentAuthToken(req)
  const userId = await requireAuth(req)
  // إعادة الربط بعد التحقق — قد حدّث requireAuth كوكيز الجلسة أثناء التحقق
  setCurrentAuthToken(req)
  return userId
}
