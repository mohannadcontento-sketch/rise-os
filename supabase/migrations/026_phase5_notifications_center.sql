-- ============================================================
-- 026. Phase 5 — نظام الإشعارات In-App (مركز الإشعارات الموحد)
-- Run AFTER 025_phase4_monetization.sql.
--
-- الهدف (من الخطة): «بناء مركز إشعارات موحد داخل أوج يكون
-- مصدرًا لكل القنوات الأخرى».
--
-- المبادئ:
--   1. جدول notifications يوسَّع (وليس يُستبدل): أعمدة جديدة
--      priority / expires_at / read_at / dedup_key + أنواع أحداث
--      المرحلة الخامسة (subscription/usage/community/mention/
--      background). عقد واجهة الجرس الحالي (read/action_url/
--      metadata) لا يتغير — التوافق الخلفي كامل.
--   2. منع تكرار نفس الإشعار عند تكرار الحدث = فهرس فريد
--      (user_id, dedup_key) + ON CONFLICT DO NOTHING. القيم
--      NULL في dedup_key لا تتعارض (NULL ≠ NULL في Postgres)
--      فالإشعارات غير المخصصة للـdedup تعمل كالمعتاد.
--   3. الإشعارات «الخادمية» (admin → مستخدم) عبر notify_user
--      (SECURITY DEFINER): مسموح فقط للـservice_role أو للمستخدم
--      لنفسه — لا يمكن لمستخدم عادي إغراق غيره.
--   4. الإشعارات المنتهية (expires_at) تُحذف كسولًا (lazy) عند
--      فتح الخلاصة — get_notifications_feed يحذف صفوف المستخدم
--      المنتهية ثم يقرأ. لا cron.
--   5. حدود الاستخدام (المرحلة 04) تبعت إشعاراتها الآن من نفس
--      نقطة الـenforcement: consume_usage يُدرج إشعار «وصلت للحد»
--      (priority high) وإشعار «اقتربت من الحد» (عند 80% يومي /
--      90% شهري) — مرة واحدة لكل فترة عبر dedup.
--   6. read_at يُضبط تلقائيًا بتريجر عند قلب read → true.
--   7. admin_apply_recovery_email_template: تطبيق قالب إيميل
--      إعادة تعيين كلمة المرور على auth.email_templates من
--      داخل لوحة الأدمن (متطلب المالك) — مع fallback واضح لو
--      الجدول/الصلاحية غير متاحين على هذا المشروع.
-- ============================================================

-- ── 1. توسيع أعمدة notifications ────────────────────────────
-- (قبل إضافة CHECK الجديدة نُسقط قيد النوع القديم أولًا
--  كي لا يلتقطه البحث الديناميكي لاحقًا)
DO $$
DECLARE
  v_type_constraint text;
BEGIN
  SELECT conname INTO v_type_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type IN%';
  IF v_type_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_type_constraint);
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedup_key  TEXT;

-- أنواع أحداث المرحلة الخامسة + الأنواع القديمة كلها
-- (DROP IF EXISTS أولًا يجعل الهجرة قابلة لإعادة التشغيل)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_v2_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_v2_check
  CHECK (type IN (
    -- القديمة (توافق خلفي كامل)
    'info', 'success', 'warning', 'error', 'achievement', 'reminder', 'system',
    -- المرحلة 05
    'subscription',  -- تحديث الاشتراك أو قرب انتهائه
    'usage',         -- بلوغ Usage Limit أو قربه
    'community',     -- رد أو تعليق في المجتمع (بنية جاهزة للمرحلة 07)
    'mention',       -- ذكر المستخدم (بنية جاهزة)
    'background'     -- نجاح/فشل عملية تنفذ في الخلفية
  ));

-- ── 2. منع تكرار نفس الإشعار (dedup) ────────────────────────
-- NULL في dedup_key لا يتعارض (القيم NULL متمايزة في الفهارس
-- الفريدة) — الإشعارات العديدة بلا dedup تعمل كالمعتاد.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedup_uidx
  ON public.notifications (user_id, dedup_key);

-- ── 3. read_at تلقائيًا عند أول قراءة ───────────────────────
CREATE OR REPLACE FUNCTION public.notifications_touch_read_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.read_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notifications_read_at_trg ON public.notifications;
CREATE TRIGGER notifications_read_at_trg
BEFORE UPDATE ON public.notifications
FOR EACH ROW
WHEN (NOT OLD.read AND NEW.read AND NEW.read_at IS NULL)
EXECUTE FUNCTION public.notifications_touch_read_at();

