-- ════════════════════════════════════════════════════════════
-- 028: المرحلة السادسة — Web Push Notifications
-- «إخراج الإشعارات المهمة من داخل المنصة إلى الجهاز، بدون
--  إغراق المستخدم»
--
-- مبادئ التصميم (من الخطة):
--   • subscription لكل جهاز/متصفح بشكل منفصل (endpoint فريد).
--   • endpoint/keys محفوظة server-side — RLS يمنع الآخرين،
--     والمستخدم يرى صفه فقط (مفاتيح جهازه معروفة لمتصفحه أصلًا).
--   • Push مرتبط بحدث الإشعار نفسه (notifications) وليس منطقًا
--     منفصلًا لكل قناة — الإرسال يُبوّب من notifications-service.
--   • تفضيلات لكل فئة (تحديثات مهمة / أمان / تذكيرات / مجتمع /
--     تسويق-بموافقة) — إيقاف Push يمنع القناة فقط ولا يلمس
--     مركز الإشعارات داخل الموقع.
--   • منع الإغراق: ادعاء ذري (pushed_at) + سقف 10/ساعة و30/يوم.
--
-- app_config: أُعيد إنشاؤه (أُسقط في 023 كجدول مهجور بلا كود)
-- بهدف حقيقي الآن: مفاتيح VAPID — قراءة service_role فقط
-- (RLS بلا أي policy = fail-closed). المفتاح الخاص لا يظهر
-- لأي مستخدم ولا في أي ملف بالمستودع.
-- ════════════════════════════════════════════════════════════

