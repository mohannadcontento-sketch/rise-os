-- ============================================================
-- 025. Phase 4 — Plans & subscriptions & usage limits
-- (Monetization Core)
-- Run AFTER 024_phase3_account_security.sql.
--
-- الهدف (من الخطة): «بناء Monetization Core مركزي يمكنه التحكم
-- في Free/Plus/Max بدون نسخ منطق الحدود داخل كل Feature».
--
-- المبادئ:
--   1. مصدر واحد لحدود الخطط = جدول plan_entitlements (قابل للتعديل
--      من SQL دون نشر جديد). لا حدود مبرمجة في كود التطبيق للـ enforcement.
--   2. الـUsage حسابات server-side بالكامل (usage_daily / usage_monthly).
--   3. منع تجاوز limit من الفرونت: فرض الحد يحدث داخل دالة
--      consume_usage (SECURITY DEFINER + قفل صف FOR UPDATE) — لا
--      INSERT/UPDATE/DELETE policies لجدولات الاستخدام إطلاقًا،
--      والعميل يستطيع فقط قراءة استخدامه هو.
--   4. الإطار الزمني = Africa/Cairo (إعادة التعيين على منتصف الليل
--      بتوقيت مصر، ليس UTC).
--   5. Max = Fair Use وليس Unlimited مطلقًا: كل الحدود أرقام صريحة.
--   6. طريقة الدفع v1 يدوية: طلب ترقية → مرجع الدفع → مراجعة
--      الأدمن → تفعيل (يُسجَّل المرجع والتاريخ ومن فعّل).
-- ============================================================

-- ── 1. خطط المنتج (بيانات وصفية للعرض) ─────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  code        TEXT PRIMARY KEY CHECK (code IN ('free', 'plus', 'max')),
  name_ar     TEXT NOT NULL,
  price_egp   NUMERIC(10,2) NOT NULL DEFAULT 0,
  features    JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INT  NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- بيانات عامة للعرض (الأسعار والحدود معلَنة في واجهة الترقية)
DROP POLICY IF EXISTS "plans_select_authenticated" ON public.plans;
CREATE POLICY "plans_select_authenticated" ON public.plans
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.plans FROM anon;
GRANT SELECT ON public.plans TO authenticated;
-- لا write policies: التعديل عبر SQL editor / service_role فقط.

INSERT INTO public.plans (code, name_ar, price_egp, features, sort_order) VALUES
  ('free', 'المجانية', 0,    '{"ads": true,  "mcp": false, "desc": "الأساسيات بإعلانات خفيفة"}', 1),
  ('plus', 'بلس',       30,   '{"ads": false, "mcp": false, "desc": "حدود أعلى بدون إعلانات"}',   2),
  ('max',  'ماكس',      50,   '{"ads": false, "mcp": true,  "desc": "أعلى حدود ضمن Fair Use + MCP"}', 3)
ON CONFLICT (code) DO UPDATE
  SET name_ar = EXCLUDED.name_ar,
      price_egp = EXCLUDED.price_egp,
      features = EXCLUDED.features,
      sort_order = EXCLUDED.sort_order;

-- ── 2. جدول الحدود (المصدر الوحيد للـ enforcement) ──────────
-- feature_key مسجَّلة في المرحلة 4:
--   ai.action    : عمليات الذكاء الاصطناعي (توصيل لاحق — البنية جاهزة)
--   export.data  : تصدير/تنزيل البيانات
--   mcp.key      : إنشاء مفتاح MCP (خاص بماكس — المرحلة 10)
-- NULL في حد = غير محدود في ذلك البُعد (ممنوع لماكس — Fair Use).
CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  plan_code      TEXT NOT NULL REFERENCES public.plans(code) ON DELETE CASCADE,
  feature_key    TEXT NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  daily_limit    INT,
  monthly_limit  INT,
  PRIMARY KEY (plan_code, feature_key),
  CHECK (daily_limit IS NULL OR daily_limit >= 0),
  CHECK (monthly_limit IS NULL OR monthly_limit >= 0)
);

ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_entitlements_select_authenticated" ON public.plan_entitlements;
CREATE POLICY "plan_entitlements_select_authenticated" ON public.plan_entitlements
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.plan_entitlements FROM anon;
GRANT SELECT ON public.plan_entitlements TO authenticated;
-- لا write policies: تعديل الحدود = SQL فقط (owner action).

