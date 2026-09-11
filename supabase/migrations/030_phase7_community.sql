-- ============================================================
-- 030_phase7_community.sql — المرحلة السابعة: المجتمع
--
-- MVP: Posts/Questions + Comments/Replies + Like + Mentions +
--      Reports + Basic Moderation + Social Notifications + Pagination.
--
-- مبادئ الأمان (من الخطة):
--   • فصل بيانات المجتمع العامة عن بيانات المستخدم الخاصة —
--     جداول المجتمع لا تحمل سوى user_id + معلومات العرض العامة
--     (الاسم/handle/الصورة عبر JOIN في RPC بأمان).
--   • ownership checks قبل تعديل/حذف المحتوى — سياسات RLS
--     update/delete-own فقط (fail-closed لكل ما عدا ذلك).
--   • Rate limits للكتابة — middleware (مسارات) + قيود فريدة
--     (تفاعل واحد/مستخدم/هدف، بلاغ واحد/مستخدم/هدف) + dedup
--     للإشعارات (مفتاح لكل حدث).
--   • حماية من spam والطلبات المتكررة — منع التكرار على مستوى
--     الفهرس الفريد + سقوف طول المحتوى CHECK.
--   • سجل moderation actions للمشرفين — community_moderation_log
--     (قراءة/كتابة service_role فقط).
--   • الحظر (ban) يُفرض داخل قاعدة البيانات نفسها — ترِيجر
--     BEFORE INSERT يرفض كتابة المحظور (fail-closed)، لا يعتمد
--     على المسار وحده.
--
-- الإشعارات الاجتماعية: أنواع 'community' و 'mention' جاهزة منذ
-- الهجرة 026 (CHECK + بوابة Push تقسمهما لفئة community)،
-- والإنشاء يتم من المسارات عبر notifyUser (المصدر الموحد).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1) profiles.handle — معرّف عام قصير للـ @mentions
--    (backfill من بادئة البريد مع إزالة التكرار؛ التريجر
--    handle_new_user يولّده لكل مستخدم جديد)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS handle text;

DO $$
DECLARE
  r record;
  v_base text;
  v_h text;
  v_n int;
BEGIN
  FOR r IN SELECT id, email FROM public.profiles WHERE handle IS NULL LOOP
    v_base := regexp_replace(split_part(lower(r.email), '@', 1), '[^a-z0-9_]', '', 'g');
    IF length(v_base) < 2 THEN v_base := 'user'; END IF;
    v_base := left(v_base, 24);
    v_h := v_base; v_n := 1;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = v_h) LOOP
      v_n := v_n + 1;
      v_h := v_base || v_n::text;
    END LOOP;
    UPDATE public.profiles SET handle = v_h WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_key ON public.profiles (handle);
CREATE INDEX IF NOT EXISTS profiles_handle_lower_idx ON public.profiles (lower(handle));

-- توليد handle لكل مستخدم جديد (نفس منطق dedup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_h text;
  v_n int;
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'user'
  )
  ON CONFLICT (id) DO NOTHING;

  -- handle فريد للمستخدم الجديد
  IF (SELECT handle FROM public.profiles WHERE id = NEW.id) IS NULL THEN
    v_base := regexp_replace(split_part(lower(NEW.email), '@', 1), '[^a-z0-9_]', '', 'g');
    IF length(v_base) < 2 THEN v_base := 'user'; END IF;
    v_base := left(v_base, 24);
    v_h := v_base; v_n := 1;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = v_h) LOOP
      v_n := v_n + 1;
      v_h := v_base || v_n::text;
    END LOOP;
    UPDATE public.profiles SET handle = v_h WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 2) community_posts — المنشورات/الأسئلة
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.community_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  body            text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000),
  status          text NOT NULL DEFAULT 'published'
                    CHECK (status IN ('published', 'hidden', 'removed')),
  edited_at       timestamptz,
  like_count      integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  reply_count     integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_posts_feed_idx
  ON public.community_posts (status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_top_idx
  ON public.community_posts (status, like_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_user_idx ON public.community_posts (user_id, created_at DESC);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_posts_select ON public.community_posts;
CREATE POLICY community_posts_select ON public.community_posts
  FOR SELECT TO authenticated
  USING (status = 'published' OR user_id = auth.uid());

-- الحذف الذاتي مسموح؛ التعديل لصف المنشور المنشور فقط
DROP POLICY IF EXISTS community_posts_insert ON public.community_posts;
CREATE POLICY community_posts_insert ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'published');

DROP POLICY IF EXISTS community_posts_update ON public.community_posts;
CREATE POLICY community_posts_update ON public.community_posts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'published')
  WITH CHECK (user_id = auth.uid() AND status = 'published');

