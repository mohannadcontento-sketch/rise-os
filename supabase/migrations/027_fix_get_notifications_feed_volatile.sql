-- ============================================================
-- 027 — إصلاح volatility الخاص بـ get_notifications_feed
-- ============================================================
-- المشكلة (مكتشفة بتشغيل اختبار المرحلة 05 على قاعدة البيانات الحقيقية):
--   الدالة أُنشئت في 026 بـ STABLE بينما تُنفّذ DELETE كسولًا للإشعارات
--   المنتهية داخلها → PostgreSQL يرفض: "DELETE is not allowed in a
--   non-volatile function" → كل استدعاء للـ RPC يفشل في الإنتاج،
--   والتطبيق كان يتراجع صامتًا للمسار القديم (بدون فلاتر/حذف كسول/
--   unreadCount في نداء واحد).
--
-- الإصلاح: تعريف الدالة VOLATILE (مطلوب لأي DELETE/تحديث حالة).
--   التأثير الجانبي لا يذكر: الاستدعاء عبر PostgREST يبقى نداءً واحدًا
--   لكل طلب — لا تغيير في الأداء الملموس.
--
-- آمن للتشغيل المتكرر (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_notifications_feed(
  p_limit        int     DEFAULT 50,
  p_filter       text    DEFAULT 'all',
  p_unread_only  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_purged   int;
  v_unread   bigint;
  v_rows     jsonb;
  v_extra    text := '';
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 50; END IF;
  IF p_limit > 100 THEN p_limit := 100; END IF;

  -- (أ) حذف المنتهي — صفوف المستخدم فقط
  DELETE FROM public.notifications
   WHERE user_id = v_user
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS v_purged = ROW_COUNT;

  -- (ب) عدّاد الشارة (غير مقروء وغير منتهٍ)
  SELECT count(*) INTO v_unread
    FROM public.notifications
   WHERE user_id = v_user
     AND NOT "read"
     AND (expires_at IS NULL OR expires_at >= now());

  -- (ج) القائمة — الفلترة بقائمة بيضاء (لا SQL ديناميكي من مدخلات)
  IF p_unread_only THEN
    v_extra := ' AND NOT "read"';
  ELSIF p_filter = 'unread' THEN
    v_extra := ' AND NOT "read"';
  ELSIF p_filter = 'high' THEN
    v_extra := ' AND priority = ''high''';
  ELSIF p_filter = 'account' THEN
    v_extra := ' AND type IN (''subscription'',''usage'',''system'',''background'')';
  ELSIF p_filter = 'activity' THEN
    v_extra := ' AND type IN (''community'',''mention'',''achievement'',''success'',''reminder'',''info'',''warning'',''error'')';
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC), ''[]''::jsonb)
       FROM (
         SELECT * FROM public.notifications
          WHERE user_id = $1 %s
          ORDER BY created_at DESC
          LIMIT $2
       ) n', v_extra)
  INTO v_rows
  USING v_user, p_limit;

  RETURN jsonb_build_object(
    'notifications', v_rows,
    'unreadCount', v_unread,
    'purged', v_purged
  );
END $$;

REVOKE ALL ON FUNCTION public.get_notifications_feed(int, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notifications_feed(int, text, boolean) TO authenticated, service_role;
