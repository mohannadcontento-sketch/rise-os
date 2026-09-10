-- ============================================================
-- 014. Server-side request idempotency / replay protection
-- Run AFTER 013_security_hardening.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.request_idempotency (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key   TEXT NOT NULL,
  request_hash      TEXT NOT NULL,
  route             TEXT NOT NULL,
  method            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
  response_status   INTEGER,
  response_body     TEXT,
  response_headers  JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  processing_until  TIMESTAMPTZ,
  CONSTRAINT request_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_request_idempotency_expires
  ON public.request_idempotency(expires_at);

CREATE INDEX IF NOT EXISTS idx_request_idempotency_user_created
  ON public.request_idempotency(user_id, created_at DESC);

ALTER TABLE public.request_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "request_idempotency_none" ON public.request_idempotency;
CREATE POLICY "request_idempotency_none" ON public.request_idempotency
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.request_idempotency FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.request_idempotency TO service_role;

-- Keep updated_at correct for any future direct maintenance.
CREATE OR REPLACE FUNCTION public.set_request_idempotency_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_request_idempotency_updated_at ON public.request_idempotency;
CREATE TRIGGER trg_request_idempotency_updated_at
BEFORE UPDATE ON public.request_idempotency
FOR EACH ROW
EXECUTE FUNCTION public.set_request_idempotency_updated_at();

-- Parent ownership hardening for task foreign references.
CREATE OR REPLACE FUNCTION public.validate_task_ownership_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'project_id does not belong to task owner';
    END IF;
  END IF;

  IF NEW.depends_on IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = NEW.depends_on AND t.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'depends_on task does not belong to task owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_task_ownership_links ON public.tasks;
CREATE TRIGGER trg_validate_task_ownership_links
BEFORE INSERT OR UPDATE OF user_id, project_id, depends_on ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.validate_task_ownership_links();

-- Ownership hardening for goals -> milestones (parent FK already exists;
-- this trigger blocks accidental future schema changes from re-parenting).
CREATE OR REPLACE FUNCTION public.validate_milestone_goal_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.goals g WHERE g.id = NEW.goal_id) THEN
    RAISE EXCEPTION 'goal_id must reference an existing goal';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_milestone_goal_ownership ON public.milestones;
CREATE TRIGGER trg_validate_milestone_goal_ownership
BEFORE INSERT OR UPDATE OF goal_id ON public.milestones
FOR EACH ROW
EXECUTE FUNCTION public.validate_milestone_goal_ownership();

-- ============================================================
-- 014b. Singleton ownership + atomic XP awarding
-- ============================================================

