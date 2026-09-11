-- ============================================================
-- اختبار المرحلة 07-ب: مرفقات صور R2 + حدود الخطة
-- (media column + media_objects + RLS/إذونات + الحصص)
-- ============================================================
-- مكان التشغيل: Supabase SQL Editor → الصق الملف كاملًا → Run
-- (أو: SUPA_DB_PASSWORD=... bun run run-tests.ts phase7b_media.sql)
-- لا يترك أثرًا — كله داخل معاملة صريحة تُلغى في النهاية ROLLBACK.
--
-- المتطلب: تطبيق migration 031_phase7b_media.sql (مطبقة في الإنتاج).
--
-- ما يختبره:
--   1. media: عمود jsonb صحيح + CHECK يقبل المصفوفة السليمة
--      ويرفض (5 صور / مفتاح مزيف / نوع غير صورة / حجم > 8MB /
--      غير مصفوفة)
--   2. anti-forgery: authenticated لا يستطيع كتابة media إدراجًا
--      ولا تعديلًا (إذونات أعمدة — حتى PostgREST المباشر ممنوع)
--   3. media_objects: RLS (أرى صفوفي فقط) + لا كتابة للمستخدم
--      إطلاقًا (pending/active/deleted كلها service_role)
--   4. حصص التخزين: الحساب من pending+active فقط (deleted خارج
--      الحساب) + plan_entitlements (3 منشورات/يوم مجاني +
--      50MB/1GB/10GB)
--   5. حد النشر اليومي: consume_usage('community.post') —
--      المجاني يُسمح 3 ثم 402-منطق (allowed=false, daily_limit)
--   6. RPCs: get_community_feed / get_community_post تعرضان
--      media
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_other uuid;
  v_free uuid;
  v_post uuid;
  v_obj_id uuid;
  v_res jsonb;
  v_count int;
  v_limit bigint;
  v_err text;
  v_day date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo')::timestamp)::date;
  v_media_valid jsonb := '[{"key":"community/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/11111111-2222-4333-8444-555555555555.jpg","contentType":"image/jpeg","bytes":123456}]'::jsonb;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_user ORDER BY created_at LIMIT 1;
  IF v_user IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'المشروع يحتاج مستخدمين اثنين على الأقل';
  END IF;
  RAISE NOTICE '══ [0] التهيئة (u=%, o=%) ══', v_user, v_other;

  -- ══ [1] عمود media + CHECK ══
  RAISE NOTICE '══ [1] community_posts.media + CHECK ══';
  INSERT INTO public.community_posts (user_id, title, body, media)
  VALUES (v_user, 'منشور بصورة', 'محتوى مع صورة', v_media_valid)
  RETURNING id INTO v_post;
  RAISE NOTICE '✅ [1a] مصفوفة media سليمة (مفتاح/نوع/حجم) → مقبولة';

  BEGIN
    UPDATE public.community_posts SET media = jsonb_build_array(
      jsonb_build_object('key','community/a/a.jpg','contentType','image/jpeg','bytes',1),
      jsonb_build_object('key','community/a/b.jpg','contentType','image/jpeg','bytes',1),
      jsonb_build_object('key','community/a/c.jpg','contentType','image/jpeg','bytes',1),
      jsonb_build_object('key','community/a/d.jpg','contentType','image/jpeg','bytes',1),
      jsonb_build_object('key','community/a/e.jpg','contentType','image/jpeg','bytes',1)
    ) WHERE id = v_post;
    RAISE EXCEPTION '❌ [1b] فشل: 5 صور يجب أن تُرفض';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ [1b] أكثر من 4 صور → CHECK يرفض';
  END;

  BEGIN
    UPDATE public.community_posts SET media = '[{"key":"miftoh-mazboot","contentType":"image/jpeg","bytes":10}]'::jsonb WHERE id = v_post;
    RAISE EXCEPTION '❌ [1c] فشل: مفتاح مزيف يجب أن يُرفض';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ [1c] مفتاح خارج النمط community/<uuid>/<uuid>.<ext> → مرفوض';
  END;

  BEGIN
    UPDATE public.community_posts SET media = '[{"key":"community/a/a.svg","contentType":"image/svg+xml","bytes":10}]'::jsonb WHERE id = v_post;
    RAISE EXCEPTION '❌ [1d] فشل: نوع غير صورة يجب أن يُرفض';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ [1d] contentType غير مسموح (svg) → مرفوض';
  END;

  BEGIN
    UPDATE public.community_posts SET media = '[{"key":"community/a/a.jpg","contentType":"image/jpeg","bytes":9000000}]'::jsonb WHERE id = v_post;
    RAISE EXCEPTION '❌ [1e] فشل: بايتات > 8MB يجب أن تُرفض';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ [1e] bytes > 8MB → مرفوض';
  END;

  BEGIN
    UPDATE public.community_posts SET media = '{"key":"x"}'::jsonb WHERE id = v_post;
    RAISE EXCEPTION '❌ [1f] فشل: غير مصفوفة يجب أن يُرفض';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ [1f] media غير مصفوفة → مرفوض';
  END;

  UPDATE public.community_posts SET media = NULL WHERE id = v_post;
  UPDATE public.community_posts SET media = v_media_valid WHERE id = v_post;
  RAISE NOTICE '✅ [1g] NULL ثم إعادة القيمة السليمة → مقبول (idempotent)';

  -- ══ [2] anti-forgery: إذونات الأعمدة ══
  RAISE NOTICE '══ [2] anti-forgery — media خارج إذونات المستخدم ══';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.community_posts SET media = '[{"key":"community/x/y.jpg","contentType":"image/jpeg","bytes":5}]'::jsonb WHERE id = v_post;
    RAISE EXCEPTION '❌ [2a] فشل: تعديل media بواسطة المستخدم يجب أن يُرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [2a] UPDATE media كـ authenticated → مرفوض (إذونات أعمدة)';
  END;

  BEGIN
    INSERT INTO public.community_posts (user_id, title, body, media)
    VALUES (v_user, 'تزوير', 'x', '[{"key":"community/x/y.jpg","contentType":"image/jpeg","bytes":5}]'::jsonb);
    RAISE EXCEPTION '❌ [2b] فشل: إدراج media بواسطة المستخدم يجب أن يُرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [2b] INSERT بعمود media → مرفوض (لا grant على العمود)';
  END;

  RESET ROLE;

  -- ══ [3] media_objects: RLS + إذونات ══
  RAISE NOTICE '══ [3] media_objects — RLS + كتابة service فقط ══';
  INSERT INTO public.media_objects (user_id, kind, object_key, bytes, content_type, status)
  VALUES (v_user, 'community_post', 'community/' || v_user || '/obj1.jpg', 500000, 'image/jpeg', 'pending')
  RETURNING id INTO v_obj_id;
  INSERT INTO public.media_objects (user_id, kind, object_key, bytes, content_type, status, post_id)
  VALUES (v_user, 'community_post', 'community/' || v_user || '/obj2.jpg', 700000, 'image/png', 'active', v_post);
  INSERT INTO public.media_objects (user_id, kind, object_key, bytes, content_type, status)
  VALUES (v_other, 'community_post', 'community/' || v_other || '/obj3.jpg', 300000, 'image/webp', 'pending');
  RAISE NOTICE '✅ [3a] إدراج service_role (postgres) → صفوف pending/active';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.media_objects WHERE user_id = v_user;
  IF v_count = 2 THEN
    RAISE NOTICE '✅ [3b] أرى صفوفي فقط (% صفوف)', v_count;
  ELSE
    RAISE EXCEPTION '❌ [3b] فشل: توقع 2 صفوف لي، وجدت %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.media_objects WHERE user_id = v_other;
  IF v_count = 0 THEN
    RAISE NOTICE '✅ [3c] صفوف غيري مخفية (RLS)';
  ELSE
    RAISE EXCEPTION '❌ [3c] فشل: لا أرى صفوف غيري أبدًا';
  END IF;

  BEGIN
    INSERT INTO public.media_objects (user_id, object_key, bytes, content_type) VALUES (v_user, 'community/x/f.jpg', 1, 'image/jpeg');
    RAISE EXCEPTION '❌ [3d] فشل: إدراج المستخدم في media_objects يجب أن يُرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [3d] INSERT media_objects كـ authenticated → مرفوض';
  END;

  BEGIN
    UPDATE public.media_objects SET status = 'deleted' WHERE id = v_obj_id;
    RAISE EXCEPTION '❌ [3e] فشل: تحديث المستخدم لصف media_objects يجب أن يُرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [3e] UPDATE media_objects كـ authenticated → مرفوض (الحساب خادمي فقط)';
  END;

  RESET ROLE;

  -- ══ [4] الحصص: الحساب pending+active فقط + قيم الخطط ══
  RAISE NOTICE '══ [4] حصص التخزين والنشر ══';
  UPDATE public.media_objects SET status = 'deleted', post_id = NULL
  WHERE object_key = 'community/' || v_user || '/obj2.jpg';

  SELECT coalesce(sum(bytes), 0) INTO v_limit
  FROM public.media_objects
  WHERE user_id = v_user AND status IN ('pending', 'active');
  IF v_limit = 500000 THEN
    RAISE NOTICE '✅ [4a] الحساب = pending+active فقط (deleted خارج الحصة): % بايت', v_limit;
  ELSE
    RAISE EXCEPTION '❌ [4a] فشل: توقع 500000، وجدت %', v_limit;
  END IF;

  SELECT storage_limit INTO v_limit FROM public.plan_entitlements
  WHERE plan_code = 'free' AND feature_key = 'community.post';
  IF v_limit = 52428800 THEN
    RAISE NOTICE '✅ [4b] free.storage_limit = 50MB';
  ELSE
    RAISE EXCEPTION '❌ [4b] فشل: free storage_limit = %', v_limit;
  END IF;
  SELECT storage_limit INTO v_limit FROM public.plan_entitlements
  WHERE plan_code = 'plus' AND feature_key = 'community.post';
  IF v_limit = 1073741824 THEN
    RAISE NOTICE '✅ [4c] plus.storage_limit = 1GB';
  ELSE
    RAISE EXCEPTION '❌ [4c] فشل: plus storage_limit = %', v_limit;
  END IF;
  SELECT storage_limit INTO v_limit FROM public.plan_entitlements
  WHERE plan_code = 'max' AND feature_key = 'community.post';
  IF v_limit = 10737418240 THEN
    RAISE NOTICE '✅ [4d] max.storage_limit = 10GB';
  ELSE
    RAISE EXCEPTION '❌ [4d] فشل: max storage_limit = %', v_limit;
  END IF;

  SELECT daily_limit INTO v_count FROM public.plan_entitlements
  WHERE plan_code = 'free' AND feature_key = 'community.post';
  IF v_count = 3 THEN
    RAISE NOTICE '✅ [4e] free: 3 منشورات/يوم (حد الخطة من وثيقة النطاق)';
  ELSE
    RAISE EXCEPTION '❌ [4e] فشل: free daily_limit = %', v_count;
  END IF;

  -- ══ [5] حد النشر اليومي — consume_usage ══
  RAISE NOTICE '══ [5] consume_usage(''community.post'') — المجاني ══';
  SELECT id INTO v_free FROM auth.users u
  WHERE public.effective_plan(u.id) = 'free'
  ORDER BY created_at LIMIT 1;
  IF v_free IS NULL THEN
    RAISE EXCEPTION '❌ [5] لا يوجد مستخدم مجاني للاختبار';
  END IF;

  -- تهيئة عدادات اليوم/الشهر (داخل المعاملة — تُلغى معها)
  INSERT INTO public.usage_daily (user_id, day, feature_key, count)
  VALUES (v_free, v_day, 'community.post', 2)
  ON CONFLICT (user_id, day, feature_key) DO UPDATE SET count = 2;
  INSERT INTO public.usage_monthly (user_id, month, feature_key, count)
  VALUES (v_free, v_month, 'community.post', 2)
  ON CONFLICT (user_id, month, feature_key) DO UPDATE SET count = 2;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT public.consume_usage('community.post') INTO v_res;
  IF (v_res->>'allowed')::boolean AND (v_res->>'usedDaily')::int = 3 THEN
    RAISE NOTICE '✅ [5a] المنشور الثالث اليومي → مسموح (٣/٣)';
  ELSE
    RAISE EXCEPTION '❌ [5a] فشل: توقع allowed=true usedDaily=3، وجدت %', v_res;
  END IF;

  SELECT public.consume_usage('community.post') INTO v_res;
  IF NOT (v_res->>'allowed')::boolean AND (v_res->>'reason') = 'daily_limit'
     AND (v_res->>'limitDaily')::int = 3 THEN
    RAISE NOTICE '✅ [5b] المنشور الرابع → ممنوع (reason=daily_limit, 3/3)';
  ELSE
    RAISE EXCEPTION '❌ [5b] فشل: توقع المنع بعد 3، وجدت %', v_res;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- ══ [6] RPCs تعرض media ══
  RAISE NOTICE '══ [6] RPCs — media في الخلاصة والتفاصيل ══';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT public.get_community_feed(1, 50, 'latest') INTO v_res;
  SELECT count(*) INTO v_count FROM jsonb_array_elements(v_res->'items') el
  WHERE el->>'id' = v_post::text AND el->'media' = v_media_valid;
  IF v_count = 1 THEN
    RAISE NOTICE '✅ [6a] get_community_feed يعيد media للمنشور';
  ELSE
    RAISE EXCEPTION '❌ [6a] فشل: media مفقودة من الخلاصة';
  END IF;

  SELECT public.get_community_post(v_post) INTO v_res;
  IF v_res->'media' = v_media_valid THEN
    RAISE NOTICE '✅ [6b] get_community_post يعيد media كاملة';
  ELSE
    RAISE EXCEPTION '❌ [6b] فشل: media مفقودة من التفاصيل';
  END IF;

  RESET ROLE;

  RAISE NOTICE '══ النهاية — كل المجموعات نجحت (سيُلغى كل شيء بـ ROLLBACK) ══';
END $$;

ROLLBACK;

-- تحقق بقايا (بعد التراجع)
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.media_objects
  WHERE object_key LIKE 'community/%/obj%.jpg' OR object_key LIKE 'community/%/obj%.png';
  IF v_count = 0 THEN
    RAISE NOTICE '✅ [residue] صفر صفوف media_objects متبقية';
  ELSE
    RAISE EXCEPTION '❌ [residue] بقايا: % صفوف', v_count;
  END IF;
END $$;
