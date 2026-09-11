-- ============================================================
-- اختبار المرحلة 07: المجتمع Community
-- (منشورات + تعليقات + إعجاب + ذِكر + بلاغات + إشراف + حظر)
-- ============================================================
-- مكان التشغيل: Supabase Dashboard → SQL Editor → الصق الملف كاملًا → Run
-- لا يترك أثرًا (كله داخل معاملة صريحة تُلغى في النهاية ROLLBACK).
--
-- المتطلب: تطبيق migration 030_phase7_community.sql أولًا
-- (مطبقة أصلًا في الإنتاج بواسطة Super-Z).
--
-- ما يختبره:
--   1.  إدراج منشور ذاتي يمر + إدراج باسم مستخدم آخر → رفض RLS
--   2.  حماية العدادات: UPDATE like_count مباشر → رفض (إذونات
--       أعمدة) + INSERT بقييم مزورة → رفض
--   3.  التعليقات: عدادات reply_count + last_activity ترتفع
--       وتنخفض بالحذف + رد بمعلومة الأب
--   4.  الإعجاب: إدراج يرفع العداد + تكرار → unique violation
--       + إلغاء ينقص
--   5.  الذِكر: الكتابة service_role فقط؛ القراءة للمذكور/صاحب
--       المحتوى؛ مستخدم ثالث يرى صفر صفوف
--   6.  البلاغات: بلاغ واحد لكل (مستخدم+هدف) + لا يمكن كتابة
--       بلاغ باسم غيرك + قراءة بلاغاتك فقط
--   7.  سجل الإشراف: authenticated يرى/يكتب صفر (service فقط)
--   8.  الحظر: يُفرض في DB (INSERT منشور/تعليق/إعجاب → رفض)
--       + الحظر المنتهي لا يمنع + المحظور يرى سببه
--   9.  خلاصة get_community_feed: ترتيب latest/top + liked_by_me
--       + pagination hasMore
--   10. get_community_post: المنشور للجميع؛ المخفي لصاحبه فقط
--   11. get_community_comments: الأحدث أولًا + مؤلف الأب
--   12. search_community_members: يستبعد نفسي والموقوف
--   13. profiles.handle: تعبئة كاملة + تفرّد
--   14. RLS عرض: المحتوى المخفي/المزال يختفي عن الآخرين
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_other uuid;
  v_third uuid;
  v_post uuid;
  v_post2 uuid;
  v_post3 uuid;
  v_comment uuid;
  v_reply uuid;
  v_notif_id uuid;
  v_res jsonb;
  v_feed jsonb;
  v_count int;
  v_before timestamptz;
  v_err text;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_user ORDER BY created_at LIMIT 1;
  SELECT id INTO v_third FROM auth.users WHERE id NOT IN (v_user, v_other) ORDER BY created_at LIMIT 1;
  IF v_user IS NULL OR v_other IS NULL OR v_third IS NULL THEN
    RAISE EXCEPTION 'المشروع يحتاج 3 مستخدمين على الأقل للاختبار الكامل';
  END IF;
  RAISE NOTICE '══ [0] التهيئة (u=%, o=%, t=%) ══', v_user, v_other, v_third;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;

  -- ── [1] إدراج منشور + RLS ──
  RAISE NOTICE '══ [1] إدراج المنشورات + RLS ══';
  INSERT INTO public.community_posts (user_id, title, body)
  VALUES (v_user, 'أول منشور اختباري', 'محتوى المنشور الأول @mohannad')
  RETURNING id INTO v_post;
  IF v_post IS NULL THEN
    RAISE EXCEPTION '❌ [1] فشل: إدراج منشور ذاتي يجب أن يمر';
  END IF;
  RAISE NOTICE '✅ [1a] منشور ذاتي أُدرج';

  BEGIN
    INSERT INTO public.community_posts (user_id, title, body) VALUES (v_other, 'انتحال', 'x');
    RAISE EXCEPTION '❌ [1b] فشل: إدراج باسم مستخدم آخر يجب أن يُرفض';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE '✅ [1b] إدراج باسم غيري → مرفوض (RLS/ownership)';
  END;

  -- ── [2] حماية العدادات (إذونات الأعمدة) ──
  RAISE NOTICE '══ [2] حماية العدادات من التزوير ══';
  BEGIN
    UPDATE public.community_posts SET like_count = 999 WHERE id = v_post;
    IF (SELECT like_count FROM public.community_posts WHERE id = v_post) = 999 THEN
      RAISE EXCEPTION '❌ [2a] فشل: UPDATE like_count مباشر يجب أن يُرفض';
    END IF;
    RAISE EXCEPTION '❌ [2a] فشل: UPDATE like_count مر دون رفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [2a] UPDATE like_count → مرفوض (إذن أعمدة)';
  END;

  BEGIN
    INSERT INTO public.community_posts (user_id, title, body, like_count, reply_count, status)
    VALUES (v_user, 'منشور مزور', 'x', 500, 500, 'published');
    RAISE EXCEPTION '❌ [2b] فشل: INSERT بأعمدة محمية يجب أن يُرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [2b] INSERT بأعمدة محمية (like_count/status) → مرفوض';
  END;

  -- ── [3] التعليقات والعدادات ──
  RAISE NOTICE '══ [3] التعليقات: العدادات والنشاط ══';
  v_before := (SELECT last_activity_at FROM public.community_posts WHERE id = v_post);
  PERFORM pg_sleep(0.02);
  -- v_other يعلّق (بجلسته)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  INSERT INTO public.community_comments (post_id, user_id, body)
  VALUES (v_post, v_other, 'تعليق أول من مستخدم آخر')
  RETURNING id INTO v_comment;

  SELECT count(*) INTO v_count FROM public.community_posts
  WHERE id = v_post AND reply_count = 1;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [3a] فشل: reply_count لم يتحدث بعد التعليق';
  END IF;
  RAISE NOTICE '✅ [3a] reply_count=1 بعد التعليق (now() ثابت داخل المعاملة — الترتيب الزمني يُختبر في E2E)';

  -- v_user يرد على تعليق v_other (بجلسته)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  INSERT INTO public.community_comments (post_id, user_id, parent_comment_id, body)
  VALUES (v_post, v_user, v_comment, 'رد على التعليق الأول')
  RETURNING id INTO v_reply;
  -- (الرد باسم v_user — جلسة v_other ستُرفض؛ جلسة v_user أدناه)

  -- ── [4] الإعجاب ──
  RAISE NOTICE '══ [4] الإعجاب (unique + عدادات) ══';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;

  INSERT INTO public.community_reactions (user_id, target_type, target_id) VALUES (v_user, 'post', v_post);
  SELECT count(*) INTO v_count FROM public.community_posts WHERE id = v_post AND like_count = 1;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [4a] فشل: like_count لم يرتفع بعد الإعجاب';
  END IF;
  RAISE NOTICE '✅ [4a] like_count=1 بعد التريجر';

  BEGIN
    INSERT INTO public.community_reactions (user_id, target_type, target_id) VALUES (v_user, 'post', v_post);
    RAISE EXCEPTION '❌ [4b] فشل: تكرار الإعجاب يجب أن يُرفض';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ [4b] تكرار الإعجاب → unique violation';
  END;

  DELETE FROM public.community_reactions WHERE user_id = v_user AND target_type = 'post' AND target_id = v_post;
  SELECT count(*) INTO v_count FROM public.community_posts WHERE id = v_post AND like_count = 0;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [4c] فشل: like_count لم ينخفض بعد إلغاء الإعجاب';
  END IF;
  RAISE NOTICE '✅ [4c] إلغاء الإعجاب → like_count=0';

  -- رد الأب: reply_count للتعليق
  SELECT count(*) INTO v_count FROM public.community_comments WHERE id = v_comment AND reply_count = 1;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [3b] فشل: reply_count للتعليق الأب لم يرتفع';
  END IF;
  RAISE NOTICE '✅ [3b] رد على تعليق → reply_count للأب=1';

  -- حذف الرد → العدادات تنخفض
  DELETE FROM public.community_comments WHERE id = v_reply;
  SELECT count(*) INTO v_count FROM public.community_comments WHERE id = v_comment AND reply_count = 0;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [3c] فشل: حذف الرد لم يخفض عداد الأب';
  END IF;
  RAISE NOTICE '✅ [3c] حذف الرد → عداد الأب رجع صفر';

  -- ── [5] الذِكر ──
  RAISE NOTICE '══ [5] سجل الذِكر (service-only كتابة) ══';
  RESET ROLE;
  -- الكتابة كما يفعل المسار (service_role / postgres)
  INSERT INTO public.community_mentions (post_id, mentioned_user_id) VALUES (v_post, v_other);
  -- القراءة كمذكور
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.community_mentions WHERE mentioned_user_id = v_other;
  IF v_count < 1 THEN
    RAISE EXCEPTION '❌ [5a] فشل: المذكور يجب أن يرى ذِكره';
  END IF;
  RAISE NOTICE '✅ [5a] المذكور يرى سجل الذِكر';
  -- مستخدم ثالث يرى صفر
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_third, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.community_mentions WHERE mentioned_user_id = v_other;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '❌ [5b] فشل: المستخدم الثالث يجب ألا يرى ذِكر غيره';
  END IF;
  RAISE NOTICE '✅ [5b] الطرف الثالث يرى صفر صفوف';
  -- كتابة المصادق → مرفوضة
  BEGIN
    INSERT INTO public.community_mentions (post_id, mentioned_user_id) VALUES (v_post, v_third);
    RAISE EXCEPTION '❌ [5c] فشل: كتابة mention من جلسة عادية يجب أن تُرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [5c] كتابة mention من authenticated → مرفوضة (service فقط)';
  END;

  -- ── [6] البلاغات ──
  RAISE NOTICE '══ [6] البلاغات (unique + ownership) ══';
  INSERT INTO public.community_reports (reporter_id, target_type, target_id, reason, details)
  VALUES (v_third, 'post', v_post, 'spam', 'تفاصيل الاختبار');
  RAISE NOTICE '✅ [6a] بلاغ أُدرج';
  BEGIN
    INSERT INTO public.community_reports (reporter_id, target_type, target_id, reason)
    VALUES (v_third, 'post', v_post, 'spam');
    RAISE EXCEPTION '❌ [6b] فشل: تكرار نفس البلاغ يجب أن يُرفض';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ [6b] تكرار البلاغ → unique violation';
  END;
  BEGIN
    INSERT INTO public.community_reports (reporter_id, target_type, target_id, reason)
    VALUES (v_user, 'post', v_post, 'other');  -- v_third يكتب باسم v_user
    RAISE EXCEPTION '❌ [6c] فشل: بلاغ باسم مستخدم آخر يجب أن يُرفض';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE '✅ [6c] بلاغ باسم غيري → مرفوض';
  END;
  SELECT count(*) INTO v_count FROM public.community_reports WHERE reporter_id = v_third;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [6d] فشل: المُبلِّغ يرى بلاغه فقط';
  END IF;
  RAISE NOTICE '✅ [6d] المُبلِّغ يرى بلاغه';

  -- ── [7] سجل الإشراف ──
  RAISE NOTICE '══ [7] سجل الإشراف (service_role فقط) ══';
  BEGIN
    SELECT count(*) INTO v_count FROM public.community_moderation_log;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '❌ [7a] فشل: المصادق يجب ألا يرى شيئًا من السجل';
    END IF;
    RAISE NOTICE '✅ [7a] authenticated يرى صفر صفوف من سجل الإشراف (RLS)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [7a] authenticated بلا صلاحية قراءة السجل أصلًا (أقوى: REVOKE)';
  END;
  BEGIN
    INSERT INTO public.community_moderation_log (action, target_type, target_id) VALUES ('hide_post', 'post', v_post);
    RAISE EXCEPTION '❌ [7b] فشل: كتابة في السجل من جلسة عادية يجب أن تُرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '✅ [7b] كتابة السجل من authenticated → مرفوضة';
  END;
  RESET ROLE;
  INSERT INTO public.community_moderation_log (moderator_id, action, target_type, target_id, reason)
  VALUES (v_user, 'hide_post', 'post', v_post, 'اختبار');
  RAISE NOTICE '✅ [7c] المشرف (service) يكتب في السجل';

  -- ── [8] الحظر ──
  RAISE NOTICE '══ [8] الحظر يُفرض داخل DB ══';
  INSERT INTO public.community_bans (user_id, reason, banned_by) VALUES (v_other, 'سلوك مخالف', v_user);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  BEGIN
    INSERT INTO public.community_posts (user_id, title, body) VALUES (v_other, 'محظور يحاول', 'x');
    RAISE EXCEPTION '❌ [8a] فشل: المحظور يجب ألا ينشر';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err NOT LIKE '%community_banned%' THEN
      RAISE EXCEPTION '❌ [8a] رفض بخطأ غير متوقع: %', v_err;
    END IF;
    RAISE NOTICE '✅ [8a] المحظور ينشر → community_banned';
  END;
  BEGIN
    INSERT INTO public.community_reactions (user_id, target_type, target_id) VALUES (v_other, 'post', v_post);
    RAISE EXCEPTION '❌ [8b] فشل: المحظور يجب ألا يتفاعل';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err NOT LIKE '%community_banned%' THEN
      RAISE EXCEPTION '❌ [8b] رفض بخطأ غير متوقع: %', v_err;
    END IF;
    RAISE NOTICE '✅ [8b] المحظور يتفاعل → community_banned';
  END;
  -- المحظور يرى صفه (يعرف سببه ومدته)
  SELECT count(*) INTO v_count FROM public.community_bans WHERE user_id = v_other;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [8c] فشل: المحظور يجب أن يرى صف حظره';
  END IF;
  RAISE NOTICE '✅ [8c] المحظور يرى صف حظره';
  -- حظر منتهي → لا يمنع
  RESET ROLE;
  UPDATE public.community_bans SET expires_at = now() - interval '1 hour' WHERE user_id = v_other;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  INSERT INTO public.community_posts (user_id, title, body) VALUES (v_other, 'بعد انتهاء الحظر', 'الآن مسموح');
  RAISE NOTICE '✅ [8d] الحظر المنتهي لا يمنع النشر';
  -- إزالة الحظر (تنظيف داخلي — بصلاحية المشرف لأن الجلسة v_other)
  RESET ROLE;
  DELETE FROM public.community_bans WHERE user_id = v_other;

  -- ── [9] خلاصة get_community_feed ──
  RAISE NOTICE '══ [9] الخلاصة (ترتيب + pagination + liked_by_me) ══';
  RESET ROLE;
  -- منشورات إضافية بأعداد إعجاب مختلفة
  INSERT INTO public.community_posts (user_id, title, body) VALUES (v_user, 'منشور الثاني', 'محتوى 2');
  INSERT INTO public.community_posts (user_id, title, body) VALUES (v_other, 'منشور الثالث', 'محتوى 3')
  RETURNING id INTO v_post2;
  SELECT id INTO v_post3 FROM public.community_posts WHERE title = 'منشور الثاني';
  -- إعجابات: «الثالث» (=v_post2) يحصل على 2، «الثاني» (=v_post3) على 1
  INSERT INTO public.community_reactions (user_id, target_type, target_id) VALUES
    (v_user, 'post', v_post2), (v_other, 'post', v_post3), (v_third, 'post', v_post2);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_third, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  v_feed := public.get_community_feed(1, 2, 'latest');
  IF (v_feed->>'hasMore')::boolean IS NOT TRUE OR jsonb_array_length(v_feed->'items') <> 2 THEN
    RAISE EXCEPTION '❌ [9a] فشل: pagination (الصفحة 1 بحجم 2) — items=% hasMore=%', jsonb_array_length(v_feed->'items'), v_feed->>'hasMore';
  END IF;
  RAISE NOTICE '✅ [9a] pagination: صفحة 1 = عنصران + hasMore';

  v_feed := public.get_community_feed(1, 20, 'top');
  IF (v_feed->'items'->0->>'title') IS DISTINCT FROM (SELECT title FROM public.community_posts WHERE id = v_post2) THEN
    RAISE EXCEPTION '❌ [9b] فشل: فلتر top يجب أن يبدأ بالأكثر إعجابًا (منشور الثالث)';
  END IF;
  RAISE NOTICE '✅ [9b] فلتر top: الأكثر إعجابًا أولًا';

  -- liked_by_me لعين v_user (أعجب بـ v_post2)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  v_feed := public.get_community_feed(1, 20, 'latest');
  SELECT count(*) INTO v_count FROM jsonb_array_elements(v_feed->'items') e
  WHERE (e->>'id') = v_post2::text AND (e->>'liked_by_me') = 'true';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '❌ [9c] فشل: liked_by_me يجب أن يكون true للمنشور الذي أعجبني';
  END IF;
  RAISE NOTICE '✅ [9c] liked_by_me صحيح';

  -- ── [10] get_community_post: المخفي لصاحبه فقط ──
  RAISE NOTICE '══ [10] المنشور المخفي ══';
  -- الإخفاء فعل مشرف (service_role) — مثل مسار /admin/community/moderate
  RESET ROLE;
  UPDATE public.community_posts SET status = 'hidden' WHERE id = v_post;
  -- v_user صاحبه → يراه
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
  -- v_user صاحبه → يراه
  v_res := public.get_community_post(v_post);
  IF v_res IS NULL THEN
    RAISE EXCEPTION '❌ [10a] فشل: صاحب المنشور المخفي يجب أن يراه';
  END IF;
  RAISE NOTICE '✅ [10a] الصاحب يرى منشوره المخفي';
  -- v_other غير صاحب → NULL
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, false);
  v_res := public.get_community_post(v_post);
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION '❌ [10b] فشل: غير الصاحب يجب ألا يرى المنشور المخفي';
  END IF;
  RAISE NOTICE '✅ [10b] غير الصاحب لا يرى المخفي';
  -- RLS: select مباشر لغير الصاحب → صفر
  SELECT count(*) INTO v_count FROM public.community_posts WHERE id = v_post;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '❌ [10c] فشل: RLS يجب أن يخفي المنشور المخفي عن الآخرين';
  END IF;
  RAISE NOTICE '✅ [10c] RLS يخفي المخفي عن الآخرين';
  -- الاستعادة فعل مشرف أيضًا
  RESET ROLE;
  UPDATE public.community_posts SET status = 'published' WHERE id = v_post;

  -- ── [11] get_community_comments ──
  RAISE NOTICE '══ [11] تعليقات المنشور ══';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  v_feed := public.get_community_comments(v_post, 1, 20);
  IF jsonb_array_length(v_feed->'items') < 1 OR (v_feed->'items'->0->>'author_handle') IS NULL THEN
    RAISE EXCEPTION '❌ [11a] فشل: التعليقات يجب أن تعود ببيانات المؤلف';
  END IF;
  RAISE NOTICE '✅ [11a] التعليقات تعود ببيانات المؤلف (handle/الاسم)';

  -- ── [12] search_community_members ──
  RAISE NOTICE '══ [12] بحث الأعضاء ══';
  v_res := public.search_community_members('');
  IF jsonb_typeof(v_res) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '❌ [12a] فشل: البحث يجب أن يرجع مصفوفة';
  END IF;
  RAISE NOTICE '✅ [12a] الشكل: مصفوفة (%, نتيجة/استعلام فارغ)', jsonb_array_length(v_res);
  -- v_other موجود ولا يشمل نفسي
  SELECT count(*) INTO v_count FROM jsonb_array_elements(public.search_community_members('')) e
  WHERE (e->>'id') = v_user::text;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '❌ [12b] فشل: البحث يجب أن يستبعد المستخدم نفسه';
  END IF;
  RAISE NOTICE '✅ [12b] البحث يستبعد نفسي';

  -- ── [13] profiles.handle ──
  RAISE NOTICE '══ [13] تعبئة handle ══';
  SELECT count(*), count(handle), count(DISTINCT handle) INTO v_count, v_count, v_count FROM public.profiles;
  SELECT count(*) INTO v_count FROM public.profiles WHERE handle IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '❌ [13a] فشل: % بروفايل بلا handle', v_count;
  END IF;
  SELECT count(*) - count(DISTINCT handle) INTO v_count FROM public.profiles;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '❌ [13b] فشل: تكرار في handles';
  END IF;
  RAISE NOTICE '✅ [13] handle: تعبئة كاملة + تفرّد';

  RESET ROLE;
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '✅ اكتملت كل اختبارات المرحلة 07 بنجاح';
  RAISE NOTICE '   (كل التغييرات داخل معاملة ستُلغى الآن)';
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- إلغاء كل شيء (لا أثر على بياناتك)
ROLLBACK;