-- Budget/savings config are logical singletons per user. Keep the newest
-- row before adding the partial unique index, so an old duplicated dataset
-- does not make the migration fail.
DELETE FROM public.knowledge_items k
USING public.knowledge_items newer
WHERE k.user_id = newer.user_id
  AND k.type = newer.type
  AND k.type IN ('budget-config', 'savings-goal')
  AND (
    COALESCE(k.updated_at, k.created_at) < COALESCE(newer.updated_at, newer.created_at)
    OR (
      COALESCE(k.updated_at, k.created_at) = COALESCE(newer.updated_at, newer.created_at)
      AND k.id < newer.id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_items_user_singleton_config_unique
  ON public.knowledge_items(user_id, type)
  WHERE type IN ('budget-config', 'savings-goal');

-- The Supabase schema did not previously persist the local streak anchor.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_date TEXT;

-- Atomic XP award. The caller must be the same authenticated profile.
-- Dedupe insert + XP/level/streak update happen in one PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.award_xp_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_dedupe_key TEXT DEFAULT NULL,
  p_activity_date TEXT DEFAULT NULL
)
RETURNS TABLE(
  xp INTEGER,
  level INTEGER,
  leveled BOOLEAN,
  duplicate BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user public.profiles%ROWTYPE;
  v_required INTEGER;
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_leveled BOOLEAN := false;
  v_date TEXT := COALESCE(p_activity_date, to_char((now() AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD'));
  v_yesterday TEXT := to_char(((v_date::date) - INTERVAL '1 day')::date, 'YYYY-MM-DD');
  v_streak INTEGER;
  v_longest INTEGER;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_user_id THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  ELSIF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 300 THEN
    RAISE EXCEPTION 'invalid XP amount';
  END IF;
  IF p_reason IS NULL OR length(p_reason) > 120 THEN
    RAISE EXCEPTION 'invalid XP reason';
  END IF;
  IF p_dedupe_key IS NOT NULL AND length(p_dedupe_key) > 200 THEN
    RAISE EXCEPTION 'invalid dedupe key';
  END IF;

  -- Lock the profile for the whole operation to prevent lost-update races.
  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF p_dedupe_key IS NOT NULL THEN
    BEGIN
      INSERT INTO public.xp_awards(user_id, reason, dedupe_key, amount)
      VALUES (p_user_id, p_reason, p_dedupe_key, p_amount);
    EXCEPTION WHEN unique_violation THEN
      RETURN QUERY SELECT v_user.xp, v_user.level, false, true;
      RETURN;
    END;
  END IF;

  v_new_xp := COALESCE(v_user.xp, 0) + p_amount;
  v_new_level := GREATEST(COALESCE(v_user.level, 1), 1);
  v_required := floor(100 * power(1.35, v_new_level - 1));

  WHILE v_new_xp >= v_required LOOP
    v_new_xp := v_new_xp - v_required;
    v_new_level := v_new_level + 1;
    v_required := floor(100 * power(1.35, v_new_level - 1));
    v_leveled := true;
  END LOOP;

  v_streak := COALESCE(v_user.streak, 0);
  IF COALESCE(v_user.last_active_date, '') <> v_date THEN
    IF COALESCE(v_user.last_active_date, '') = v_yesterday THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
  END IF;
  v_longest := GREATEST(v_streak, COALESCE(v_user.longest_streak, 0));

  UPDATE public.profiles
  SET xp = v_new_xp,
      level = v_new_level,
      xp_to_next_level = v_required,
      streak = v_streak,
      longest_streak = v_longest,
      last_active_date = v_date,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN QUERY SELECT v_new_xp, v_new_level, v_leveled, false;
END;
$$;

REVOKE ALL ON FUNCTION public.award_xp_atomic(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp_atomic(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- Do not expose XP award records to the service's normal authenticated client
-- except via the RPC above; the existing own-row SELECT/INSERT policies remain
-- compatible with the older route if a rollback is ever necessary.

-- Atomic full-user data wipe. It intentionally keeps the auth/profile row,
-- but removes all personal content and resets usage counters in one transaction.
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
  v_table TEXT;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Delete child/independent user-owned records first. Tasks/goals then
  -- cascade their subtasks/milestones through the existing FK constraints.
  FOREACH v_table IN ARRAY ARRAY[
    'habit_logs', 'habits', 'tasks', 'goals', 'projects', 'journals',
    'focus_sessions', 'health_logs', 'finance_records', 'books',
    'knowledge_items', 'planner_items', 'morning_logs', 'daily_scores',
    'user_achievements', 'notifications', 'work_sessions', 'user_api_keys',
    'xp_awards'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_table)
        USING p_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted := v_deleted + COALESCE(v_count, 0);
    END IF;
  END LOOP;

  IF to_regclass('public.user_settings') IS NOT NULL THEN
    UPDATE public.user_settings
    SET theme = 'system', language = 'ar', wake_up_time = '06:00',
        sleep_time = '22:00', focus_duration = 50, daily_water_goal = 8,
        daily_reading_goal = 30, weekly_exercise_goal = 5,
        notifications = true, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.user_ai_usage') IS NOT NULL THEN
    UPDATE public.user_ai_usage
    SET monthly_used = 0, total_used = 0, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.user_storage') IS NOT NULL THEN
    UPDATE public.user_storage
    SET storage_used = 0, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(UUID) TO authenticated;