INSERT INTO public.plan_entitlements (plan_code, feature_key, enabled, daily_limit, monthly_limit) VALUES
  -- الذكاء الاصطناعي: مجاني 5/يوم و 60/شهر، بلس 30/يوم و 600/شهر،
  -- ماكس 100/يوم و 3000/شهر (Fair Use صريح — لا NULL).
  ('free', 'ai.action',   true, 5,   60),
  ('plus', 'ai.action',   true, 30,  600),
  ('max',  'ai.action',   true, 100, 3000),
  -- تصدير البيانات: يومي فقط (monthly NULL = بلا سقف شهري منفصل)
  ('free', 'export.data', true, 3,   NULL),
  ('plus', 'export.data', true, 15,  NULL),
  ('max',  'export.data', true, 50,  NULL),
  -- MCP: متاح لماكس فقط (بدون عدّاد — entitlement منطقي)
  ('free', 'mcp.key',     false, NULL, NULL),
  ('plus', 'mcp.key',     false, NULL, NULL),
  ('max',  'mcp.key',     true,  NULL, NULL)
ON CONFLICT (plan_code, feature_key) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      daily_limit = EXCLUDED.daily_limit,
      monthly_limit = EXCLUDED.monthly_limit;

-- ── 3. عدّادات الاستخدام (server-side فقط) ─────────────────
CREATE TABLE IF NOT EXISTS public.usage_daily (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day         DATE NOT NULL,               -- يوم القاهرة (ليس UTC)
  feature_key TEXT NOT NULL,
  count       INT  NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, feature_key)
);

CREATE TABLE IF NOT EXISTS public.usage_monthly (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month       DATE NOT NULL,               -- أول يوم من شهر القاهرة
  feature_key TEXT NOT NULL,
  count       INT  NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month, feature_key)
);

ALTER TABLE public.usage_daily   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_monthly ENABLE ROW LEVEL SECURITY;

-- قراءة استخدامك فقط؛ لا write policies (fail-closed):
-- الكتابة الوحيدة = consume_usage (SECURITY DEFINER).
DROP POLICY IF EXISTS "usage_daily_select_own" ON public.usage_daily;
CREATE POLICY "usage_daily_select_own" ON public.usage_daily
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "usage_monthly_select_own" ON public.usage_monthly;
CREATE POLICY "usage_monthly_select_own" ON public.usage_monthly
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.usage_daily   FROM anon, authenticated;
REVOKE ALL ON public.usage_monthly FROM anon, authenticated;
GRANT SELECT ON public.usage_daily   TO authenticated;
GRANT SELECT ON public.usage_monthly TO authenticated;

-- فهرس لتقارير الأدمن (استخدام مستخدم عبر الأيام)
CREATE INDEX IF NOT EXISTS usage_daily_user_day_idx
  ON public.usage_daily (user_id, day DESC);

-- ── 4. طلبات الترقية (الدفع اليدوي v1) ─────────────────────
-- التدفق: المستخدم يطلب → تعليمات الدفع → يدفع ويرسل المرجع →
-- الأدمن يراجع → تفعيل. يُسجَّل المرجع والتاريخ ومن فعّل.
CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_plan TEXT NOT NULL CHECK (requested_plan IN ('plus', 'max')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  payment_method TEXT NOT NULL
                 CHECK (payment_method IN ('instapay', 'vodafone_cash', 'etisalat_cash', 'other')),
  reference      TEXT NOT NULL CHECK (char_length(reference) BETWEEN 4 AND 64),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT
);

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

-- المستخدم: يرى طلباته، وينشئ طلبًا لنفسه بحالة pending فقط.
DROP POLICY IF EXISTS "subscription_requests_select_own" ON public.subscription_requests;
CREATE POLICY "subscription_requests_select_own" ON public.subscription_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscription_requests_insert_own" ON public.subscription_requests;
CREATE POLICY "subscription_requests_insert_own" ON public.subscription_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND rejection_reason IS NULL
  );

