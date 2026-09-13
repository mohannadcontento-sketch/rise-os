-- ============================================================
-- 036_qa_account_delete_fix.sql — إصلاح اكتشفته QA المرحلة 15
--
-- المشكلة: حذف الحساب (delete-account) كان يفشل بخطأ
-- «Database error deleting user» لأي مستخدم له أثر في سجل
-- الإدارة (كل منشور/تعليق/تفاعل/بلاغ في المجتمع يكتب صفًا في
-- audit_logs) — لأن actor_user_id كان ON DELETE RESTRICT
-- (الهجرة 013) فيمنع حذف profiles/auth.users نهائيًا.
--
-- الحل (نمط حفظ سجل التدقيق): الصفوف تبقى والفاعل يُجهَّل:
--   audit_logs.actor_user_id → قابل للـNULL + ON DELETE SET NULL
-- — السجل نفسه لا يُحذف أبدًا (مبدأ ledger)، فقط هوية الفاعل
-- تُمحى مع حذف حسابه (متسق مع سياسة حذف بيانات المستخدم).
--
-- نفس المعالجة لمراجع الإدارة القابلة للإبطال في المجتمع:
--   community_reports.handled_by · community_moderation_log.
--   moderator_id · community_bans.banned_by  (كانت NO ACTION)
--
-- كل شيء idempotent — آمن التكرار.
-- ============================================================

-- 1) سجل الإدارة: الفاعل يُجهَّل عند حذف حسابه، والسجل يبقى
ALTER TABLE public.audit_logs
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 2) مراجع الإشراف في المجتمع: تُفرَّغ عند حذف الحساب
ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_handled_by_fkey;
ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_handled_by_fkey
  FOREIGN KEY (handled_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.community_moderation_log
  DROP CONSTRAINT IF EXISTS community_moderation_log_moderator_id_fkey;
ALTER TABLE public.community_moderation_log
  ADD CONSTRAINT community_moderation_log_moderator_id_fkey
  FOREIGN KEY (moderator_id) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.community_bans
  DROP CONSTRAINT IF EXISTS community_bans_banned_by_fkey;
ALTER TABLE public.community_bans
  ADD CONSTRAINT community_bans_banned_by_fkey
  FOREIGN KEY (banned_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ============================================================
-- ملاحظات للمالك:
-- 1) هذا الإصلاح مطلوب قبل تشغيل حذف الحسابات للمستخدمين
--    الحقيقيين (Beta) — بدونه يفشل حذف أي مستخدم نشط بالمجتمع.
-- 2) الصفوف التاريخية في audit_logs لا تتأثر — فقط القيود
--    الجديدة تسمح بمحو هوية الفاعل عند حذف حسابه مستقبلًا.
-- 3) الحساب التجريبي العالق (qa-cycle-…@qa-probe.test) سيصبح
--    قابلًا للحذف بعد التطبيق — أعد المحاولة من واجهة الحذف
--    أو أخبر المساعد ليعيد الفحص.
-- ============================================================
