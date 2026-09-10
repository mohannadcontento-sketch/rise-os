-- 020. Broadcast RPC schema correction
-- Run AFTER 019_final_privilege_hardening.sql.
-- Fixes notification column/type names to match the live schema.

CREATE OR REPLACE FUNCTION public.admin_broadcast_notifications_atomic(
  p_admin_user_id UUID,
  p_target_user_ids UUID[] DEFAULT NULL,
  p_title TEXT DEFAULT '',
  p_body TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_inserted INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_user_id THEN
    RAISE EXCEPTION 'identity mismatch';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_admin_user_id;
  IF lower(trim(COALESCE(v_role, ''))) NOT IN ('admin', 'ادمن') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 OR length(p_title) > 120
     OR p_body IS NULL OR length(trim(p_body)) = 0 OR length(p_body) > 1000 THEN
    RAISE EXCEPTION 'invalid broadcast payload';
  END IF;

  IF p_target_user_ids IS NULL OR cardinality(p_target_user_ids) = 0 THEN
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url, read)
    SELECT id, p_title, p_body, 'system', '📣', '', false
    FROM public.profiles;
  ELSE
    INSERT INTO public.notifications (user_id, title, body, type, icon, action_url, read)
    SELECT p.id, p_title, p_body, 'system', '📣', '', false
    FROM public.profiles p
    WHERE p.id = ANY(p_target_user_ids);
  END IF;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RAISE EXCEPTION 'no recipients'; END IF;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notifications_atomic(UUID, UUID[], TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notifications_atomic(UUID, UUID[], TEXT, TEXT) TO service_role;