-- لا UPDATE/DELETE للمستخدم: المراجعة حكر على service_role (الأدمن).
-- منع طلبات مكررة معلّقة لنفس الخطة:
CREATE UNIQUE INDEX IF NOT EXISTS subscription_requests_one_pending_per_plan
  ON public.subscription_requests (user_id, requested_plan)
  WHERE status = 'pending';

REVOKE ALL ON public.subscription_requests FROM anon;
GRANT SELECT, INSERT ON public.subscription_requests TO authenticated;

-- ── 5. الخطة الفعّالة (حساب انتهاء الصلاحية مركزيًا) ────────
-- "expired" منطقيًا: status='active' مع expires_at ماضٍ → يعامل
-- كـ free عند القراءة. النتيجة نفسها في كل مكان دون cron.
CREATE OR REPLACE FUNCTION public.effective_plan(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN us.status = 'active'
             AND (us.expires_at IS NULL OR us.expires_at > now())
        THEN us.plan
      END
      FROM public.user_subscriptions us
      WHERE us.user_id = p_user
    ),
    'free'
  );
$$;

REVOKE ALL ON FUNCTION public.effective_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_plan(uuid) TO authenticated, service_role;

-- ── 6. البوابة الذرية للحدود: consume_usage ─────────────────
-- تُنادى من API routes بعميل المستخدم. تقرأ الخطة والحدود من
-- قاعدة البيانات (لا وسائط limits من العميل — لا خداع ممكن)،
-- تقفل صفّي العدّاد FOR UPDATE، تفحص، ثم تزيد ذريًّا.
-- إرجاع jsonb: { allowed, reason?, feature, plan, usedDaily,
--                limitDaily, usedMonthly, limitMonthly,
--                resetDailyAt, resetMonthlyAt }
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_plan := public.effective_plan(v_user);

  SELECT pe.enabled, pe.daily_limit, pe.monthly_limit
    INTO v_enabled, v_daily_limit, v_monthly_limit
  FROM public.plan_entitlements pe
  WHERE pe.plan_code = v_plan AND pe.feature_key = p_feature_key;

  -- لا entitlement مسجّل → ممنوع (fail-closed)
  IF NOT FOUND OR NOT v_enabled THEN
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

  -- ضمان وجود الصفين ثم قفلهما (تسلسل المتصلين المتزامنين)
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

  -- الفحص ثم الزيادة (ضمن نفس المعاملة — لا نافذة سباق)
  IF v_daily_limit IS NOT NULL AND v_used_daily >= v_daily_limit THEN
    v_result := jsonb_build_object(
      'allowed', false, 'reason', 'daily_limit',
      'feature', p_feature_key, 'plan', v_plan,
      'usedDaily', v_used_daily, 'limitDaily', v_daily_limit,
      'usedMonthly', v_used_monthly, 'limitMonthly', v_monthly_limit
    );
    RETURN v_result;
  END IF;

  IF v_monthly_limit IS NOT NULL AND v_used_monthly >= v_monthly_limit THEN
    v_result := jsonb_build_object(
      'allowed', false, 'reason', 'monthly_limit',
      'feature', p_feature_key, 'plan', v_plan,
      'usedDaily', v_used_daily, 'limitDaily', v_daily_limit,
      'usedMonthly', v_used_monthly, 'limitMonthly', v_monthly_limit
    );
    RETURN v_result;
  END IF;

  UPDATE public.usage_daily
     SET count = count + 1, updated_at = now()
   WHERE user_id = v_user AND day = v_today AND feature_key = p_feature_key;

  UPDATE public.usage_monthly
     SET count = count + 1, updated_at = now()
   WHERE user_id = v_user AND month = v_month AND feature_key = p_feature_key;

  v_reset_daily   := ((v_today + 1)::timestamp AT TIME ZONE 'Africa/Cairo');
  v_reset_monthly := ((date_trunc('month', v_month + interval '1 month'))::timestamp AT TIME ZONE 'Africa/Cairo');

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
END;
$$;

