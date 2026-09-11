-- ============================================================
-- 031_phase7b_media.sql — المرحلة 07-ب: مرفقات صور المنشورات (R2)
--
-- القرارات المعمارية (وثيقة النطاق §4 — قرارات المالك):
--   • الصور والمرفقات على Cloudflare R2 — لا تخزين صور في
--     Supabase. هذا الملف يحمل الحسابات والحصص فقط (المفاتيح
--     والبايتات) — البايتات نفسها في R2.
--   • حدود الخطة: مساحة المرفقات 50MB (مجانية) / 1GB (بلس) /
--     10GB (ماكس)، والمجانية 3 منشورات/يوم (قراءة + نشر محدود).
--
-- الأمان (نفس مبادئ 030):
--   • community_posts.media يُكتب عبر service_role فقط — عمود
--     NOT ضمن إذونات INSERT/UPDATE للمستخدم، فحتى نداء
--     PostgREST مباشرة لا يستطيع تزوير مفاتيح الميديا.
--   • CHECK بنية media عبر دالة IMMUTABLE (نوع/مفتاح/حجم).
--   • media_objects: select-own فقط؛ كل الكتابات service_role
--     (الطلب، الحصص، التعلّق بالمنشور — كلها خادمية).
--   • RLS: المستخدم يرى صفوفه (حصته/استخدامه) — لا شيء آخر.
--
-- الإشعارات: لا تغيير — نفس مسار notify_user الموحد.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1) دالة تحقق بنية media (IMMUTABLE — قابلة للاستخدام في CHECK)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.community_media_valid(m jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT m IS NULL OR (
    jsonb_typeof(m) = 'array'
    AND jsonb_array_length(m) <= 4
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(m) el
      WHERE jsonb_typeof(el) <> 'object'
         OR jsonb_typeof(el->'key') <> 'string'
         OR el->>'key' !~ '^community/[A-Za-z0-9-]+/[A-Za-z0-9-]+\.(jpg|png|webp|gif)$'
         OR jsonb_typeof(el->'contentType') <> 'string'
         OR el->>'contentType' NOT IN ('image/jpeg','image/png','image/webp','image/gif')
         OR jsonb_typeof(el->'bytes') <> 'number'
         OR (el->>'bytes')::numeric NOT BETWEEN 1 AND 8388608
    )
  );
$$;

-- ════════════════════════════════════════════════════════════
-- 2) community_posts.media — مصفوفة {key, contentType, bytes}
--    (تُضبط من المسار عبر service_role بعد التحقق من ملكية
--     كائنات media_objects — انظر مسار النشر)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS media jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_media_check') THEN
    ALTER TABLE public.community_posts
      ADD CONSTRAINT community_posts_media_check
      CHECK (public.community_media_valid(media));
  END IF;
END $$;

-- إذونات الأعمدة تبقى كما هي (user_id/title/body للإدراج،
-- title/body/edited_at للتعديل) — media خارجها عمدًا:
-- المستخدم لا يستطيع كتابته مهما فعل.

-- ════════════════════════════════════════════════════════════
-- 3) media_objects — سجل كائنات الوسائط والحساب ضد الحصة
--    pending → active (تعلّق بمنشور) → deleted
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.media_objects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'community_post'
                 CHECK (kind IN ('community_post', 'avatar', 'other')),
  post_id      uuid REFERENCES public.community_posts(id) ON DELETE SET NULL,
  object_key   text NOT NULL UNIQUE
                 CHECK (length(btrim(object_key)) BETWEEN 5 AND 300),
  bytes        bigint NOT NULL CHECK (bytes BETWEEN 1 AND 8388608),
  content_type text NOT NULL
                 CHECK (content_type IN ('image/jpeg','image/png','image/webp','image/gif')),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'orphaned', 'deleted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_objects_user_idx
  ON public.media_objects (user_id, status);
CREATE INDEX IF NOT EXISTS media_objects_post_idx
  ON public.media_objects (post_id);

ALTER TABLE public.media_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_objects_select_own ON public.media_objects;
CREATE POLICY media_objects_select_own ON public.media_objects
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- إذونات fail-closed (نفس نمط 030): سحب تلقائي ثم منح الحد الأدنى
REVOKE ALL ON public.media_objects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.media_objects TO authenticated;
GRANT ALL ON public.media_objects TO service_role;

DROP TRIGGER IF EXISTS trg_media_objects_updated_at ON public.media_objects;
CREATE TRIGGER trg_media_objects_updated_at
  BEFORE UPDATE ON public.media_objects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 4) حدود الخطة: community.post (3/يوم للمجانية) +
--    storage_limit (بايتات: 50MB / 1GB / 10GB)
--    daily_limit INT لا يتسع لـ10GB → عمود bigint مستقل للحصة.
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.plan_entitlements ADD COLUMN IF NOT EXISTS storage_limit bigint;

INSERT INTO public.plan_entitlements
  (plan_code, feature_key, enabled, daily_limit, monthly_limit, storage_limit) VALUES
  ('free', 'community.post', true, 3,    90,   52428800),
  ('plus', 'community.post', true, NULL, NULL, 1073741824),
  ('max',  'community.post', true, NULL, NULL, 10737418240)
ON CONFLICT (plan_code, feature_key) DO UPDATE
  SET enabled      = EXCLUDED.enabled,
      daily_limit  = EXCLUDED.daily_limit,
      monthly_limit = EXCLUDED.monthly_limit,
      storage_limit = EXCLUDED.storage_limit;

-- ════════════════════════════════════════════════════════════
-- 5) RPC: الخلاصة والتفاصيل تعرضان media (المفاتيح فقط —
--    توقيع روابط القراءة يجري في المسار خادميًا)
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
           p.media,
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
    'media', v_post.media,
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
