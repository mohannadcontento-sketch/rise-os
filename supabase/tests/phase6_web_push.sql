-- ============================================================
-- اختبار المرحلة 06: Web Push
-- (الاشتراكات لكل جهاز + التفضيلات + بوابة الإرسال + الأمان)
-- ============================================================
-- مكان التشغيل: Supabase Dashboard → SQL Editor → الصق الملف كاملًا → Run
-- لا يترك أثرًا (كله داخل معاملة صريحة تُلغى في النهاية ROLLBACK).
--
-- المتطلب: تطبيق migration 028_phase6_web_push.sql أولًا
-- (مُطبّقة أصلًا في الإنتاج بواسطة Super-Z).
--
-- ما يختبره:
--   1.  upsert اشتراك صحيح → id + إعادة النداء تجدد المفاتيح
--       وترفع سقف الجهاز نفسه (نفس endpoint)
--   2.  تحقق الشكل: endpoint ليس https / مفاتيح قصيرة → رفض
--   3.  سقف 10 أجهزة → الجهاز 11 يُرفض (device_limit)
--   4.  list_push_subscriptions: صفو فقط + endpoint مقنّع (origin)
--   5.  revoke بالمعرّف (صفو) + إبطال صف مستخدم آخر → ممنوع
--   6.  RLS: قراءة push_subscriptions صليب المستخدمين → صفر صفوف
--   7.  تفضيلات: الافتراضيات ثم set (مجتمع/تسويق) ثم قراءتها
--   8.  بوابة الإرسال gate_push_for_notification:
--       a. نداء من جلسة authenticated → ممنوع (service_role فقط)
--       b. مهم → ok:true (مع الادعاء pushed_at)
--       c. نداء ثانٍ لنفس الإشعار → already_pushed (منع الإرسال
--          المزدوج — DoD: «لا إشعار مكرر لنفس الحدث»)
--       d. فئة community (افتراضي مغلق) → category_disabled
--       e. إشعار metadata category=marketing والتفضيل false → category_disabled
--       f. push_enabled=false → push_disabled
--       g. سقف الساعة: 10 ادعاءات → rate_limited_hour
--   9.  cleanup_stale: جهاز قديم (created_at قبل 31 يومًا) → إبطال
--   10. الإشعار داخل الموقع موجود رغم كل رفض Push (DoD)
--
-- ملاحظة: تعمل الجلسة هنا كـpostgres؛ نستخدم SET ROLE
-- + request.jwt.claims لمحاكاة جلسة مستخدم حقيقية بالضبط.
-- ============================================================

BEGIN;