DROP POLICY IF EXISTS community_posts_delete ON public.community_posts;
CREATE POLICY community_posts_delete ON public.community_posts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 3) community_comments — التعليقات والردود (self-ref)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.community_comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id            uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id  uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  body               text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  status             text NOT NULL DEFAULT 'published'
                       CHECK (status IN ('published', 'hidden', 'removed')),
  edited_at          timestamptz,
  like_count         integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  reply_count        integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_comments_post_idx
  ON public.community_comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_comments_parent_idx
  ON public.community_comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS community_comments_user_idx
  ON public.community_comments (user_id, created_at DESC);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_comments_select ON public.community_comments;
CREATE POLICY community_comments_select ON public.community_comments
  FOR SELECT TO authenticated
  USING (status = 'published' OR user_id = auth.uid());

DROP POLICY IF EXISTS community_comments_insert ON public.community_comments;
CREATE POLICY community_comments_insert ON public.community_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'published');

DROP POLICY IF EXISTS community_comments_update ON public.community_comments;
CREATE POLICY community_comments_update ON public.community_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'published')
  WITH CHECK (user_id = auth.uid() AND status = 'published');

DROP POLICY IF EXISTS community_comments_delete ON public.community_comments;
CREATE POLICY community_comments_delete ON public.community_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 4) community_reactions — إعجاب واحد لكل مستخدم/هدف
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.community_reactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id    uuid NOT NULL,
  reaction     text NOT NULL DEFAULT 'like' CHECK (reaction IN ('like')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS community_reactions_target_idx
  ON public.community_reactions (target_type, target_id);

ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;

-- القراءة عامة داخل التطبيق (للعدادات ولعرض «أعجبني»)
DROP POLICY IF EXISTS community_reactions_select ON public.community_reactions;
CREATE POLICY community_reactions_select ON public.community_reactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS community_reactions_insert ON public.community_reactions;
CREATE POLICY community_reactions_insert ON public.community_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS community_reactions_delete ON public.community_reactions;
CREATE POLICY community_reactions_delete ON public.community_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 5) community_mentions — سجل الذِكر (للعرض/الإحصاء)
--    الكتابة service_role فقط (المسار يحلل @handle خادميًا)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.community_mentions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id        uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1),
  UNIQUE (post_id, mentioned_user_id),
  UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS community_mentions_user_idx
  ON public.community_mentions (mentioned_user_id, created_at DESC);

ALTER TABLE public.community_mentions ENABLE ROW LEVEL SECURITY;

-- المستخدم يرى من ذكره فقط؛ لا سياسات كتابة (service_role فقط)
DROP POLICY IF EXISTS community_mentions_select ON public.community_mentions;
CREATE POLICY community_mentions_select ON public.community_mentions
  FOR SELECT TO authenticated
  USING (mentioned_user_id = auth.uid() OR post_id IN (SELECT id FROM public.community_posts WHERE user_id = auth.uid()) OR comment_id IN (SELECT id FROM public.community_comments WHERE user_id = auth.uid()));

-- ════════════════════════════════════════════════════════════
-- 6) community_reports — الإبلاغ + مسار مراجعة واضح
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.community_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id    uuid NOT NULL,
  reason       text NOT NULL CHECK (reason IN ('spam', 'abuse', 'offensive', 'off_topic', 'other')),
  details      text CHECK (details IS NULL OR length(btrim(details)) <= 2000),
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'resolved_dismissed', 'resolved_hidden', 'resolved_removed')),
  handled_by   uuid REFERENCES auth.users(id),
  handled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS community_reports_queue_idx
  ON public.community_reports (status, created_at DESC);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_reports_insert ON public.community_reports;