-- ── 4. notify_user: الإنشاء الموحد server-side ──────────────
-- مسموح: service_role (أدمن/خادم) أو المستخدم لنفسه فقط.
-- يعيد id الإشعار، أو NULL لو dedup_key موجود مسبقًا (مكرر).
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id    uuid,
  p_type       text,
  p_title      text,
  p_body       text         DEFAULT NULL,
  p_icon       text         DEFAULT NULL,
  p_action_url text         DEFAULT NULL,
  p_metadata   jsonb        DEFAULT NULL,
  p_priority   text         DEFAULT 'normal',
  p_expires_at timestamptz  DEFAULT NULL,
  p_dedup_key  text         DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user';
  END IF;
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.notifications (
    user_id, type, title, body, icon, action_url, metadata,
    priority, expires_at, "read", dedup_key
  ) VALUES (
    p_user_id, p_type, p_title, p_body, p_icon, p_action_url,
    COALESCE(p_metadata, '{}'::jsonb), p_priority, p_expires_at, false, p_dedup_key
  )
  ON CONFLICT (user_id, dedup_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;  -- NULL = مكرر (تم منعه)
END $$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb, text, timestamptz, text) TO authenticated, service_role;

-- ── 5. get_notifications_feed: خلاصة + فلترة + عدّاد ─────────
-- في طلب واحد: (أ) حذف صفوف المستخدم المنتهية (lazy cleanup)،
-- (ب) عدّ غير المقروء (غير المنتهي)، (ج) القائمة مع الفلترة.
-- p_filter: all | unread | high | account | activity
--   account  = subscription/usage/system/background (حسابك ونظامه)
--   activity = community/mention/achievement/success/reminder/
--              info/warning/error (نشاطك داخل أوج)
CREATE OR REPLACE FUNCTION public.get_notifications_feed(
  p_limit        int     DEFAULT 50,
  p_filter       text    DEFAULT 'all',
  p_unread_only  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

-- ── 6. mark_all_notifications_read: تحديد الكل بطلب واحد ────
-- ذري وسريع (بدل إرسال كل المعرفات من العميل). read_at يُضبط
-- بالتريجر أعلاه.
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.notifications
     SET "read" = true
   WHERE user_id = auth.uid()
     AND NOT "read";
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated, service_role;

-- ── 7. notifications_unread_count: شارة خفيفة (badge-only) ──
-- أرخص من جلب الخلاصة كاملة لتحديث الشارة كل 5 دقائق.
CREATE OR REPLACE FUNCTION public.notifications_unread_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)
    FROM public.notifications
   WHERE user_id = auth.uid()
     AND NOT "read"
     AND (expires_at IS NULL OR expires_at >= now());
$$;

REVOKE ALL ON FUNCTION public.notifications_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notifications_unread_count() TO authenticated, service_role;

