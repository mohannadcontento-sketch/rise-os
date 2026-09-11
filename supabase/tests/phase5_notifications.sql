-- ============================================================
-- اختبار المرحلة 05: مركز الإشعارات In-App
-- (notify_user + dedup + الفلاتر + read_at + الحذف الكسول)
-- ============================================================
-- مكان التشغيل: Supabase Dashboard → SQL Editor → الصق الملف كاملًا → Run
-- لا يترك أثرًا (كله داخل معاملة صريحة تُلغى في النهاية ROLLBACK).
--
-- المتطلب: تطبيق migration 026_phase5_notifications_center.sql أولًا.
--
-- ما يختبره:
--   1.  notify_user (ذاتي) يعيد id
--   2.  منع التكرار: نفس dedup_key مرتين → الثانية NULL وصف واحد
--   3.  notify_user لمستخدم آخر → ممنوع (forbidden) لجلسة عادية
--   4.  notify_user من service_role → مسموح لأي مستخدم (مسار الأدمن)
--   5.  الأنواع الجديدة مقبولة + نوع غير صالح → check_violation
--   6.  فلترة الخلاصة: account / activity / unread / high
--   7.  تحديد الكل كمقروء → read_at يُضبط بالتريجر
--   8.  العدّاد الخفيف unread_count
--   9.  الحذف الكسول للإشعارات المنتهية (expires_at)
--   10. consume_usage: إشعار قرب الحد (80%) + إشعار المنع (dedup)
--   11. RLS: إدراج ذاتي مباشر يمر، صليب المستخدمين يُرفض
--
-- ملاحظة: تعمل الجلسة هنا كـ postgres؛ نستخدم SET ROLE authenticated
-- + request.jwt.claims لمحاكاة جلسة مستخدم حقيقية بالضبط.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_other uuid;
  v_id1 uuid;
  v_id2 uuid;
  v_count int;
  v_unread_before bigint;
  v_unread_after bigint;
  v_feed jsonb;
  v_test_rows jsonb;
  v_purged int;
  v_res jsonb;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستخدمون في المشروع — أنشئ حسابًا أولًا';
  END IF;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_user ORDER BY created_at LIMIT 1;

  RAISE NOTICE '══ [0] التهيئة (المستخدم %) ══', v_user;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;

  SELECT public.notifications_unread_count() INTO v_unread_before;

  -- ── [1] notify_user ذاتي ──
  RAISE NOTICE '══ [1] notify_user (ذاتي، type=subscription، priority=high) ══';
  v_id1 := public.notify_user(
    p_user_id => v_user,
    p_type => 'subscription',
    p_title => 'اختبار: تم تفعيل خطة بلس',
    p_body => 'إشعار اختبار المرحلة 05',
    p_icon => '🎫',
    p_action_url => 'settings',
    p_priority => 'high',
    p_dedup_key => 'test-phase5:sub:1'
  );
  IF v_id1 IS NULL THEN
    RAISE EXCEPTION '❌ [1] فشل: notify_user أعاد NULL للإدراج الأول';
  END IF;
  RAISE NOTICE '✅ [1] أُدرج الإشعار (%)', v_id1;

  -- ── [2] منع التكرار (dedup) ──
  RAISE NOTICE '══ [2] نفس dedup_key مرة ثانية → يجب NULL (مكرر) ══';
  v_id2 := public.notify_user(
    p_user_id => v_user,
    p_type => 'subscription',
    p_title => 'اختبار: تم تفعيل خطة بلس (تكرار)',
    p_dedup_key => 'test-phase5:sub:1'
  );
  IF v_id2 IS NOT NULL THEN
    RAISE EXCEPTION '❌ [2] فشل: الإدراج المكرر أعاد % — dedup لا يعمل!', v_id2;
  END IF;
  SELECT count(*) INTO v_count FROM public.notifications
    WHERE user_id = v_user AND dedup_key = 'test-phase5:sub:1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [2] فشل: صفوف dedup = % (المتوقع 1)', v_count;
  END IF;
  RAISE NOTICE '✅ [2] الإدراج الثاني مُنع (NULL) والصف واحد فقط';

  -- ── [3] cross-user ممنوع لجلسة عادية ──
  IF v_other IS NOT NULL THEN
    RAISE NOTICE '══ [3] notify_user لمستخدم آخر (جلسة عادية → forbidden) ══';
    BEGIN
      PERFORM public.notify_user(
        p_user_id => v_other,
        p_type => 'system',
        p_title => 'محاولة تطفل',
        p_dedup_key => 'test-phase5:hack:1'
      );
      RAISE EXCEPTION '❌ [3] فشل: إشعار لمستخدم آخر سُمح لجلسة عادية!';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%forbidden%' THEN
          RAISE EXCEPTION '❌ [3] خطأ غير متوقع: %', SQLERRM;
        END IF;
        RAISE NOTICE '✅ [3] رُفض بـ forbidden (%)', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '══ [3] تم تخطيه (يوجد مستخدم واحد فقط) ══';
  END IF;

  -- ── [4] service_role → مسموح لأي مستخدم (مسار الأدمن) ──
  IF v_other IS NOT NULL THEN
    RAISE NOTICE '══ [4] notify_user بجلسة service_role (مسار الأدمن) ══';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'service_role')::text, false);
    v_id2 := public.notify_user(
      p_user_id => v_other,
      p_type => 'system',
      p_title => 'اختبار: رسالة أدمن',
      p_dedup_key => 'test-phase5:admin:1'
    );
    IF v_id2 IS NULL THEN
      RAISE EXCEPTION '❌ [4] فشل: service_role لم يستطع إشعار مستخدمًا آخر';
    END IF;
    RAISE NOTICE '✅ [4] أدمن (service_role) أشعر مستخدمًا آخر بنجاح';
    -- العودة لجلسة المستخدم العادية
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  END IF;

  -- ── [5] الأنواع الجديدة + رفض غير الصالح ──
  RAISE NOTICE '══ [5] type=usage مقبول؛ type غير صالح → check_violation ══';
  PERFORM public.notify_user(
    p_user_id => v_user,
    p_type => 'usage',
    p_title => 'اختبار: وصلت للحد',
    p_dedup_key => 'test-phase5:usage:1'
  );
  RAISE NOTICE '✅ [5a] type=usage أُدرج';
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, dedup_key)
    VALUES (v_user, 'admin_message', 'نوع قديم مكسور', 'test-phase5:bad:1');
    RAISE EXCEPTION '❌ [5b] فشل: نوع غير صالح سُمع!';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE '✅ [5b] النوع غير الصالح رُفض (check_violation)';
  END;

  -- ── [6] فلترة الخلاصة ──
  RAISE NOTICE '══ [6] feed: account / activity / high ══';
  PERFORM public.notify_user(
    p_user_id => v_user,
    p_type => 'success',
    p_title => 'اختبار: إنجاز',
    p_dedup_key => 'test-phase5:success:1'
  );

  v_feed := public.get_notifications_feed(100, 'account', false);
  v_test_rows := (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(v_feed->'notifications') elem
    WHERE (elem->>'dedup_key') LIKE 'test-phase5:%'
  );
  IF NOT (v_test_rows @> '[{"type":"subscription"}]'::jsonb AND v_test_rows @> '[{"type":"usage"}]'::jsonb) THEN
    RAISE EXCEPTION '❌ [6a] فشل: account لا يحوي subscription+usage: %', v_test_rows;
  END IF;
  IF jsonb_array_length(v_test_rows) <> 2 THEN
    RAISE EXCEPTION '❌ [6a] فشل: account أرجع % صفوف اختبار (المتوقع 2 — بدون success)', jsonb_array_length(v_test_rows);
  END IF;
  RAISE NOTICE '✅ [6a] filter=account → subscription+usage فقط (بدون success)';

  v_feed := public.get_notifications_feed(100, 'activity', false);
  v_test_rows := (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(v_feed->'notifications') elem
    WHERE (elem->>'dedup_key') LIKE 'test-phase5:%'
  );
  IF jsonb_array_length(v_test_rows) <> 1 OR (v_test_rows->0->>'type') <> 'success' THEN
    RAISE EXCEPTION '❌ [6b] فشل: activity أرجع %', v_test_rows;
  END IF;
  RAISE NOTICE '✅ [6b] filter=activity → success فقط';

  v_feed := public.get_notifications_feed(100, 'high', false);
  v_test_rows := (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(v_feed->'notifications') elem
    WHERE (elem->>'dedup_key') LIKE 'test-phase5:%'
  );
  IF jsonb_array_length(v_test_rows) <> 1 OR (v_test_rows->0->>'priority') <> 'high' THEN
    RAISE EXCEPTION '❌ [6c] فشل: high أرجع % (المتوقع إشعار subscription high فقط)', v_test_rows;
  END IF;
  RAISE NOTICE '✅ [6c] filter=high → إشعار الاشتراك (priority=high) فقط';

  -- ── [7] تحديد الكل + read_at بالتريجر ──
  RAISE NOTICE '══ [7] mark_all_notifications_read + تريجر read_at ══';
  SELECT count(*) INTO v_count FROM public.notifications
    WHERE user_id = v_user AND dedup_key LIKE 'test-phase5:%' AND NOT "read";
  IF v_count < 3 THEN
    RAISE EXCEPTION '❌ [7a] فشل: صفوف اختبار غير مقروءة = % (المتوقع 3)', v_count;
  END IF;
  PERFORM public.mark_all_notifications_read();
  SELECT count(*) INTO v_count FROM public.notifications
    WHERE user_id = v_user AND dedup_key LIKE 'test-phase5:%' AND "read" AND read_at IS NOT NULL;
  IF v_count <> 3 THEN
    RAISE EXCEPTION '❌ [7b] فشل: صفوف test المقروءة بلا read_at = % (المتوقع 3)', v_count;
  END IF;
  RAISE NOTICE '✅ [7] الكل مقروء وread_at مضبوط بالتريجر (3 صفوف)';

  -- ── [8] العدّاد الخفيف ──
  RAISE NOTICE '══ [8] notifications_unread_count بعد التحديد ══';
  SELECT public.notifications_unread_count() INTO v_unread_after;
  IF v_unread_after > 0 THEN
    RAISE NOTICE '⚠️ [8] unread = % (إشعارات حقيقية وصلت أثناء الاختبار — غير حرج، داخل معاملة)', v_unread_after;
  ELSE
    RAISE NOTICE '✅ [8] العدّاد = 0 بعد تحديد الكل';
  END IF;

  -- ── [9] الحذف الكسول للمنتهي ──
  RAISE NOTICE '══ [9] إشعار منتهي الصلاحية → يُحذف عند فتح الخلاصة ══';
  INSERT INTO public.notifications (user_id, type, title, dedup_key, expires_at, "read")
  VALUES (v_user, 'background', 'اختبار: منتهي', 'test-phase5:expired:1', now() - interval '1 hour', false);
  v_feed := public.get_notifications_feed(100, 'all', false);
  v_purged := (v_feed->>'purged')::int;
  IF v_purged < 1 THEN
    RAISE EXCEPTION '❌ [9] فشل: purged = % (المتوقع ≥ 1)', v_purged;
  END IF;
  SELECT count(*) INTO v_count FROM public.notifications
    WHERE user_id = v_user AND dedup_key = 'test-phase5:expired:1';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '❌ [9b] فشل: الصف المنتهي ما زال موجودًا';
  END IF;
  RAISE NOTICE '✅ [9] المنتهي حُذف كسولًا (purged=%) والعدّاد لم يحسبه', v_purged;

  -- ── [10] consume_usage: قرب الحد + المنع (dedup) ──
  RAISE NOTICE '══ [10] ai.action: قرب 80%% ثم المنع — إشعارات بلا تكرار ══';
  -- نظف عدادات اليوم لهذا الاختبار (داخل ROLLBACK — لا أثر).
  -- التنظيف بصلاحيات postgres: جدولات الاستخدام لا write policies
  -- للمستخدمين (عمدًا) فتنظيفها كـ authenticated يمس 0 صفوف.
  RESET ROLE;
  DELETE FROM public.usage_daily
   WHERE user_id = v_user AND feature_key = 'ai.action' AND day = (now() AT TIME ZONE 'Africa/Cairo')::date;
  DELETE FROM public.usage_monthly
   WHERE user_id = v_user AND feature_key = 'ai.action' AND month = date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo')::timestamp)::date;
  DELETE FROM public.notifications
   WHERE user_id = v_user AND dedup_key LIKE 'usage-%';
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);

  FOR i IN 1..4 LOOP
    v_res := public.consume_usage('ai.action');
    IF NOT (v_res->>'allowed')::boolean THEN
      RAISE EXCEPTION '❌ [10a] فشل: المحاولة % كان يجب أن تُسمح', i;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_count FROM public.notifications
    WHERE user_id = v_user AND dedup_key LIKE 'usage-near-d:%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [10b] فشل: إشعارات القرب = % (المتوقع 1 عند 80%%)', v_count;
  END IF;
  RAISE NOTICE '✅ [10b] إشعار «اقتربت من حدك اليومي» ظهر مرة واحدة (80%% = 4/5)';

  v_res := public.consume_usage('ai.action');
  IF NOT (v_res->>'allowed')::boolean THEN
    RAISE EXCEPTION '❌ [10c] فشل: المحاولة الخامسة (5/5) كان يجب أن تُسمح';
  END IF;
  v_res := public.consume_usage('ai.action');
  IF (v_res->>'allowed')::boolean OR (v_res->>'reason') <> 'daily_limit' THEN
    RAISE EXCEPTION '❌ [10d] فشل: السادسة لم تُمنع بـ daily_limit';
  END IF;
  v_res := public.consume_usage('ai.action');
  IF (v_res->>'allowed')::boolean THEN
    RAISE EXCEPTION '❌ [10e] فشل: السابعة لم تُمنع';
  END IF;
  SELECT count(*) INTO v_count FROM public.notifications
    WHERE user_id = v_user AND dedup_key LIKE 'usage-daily:%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [10f] فشل: إشعارات المنع = % (المتوقع 1 — dedup)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.notifications
    WHERE user_id = v_user AND dedup_key LIKE 'usage-near-d:%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [10g] فشل: المنع كرر إشعار القرب؟! = %', v_count;
  END IF;
  RAISE NOTICE '✅ [10] منع السادسة/السابعة → إشعار منع واحد فقط (priority high)';

  -- ── [11] RLS: إدراج ذاتي مباشر يمر؛ صليب المستخدمين يُرفض ──
  RAISE NOTICE '══ [11] RLS على notifications ══';
  INSERT INTO public.notifications (user_id, type, title, dedup_key)
  VALUES (v_user, 'info', 'اختبار: إدراج ذاتي', 'test-phase5:direct:1');
  RAISE NOTICE '✅ [11a] الإدراج الذاتي المباشر سُمح (سياسة insert-own)';
  IF v_other IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, dedup_key)
      VALUES (v_other, 'info', 'اختبار: تطفل', 'test-phase5:hack:2');
      RAISE EXCEPTION '❌ [11b] فشل: إدراج لمستخدم آخر سُمح!';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE '✅ [11b] الإدراج لمستخدم آخر رُفض (RLS)';
    END;
    SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_other AND dedup_key LIKE 'test-phase5:hack:%';
    IF v_count > 0 THEN
      RAISE EXCEPTION '❌ [11c] فشل: رأيت/أدرجت صفوف مستخدم آخر!';
    END IF;
  END IF;

  RESET ROLE;
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '✅ اكتملت كل اختبارات المرحلة 05 بنجاح';
  RAISE NOTICE '   (كل التغييرات داخل معاملة ستُلغى الآن)';
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- إلغاء كل شيء (لا أثر على بياناتك)
ROLLBACK;