CREATE POLICY community_reports_insert ON public.community_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND status = 'open');

DROP POLICY IF EXISTS community_reports_select ON public.community_reports;
CREATE POLICY community_reports_select ON public.community_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());
-- (المراجعة عبر service_role — يتجاوز RLS)

-- ════════════════════════════════════════════════════════════
-- 7) community_moderation_log — سجل إجراءات المشرفين
--    (قراءة/كتابة service_role فقط — RLS بلا سياسات)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.community_moderation_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid REFERENCES auth.users(id),
  action       text NOT NULL CHECK (action IN (
                 'hide_post', 'restore_post', 'remove_post',
                 'hide_comment', 'restore_comment', 'remove_comment',
                 'dismiss_report', 'hide_reported', 'remove_reported',
                 'ban_user', 'unban_user')),
  target_type  text NOT NULL CHECK (target_type IN ('post', 'comment', 'user', 'report')),
  target_id    uuid NOT NULL,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_modlog_recent_idx
  ON public.community_moderation_log (created_at DESC);

ALTER TABLE public.community_moderation_log ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- 8) community_bans — حظر المجتمع (مؤقت أو دائم)
--    (قراءة صفه فقط؛ الكتابة service_role)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.community_bans (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text,
  banned_by   uuid REFERENCES auth.users(id),
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_bans_select_own ON public.community_bans;
CREATE POLICY community_bans_select_own ON public.community_bans
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ═══ 8-ب) إذونات على مستوى الأعمدة (fail-closed) ═══
-- المستخدم يستطيع كتابة أعمدة المحتوى فقط — العدادات/الحالة/
-- المستخدم تُدار خادميًا (قيم افتراضية + التريجرات)، فحتى نداء
-- PostgREST مباشرة لا يسمح بتعيين like_count=999 أو status.
-- ⚠️ Supabase default ACL يمنح anon/authenticated/service_role كل
-- الصلاحيات على أي جدول ينشئه postgres في public تلقائيًا — نسحبها
-- من authenticated أيضًا ثم نعيد منح ما يلزم فقط (أعمدة محددة).
REVOKE ALL ON public.community_posts, public.community_comments,
  public.community_reactions, public.community_mentions,
  public.community_reports, public.community_moderation_log,
  public.community_bans FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON public.community_posts TO authenticated;
GRANT INSERT (user_id, title, body) ON public.community_posts TO authenticated;
GRANT UPDATE (title, body, edited_at) ON public.community_posts TO authenticated;

GRANT SELECT, DELETE ON public.community_comments TO authenticated;
GRANT INSERT (post_id, user_id, parent_comment_id, body) ON public.community_comments TO authenticated;
GRANT UPDATE (body, edited_at) ON public.community_comments TO authenticated;

GRANT SELECT, DELETE ON public.community_reactions TO authenticated;
GRANT INSERT (user_id, target_type, target_id, reaction) ON public.community_reactions TO authenticated;

GRANT SELECT ON public.community_mentions TO authenticated;

GRANT SELECT, INSERT (reporter_id, target_type, target_id, reason, details)
  ON public.community_reports TO authenticated;

-- المحظور يرى صفه فقط (السبب/المدة) — RLS select-own فوق هذا الإذن
GRANT SELECT ON public.community_bans TO authenticated;
-- moderation_log: لا منح لـ authenticated إطلاقًا (service_role فقط)
GRANT ALL ON public.community_moderation_log, public.community_bans TO service_role;

