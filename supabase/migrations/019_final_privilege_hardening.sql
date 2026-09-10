-- ============================================================
-- 019. Final privilege hardening
-- Run AFTER 018_integrity_and_atomic_goal_toggle.sql.
-- No data is deleted by this migration.
-- ============================================================

-- The admin RPC is server-mediated. Ordinary browser JWTs do not need
-- direct EXECUTE; the application calls it through the trusted service role.
REVOKE ALL ON FUNCTION public.admin_read(TEXT, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_read(TEXT, INTEGER, UUID) TO service_role;

-- Remove direct invocation of internal trigger/authorization helpers.
REVOKE ALL ON FUNCTION public.is_trusted_user_context(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_task_ownership_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_milestone_goal_ownership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_focus_task_ownership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_request_idempotency_updated_at() FROM PUBLIC, anon, authenticated;

-- Re-state the intended RPC boundary explicitly after all historical migrations.
REVOKE ALL ON FUNCTION public.create_task_with_subtasks(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_with_subtasks(UUID, JSONB, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_task_with_subtasks(UUID, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_with_subtasks(UUID, TEXT, JSONB, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_goal_with_milestones(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_goal_with_milestones(UUID, JSONB, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.toggle_goal_milestone_atomic(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_goal_milestone_atomic(UUID, UUID, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.award_xp_atomic(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_xp_atomic(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_user_data_atomic(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data_atomic(UUID, UUID) TO service_role;

-- Disable any legacy arbitrary-SQL helper that may exist from an older install.
DO $$
BEGIN
  IF to_regprocedure('public.exec_sql(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated;
  END IF;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.exec_sql(jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.exec_sql(jsonb) FROM PUBLIC, anon, authenticated;
  END IF;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON SCHEMA public IS 'RiseOS final privilege-hardened application schema';

-- Atomic admin broadcast: one transaction, no partial chunks.
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
