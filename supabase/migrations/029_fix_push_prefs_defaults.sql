-- ============================================================
-- 029_fix_push_prefs_defaults.sql
-- إصلاح المرحلة 06 (بعد فحص حي على الإنتاج 2026-09-12):
--
-- الباگ: get_notification_preferences() و _user_push_prefs() كانتا
-- تُرجعان NULL لأي مستخدم لا يملك صفًا في notification_preferences،
-- رغم أن فرع «الافتراضيات» موجود في الكود. السبب: COALESCE كان
-- داخل إسقاط صف الاستعلام (SELECT COALESCE(obj, defaults) FROM …
-- WHERE user_id=…) — عندما يطابق WHERE صفر صفوف يعود الاستعلام
-- فارغًا فترجع الدالة NULL، والفرع الافتراضي لا يُقيَّم إطلاقًا
-- (نمط effective_plan الصحيح يضع الصف داخل استعلام جزئي scalar
-- subquery — COALESCE((SELECT …), defaults)).
--
-- الأثر العملي: بوابة gate_push_for_notification تقرأ prefs= NULL
-- → فحص push_enabled يُتخطى (NOT NULL = NULL) → فحص الفئة يُقيَّم
-- COALESCE(NULL, false) = false → ترفض بـ category_disabled بصمت
-- → لا يصل أي Push إطلاقًا لمستخدم لم يحفظ تفضيلاته يدويًا مرة
-- واحدة على الأقل. هذا هو نمط «الفشل الصامت» الذي رصده المالك.
--
-- الإصلاح (كل شيء قاعدة-بيانات فقط — لا تغيير في التطبيق):
--   1) _user_push_prefs: نمط الاستعلام الجزئي (كـ effective_plan)
--   2) get_notification_preferences: نفس النمط
--   3) upsert_push_subscription: ضمان وجود صف التفضيلات (افتراضيات)
--      لحظة تسجيل أول جهاز — القراءات القادمة تصطدم بصف حقيقي
--   4) بوابة الإرسال: تحصين فحص push_enabled ليُغلق على NULL
--      بدل تخطيه (fail-closed)
-- ============================================================

-- ── 1) مساعد التفضيلات: صف المستخدم أو الافتراضيات (أصلًا) ──
CREATE OR REPLACE FUNCTION public._user_push_prefs(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'push_enabled',   np.push_enabled,
        'push_important', np.push_important,
        'push_security',  np.push_security,
        'push_reminders', np.push_reminders,
        'push_community', np.push_community,
        'push_marketing', np.push_marketing
      )
      FROM public.notification_preferences np
      WHERE np.user_id = p_user
    ),
    jsonb_build_object(
      'push_enabled',   true,
      'push_important', true,
      'push_security',  true,
      'push_reminders', true,
      'push_community', false,
      'push_marketing', false
    )
  );
$$;

REVOKE ALL ON FUNCTION public._user_push_prefs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._user_push_prefs(uuid) TO service_role;

