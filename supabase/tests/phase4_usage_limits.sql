-- ============================================================
-- اختبار المرحلة 04: حدود الاستخدام + إعادة التعيين اليومي/الشهري
-- ============================================================
-- مكان التشغيل: Supabase Dashboard → SQL Editor → الصق الملف كاملًا → Run
-- لا يترك أثرًا (كله داخل معاملة تُلغى في النهاية ROLLBACK).
--
-- ما يختبره:
--   1. consume_usage يسمح N مرة ثم يمنع (حد يومي) — ذريًّا
--   2. الإعادة اليومية: عداد الأمس لا يحسب اليوم
--   3. الإعادة الشهرية: عداد الشهر الماضي لا يحسب هذا الشهر
--   4. mcp.key غير متاح للمجانية (not_entitled)
--   5. منع التلاعب: لا INSERT/UPDATE مباشر على العدادات (لا سياسات كتابة)
--   6. RLS: مستخدم لا يرى عدادات غيره
--   7. انتهاء الصلاحية → الخطة الفعّالة ترجع free
--   8. طلب ترقية: INSERT صحيح يمر، تزوير الحالة يُرفض
--
-- ملاحظة: تعمل الجلسة هنا كـ postgres؛ نستخدم SET ROLE authenticated
-- + request.jwt.claims لمحاكاة جلسة مستخدم حقيقية بالضبط.
-- ============================================================

