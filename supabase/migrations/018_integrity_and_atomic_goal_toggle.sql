-- ============================================================
-- 018. Data integrity constraints + atomic goal milestone toggle
-- Run AFTER 017_idempotency_lease_and_admin_fix.sql.
-- ============================================================

-- The natural daily-record unique constraints already exist from migration 005.
-- This migration only adds the missing achievement uniqueness and new cross-table guard.
DO $$
BEGIN
  IF to_regclass('public.user_achievements') IS NOT NULL THEN
    DELETE FROM public.user_achievements a
    USING public.user_achievements newer
    WHERE a.user_id = newer.user_id
      AND a.badge_id = newer.badge_id
      AND a.id <> newer.id
      AND a.earned_at < newer.earned_at;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_achievements_user_badge
  ON public.user_achievements(user_id, badge_id);

-- Prevent a focus session from referencing a task owned by another user.
CREATE OR REPLACE FUNCTION public.validate_focus_task_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = NEW.task_id AND t.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'task does not belong to focus session owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_focus_task_ownership ON public.focus_sessions;
CREATE TRIGGER trg_validate_focus_task_ownership
BEFORE INSERT OR UPDATE OF task_id, user_id
ON public.focus_sessions
FOR EACH ROW
EXECUTE FUNCTION public.validate_focus_task_ownership();

