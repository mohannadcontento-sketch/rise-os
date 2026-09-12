// ============================================================
// mcp/rate-limit.ts — حدود معدل MCP (المرحلة 10 — MCP للـMax)
//
// مبدأ الخطة: «Rate limits لكل user/tool» — طبقتان هنا:
//   1) حد إجمالي لكل مستخدم: 30 طلب/دقيقة (كل الطرق مجتمعة)
//   2) حد أدوات الكتابة: 10 عمليات كتابة/دقيقة لكل مستخدم
//   (الأداة الواحدة لا تحتاج حدًا منفصلًا إضافيًا في النسخة
//   الأولى: 8 أدوات فقط، والكتابة هي المكلفة/الحساسة — القيد
//   يشد كل عمليات الكتابة مجتمعة، والقراءات يحكمها الحد
//   الإجمالي + حد الـmiddleware لكل IP: 60/دقيقة.)
//
// ملاحظة تشغيلية (موثّقة بصدق): هذه حدود داخل الذاكرة — على
// Serverless كل نسخة دالة لها ذاكرتها، فهي «طبقة دفاع أولى»
// وليست عدًّا مضمونًا عبر النسخ. معها: حد الـmiddleware لكل IP
// (60/د) + Audit Log لكل كتابة — الإطار الكامل قابل للترقية
// لاحقًا إلى Redis/usage_daily دون تغيير الواجهة.
//
// التنفيذ: نافذة ثابتة 60 ثانية لكل مستخدم (bucket) — أبسط
// من token bucket وكافية لحماية الأغلبية الساحقة من سيناريوهات
// الإساءة. القرارات deterministic وسريعة (O(1) لكل طلب).
// ============================================================

/** حد الطلبات الإجمالي لكل مستخدم في الدقيقة */
const LIMIT_TOTAL_PER_MIN = 30

/** حد عمليات الكتابة (أدوات write) لكل مستخدم في الدقيقة */
const LIMIT_WRITES_PER_MIN = 10

/** طول النافذة بالمللي ثانية */
const WINDOW_MS = 60_000

interface Bucket {
  count: number
  writes: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export type RateLimitReason = 'total' | 'write'

export interface RateLimitVerdict {
  allowed: boolean
  reason?: RateLimitReason
  /** ثواني حتى إعادة تعيين النافذة (لرأس Retry-After) */
  retryAfterSec?: number
}

/**
 * فحص/احتساب الحد لمستخدم واحد.
 * isWrite=true يستهلك من رصيدي الإجمالي والكتابة معًا؛
 * isWrite=false من الإجمالي فقط. الاستدعاء نفسه هو العدّاد —
 * لا تستدعِها مرتين لنفس الطلب.
 */
export function checkMcpRateLimit(userId: string, isWrite: boolean): RateLimitVerdict {
  const now = Date.now()

  let bucket = buckets.get(userId)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, writes: 0, resetAt: now + WINDOW_MS }
    buckets.set(userId, bucket)
  }

  const total = bucket.count + 1
  if (total > LIMIT_TOTAL_PER_MIN) {
    return {
      allowed: false,
      reason: 'total',
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  if (isWrite && bucket.writes + 1 > LIMIT_WRITES_PER_MIN) {
    return {
      allowed: false,
      reason: 'write',
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  // الالتزام: نحجز المقعد قبل التنفيذ الفعلي — لو فشل التنفيذ
  // لاحقًا يُحتسب anyway (استهلاك الموارد حدث بالفعل)
  bucket.count = total
  if (isWrite) bucket.writes += 1

  // تنظيف دوري: الخريطة تنمو فقط لو مستخدمون كثيرون في نفس الدقيقة
  if (buckets.size > 5000) {
    for (const [key, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(key)
    }
  }

  return { allowed: true }
}

/** إعادة التهيئة (اختبارات فقط) */
export function resetMcpRateLimits(): void {
  buckets.clear()
}
