-- ============================================================
-- RiseOS — Corrective fix: composite RPC functions (uuid casts)
-- ============================================================
-- WHY: migrations 016/018 defined the atomic composite functions with
-- `gen_random_uuid()::text` COALESCE patterns and raw TEXT expressions
-- being inserted into UUID columns → runtime error 42804
--   "column \"id\" is of type uuid but expression is of type text"
-- and `uuid = text` comparisons that cannot resolve.
-- These functions were never runtime-tested until now (the audit
-- container could not run the build), and the app previously used
-- plain INSERTs, so the defects surfaced only after the app switched
-- to calling these RPCs.
--
-- FIX: proper ::uuid casts. Logic, names, signatures, security
-- attributes, and grants are UNCHANGED. Safe to run on live data:
-- no tables are touched, only function definitions are replaced.
-- Run once in Supabase SQL Editor (any order, idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1. create_task_with_subtasks
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_task_with_subtasks(
  p_user_id UUID,
  p_task JSONB,
  p_subtasks JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
  v_task JSONB;
  v_subtasks JSONB;
BEGIN
  IF NOT public.is_trusted_user_context(p_user_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.tasks (
    id, user_id, title, description, status, priority, label, project_id,
    due_date, due_time, is_recurring, recurring_pattern, estimated_min,
    xp_reward, depends_on, "order"
  )
  VALUES (
    COALESCE(NULLIF(p_task->>'id','')::uuid, gen_random_uuid()),
    p_user_id,
    p_task->>'title',
    p_task->>'description',
    COALESCE(NULLIF(p_task->>'status',''), 'todo'),
    COALESCE(NULLIF(p_task->>'priority',''), 'medium'),
    p_task->>'label',
    NULLIF(p_task->>'project_id','')::uuid,
    p_task->>'due_date',
    p_task->>'due_time',
    COALESCE((p_task->>'is_recurring')::boolean, false),
    p_task->>'recurring_pattern',
    NULLIF(p_task->>'estimated_min','')::integer,
    COALESCE(NULLIF(p_task->>'xp_reward','')::integer, 10),
    NULLIF(p_task->>'depends_on','')::uuid,
    COALESCE(NULLIF(p_task->>'order','')::integer, 0)
  )
  RETURNING to_jsonb(tasks.*), tasks.id INTO v_task, v_task_id;

  IF jsonb_typeof(p_subtasks) = 'array' THEN
    INSERT INTO public.subtasks (id, task_id, title, completed, "order")
    SELECT
      COALESCE(NULLIF(x->>'id','')::uuid, gen_random_uuid()),
      v_task_id,
      x->>'title',
      COALESCE((x->>'completed')::boolean, false),
      COALESCE(NULLIF(x->>'order','')::integer, 0)
    FROM jsonb_array_elements(p_subtasks) AS x;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s."order"), '[]'::jsonb)
  INTO v_subtasks
  FROM public.subtasks s
  WHERE s.task_id = v_task_id;

  RETURN jsonb_build_object('task', v_task, 'subtasks', v_subtasks);
END;
$$;

-- ------------------------------------------------------------
-- 2. update_task_with_subtasks
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_task_with_subtasks(
  p_user_id UUID,
  p_task_id TEXT,
  p_task JSONB,
  p_subtasks JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
  v_task JSONB;
  v_subtasks JSONB;
BEGIN
  IF NOT public.is_trusted_user_context(p_user_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_task_id := p_task_id::uuid;

  UPDATE public.tasks
  SET
    title = COALESCE(p_task->>'title', title),
    description = CASE WHEN p_task ? 'description' THEN p_task->>'description' ELSE description END,
    status = COALESCE(p_task->>'status', status),
    priority = COALESCE(p_task->>'priority', priority),
    label = CASE WHEN p_task ? 'label' THEN p_task->>'label' ELSE label END,
    project_id = CASE WHEN p_task ? 'project_id' THEN NULLIF(p_task->>'project_id','')::uuid ELSE project_id END,
    due_date = CASE WHEN p_task ? 'due_date' THEN p_task->>'due_date' ELSE due_date END,
    due_time = CASE WHEN p_task ? 'due_time' THEN p_task->>'due_time' ELSE due_time END,
    is_recurring = CASE WHEN p_task ? 'is_recurring' THEN (p_task->>'is_recurring')::boolean ELSE is_recurring END,
    recurring_pattern = CASE WHEN p_task ? 'recurring_pattern' THEN p_task->>'recurring_pattern' ELSE recurring_pattern END,
    estimated_min = CASE WHEN p_task ? 'estimated_min' THEN NULLIF(p_task->>'estimated_min','')::integer ELSE estimated_min END,
    xp_reward = CASE WHEN p_task ? 'xp_reward' THEN COALESCE(NULLIF(p_task->>'xp_reward','')::integer, xp_reward) ELSE xp_reward END,
    depends_on = CASE WHEN p_task ? 'depends_on' THEN NULLIF(p_task->>'depends_on','')::uuid ELSE depends_on END,
    "order" = CASE WHEN p_task ? 'order' THEN (p_task->>'order')::integer ELSE "order" END,
    completed_at = CASE
      WHEN p_task->>'status' = 'done' THEN COALESCE(completed_at, now())
      WHEN p_task ? 'status' THEN NULL
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = v_task_id AND user_id = p_user_id
  RETURNING to_jsonb(tasks.*) INTO v_task;

  IF v_task IS NULL THEN RAISE EXCEPTION 'task not found or not owned'; END IF;

  IF p_subtasks IS NOT NULL THEN
    DELETE FROM public.subtasks WHERE task_id = v_task_id;
    IF jsonb_typeof(p_subtasks) = 'array' THEN
      INSERT INTO public.subtasks (id, task_id, title, completed, "order")
      SELECT
        COALESCE(NULLIF(x->>'id','')::uuid, gen_random_uuid()),
        v_task_id,
        x->>'title',
        COALESCE((x->>'completed')::boolean, false),
        COALESCE(NULLIF(x->>'order','')::integer, 0)
      FROM jsonb_array_elements(p_subtasks) AS x;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s."order"), '[]'::jsonb)
  INTO v_subtasks
  FROM public.subtasks s
  WHERE s.task_id = v_task_id;

  RETURN jsonb_build_object('task', v_task, 'subtasks', v_subtasks);
END;
$$;

-- ------------------------------------------------------------
-- 3. create_goal_with_milestones
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_goal_with_milestones(
  p_user_id UUID,
  p_goal JSONB,
  p_milestones JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_id UUID;
  v_goal JSONB;
  v_milestones JSONB;
BEGIN
  IF NOT public.is_trusted_user_context(p_user_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.goals (id, user_id, title, vision, why, type, progress, status, deadline)
  VALUES (
    COALESCE(NULLIF(p_goal->>'id','')::uuid, gen_random_uuid()),
    p_user_id,
    p_goal->>'title', p_goal->>'vision', p_goal->>'why',
    COALESCE(NULLIF(p_goal->>'type',''), 'quarterly'),
    COALESCE(NULLIF(p_goal->>'progress','')::double precision, 0),
    COALESCE(NULLIF(p_goal->>'status',''), 'active'), p_goal->>'deadline'
  )
  RETURNING to_jsonb(goals.*), goals.id INTO v_goal, v_goal_id;

  IF jsonb_typeof(p_milestones) = 'array' THEN
    INSERT INTO public.milestones (id, goal_id, title, completed, "order")
    SELECT
      COALESCE(NULLIF(x->>'id','')::uuid, gen_random_uuid()),
      v_goal_id,
      x->>'title',
      COALESCE((x->>'completed')::boolean, false),
      COALESCE(NULLIF(x->>'order','')::integer, 0)
    FROM jsonb_array_elements(p_milestones) AS x;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m."order"), '[]'::jsonb)
  INTO v_milestones
  FROM public.milestones m
  WHERE m.goal_id = v_goal_id;

  RETURN jsonb_build_object('goal', v_goal, 'milestones', v_milestones);
END;
$$;

-- ------------------------------------------------------------
-- 4. Re-assert the intended grants (unchanged from 016/019)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_task_with_subtasks(UUID, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_task_with_subtasks(UUID, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_goal_with_milestones(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_with_subtasks(UUID, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_task_with_subtasks(UUID, TEXT, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_goal_with_milestones(UUID, JSONB, JSONB) TO authenticated, service_role;