-- ── 8. consume_usage v2: حدود المرحلة 04 + إشعاراتها ─────────
-- نفس منطق 025 حرفيًا (atomic: قفل FOR UPDATE → فحص → زيادة)
-- + إدراج إشعار عند:
--   • المنع (not_entitled / daily / monthly) — priority high،
--     مرة واحدة لكل (ميزة×فترة) عبر dedup.
--   • القرب من الحد: 80% يوميًا / 90% شهريًا — priority normal،
--     مرة واحدة لكل (ميزة×فترة).
-- الإشعار داخل نفس معاملة العدّاد؛ والشكل المرجوع للعميل
-- (jsonb) لم يتغير إطلاقًا — توافق خلفي كامل مع اختبارات 04.
CREATE OR REPLACE FUNCTION public.consume_usage(p_feature_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user          uuid  := auth.uid();
  v_plan          text;
  v_enabled       boolean;
  v_daily_limit   int;
  v_monthly_limit int;
  v_today         date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_month         date := date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo')::timestamp)::date;
  v_used_daily    int;
  v_used_monthly  int;
  v_reset_daily   timestamptz;
  v_reset_monthly timestamptz;
  v_result        jsonb;
  v_label         text := CASE p_feature_key
                            WHEN 'ai.action'   THEN 'الذكاء الاصطناعي'
                            WHEN 'export.data' THEN 'تصدير البيانات'
                            WHEN 'mcp.key'     THEN 'MCP'
                            ELSE p_feature_key
                          END;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_plan := public.effective_plan(v_user);

  SELECT pe.enabled, pe.daily_limit, pe.monthly_limit
    INTO v_enabled, v_daily_limit, v_monthly_limit
  FROM public.plan_entitlements pe
  WHERE pe.plan_code = v_plan AND pe.feature_key = p_feature_key;

  -- لا entitlement مسجّل → ممنوع (fail-closed) + إشعار مرة/يوم
  IF NOT FOUND OR NOT v_enabled THEN
    INSERT INTO public.notifications (
      user_id, type, title, body, icon, action_url, metadata, priority, "read", dedup_key
    ) VALUES (
      v_user, 'usage',
      '«' || v_label || '» غير متاحة في خطتك',
      'هذه الميزة متاحة في خطة أعلى. رقِّ خطتك من الإعدادات ← الخطة والاشتراك لتفعيلها.',
      '🔒', 'settings',
      jsonb_build_object('feature', p_feature_key, 'reason', 'not_entitled', 'plan', v_plan),
      'high', false,
      'usage-ent:' || p_feature_key || ':' || v_today::text
    )
    ON CONFLICT (user_id, dedup_key) DO NOTHING;

    v_result := jsonb_build_object(
      'allowed', false,
      'reason', 'not_entitled',
      'feature', p_feature_key,
      'plan', v_plan
    );
    RETURN v_result;
  END IF;

  -- Fair Use: الحدود الصفرية تُحترم قبل أي إدراج
  IF v_daily_limit = 0 OR v_monthly_limit = 0 THEN
    v_result := jsonb_build_object(
      'allowed', false,
      'reason', CASE WHEN v_daily_limit = 0 THEN 'daily_limit' ELSE 'monthly_limit' END,
      'feature', p_feature_key, 'plan', v_plan,
      'usedDaily', 0, 'limitDaily', v_daily_limit,
      'usedMonthly', 0, 'limitMonthly', v_monthly_limit
    );
    RETURN v_result;
  END IF;

  INSERT INTO public.usage_daily (user_id, day, feature_key, count)
  VALUES (v_user, v_today, p_feature_key, 0)
  ON CONFLICT (user_id, day, feature_key) DO NOTHING;

  INSERT INTO public.usage_monthly (user_id, month, feature_key, count)
  VALUES (v_user, v_month, p_feature_key, 0)
  ON CONFLICT (user_id, month, feature_key) DO NOTHING;

  SELECT count INTO v_used_daily
  FROM public.usage_daily
  WHERE user_id = v_user AND day = v_today AND feature_key = p_feature_key
  FOR UPDATE;

  SELECT count INTO v_used_monthly
  FROM public.usage_monthly
  WHERE user_id = v_user AND month = v_month AND feature_key = p_feature_key
  FOR UPDATE;

  v_reset_daily   := ((v_today + 1)::timestamp AT TIME ZONE 'Africa/Cairo');
  v_reset_monthly := ((date_trunc('month', v_month + interval '1 month'))::timestamp AT TIME ZONE 'Africa/Cairo');

  -- الفحص ثم الزيادة (نفس نافذة العدّ) — المنع + إشعار مرة/فترة
  IF v_daily_limit IS NOT NULL AND v_used_daily >= v_daily_limit THEN
    INSERT INTO public.notifications (
      user_id, type, title, body, icon, action_url, metadata, priority, "read", dedup_key
    ) VALUES (
      v_user, 'usage',
      'وصلت للحد اليومي من «' || v_label || '»',
      'استخدمت ' || v_used_daily || ' من ' || v_daily_limit || ' اليوم. يتجدد غدًا بعد منتصف الليل (توقيت القاهرة) — أو رقِّ خطتك الآن لحدود أعلى.',
      '📊', 'settings',
      jsonb_build_object(
        'feature', p_feature_key, 'reason', 'daily_limit', 'plan', v_plan,
        'usedDaily', v_used_daily, 'limitDaily', v_daily_limit,
        'resetDailyAt', to_jsonb(v_reset_daily::text)
      ),
      'high', false,
      'usage-daily:' || p_feature_key || ':' || v_today::text
    )
    ON CONFLICT (user_id, dedup_key) DO NOTHING;

    v_result := jsonb_build_object(
      'allowed', false, 'reason', 'daily_limit',
      'feature', p_feature_key, 'plan', v_plan,
      'usedDaily', v_used_daily, 'limitDaily', v_daily_limit,
      'usedMonthly', v_used_monthly, 'limitMonthly', v_monthly_limit,
      'resetDailyAt', v_reset_daily, 'resetMonthlyAt', v_reset_monthly
    );
    RETURN v_result;
  END IF;

  IF v_monthly_limit IS NOT NULL AND v_used_monthly >= v_monthly_limit THEN
    INSERT INTO public.notifications (
      user_id, type, title, body, icon, action_url, metadata, priority, "read", dedup_key
    ) VALUES (
      v_user, 'usage',
      'وصلت للحد الشهري من «' || v_label || '»',
      'استخدمت ' || v_used_monthly || ' من ' || v_monthly_limit || ' هذا الشهر. يتجدد مع بداية الشهر — أو رقِّ خطتك الآن.',
      '📊', 'settings',
      jsonb_build_object(
        'feature', p_feature_key, 'reason', 'monthly_limit', 'plan', v_plan,
        'usedMonthly', v_used_monthly, 'limitMonthly', v_monthly_limit,
        'resetMonthlyAt', to_jsonb(v_reset_monthly::text)
      ),
      'high', false,
      'usage-monthly:' || p_feature_key || ':' || v_month::text
    )
    ON CONFLICT (user_id, dedup_key) DO NOTHING;

    v_result := jsonb_build_object(
      'allowed', false, 'reason', 'monthly_limit',
      'feature', p_feature_key, 'plan', v_plan,
      'usedDaily', v_used_daily, 'limitDaily', v_daily_limit,
      'usedMonthly', v_used_monthly, 'limitMonthly', v_monthly_limit,
      'resetDailyAt', v_reset_daily, 'resetMonthlyAt', v_reset_monthly
    );
    RETURN v_result;
  END IF;

  UPDATE public.usage_daily
     SET count = count + 1, updated_at = now()
   WHERE user_id = v_user AND day = v_today AND feature_key = p_feature_key;

  UPDATE public.usage_monthly
     SET count = count + 1, updated_at = now()
   WHERE user_id = v_user AND month = v_month AND feature_key = p_feature_key;

  -- القرب من الحد: 80% يوميًا / 90% شهريًا — مرة واحدة لكل فترة
  IF v_daily_limit IS NOT NULL AND (v_used_daily + 1) >= ceil(0.8 * v_daily_limit)
     AND (v_used_daily + 1) < v_daily_limit THEN
    INSERT INTO public.notifications (
      user_id, type, title, body, icon, action_url, metadata, priority, "read", dedup_key
    ) VALUES (
      v_user, 'usage',
      'اقتربت من حدك اليومي — «' || v_label || '»',
      'استخدمت ' || (v_used_daily + 1) || ' من ' || v_daily_limit || ' اليوم. يمكنك الترقية في أي وقت لرفع السقف.',
      '📈', 'settings',
      jsonb_build_object(
        'feature', p_feature_key, 'reason', 'near_daily', 'plan', v_plan,
        'usedDaily', v_used_daily + 1, 'limitDaily', v_daily_limit
      ),
      'normal', false,
      'usage-near-d:' || p_feature_key || ':' || v_today::text
    )
    ON CONFLICT (user_id, dedup_key) DO NOTHING;
  END IF;

  IF v_monthly_limit IS NOT NULL AND (v_used_monthly + 1) >= ceil(0.9 * v_monthly_limit)
     AND (v_used_monthly + 1) < v_monthly_limit THEN
    INSERT INTO public.notifications (
      user_id, type, title, body, icon, action_url, metadata, priority, "read", dedup_key
    ) VALUES (
      v_user, 'usage',
      'اقتربت من حدك الشهري — «' || v_label || '»',
      'استخدمت ' || (v_used_monthly + 1) || ' من ' || v_monthly_limit || ' هذا الشهر. تجد لوحة الاستخدام في الإعدادات ← الخطة والاشتراك.',
      '📈', 'settings',
      jsonb_build_object(
        'feature', p_feature_key, 'reason', 'near_monthly', 'plan', v_plan,
        'usedMonthly', v_used_monthly + 1, 'limitMonthly', v_monthly_limit
      ),
      'normal', false,
      'usage-near-m:' || p_feature_key || ':' || v_month::text
    )
    ON CONFLICT (user_id, dedup_key) DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'allowed', true,
    'feature', p_feature_key,
    'plan', v_plan,
    'usedDaily', v_used_daily + 1, 'limitDaily', v_daily_limit,
    'usedMonthly', v_used_monthly + 1, 'limitMonthly', v_monthly_limit,
    'resetDailyAt', v_reset_daily,
    'resetMonthlyAt', v_reset_monthly
  );
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.consume_usage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_usage(text) TO authenticated, service_role;