REVOKE ALL ON FUNCTION public.consume_usage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_usage(text) TO authenticated, service_role;

-- ── 7. لوحة الاستخدام للمستخدم (طلب واحد بدل 4) ─────────────
CREATE OR REPLACE FUNCTION public.get_usage_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_plan  text;
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo')::timestamp)::date;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_plan := public.effective_plan(v_user);

  RETURN jsonb_build_object(
    'plan', v_plan,
    'today', v_today,
    'month', v_month,
    'resetDailyAt', ((v_today + 1)::timestamp AT TIME ZONE 'Africa/Cairo'),
    'resetMonthlyAt', ((date_trunc('month', v_month + interval '1 month'))::timestamp AT TIME ZONE 'Africa/Cairo'),
    'features', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'featureKey', pe.feature_key,
          'enabled', pe.enabled,
          'limitDaily', pe.daily_limit,
          'limitMonthly', pe.monthly_limit,
          'usedDaily', COALESCE(ud.count, 0),
          'usedMonthly', COALESCE(um.count, 0)
        ) ORDER BY pe.feature_key
      ), '[]'::jsonb)
      FROM public.plan_entitlements pe
      LEFT JOIN public.usage_daily ud
        ON ud.user_id = v_user AND ud.day = v_today AND ud.feature_key = pe.feature_key
      LEFT JOIN public.usage_monthly um
        ON um.user_id = v_user AND um.month = v_month AND um.feature_key = pe.feature_key
      WHERE pe.plan_code = v_plan
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_usage_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_usage_overview() TO authenticated, service_role;

-- ── 8. فحص entitlement منطقي بدون عدّ (مثل MCP لماكس) ────────
-- نفس منطق القفل في consume_usage لكن دون أي زيادة في العدّادات
-- — للقرارات البوليانية (متاح/غير متاح) غير القابلة للعد.
CREATE OR REPLACE FUNCTION public.check_entitlement(p_feature_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_plan    text;
  v_enabled boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_plan := public.effective_plan(v_user);

  SELECT pe.enabled INTO v_enabled
  FROM public.plan_entitlements pe
  WHERE pe.plan_code = v_plan AND pe.feature_key = p_feature_key;

  RETURN jsonb_build_object(
    'entitled', COALESCE(v_enabled, false),
    'plan', v_plan,
    'feature', p_feature_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_entitlement(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_entitlement(text) TO authenticated, service_role;

COMMENT ON TABLE public.plan_entitlements IS 'المصدر الوحيد لحدود الخطط — تُعدَّل من SQL فقط؛ الـ enforcement داخل consume_usage';
COMMENT ON TABLE public.usage_daily   IS 'عدّاد استخدام يومي (يوم القاهرة) — يُكتب فقط عبر consume_usage، لا write policies';
COMMENT ON TABLE public.usage_monthly IS 'عدّاد استخدام شهري (شهر القاهرة) — يُكتب فقط عبر consume_usage، لا write policies';
COMMENT ON TABLE public.subscription_requests IS 'طلبات الترقية بالدفع اليدوي v1 — المستخدم ينشئ pending فقط؛ المراجعة عبر service_role';

-- ── 9. أعمدة التفعيل في user_subscriptions (إضافية على 024) ──
-- متطلب الخطة: «تسجيل مرجع العملية وتاريخها ومن قام بالتفعيل».
-- التاريخ موجود (started_at/updated_at)؛ هنا المرجع والوسيلة
-- والمُفعِّل. سجل الـ audit النصي يكمل الصورة (subscription-approve).
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_subscriptions.payment_method IS 'وسيلة الدفع عند آخر تفعيل (instapay/vodafone_cash/etisalat_cash/other/manual_admin)';
COMMENT ON COLUMN public.user_subscriptions.reference IS 'مرجع عملية الدفع عند آخر تفعيل';
COMMENT ON COLUMN public.user_subscriptions.activated_by IS 'معرّف الأدمن الذي فعّل الخطة (NULL للصفوف التلقائية free)';
