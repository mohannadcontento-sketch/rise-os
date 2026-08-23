-- ============================================================
-- 009. WORK SESSIONS ("الشغل")
-- Long-form work blocks (hours) distinct from the pomodoro-style
-- Deep Work timer. Tracks planned vs. actual time, breaks taken,
-- linked tasks accomplished, and a computed quality score.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT,
  planned_min     INT NOT NULL,
  active_min      INT NOT NULL DEFAULT 0,
  break_min       INT NOT NULL DEFAULT 0,
  breaks_count    INT NOT NULL DEFAULT 0,
  breaks_log      TEXT,              -- JSON-encoded array of { start, end, min }
  task_ids        TEXT,              -- JSON-encoded array of task IDs completed during the session
  tasks_completed INT NOT NULL DEFAULT 0,
  quality_score   INT,               -- 0-100, computed when the session ends
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active', -- active | paused | completed | cancelled
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_user_id ON public.work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_started_at ON public.work_sessions(started_at);

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own work_sessions" ON public.work_sessions;
CREATE POLICY "Users can view their own work_sessions" ON public.work_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own work_sessions" ON public.work_sessions;
CREATE POLICY "Users can insert their own work_sessions" ON public.work_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own work_sessions" ON public.work_sessions;
CREATE POLICY "Users can update their own work_sessions" ON public.work_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own work_sessions" ON public.work_sessions;
CREATE POLICY "Users can delete their own work_sessions" ON public.work_sessions
  FOR DELETE USING (auth.uid() = user_id);