DO $$
DECLARE
  v_user uuid;
  v_other uuid;
  v_res jsonb;
  v_allowed_count int := 0;
  v_blocked_count int := 0;
  v_row_count int;
  v_affected int;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستخدمون في المشروع — أنشئ حسابًا أولًا';
  END IF;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_user ORDER BY created_at LIMIT 1;

  RAISE NOTICE '══ [0] التهيئة (المستخدم %، ثاني مستخدم %) ══', v_user, COALESCE(v_other::text, 'لا يوجد');

  -- محاكاة جلسة المستخدم (كما يفعل PostgREST تمامًا)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;

  -- ── [1] الحد اليومي: free/export.data = 3 ──
  RAISE NOTICE '══ [1] consume_usage export.data × 5 (الحد اليومي = 3) ══';
  FOR i IN 1..5 LOOP
    v_res := public.consume_usage('export.data');
    IF (v_res->>'allowed')::boolean THEN
      v_allowed_count := v_allowed_count + 1;
    ELSE
      v_blocked_count := v_blocked_count + 1;
      RAISE NOTICE '    المحاولة % → ممنوعة (سبب %، استخدام %/%)',
        i, v_res->>'reason', v_res->>'usedDaily', v_res->>'limitDaily';
    END IF;
  END LOOP;
  IF v_allowed_count <> 3 OR v_blocked_count <> 2 THEN
    RAISE EXCEPTION '❌ [1] فشل: سُمح % ومُنع % (المتوقع 3 و 2)', v_allowed_count, v_blocked_count;
  END IF;
  RAISE NOTICE '✅ [1] سُمح 3 مرات ومُنع بعدها تمامًا';

  -- ── [2] الإعادة اليومية ──
  RAISE NOTICE '══ [2] عداد الأمس (مملوء) لا يؤثر على اليوم ══';
  INSERT INTO public.usage_daily (user_id, day, feature_key, count, updated_at)
  VALUES (v_user, (current_date - 1), 'export.data', 999, now())
  ON CONFLICT (user_id, day, feature_key) DO UPDATE SET count = 999;
  v_res := public.consume_usage('export.data');
  -- كان محظورًا (3/3 اليوم)؛ عدّاد الأمس 999 يجب ألا يسمح به
  IF (v_res->>'allowed')::boolean THEN
    RAISE EXCEPTION '❌ [2] فشل: سُمح رغم أن حد اليوم (3) مستنفد';
  END IF;
  -- عدّاد اليوم نفسه يجب أن يبقى 3 (لم يزد بسبب المحاولة الممنوعة)
  SELECT ud.count INTO v_row_count FROM public.usage_daily ud
    WHERE ud.user_id = v_user AND ud.day = current_date AND ud.feature_key = 'export.data';
  IF v_row_count <> 3 THEN
    RAISE EXCEPTION '❌ [2] فشل: عدّاد اليوم = % (المتوقع 3 — المحاولة الممنوعة لا تزيد)', v_row_count;
  END IF;
  RAISE NOTICE '✅ [2] عدّاد الأمس (999) معزول عن اليوم، والمحاولة الممنوعة لم تزد العداد';

  -- ── [3] الإعادة الشهرية ──
  RAISE NOTICE '══ [3] عدّاد الشهر الماضي (مملوء) لا يحسب هذا الشهر ══';
  INSERT INTO public.usage_monthly (user_id, month, feature_key, count, updated_at)
  VALUES (v_user, date_trunc('month', (now() - interval '1 month'))::date, 'export.data', 999, now())
  ON CONFLICT (user_id, month, feature_key) DO UPDATE SET count = 999;
  v_res := public.consume_usage('export.data');
  IF (v_res->>'reason') IS DISTINCT FROM 'daily_limit' THEN
    RAISE EXCEPTION '❌ [3] فشل: سبب المنع % (المتوقع daily_limit — الشهر الماضي لا يحجب)', v_res->>'reason';
  END IF;
  RAISE NOTICE '✅ [3] الشهر الماضي (999) معزول — السبب ظل daily_limit وليس monthly_limit';

  -- ── [4] MCP غير متاح للمجانية ──
  RAISE NOTICE '══ [4] check_entitlement mcp.key (المجانية) ══';
  v_res := public.check_entitlement('mcp.key');
  IF (v_res->>'entitled')::boolean THEN
    RAISE EXCEPTION '❌ [4] فشل: mcp.key متاح للمجانية!';
  END IF;
  RAISE NOTICE '✅ [4] mcp.key ممنوع للمجانية (الخطة الفعّالة %)', v_res->>'plan';

  -- ── [5] لا كتابة مباشرة على العدادات ──
  RAISE NOTICE '══ [5] محاولة كتابة مباشرة في usage_daily (يجب أن تُرفض) ══';
  BEGIN
    UPDATE public.usage_daily SET count = 0
      WHERE user_id = v_user AND day = current_date AND feature_key = 'export.data';
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected > 0 THEN
      RAISE EXCEPTION '❌ [5] فشل: UPDATE مباشر عدّل % صفًا — لا سياسات كتابة يجب أن تمنع هذا!', v_affected;
    ELSE
      RAISE NOTICE '✅ [5] UPDATE مباشر أثّر على 0 صف (مرفوض بـ RLS)';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '✅ [5] الكتابة المباشرة رُفضت (%)', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.usage_daily (user_id, day, feature_key, count)
    VALUES (v_user, current_date + 1, 'export.data', 0);
    RAISE EXCEPTION '❌ [5b] فشل: INSERT مباشر في usage_daily سُمح!';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '✅ [5b] INSERT المباشر رُفض (%)', SQLERRM;
  END;

  -- ── [6] RLS: لا أرى عدّادات مستخدم آخر ──
  IF v_other IS NOT NULL THEN
    RAISE NOTICE '══ [6] RLS: قراءة عدّادات مستخدم آخر (يجب 0 صفوف) ══';
    SELECT count(*) INTO v_row_count FROM public.usage_daily WHERE user_id = v_other;
    IF v_row_count <> 0 THEN
      RAISE EXCEPTION '❌ [6] فشل: رأيت % صفًا من عدّادات مستخدم آخر!', v_row_count;
    END IF;
    RAISE NOTICE '✅ [6] صفر صفوف لمستخدم آخر (RLS select-own)';
  ELSE
    RAISE NOTICE '══ [6] تم تخطيه (يوجد مستخدم واحد فقط) ══';
  END IF;

  -- ── [7] انتهاء الصلاحية → free ──
  RAISE NOTICE '══ [7] خطة منتهية الصلاحية ترجع free ══';
  RESET ROLE;
  UPDATE public.user_subscriptions
     SET plan = 'max', status = 'active', expires_at = now() - interval '1 day'
   WHERE user_id = v_user;
  SET ROLE authenticated;
  v_res := public.check_entitlement('mcp.key');
  IF (v_res->>'entitled')::boolean OR (v_res->>'plan') <> 'free' THEN
    RAISE EXCEPTION '❌ [7] فشل: خطة منتهية ما زالت فعّالة (%)', v_res->>'plan';
  END IF;
  RAISE NOTICE '✅ [7] انتهت الصلاحية → الخطة الفعّالة free تلقائيًا (بدون cron)';

  -- ── [8] طلب ترقية: الصحيح يمر، التزوير يُرفض ──
  RAISE NOTICE '══ [8] طلب ترقية: إدراج صحيح ثم تزوير الحالة ══';
  INSERT INTO public.subscription_requests (user_id, requested_plan, payment_method, reference, note)
  VALUES (v_user, 'plus', 'instapay', 'TEST-REF-0001', 'اختبار');
  RAISE NOTICE '✅ [8a] طلب صحيح أُدرج (pending)';

  BEGIN
    INSERT INTO public.subscription_requests (user_id, requested_plan, status, payment_method, reference)
    VALUES (v_user, 'max', 'approved', 'instapay', 'HACK-0002');
    RAISE EXCEPTION '❌ [8b] فشل: إدراج طلب بحالة approved سُمح!';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE '✅ [8b] التزوير رُفض (لا يمكن اختيار الحالة) (%)', SQLERRM;
  END;

  RESET ROLE;
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '✅ اكتملت كل اختبارات المرحلة 04 بنجاح';
  RAISE NOTICE '   (كل التغييرات داخل معاملة ستُلغى الآن)';
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- إلغاء كل شيء (لا أثر على بياناتك)
ROLLBACK;
