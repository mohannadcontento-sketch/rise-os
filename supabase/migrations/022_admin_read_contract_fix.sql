-- 022. Fix admin_read result contract metadata.
-- Run AFTER 021_notification_integrity.sql.
-- No data mutation.

CREATE OR REPLACE FUNCTION public.admin_read(p_query_id TEXT, p_limit INTEGER DEFAULT 100, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := COALESCE(auth.uid(), p_admin_user_id);
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_role TEXT;
  v_rows JSONB := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_uid THEN RAISE EXCEPTION 'identity mismatch'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF lower(trim(COALESCE(v_role, ''))) NOT IN ('admin', 'ادمن') THEN RAISE EXCEPTION 'admin only'; END IF;

  CASE p_query_id
    WHEN 'table_counts' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY (t->>'row_count')::bigint DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT jsonb_build_object('table_name', relname, 'row_count', n_live_tup) AS t
        FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY n_live_tup DESC LIMIT v_limit
      ) s;
    WHEN 'recent_users' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
      INTO v_rows FROM (
        SELECT id, email, name, role, suspended, created_at
        FROM public.profiles ORDER BY created_at DESC LIMIT v_limit
      ) p;
    WHEN 'recent_audit' THEN
      IF to_regclass('public.audit_logs') IS NULL THEN
        RETURN jsonb_build_object('query_id', p_query_id, 'columns', '[]'::jsonb, 'rows', '[]'::jsonb);
      END IF;
      SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
      INTO v_rows FROM (
        SELECT id, user_id, action, target_type, target_id, metadata, created_at
        FROM public.audit_logs ORDER BY created_at DESC LIMIT v_limit
      ) a;
    WHEN 'recent_errors' THEN
      IF to_regclass('public.error_logs') IS NULL THEN
        RETURN jsonb_build_object('query_id', p_query_id, 'columns', '[]'::jsonb, 'rows', '[]'::jsonb);
      END IF;
      SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC), '[]'::jsonb)
      INTO v_rows FROM (
        SELECT id, user_id, message, stack, level, created_at
        FROM public.error_logs ORDER BY created_at DESC LIMIT v_limit
      ) e;
    WHEN 'storage_summary' THEN
      IF to_regclass('public.user_storage') IS NULL THEN
        RETURN jsonb_build_object('query_id', p_query_id, 'columns', '[]'::jsonb, 'rows', '[]'::jsonb);
      END IF;
      SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.storage_used DESC), '[]'::jsonb)
      INTO v_rows FROM (
        SELECT user_id, storage_used, updated_at
        FROM public.user_storage ORDER BY storage_used DESC LIMIT v_limit
      ) s;
    ELSE
      RAISE EXCEPTION 'unsupported admin query';
  END CASE;

  RETURN jsonb_build_object(
    'query_id', p_query_id,
    'columns', CASE p_query_id
      WHEN 'table_counts' THEN '["table_name","row_count"]'::jsonb
      WHEN 'recent_users' THEN '["id","email","name","role","suspended","created_at"]'::jsonb
      WHEN 'recent_audit' THEN '["id","user_id","action","target_type","target_id","metadata","created_at"]'::jsonb
      WHEN 'recent_errors' THEN '["id","user_id","message","stack","level","created_at"]'::jsonb
      WHEN 'storage_summary' THEN '["user_id","storage_used","updated_at"]'::jsonb
    END,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_read(TEXT, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_read(TEXT, INTEGER, UUID) TO service_role;