-- Atomic milestone toggle + parent-goal progress recalculation.
CREATE OR REPLACE FUNCTION public.toggle_goal_milestone_atomic(
  p_user_id UUID,
  p_milestone_id UUID,
  p_completed BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_id UUID;
  v_completed_count INTEGER;
  v_total_count INTEGER;
  v_progress INTEGER;
  v_milestone JSONB;
BEGIN
  IF NOT public.is_trusted_user_context(p_user_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT goal_id INTO v_goal_id
  FROM public.milestones m
  JOIN public.goals g ON g.id = m.goal_id AND g.user_id = p_user_id
  WHERE m.id = p_milestone_id
  FOR UPDATE;

  IF v_goal_id IS NULL THEN
    RAISE EXCEPTION 'milestone not found or not owned';
  END IF;

  UPDATE public.milestones
  SET completed = COALESCE(p_completed, false)
  WHERE id = p_milestone_id
  RETURNING to_jsonb(milestones.*) INTO v_milestone;

  SELECT COUNT(*)::INTEGER,
         COUNT(*) FILTER (WHERE completed)::INTEGER
  INTO v_total_count, v_completed_count
  FROM public.milestones
  WHERE goal_id = v_goal_id;

  v_progress := CASE
    WHEN v_total_count > 0 THEN ROUND((v_completed_count::NUMERIC / v_total_count::NUMERIC) * 100)::INTEGER
    ELSE 0
  END;

  UPDATE public.goals
  SET progress = v_progress,
      status = CASE WHEN v_progress = 100 THEN 'done' ELSE 'active' END,
      updated_at = now()
  WHERE id = v_goal_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'milestone', v_milestone,
    'goal_id', v_goal_id,
    'progress', v_progress,
    'status', CASE WHEN v_progress = 100 THEN 'done' ELSE 'active' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_goal_milestone_atomic(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_goal_milestone_atomic(UUID, UUID, BOOLEAN) TO authenticated, service_role;

-- Atomic admin-side deletion of a user's application data.
-- Child tables without user_id (subtasks, milestones, habit_logs) are deleted
-- through their parent foreign keys, so this function cannot fail on a missing column.
CREATE OR REPLACE FUNCTION public.admin_delete_user_data_atomic(
  p_admin_user_id UUID,
  p_target_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role TEXT;
  v_deleted INTEGER := 0;
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_user_id THEN
    RAISE EXCEPTION 'identity mismatch';
  END IF;

  SELECT role INTO v_admin_role FROM public.profiles WHERE id = p_admin_user_id;
  IF lower(trim(COALESCE(v_admin_role, ''))) NOT IN ('admin', 'ادمن') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_admin_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'cannot delete self';
  END IF;

  IF to_regclass('public.habit_logs') IS NOT NULL THEN
    DELETE FROM public.habit_logs h
    USING public.habits hb
    WHERE h.habit_id = hb.id AND hb.user_id = p_target_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_count, 0);
  END IF;

  -- Child rows cascade from these parent deletes.

  IF to_regclass('public.habits') IS NOT NULL THEN DELETE FROM public.habits WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN DELETE FROM public.tasks WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.goals') IS NOT NULL THEN DELETE FROM public.goals WHERE user_id = p_target_user_id; END IF;

  IF to_regclass('public.projects') IS NOT NULL THEN DELETE FROM public.projects WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.journals') IS NOT NULL THEN DELETE FROM public.journals WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.focus_sessions') IS NOT NULL THEN DELETE FROM public.focus_sessions WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.health_logs') IS NOT NULL THEN DELETE FROM public.health_logs WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.finance_records') IS NOT NULL THEN DELETE FROM public.finance_records WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.books') IS NOT NULL THEN DELETE FROM public.books WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.knowledge_items') IS NOT NULL THEN DELETE FROM public.knowledge_items WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.planner_items') IS NOT NULL THEN DELETE FROM public.planner_items WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.morning_logs') IS NOT NULL THEN DELETE FROM public.morning_logs WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.daily_scores') IS NOT NULL THEN DELETE FROM public.daily_scores WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.user_achievements') IS NOT NULL THEN DELETE FROM public.user_achievements WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN DELETE FROM public.notifications WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.user_ai_usage') IS NOT NULL THEN DELETE FROM public.user_ai_usage WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.user_storage') IS NOT NULL THEN DELETE FROM public.user_storage WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.user_api_keys') IS NOT NULL THEN DELETE FROM public.user_api_keys WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.user_settings') IS NOT NULL THEN DELETE FROM public.user_settings WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.work_sessions') IS NOT NULL THEN DELETE FROM public.work_sessions WHERE user_id = p_target_user_id; END IF;
  IF to_regclass('public.xp_awards') IS NOT NULL THEN DELETE FROM public.xp_awards WHERE user_id = p_target_user_id; END IF;

  DELETE FROM public.profiles WHERE id = p_target_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + COALESCE(v_count, 0);

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_data_atomic(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data_atomic(UUID, UUID) TO service_role;

-- Correct the original self-service wipe function from migration 014.
CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_deleted INTEGER := 0;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF to_regclass('public.habit_logs') IS NOT NULL THEN
    DELETE FROM public.habit_logs h
    USING public.habits hb
    WHERE h.habit_id = hb.id AND hb.user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_count, 0);
  END IF;

  IF to_regclass('public.habits') IS NOT NULL THEN DELETE FROM public.habits WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN DELETE FROM public.tasks WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.goals') IS NOT NULL THEN DELETE FROM public.goals WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN DELETE FROM public.projects WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.journals') IS NOT NULL THEN DELETE FROM public.journals WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.focus_sessions') IS NOT NULL THEN DELETE FROM public.focus_sessions WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.health_logs') IS NOT NULL THEN DELETE FROM public.health_logs WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.finance_records') IS NOT NULL THEN DELETE FROM public.finance_records WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.books') IS NOT NULL THEN DELETE FROM public.books WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.knowledge_items') IS NOT NULL THEN DELETE FROM public.knowledge_items WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.planner_items') IS NOT NULL THEN DELETE FROM public.planner_items WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.morning_logs') IS NOT NULL THEN DELETE FROM public.morning_logs WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.daily_scores') IS NOT NULL THEN DELETE FROM public.daily_scores WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.user_achievements') IS NOT NULL THEN DELETE FROM public.user_achievements WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN DELETE FROM public.notifications WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.user_ai_usage') IS NOT NULL THEN DELETE FROM public.user_ai_usage WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.user_storage') IS NOT NULL THEN DELETE FROM public.user_storage WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.user_api_keys') IS NOT NULL THEN DELETE FROM public.user_api_keys WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.user_settings') IS NOT NULL THEN DELETE FROM public.user_settings WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.work_sessions') IS NOT NULL THEN DELETE FROM public.work_sessions WHERE user_id = p_user_id; END IF;
  IF to_regclass('public.xp_awards') IS NOT NULL THEN DELETE FROM public.xp_awards WHERE user_id = p_user_id; END IF;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(UUID) TO authenticated;

-- admin_read is server-mediated; ordinary authenticated clients do not need
-- direct EXECUTE even though the function performs an admin role check.
REVOKE EXECUTE ON FUNCTION public.admin_read(TEXT, INTEGER, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_read(TEXT, INTEGER, UUID) TO service_role;