-- ── 1. اشتراكات Push (لكل جهاز على حدة) ────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- endpoint فريد عالميًا (عنوان خدمة Push الخاصة بهذا المتصفح)
  endpoint       text NOT NULL UNIQUE,
  -- مفاتيح تشفير الاشتراك (يعرفها متصفح المستخدم أصلًا)
  p256dh         text NOT NULL,
  auth           text NOT NULL,
  -- تسمية الجهاز للعرض («Chrome على أندرويد» مثلًا)
  label          text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_push_at   timestamptz,
  revoked_at     timestamptz,
  revoked_reason text,          -- 'user' | 'expired' | 'stale' | 'admin'
  CONSTRAINT push_subscriptions_endpoint_https CHECK (endpoint ~ '^https://'),
  CONSTRAINT push_subscriptions_keys_len CHECK (
    length(p256dh) BETWEEN 64 AND 160 AND length(auth) BETWEEN 16 AND 64
  )
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON public.push_subscriptions (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- المستخدم يقرأ صفوفه فقط. لا write policies إطلاقًا (fail-closed):
-- كل كتابة تمر عبر RPCs بأبواب صلاحية داخل الدالة.
DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 2. تفضيلات الإشعارات (لكل فئة قناة Push) ────────────────
-- الفئات كما في الخطة:
--   important (تحديثات مهمة)   ✅ افتراضيًا
--   security  (أمان الحساب)    ✅ افتراضيًا
--   reminders (تذكيرات)        ✅ افتراضيًا
--   community (نشاط المجتمع)   ❌ اختياري — افتراضيًا مغلق
--   marketing (تسويق)          ❌ يتطلب موافقة صريحة — مغلق افتراضيًا
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled   boolean NOT NULL DEFAULT true,
  push_important boolean NOT NULL DEFAULT true,
  push_security  boolean NOT NULL DEFAULT true,
  push_reminders boolean NOT NULL DEFAULT true,
  push_community boolean NOT NULL DEFAULT false,
  push_marketing boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- قراءة صفه فقط؛ الكتابة عبر RPC (تحقق من القيم).
DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 3. app_config: مفاتيح VAPID (service_role فقط) ───────────
CREATE TABLE IF NOT EXISTS public.app_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
-- لا policies = لا anon ولا authenticated (fail-closed).

-- ── 4. الإشعارات: عمود ادعاء Push (منع الإرسال المزدوج) ─────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
-- NULL = لم يُرسل Push لهذا الإشعار بعد (أو غير مؤهل).
-- الادعاء الذري: UPDATE … WHERE pushed_at IS NULL.

-- ── 5. RPC: upsert اشتراك (المستخدم لنفسه) ──────────────────
-- بوابة: المستخدم المسجل فقط (auth.uid). تحقق من الشكل،
-- سقف 10 أجهزة نشطة للمستخدم، و ON CONFLICT(endpoint) يجدد
-- المفاتيح ويلغي أي إبطال سابق (نفس المتصفح عاد بذات العنوان).
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_label    text DEFAULT NULL,
  p_ua       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
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

-- ── 6. RPC: إبطال اشتراك ────────────────────────────────────
-- بوابة: المستخدم لصفوفه، أو service_role (تنظيف 404/410).
CREATE OR REPLACE FUNCTION public.revoke_push_subscription(
  p_endpoint text,
  p_reason   text DEFAULT 'user'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  UPDATE public.push_subscriptions
  SET revoked_at = now(),
      revoked_reason = left(COALESCE(NULLIF(p_reason, ''), 'user'), 40)
  WHERE endpoint = p_endpoint
    AND (auth.role() = 'service_role' OR user_id = auth.uid())
    AND revoked_at IS NULL;

  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.revoke_push_subscription(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_push_subscription(text, text) TO authenticated, service_role;

-- إبطال بالمعرّف — من قائمة أجهزة المستخدم (لا يحتاج endpoint
-- الكامل الذي لا يُعرض في القائمة أصلًا). نفس البوابة: صفو أو
-- service_role.
CREATE OR REPLACE FUNCTION public.revoke_push_subscription_by_id(
  p_id     uuid,
  p_reason text DEFAULT 'user'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  UPDATE public.push_subscriptions
  SET revoked_at = now(),
      revoked_reason = left(COALESCE(NULLIF(p_reason, ''), 'user'), 40)
  WHERE id = p_id
    AND (auth.role() = 'service_role' OR user_id = auth.uid())
    AND revoked_at IS NULL;

  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.revoke_push_subscription_by_id(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_push_subscription_by_id(uuid, text) TO authenticated, service_role;

-- ── 7. RPC: أجهزة المستخدم (endpoint مقنّع — الأصل فقط) ────
CREATE OR REPLACE FUNCTION public.list_push_subscriptions()
RETURNS TABLE (
  id             uuid,
  label          text,
  endpoint_origin text,
  created_at     timestamptz,
  last_push_at   timestamptz,
  revoked_at     timestamptz,
  revoked_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         s.label,
         -- الأصل فقط (https://fcm.googleapis.com/…) — لا يكشف المسار الكامل
         split_part(split_part(s.endpoint, '//', 2), '/', 1) AS endpoint_origin,
         s.created_at,
         s.last_push_at,
         s.revoked_at,
         s.revoked_reason
  FROM public.push_subscriptions s
  WHERE s.user_id = auth.uid()
  ORDER BY s.revoked_at IS NULL DESC, s.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_push_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_push_subscriptions() TO authenticated, service_role;

-- ── 8. RPC: قراءة التفضيلات (صف المستخدم أو الافتراضيات) ───
CREATE OR REPLACE FUNCTION public.get_notification_preferences()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_build_object(
      'push_enabled',   p.push_enabled,
      'push_important', p.push_important,
      'push_security',  p.push_security,
      'push_reminders', p.push_reminders,
      'push_community', p.push_community,
      'push_marketing', p.push_marketing
    ),
    jsonb_build_object(
      'push_enabled',   true,
      'push_important', true,
      'push_security',  true,
      'push_reminders', true,
      'push_community', false,
      'push_marketing', false
    )
  )
  FROM public.notification_preferences p
  WHERE p.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_notification_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_preferences() TO authenticated, service_role;

-- ── 9. RPC: تحديث التفضيلات (upsert صف المستخدم) ───────────
CREATE OR REPLACE FUNCTION public.set_notification_preferences(
  p_enabled   boolean DEFAULT NULL,
  p_important boolean DEFAULT NULL,
  p_security  boolean DEFAULT NULL,
  p_reminders boolean DEFAULT NULL,
  p_community boolean DEFAULT NULL,
  p_marketing boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  INSERT INTO public.notification_preferences AS np (
    user_id, push_enabled, push_important, push_security,
    push_reminders, push_community, push_marketing
  ) VALUES (
    v_user,
    COALESCE(p_enabled, true),
    COALESCE(p_important, true),
    COALESCE(p_security, true),
    COALESCE(p_reminders, true),
    COALESCE(p_community, false),
    COALESCE(p_marketing, false)
  )
  ON CONFLICT (user_id) DO UPDATE
  SET push_enabled   = COALESCE(p_enabled,   np.push_enabled),
      push_important = COALESCE(p_important, np.push_important),
      push_security  = COALESCE(p_security,  np.push_security),
      push_reminders = COALESCE(p_reminders, np.push_reminders),
      push_community = COALESCE(p_community, np.push_community),
      push_marketing = COALESCE(p_marketing, np.push_marketing),
      updated_at     = now();

  RETURN public.get_notification_preferences();
END $$;

REVOKE ALL ON FUNCTION public.set_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated, service_role;

-- ── 10. RPC: بوابة إرسال Push لإشعار واحد ──────────────────
-- بوابة: service_role فقط (خادم أوج). التسلسل:
--   1) خريطة type → فئة (مجتمع/تذكيرات… وإلا «مهم»).
--   2) تفضيلات المستخدم: القناة مفتوحة؟ push_enabled؟
--   3) سقوف الإغراق: <10 pushes آخر ساعة و<30 آخر 24 ساعة.
--   4) ادعاء ذري: UPDATE pushed_at WHERE IS NULL → مرة واحدة فقط.
-- الإرجاع: {ok, reason, user_id, category, priority, title, body,
--           action_url, notification_id}
--   ok=false مع reason صريح: push_disabled / category_disabled /
--   rate_limited_hour / rate_limited_day / already_pushed /
--   not_found. فشل القناة لا يفشّل الإشعار داخل الموقع إطلاقًا.
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

  IF NOT (v_pref->>'push_enabled')::boolean THEN
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

-- مساعد خاص: تفضيلات مستخدم (بلا auth.uid — يُستدعى داخليًا
-- بمعرّف صريح). غير ممنوح لأي دور خارجي.
CREATE OR REPLACE FUNCTION public._user_push_prefs(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_build_object(
      'push_enabled',   np.push_enabled,
      'push_important', np.push_important,
      'push_security',  np.push_security,
      'push_reminders', np.push_reminders,
      'push_community', np.push_community,
      'push_marketing', np.push_marketing
    ),
    jsonb_build_object(
      'push_enabled',   true,
      'push_important', true,
      'push_security',  true,
      'push_reminders', true,
      'push_community', false,
      'push_marketing', false
    )
  )
  FROM public.notification_preferences np
  WHERE np.user_id = p_user;
$$;

REVOKE ALL ON FUNCTION public._user_push_prefs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._user_push_prefs(uuid) TO service_role;

-- ── 11. RPC: تحديث نشاط الاشتراك بعد الإرسال ────────────────
-- نجاح فقط يحدّث last_push_at. الإخفاق الدائم (404/410) يُدار
-- عبر revoke_push_subscription («expired») من نداء الإرسال نفسه.
CREATE OR REPLACE FUNCTION public.touch_push_subscription(
  p_endpoint text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.push_subscriptions
  SET last_push_at = now()
  WHERE endpoint = p_endpoint AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.touch_push_subscription(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_push_subscription(text) TO service_role;

-- ── 12. RPC: تنظيف الاشتراكات المهجورة (cron) ───────────────
-- اشتراك لم يُرسل عبره شيء منذ p_days يومًا → إبطال (وليس حذف:
-- نُبقي الأثر). service_role فقط.
CREATE OR REPLACE FUNCTION public.cleanup_stale_push_subscriptions(
  p_days int DEFAULT 30
)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.push_subscriptions
  SET revoked_at = now(), revoked_reason = 'stale'
  WHERE revoked_at IS NULL
    AND COALESCE(last_push_at, created_at) < now() - (GREATEST(p_days, 7) * interval '1 day');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.cleanup_stale_push_subscriptions(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_push_subscriptions(int) TO service_role;
