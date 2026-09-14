-- ============================================================
-- 037. PHASE 15 — FEEDBACK (جمع الملاحظات داخل التطبيق — Beta)
--
-- بند خطة البيتا: «جمع Feedback داخل التطبيق». قناة مباشرة من
-- المستخدم للفريق: نوع (مشكلة/اقتراح/سؤال/أخرى) + نص + صفحة
-- الاختيار (سياق تلقائي من العميل) + حالة متابعة للمالك
-- (new → read → handled).
--
-- الوصول:
--   • المستخدم (عبر /api/rise/feedback بتوكنه): إدراج ملاحظته
--     فقط + قراءة ملاحظاته فقط — سياسات RLS أدناه.
--   • لا توجد سياسات UPDATE/DELETE للمستخدمين: الملاحظة بعد
--     الإرسال لا تُعدَّل — نزاهة القناة (ما يقرأه المالك هو ما
--     كتبه المستخدم حرفيًا).
--   • المالك (مسارات /api/rise/admin/feedback بـservice role
--     يتجاوز RLS): قراءة الكل + تحديث الحالة فقط.
--
-- idempotent: كل العبارات IF NOT EXISTS / DROP POLICY IF EXISTS
-- (آمنة لإعادة التشغيل مثل 035/036).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.feedback (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('bug', 'suggestion', 'question', 'other')),
  message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  page        TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'handled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON public.feedback(status, created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- إدراج ملاحظة باسمك فقط
DROP POLICY IF EXISTS feedback_insert_own ON public.feedback;
CREATE POLICY feedback_insert_own ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- قراءة ملاحظاتك فقط (متابعة حالتها)
DROP POLICY IF EXISTS feedback_select_own ON public.feedback;
CREATE POLICY feedback_select_own ON public.feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- لا سياسات UPDATE / DELETE — المستخدم لا يعدّل ولا يحذف بعد الإرسال؛
-- إدارة الحالة حصريًا عبر service role من لوحة الإدارة.