-- تحديث updated_at تلقائيًا (نفس دالة المشروع العامة)
DROP TRIGGER IF EXISTS trg_community_posts_updated_at ON public.community_posts;
CREATE TRIGGER trg_community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_community_comments_updated_at ON public.community_comments;
CREATE TRIGGER trg_community_comments_updated_at
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 9) فرض الحظر داخل قاعدة البيانات (fail-closed)
--    أي INSERT لمنشور/تعليق/تفاعل من مستخدم محظور → رفض
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.community_write_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.community_bans b
    WHERE b.user_id = auth.uid()
      AND (b.expires_at IS NULL OR b.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.community_write_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_write_allowed() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.community_assert_not_banned()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.community_write_allowed() THEN
    RAISE EXCEPTION 'community_banned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_ban_check ON public.community_posts;
CREATE TRIGGER trg_posts_ban_check
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_assert_not_banned();

DROP TRIGGER IF EXISTS trg_comments_ban_check ON public.community_comments;
CREATE TRIGGER trg_comments_ban_check
  BEFORE INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_assert_not_banned();

DROP TRIGGER IF EXISTS trg_reactions_ban_check ON public.community_reactions;
CREATE TRIGGER trg_reactions_ban_check
  BEFORE INSERT ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.community_assert_not_banned();

-- ════════════════════════════════════════════════════════════
-- 10) العدادات — trigger واحد ذري لكل من الإضافة والحذف
--     (like_count / reply_count / last_activity_at)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.community_recount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE public.community_posts SET like_count = like_count + 1
      WHERE id = NEW.target_id AND status <> 'removed';
    ELSE
      UPDATE public.community_comments SET like_count = like_count + 1
      WHERE id = NEW.target_id AND status <> 'removed';
    END IF;
  ELSE -- DELETE
    IF OLD.target_type = 'post' THEN
      UPDATE public.community_posts SET like_count = GREATEST(like_count - 1, 0)
      WHERE id = OLD.target_id;
    ELSE
      UPDATE public.community_comments SET like_count = GREATEST(like_count - 1, 0)
      WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_recount ON public.community_reactions;
CREATE TRIGGER trg_community_recount
  AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.community_recount();

CREATE OR REPLACE FUNCTION public.community_comment_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts
    SET reply_count = reply_count + 1, last_activity_at = now()
    WHERE id = NEW.post_id;
    IF NEW.parent_comment_id IS NOT NULL THEN
      UPDATE public.community_comments SET reply_count = reply_count + 1
      WHERE id = NEW.parent_comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = OLD.post_id;
    IF OLD.parent_comment_id IS NOT NULL THEN
      UPDATE public.community_comments SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = OLD.parent_comment_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_comment_counts ON public.community_comments;
CREATE TRIGGER trg_community_comment_counts
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_comment_counts();