-- ── 9. تطبيق قالب إيميل إعادة التعيين (متطلب المالك) ────────
-- admin_apply_recovery_email_template: يكتب قالب HTML في
-- auth.email_templates (type='recovery') إن كان الجدول متاحًا
-- والدور يملك صلاحيته. يعيد jsonb بحالة واضحة — لو الجدول أو
-- الصلاحية غير متاحين: applied=false مع reason ونص إرشادي
-- (البديل: اللصق من Dashboard → Authentication → Email
--  Templates → Reset Password).
-- البوابة: service_role فقط (يُنادى من مسار أدمن بخادم التطبيق)
-- أو أدمن (raw_app_meta_data->>'role' = 'admin') من جلسة مستخدم.
CREATE OR REPLACE FUNCTION public.admin_apply_recovery_email_template(
  p_content text,
  p_subject text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin      boolean := false;
  v_table_exists  boolean;
  v_has_updated   boolean;
  v_has_subject   boolean;
  v_set_clause    text;
  v_rows          int;
  v_content       text;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_is_admin := true;
  ELSE
    SELECT COALESCE((raw_app_meta_data->>'role') = 'admin', false)
      INTO v_is_admin
      FROM auth.users
     WHERE id = auth.uid();
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- سلامة المحتوى: يجب أن يحمل متغير Supabase الحيوي
  v_content := trim(p_content);
  IF char_length(v_content) < 200 THEN
    RAISE EXCEPTION 'content_too_short';
  END IF;
  IF position('{{ .ConfirmationURL }}' in v_content) = 0 THEN
    RAISE EXCEPTION 'missing_confirmation_url';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'auth' AND table_name = 'email_templates'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'table_missing',
      'note', 'جدول auth.email_templates غير موجود في هذا المشروع — الصق القالب يدويًا: Dashboard → Authentication → Email Templates → Reset Password (HTML).'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'auth' AND table_name = 'email_templates' AND column_name = 'last_updated_at'
  ) INTO v_has_updated;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'auth' AND table_name = 'email_templates' AND column_name = 'subject'
  ) INTO v_has_subject;

  v_set_clause := 'content = $1';
  IF v_has_updated THEN
    v_set_clause := v_set_clause || ', last_updated_at = now()';
  END IF;
  IF v_has_subject AND p_subject IS NOT NULL AND char_length(p_subject) > 0 THEN
    v_set_clause := v_set_clause || ', subject = $2';
  END IF;

  BEGIN
    EXECUTE format('UPDATE auth.email_templates SET %s WHERE type = ''recovery''', v_set_clause)
      USING v_content, p_subject;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      -- لا صف بعد (أول تطبيق) → INSERT بالأعمدة المتاحة فقط
      IF v_has_subject AND p_subject IS NOT NULL AND char_length(p_subject) > 0 THEN
        EXECUTE 'INSERT INTO auth.email_templates (type, content, subject) VALUES (''recovery'', $1, $2)'
          USING v_content, p_subject;
      ELSE
        EXECUTE 'INSERT INTO auth.email_templates (type, content) VALUES (''recovery'', $1)'
          USING v_content;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'applied', true,
      'reason', 'updated',
      'contentLength', char_length(v_content),
      'subjectSet', (v_has_subject AND p_subject IS NOT NULL AND char_length(p_subject) > 0)
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      RETURN jsonb_build_object(
        'applied', false,
        'reason', 'permission',
        'note', 'دور الخادم لا يملك كتابة auth.email_templates في هذا المشروع — الصق القالب يدويًا من Dashboard → Authentication → Email Templates → Reset Password.'
      );
    WHEN undefined_column THEN
      RETURN jsonb_build_object(
        'applied', false,
        'reason', 'schema_mismatch',
        'note', 'بنية auth.email_templates غير مطابقة للمتوقع — الصق القالب يدويًا من Dashboard → Authentication → Email Templates.'
      );
  END;
END $$;

REVOKE ALL ON FUNCTION public.admin_apply_recovery_email_template(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_recovery_email_template(text, text) TO authenticated, service_role;

-- ── 10. فهارس الأداء للفلترة الجديدة ────────────────────────
CREATE INDEX IF NOT EXISTS notifications_user_priority_idx
  ON public.notifications (user_id, priority, created_at DESC)
  WHERE priority = 'high';

CREATE INDEX IF NOT EXISTS notifications_user_expires_idx
  ON public.notifications (user_id, expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN public.notifications.priority   IS 'normal/high — الإشعارات المهمة تظهر بتمييز بصري وأولوية في الفلترة';
COMMENT ON COLUMN public.notifications.expires_at IS 'انتهاء صلاحية الإشعار — تُحذف كسولًا عند فتح الخلاصة';
COMMENT ON COLUMN public.notifications.read_at    IS 'وقت أول قراءة (يضبطه تريجر notifications_read_at_trg)';
COMMENT ON COLUMN public.notifications.dedup_key  IS 'مفتاح منع التكرار: نفس (user_id, dedup_key) لا يُدرج مرتين — NULL يعني بلا dedup';