-- ── 2) قراءة التفضيلات (واجهة الإعدادات): نفس الإصلاح ──────
CREATE OR REPLACE FUNCTION public.get_notification_preferences()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'push_enabled',   p.push_enabled,
        'push_important', p.push_important,
        'push_security',  p.push_security,
        'push_reminders', p.push_reminders,
        'push_community', p.push_community,
        'push_marketing', p.push_marketing
      )
      FROM public.notification_preferences p
      WHERE p.user_id = auth.uid()
    ),
    jsonb_build_object(
      'push_enabled',   true,
      'push_important', true,
      'push_security',  true,
      'push_reminders', true,
      'push_community', false,
      'push_marketing', false
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_notification_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_preferences() TO authenticated, service_role;

-- ── 3) تسجيل جهاز ⇒ ضمان صف التفضيلات (افتراضيات الجدول) ────
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_label    text DEFAULT NULL,
  p_ua       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_active int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' OR length(p_endpoint) > 2048 THEN
    RAISE EXCEPTION 'invalid_endpoint';
  END IF;
  IF p_p256dh IS NULL OR length(p_p256dh) NOT BETWEEN 64 AND 160 THEN
    RAISE EXCEPTION 'invalid_p256dh';
  END IF;
  IF p_auth IS NULL OR length(p_auth) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'invalid_auth';
  END IF;

  -- صف تفضيلات افتراضي لحظة تسجيل أول جهاز (idempotent)
  INSERT INTO public.notification_preferences (user_id)
  VALUES (v_user)
  ON CONFLICT (user_id) DO NOTHING;

  -- سقف الأجهزة النشطة (المتجاوز يُطلب منه تنظيف الأجهزة القديمة)
  SELECT count(*) INTO v_active
  FROM public.push_subscriptions
  WHERE user_id = v_user AND revoked_at IS NULL;

  IF v_active >= 10 AND NOT EXISTS (
    SELECT 1 FROM public.push_subscriptions
    WHERE user_id = v_user AND endpoint = p_endpoint
  ) THEN
    RAISE EXCEPTION 'device_limit';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, label, user_agent)
  VALUES (v_user, p_endpoint, p_p256dh, p_auth,
          COALESCE(NULLIF(left(p_label, 120), ''), NULLIF(left(p_ua, 250), '')), left(p_ua, 250))
  ON CONFLICT (endpoint) DO UPDATE
  SET p256dh       = EXCLUDED.p256dh,
      auth         = EXCLUDED.auth,
      label        = EXCLUDED.label,
      user_agent   = EXCLUDED.user_agent,
      revoked_at   = NULL,
      revoked_reason = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.upsert_push_subscription(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text, text) TO authenticated, service_role;

-- ── 4) تحصين بوابة الإرسال: NULL ⇒ مرفوض بوضوح ──────────────
CREATE OR REPLACE FUNCTION public.gate_push_for_notification(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n         public.notifications;
  v_category text;
  v_pref    jsonb;
  v_hour    int;
  v_day     int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO n FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- خريطة الفئات (تسويق لا يُرسل إلا بتصنيف صريح عبر metadata->>'category')
  v_category := COALESCE(NULLIF(n.metadata->>'category', ''),
    CASE n.type
      WHEN 'community' THEN 'community'
      WHEN 'mention'   THEN 'community'
      WHEN 'reminder'  THEN 'reminders'
      ELSE 'important'
    END);

  SELECT public._user_push_prefs(n.user_id) INTO v_pref;

  -- fail-closed: لا تفضيلات ⇒ مرفوض (كان يُتخطى الفحص)
  IF v_pref IS NULL OR NOT COALESCE((v_pref->>'push_enabled')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'push_disabled');
  END IF;
  IF NOT COALESCE((v_pref->>('push_' || v_category))::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'category_disabled', 'category', v_category);
  END IF;

  -- سقوف الإغراق (بالعدّ على pushed_at في جدول الإشعارات نفسه)
  SELECT count(*) FILTER (WHERE pushed_at > now() - interval '1 hour'),
         count(*) FILTER (WHERE pushed_at > now() - interval '24 hours')
  INTO v_hour, v_day
  FROM public.notifications
  WHERE user_id = n.user_id AND pushed_at IS NOT NULL;

  IF v_hour >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited_hour');
  END IF;
  IF v_day >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited_day');
  END IF;

  -- الادعاء الذري — نداء متزامن ثانٍ لن يحصل عليه
  UPDATE public.notifications
  SET pushed_at = now()
  WHERE id = p_notification_id AND pushed_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_pushed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'notification_id', n.id,
    'user_id', n.user_id,
    'category', v_category,
    'priority', n.priority,
    'title', n.title,
    'body', n.body,
    'icon', n.icon,
    'action_url', n.action_url
  );
END $$;

REVOKE ALL ON FUNCTION public.gate_push_for_notification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gate_push_for_notification(uuid) TO service_role;