-- ════════════════════════════════════════════════════════════
-- 11) RPC: get_community_feed — خلاصة بنداء واحد
--     p_filter: 'latest' (آخر نشاط) | 'top' (الأكثر إعجابًا)
--     المنشورات المخفية/المحذوفة لا تظهر (إلا لصاحبها عبر RLS
--     — هذه الدالة للخلاصة العامة فقط)، وliked_by_me يعرض
--     حالة القلب مباشرة في نداء واحد.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_community_feed(
  p_page     int DEFAULT 1,
  p_per_page int DEFAULT 20,
  p_filter   text DEFAULT 'latest'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_offset int;
  v_items jsonb;
  v_total bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_filter NOT IN ('latest', 'top') THEN
    RAISE EXCEPTION 'invalid_filter';
  END IF;
  p_page := GREATEST(p_page, 1);
  p_per_page := LEAST(GREATEST(p_per_page, 1), 50);
  v_offset := (p_page - 1) * p_per_page;

  SELECT count(*) INTO v_total
  FROM public.community_posts
  WHERE status = 'published';

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_items
  FROM (
    SELECT p.id, p.title,
           left(p.body, 220) AS body_snippet,
           p.user_id,
           pr.name AS author_name,
           pr.handle AS author_handle,
           pr.avatar AS author_avatar,
           p.like_count, p.reply_count,
           p.created_at, p.last_activity_at,
           p.status,
           EXISTS (SELECT 1 FROM public.community_reactions r
                   WHERE r.user_id = v_user AND r.target_type = 'post' AND r.target_id = p.id) AS liked_by_me
    FROM public.community_posts p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.status = 'published'
    ORDER BY CASE WHEN p_filter = 'top' THEN p.like_count END DESC NULLS LAST,
             CASE WHEN p_filter = 'top' THEN p.created_at END DESC,
             CASE WHEN p_filter <> 'top' THEN p.last_activity_at END DESC
    LIMIT p_per_page OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'perPage', p_per_page,
    'hasMore', (v_offset + p_per_page) < v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_community_feed(int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_feed(int, int, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 12) RPC: get_community_post — تفاصيل منشور واحد + حالة القلب
--     يظهر المنشور المنشور، أو المخفي/المحذوف لصاحبه فقط.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_community_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_post public.community_posts;
  v_item jsonb;
  v_author jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_post FROM public.community_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_post.status <> 'published' AND v_post.user_id <> v_user THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(a) INTO v_author
  FROM (SELECT pr.name, pr.handle, pr.avatar FROM public.profiles pr WHERE pr.id = v_post.user_id) a;

  SELECT jsonb_build_object(
    'id', v_post.id,
    'title', v_post.title,
    'body', v_post.body,
    'userId', v_post.user_id,
    'author', v_author,
    'status', v_post.status,
    'likeCount', v_post.like_count,
    'replyCount', v_post.reply_count,
    'createdAt', v_post.created_at,
    'editedAt', v_post.edited_at,
    'likedByMe', EXISTS (SELECT 1 FROM public.community_reactions r
                          WHERE r.user_id = v_user AND r.target_type = 'post' AND r.target_id = v_post.id)
  ) INTO v_item;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.get_community_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_post(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 13) RPC: get_community_comments — تعليقات المنشور (الأحدث
--     أولًا) مع اسم كاتب الرد الأب وباقة معلومات عرض كاملة
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_community_comments(
  p_post_id  uuid,
  p_page     int DEFAULT 1,
  p_per_page int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_offset int;
  v_items jsonb;
  v_total bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  p_page := GREATEST(p_page, 1);
  p_per_page := LEAST(GREATEST(p_per_page, 1), 50);
  v_offset := (p_page - 1) * p_per_page;

  SELECT count(*) INTO v_total
  FROM public.community_comments
  WHERE post_id = p_post_id AND status = 'published';

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_items
  FROM (
    SELECT c.id, c.post_id, c.parent_comment_id,
           ppr.handle AS parent_author_handle,
           c.user_id,
           pr.name AS author_name,
           pr.handle AS author_handle,
           pr.avatar AS author_avatar,
           c.body, c.status,
           c.like_count, c.reply_count,
           c.created_at, c.edited_at,
           EXISTS (SELECT 1 FROM public.community_reactions r
                   WHERE r.user_id = v_user AND r.target_type = 'comment' AND r.target_id = c.id) AS liked_by_me
    FROM public.community_comments c
    JOIN public.profiles pr ON pr.id = c.user_id
    LEFT JOIN public.community_comments pc ON pc.id = c.parent_comment_id
    LEFT JOIN public.profiles ppr ON ppr.id = pc.user_id
    WHERE c.post_id = p_post_id AND c.status = 'published'
    ORDER BY c.created_at DESC
    LIMIT p_per_page OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'perPage', p_per_page,
    'hasMore', (v_offset + p_per_page) < v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_community_comments(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_comments(uuid, int, int) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 14) RPC: search_community_members — اقتراحات @mention
--     يبحث في handle/الاسم؛ لا يرجع بريدًا أو أي بيانات خاصة.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.search_community_members(p_query text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'handle', pr.handle, 'avatar', pr.avatar))
    FROM (
      SELECT id, name, handle, avatar
      FROM public.profiles
      WHERE id <> v_user
        AND suspended = false
        AND length(btrim(p_query)) >= 1
        AND (handle ILIKE p_query || '%' OR lower(name) ILIKE '%' || lower(p_query) || '%')
      ORDER BY handle
      LIMIT 20
    ) pr
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.search_community_members(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_community_members(text) TO authenticated, service_role;