-- إزاحة «الآن» للـinterval تُستخدم في [9]
DO $$
DECLARE
  v_user uuid;
  v_other uuid;
  v_sub_id uuid;
  v_sub_id2 uuid;
  v_sub_id3 uuid;
  v_res jsonb;
  v_count int;
  v_notif uuid;
  v_notif2 uuid;
  v_notif3 uuid;
  v_notif_marketing uuid;
  v_pushed_at timestamptz;
  v_i int;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستخدمون في المشروع — أنشئ حسابًا أولًا';
  END IF;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_user ORDER BY created_at LIMIT 1;

  RAISE NOTICE '══ [0] التهيئة (المستخدم %) ══', v_user;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;

  -- ── [1] upsert اشتراك صحيح + تجديد ──
  RAISE NOTICE '══ [1] upsert اشتراك صحيح (لكل جهاز على حدة) ══';
  v_sub_id := public.upsert_push_subscription(
    p_endpoint => 'https://fcm.googleapis.com/fcm/send/test-phase6-device-1',
    p_p256dh => repeat('A', 87),
    p_auth => repeat('B', 22),
    p_label => 'Chrome · أندرويد',
    p_ua => 'Mozilla/5.0 (Linux; Android 14) Test'
  );
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION '❌ [1] فشل: upsert أعاد NULL';
  END IF;
  -- إعادة نداء نفس الجهاز: يجدد ولا يستهلك سقف جديد
  v_sub_id2 := public.upsert_push_subscription(
    p_endpoint => 'https://fcm.googleapis.com/fcm/send/test-phase6-device-1',
    p_p256dh => repeat('C', 87),
    p_auth => repeat('D', 22),
    p_label => 'Chrome · أندرويد (مجدّد)'
  );
  IF v_sub_id2 IS DISTINCT FROM v_sub_id THEN
    RAISE EXCEPTION '❌ [1b] فشل: نفس endpoint أنشأ صفًا ثانيًا (% ≠ %)', v_sub_id, v_sub_id2;
  END IF;
  SELECT count(*) INTO v_count FROM public.push_subscriptions
  WHERE user_id = v_user AND revoked_at IS NULL AND endpoint LIKE '%test-phase6%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [1c] فشل: عدد أجهزة المجموعة = % (المتوقع 1)', v_count;
  END IF;
  RAISE NOTICE '✅ [1] الجهاز نفسه يُجدّد ولا يتكرر (%)', v_sub_id;

  -- ── [2] تحقق الشكل ──
  RAISE NOTICE '══ [2] رفض الأشكال غير الصالحة ══';
  BEGIN
    PERFORM public.upsert_push_subscription('http://insecure.example/push', repeat('A',87), repeat('B',22));
    RAISE EXCEPTION '❌ [2a] فشل: endpoint غير https سُمح!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid_endpoint%' THEN
      RAISE EXCEPTION '❌ [2a] خطأ غير متوقع: %', SQLERRM;
    END IF;
    RAISE NOTICE '✅ [2a] endpoint غير https مرفوض';
  END;
  BEGIN
    PERFORM public.upsert_push_subscription('https://fcm.example/x', repeat('A',10), repeat('B',22));
    RAISE EXCEPTION '❌ [2b] فشل: p256dh قصير سُمح!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid_p256dh%' THEN
      RAISE EXCEPTION '❌ [2b] خطأ غير متوقع: %', SQLERRM;
    END IF;
    RAISE NOTICE '✅ [2b] مفاتيح غير صالحة مرفوضة';
  END;

  -- ── [3] سقف 10 أجهزة ──
  RAISE NOTICE '══ [3] سقف الأجهزة (10) ══';
  v_count := 1; -- جهازنا من [1]
  WHILE v_count < 10 LOOP
    PERFORM public.upsert_push_subscription(
      'https://fcm.googleapis.com/fcm/send/test-phase6-fill-' || v_count,
      repeat('A',87), repeat('B',22), 'جهاز ملء ' || v_count
    );
    v_count := v_count + 1;
  END LOOP;
  BEGIN
    PERFORM public.upsert_push_subscription(
      'https://fcm.googleapis.com/fcm/send/test-phase6-device-11',
      repeat('A',87), repeat('B',22), 'الجهاز 11'
    );
    RAISE EXCEPTION '❌ [3] فشل: الجهاز 11 سُمح!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%device_limit%' THEN
      RAISE EXCEPTION '❌ [3] خطأ غير متوقع: %', SQLERRM;
    END IF;
    RAISE NOTICE '✅ [3] الجهاز 11 رُفض (device_limit)';
  END;

  -- ── [4] القائمة: صفو فقط + endpoint مقنّع ──
  RAISE NOTICE '══ [4] list_push_subscriptions ══';
  SELECT jsonb_agg(endpoint_origin) INTO v_res
  FROM public.list_push_subscriptions();
  IF v_res::text LIKE '%/fcm/send/%' THEN
    RAISE EXCEPTION '❌ [4a] فشل: المسار الكامل للـendpoint ظهر في القائمة!';
  END IF;
  IF v_res::text NOT LIKE '%fcm.googleapis.com%' THEN
    RAISE EXCEPTION '❌ [4b] فشل: أصل الـendpoint (origin) غير ظاهر كما يجب';
  END IF;
  SELECT count(*) INTO v_count FROM public.list_push_subscriptions();
  IF v_count < 10 THEN
    RAISE EXCEPTION '❌ [4c] فشل: عدد الأجهزة في القائمة = % (المتوقع ≥10)', v_count;
  END IF;
  RAISE NOTICE '✅ [4] القائمة تعرض الأصل فقط (%) أجهزة', v_count;

  -- ── [5] الإبطال بالمعرّف + منع التطفل ──
  RAISE NOTICE '══ [5] revoke_push_subscription_by_id ══';
  SELECT id INTO v_sub_id3 FROM public.push_subscriptions
  WHERE endpoint LIKE '%test-phase6-fill-1%' LIMIT 1;
  IF NOT public.revoke_push_subscription_by_id(v_sub_id3, 'user') THEN
    RAISE EXCEPTION '❌ [5a] فشل: إبطال جهازي رُفض';
  END IF;
  RAISE NOTICE '✅ [5a] جهازي أُبطل';
  IF v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, false);
    SELECT id INTO v_sub_id3 FROM public.push_subscriptions
    WHERE endpoint LIKE '%test-phase6-fill-2%' LIMIT 1;
    IF public.revoke_push_subscription_by_id(v_sub_id3, 'user') THEN
      RAISE EXCEPTION '❌ [5b] فشل: إبطال جهاز مستخدم آخر سُمح!';
    END IF;
    RAISE NOTICE '✅ [5b] إبطال جهاز الآخر رُفض';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  END IF;

  -- ── [6] RLS: قراءة صليب المستخدمين ──
  RAISE NOTICE '══ [6] RLS على push_subscriptions ══';
  IF v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, false);
    SELECT count(*) INTO v_count FROM public.push_subscriptions WHERE user_id = v_user;
    IF v_count > 0 THEN
      RAISE EXCEPTION '❌ [6] فشل: مستخدم آخر رأى اشتراكاتي!';
    END IF;
    RAISE NOTICE '✅ [6] قراءة صليب المستخدمين → صفر صفوف';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  END IF;

  -- ── [7] التفضيلات ──
  RAISE NOTICE '══ [7] notification_preferences ══';
  v_res := public.get_notification_preferences();
  IF (v_res->>'push_community')::boolean OR (v_res->>'push_marketing')::boolean THEN
    RAISE EXCEPTION '❌ [7a] فشل: الافتراضيات ليست مغلقة للمجتمع/التسويق';
  END IF;
  RAISE NOTICE '✅ [7a] الافتراضيات: مهم/أمان/تذكيرات مفتوحة، مجتمع/تسويق مغلقة';
  v_res := public.set_notification_preferences(p_community => true, p_marketing => true, p_enabled => true);
  IF NOT (v_res->>'push_community')::boolean OR NOT (v_res->>'push_marketing')::boolean THEN
    RAISE EXCEPTION '❌ [7b] فشل: set لم يحفظ المجتمع/التسويق';
  END IF;
  v_res := public.get_notification_preferences();
  IF NOT (v_res->>'push_community')::boolean THEN
    RAISE EXCEPTION '❌ [7c] فشل: القراءة بعد الحفظ غير متطابقة';
  END IF;
  RAISE NOTICE '✅ [7b,c] الحفظ والقراءة يعملان';
  -- إرجاع التفضيلات لحالة الافتراض لاختبارات البوابة
  PERFORM public.set_notification_preferences(p_community => false, p_marketing => false, p_enabled => true);

  -- ── [8] بوابة الإرسال ──
  RAISE NOTICE '══ [8] gate_push_for_notification ══';

  -- [8a] من جلسة authenticated → ممنوع
  -- (المنع هنا أقوى من استثناء داخلي: REVOKE EXECUTE يجعل النداء
  --  نفسه مرفوضًا بصلاحيات GRANT — authenticated لا يملك أصلًا حق
  --  استدعاء بوابة الإرسال. نقبل كلا الشكلين كرفض سليم.)
  v_notif := public.notify_user(
    p_user_id => v_user, p_type => 'subscription', p_title => 'اختبار البوابة',
    p_dedup_key => 'test-phase6:gate:1'
  );
  BEGIN
    v_res := public.gate_push_for_notification(v_notif);
    RAISE EXCEPTION '❌ [8a] فشل: البوابة سُمحت لجلسة عادية!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' AND SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION '❌ [8a] خطأ غير متوقع: %', SQLERRM;
    END IF;
    RAISE NOTICE '✅ [8a] البوابة من جلسة عادية → مرفوضة (صلاحيات GRANT)';
  END;

  -- [8b] service_role → ok + الادعاء
  -- (امتياز EXECUTE ممنوح لدور service_role فقط → الجلسة نفسها
  --  service_role، والادعاء يطابق — هكذا يستدعيه خادم أوج عبر
  --  PostgREST بمفتاح service_role تمامًا)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'service_role')::text, false);
  SET ROLE service_role;
  v_res := public.gate_push_for_notification(v_notif);
  IF v_res->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '❌ [8b] فشل: البوابة رفضت إشعارًا مهمًا → %', v_res->>'reason';
  END IF;
  SELECT pushed_at INTO v_pushed_at FROM public.notifications WHERE id = v_notif;
  IF v_pushed_at IS NULL THEN
    RAISE EXCEPTION '❌ [8b2] فشل: pushed_at لم يُضبط (الادعاء)';
  END IF;
  RAISE NOTICE '✅ [8b] إشعار مهم → ok + ادعاء pushed_at';

  -- [8c] نداء ثانٍ → already_pushed
  v_res := public.gate_push_for_notification(v_notif);
  IF v_res->>'reason' IS DISTINCT FROM 'already_pushed' THEN
    RAISE EXCEPTION '❌ [8c] فشل: النداء الثاني يجب أن يكون already_pushed → %', v_res->>'reason';
  END IF;
  RAISE NOTICE '✅ [8c] نفس الإشعار مرة ثانية → already_pushed (لا ازدواج)';

  -- [8d] فئة community مغلقة
  v_notif2 := public.notify_user(
    p_user_id => v_user, p_type => 'community', p_title => 'رد جديد',
    p_dedup_key => 'test-phase6:gate:2'
  );
  v_res := public.gate_push_for_notification(v_notif2);
  IF v_res->>'reason' IS DISTINCT FROM 'category_disabled' THEN
    RAISE EXCEPTION '❌ [8d] فشل: community يجب أن تكون category_disabled → %', v_res->>'reason';
  END IF;
  RAISE NOTICE '✅ [8d] community (مغلقة افتراضيًا) → category_disabled';

  -- [8e] تسويق بmetadata صريح والتفضيل false
  v_notif_marketing := public.notify_user(
    p_user_id => v_user, p_type => 'system', p_title => 'عرض خاص',
    p_metadata => jsonb_build_object('category', 'marketing'),
    p_dedup_key => 'test-phase6:gate:3'
  );
  v_res := public.gate_push_for_notification(v_notif_marketing);
  IF v_res->>'reason' IS DISTINCT FROM 'category_disabled' THEN
    RAISE EXCEPTION '❌ [8e] فشل: تسويق بلا موافقة يجب أن يكون category_disabled → %', v_res->>'reason';
  END IF;
  RAISE NOTICE '✅ [8e] تسويق بلا موافقة → category_disabled';

  -- [8f] push_enabled=false → push_disabled
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  PERFORM public.set_notification_preferences(p_enabled => false);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'service_role')::text, false);
  SET ROLE service_role;
  v_notif3 := public.notify_user(
    p_user_id => v_user, p_type => 'background', p_title => 'تصدير',
    p_dedup_key => 'test-phase6:gate:4'
  );
  v_res := public.gate_push_for_notification(v_notif3);
  IF v_res->>'reason' IS DISTINCT FROM 'push_disabled' THEN
    RAISE EXCEPTION '❌ [8f] فشل: push_enabled=false يجب أن يعيد push_disabled → %', v_res->>'reason';
  END IF;
  RAISE NOTICE '✅ [8f] إيقاف القناة → push_disabled (دون لمس الإشعار نفسه)';
  SELECT count(*) INTO v_count FROM public.notifications WHERE id = v_notif3;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [8f2] فشل: الإشعار داخل الموقع اختفى!';
  END IF;
  RAISE NOTICE '✅ [8f2] الإشعار داخل الموقع موجود رغم رفض Push (DoD)';
  -- إرجاع التفعيل (جلسة المستخدم)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  PERFORM public.set_notification_preferences(p_enabled => true);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'service_role')::text, false);
  SET ROLE service_role;

  -- [8g] سقف الساعة: 10 ادعاءات ناجحة → rate_limited_hour
  v_i := 0;
  WHILE v_i < 9 LOOP
    v_notif := public.notify_user(
      p_user_id => v_user, p_type => 'system', p_title => 'إغراق ' || v_i,
      p_dedup_key => 'test-phase6:flood:' || v_i
    );
    v_res := public.gate_push_for_notification(v_notif);
    IF v_res->>'ok' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION '❌ [8g-تمهيد] فشل عند الإشعار % → %', v_i, v_res->>'reason';
    END IF;
    v_i := v_i + 1;
  END LOOP;
  -- الآن لدينا 10 مدعاة (1 من 8b + 9 هنا) → الحادي عشر يُحد
  v_notif := public.notify_user(
    p_user_id => v_user, p_type => 'system', p_title => 'إغراق 10',
    p_dedup_key => 'test-phase6:flood:10'
  );
  v_res := public.gate_push_for_notification(v_notif);
  IF v_res->>'reason' IS DISTINCT FROM 'rate_limited_hour' THEN
    RAISE EXCEPTION '❌ [8g] فشل: المتوقع rate_limited_hour → %', v_res->>'reason';
  END IF;
  RAISE NOTICE '✅ [8g] بعد 10 إرسالات في الساعة → rate_limited_hour (لا إغراق)';

  -- ── [9] تنظيف المهجور ──
  RAISE NOTICE '══ [9] cleanup_stale_push_subscriptions ══';
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.cleanup_stale_push_subscriptions(30);
  SELECT count(*) INTO v_count FROM public.push_subscriptions
  WHERE endpoint LIKE '%test-phase6-fill-3%' AND revoked_reason = 'stale';
  -- ملء الجهاز لم يُرسل عبره شيء و created_at الآن → لن يُبطله الـcron
  -- (الاختبار الحقيقي للتقادم يحتاج صفًا بتاريخ قديم):
  UPDATE public.push_subscriptions
  SET created_at = now() - interval '40 days', last_push_at = NULL
  WHERE endpoint LIKE '%test-phase6-fill-3%';
  PERFORM public.cleanup_stale_push_subscriptions(30);
  SELECT count(*) INTO v_count FROM public.push_subscriptions
  WHERE endpoint LIKE '%test-phase6-fill-3%' AND revoked_reason = 'stale';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [9] فشل: الجهاز المهجور (40 يومًا) لم يُبطل';
  END IF;
  RAISE NOTICE '✅ [9] الجهاز المهجور أُبطل (revoked_reason=stale) — لا حذف';

  -- ── [10] touch بعد إرسال ناجح ──
  RAISE NOTICE '══ [10] touch_push_subscription ══';
  UPDATE public.push_subscriptions SET last_push_at = NULL
  WHERE endpoint LIKE '%test-phase6-device-1%';
  PERFORM public.touch_push_subscription('https://fcm.googleapis.com/fcm/send/test-phase6-device-1');
  SELECT count(*) INTO v_count FROM public.push_subscriptions
  WHERE endpoint LIKE '%test-phase6-device-1%' AND last_push_at IS NOT NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [10] فشل: last_push_at لم يُحدّث بعد النجاح';
  END IF;
  RAISE NOTICE '✅ [10] last_push_at يُحدّث بعد الإرسال الناجح';

  RESET ROLE;
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '✅ اكتملت كل اختبارات المرحلة 06 بنجاح';
  RAISE NOTICE '   (كل التغييرات داخل معاملة ستُلغى الآن)';
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- إلغاء كل شيء (لا أثر على بياناتك)
ROLLBACK;
