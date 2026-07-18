-- ============================================================
-- RiseOS Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES TABLE (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT 'مستخدم',
  email          TEXT NOT NULL,
  avatar         TEXT,
  level          INT NOT NULL DEFAULT 1,
  xp             INT NOT NULL DEFAULT 0,
  xp_to_next_level INT NOT NULL DEFAULT 100,
  streak         INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  total_focus_min INT NOT NULL DEFAULT 0,
  total_tasks_done INT NOT NULL DEFAULT 0,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. USER SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  theme              TEXT NOT NULL DEFAULT 'system',
  language           TEXT NOT NULL DEFAULT 'ar',
  wake_up_time       TEXT NOT NULL DEFAULT '06:00',
  sleep_time         TEXT NOT NULL DEFAULT '22:00',
  focus_duration     INT NOT NULL DEFAULT 50,
  daily_water_goal   INT NOT NULL DEFAULT 8,
  daily_reading_goal INT NOT NULL DEFAULT 30,
  weekly_exercise_goal INT NOT NULL DEFAULT 5,
  notifications      BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create settings when profile is created
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_settings ON public.profiles;
CREATE TRIGGER on_profile_created_settings
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- ============================================================
-- 3. USER ACHIEVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  badge_icon TEXT NOT NULL,
  badge_desc TEXT NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. DAILY SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_scores (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  score          FLOAT NOT NULL DEFAULT 0,
  morning_score  FLOAT NOT NULL DEFAULT 0,
  task_score     FLOAT NOT NULL DEFAULT 0,
  habit_score    FLOAT NOT NULL DEFAULT 0,
  focus_score    FLOAT NOT NULL DEFAULT 0,
  health_score   FLOAT NOT NULL DEFAULT 0,
  journal_score  FLOAT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#059669',
  icon        TEXT,
  progress    FLOAT NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'todo',
  priority          TEXT NOT NULL DEFAULT 'medium',
  label             TEXT,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  due_date          TEXT,
  due_time          TEXT,
  is_recurring      BOOLEAN NOT NULL DEFAULT false,
  recurring_pattern TEXT,
  estimated_min     INT,
  xp_reward         INT NOT NULL DEFAULT 10,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  depends_on        UUID,
  "order"           INT NOT NULL DEFAULT 0
);

-- ============================================================
-- 7. SUBTASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subtasks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT false,
  "order"    INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  vision     TEXT,
  why        TEXT,
  type       TEXT NOT NULL DEFAULT 'quarterly',
  progress   FLOAT NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'active',
  deadline   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. MILESTONES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.milestones (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id    UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT false,
  "order"    INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. HABITS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.habits (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  color         TEXT NOT NULL DEFAULT '#059669',
  frequency     TEXT NOT NULL DEFAULT 'daily',
  target_count  INT NOT NULL DEFAULT 1,
  reminder_time TEXT,
  xp_reward     INT NOT NULL DEFAULT 15,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. HABIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.habit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  habit_id   UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT false,
  count      INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. MORNING LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.morning_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  score           FLOAT NOT NULL DEFAULT 0,
  completed_items TEXT NOT NULL DEFAULT '[]',
  total_items     INT NOT NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 13. JOURNALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  gratitude     TEXT,
  wins          TEXT,
  challenges    TEXT,
  mood          INT,
  energy        INT,
  ideas         TEXT,
  tomorrow_plan TEXT,
  tags          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 14. FOCUS SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  duration     INT NOT NULL,
  actual_min   INT NOT NULL DEFAULT 0,
  type         TEXT NOT NULL DEFAULT 'pomodoro',
  notes        TEXT,
  task_id      UUID,
  completed    BOOLEAN NOT NULL DEFAULT false,
  started_at   TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 15. HEALTH LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.health_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  sleep_hours    FLOAT,
  sleep_quality  INT,
  water_glasses  INT,
  steps          INT,
  calories       INT,
  weight         FLOAT,
  mood           INT,
  energy         INT,
  exercise_type  TEXT,
  exercise_min   INT,
  exercise_note  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 16. FINANCE RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.finance_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  category    TEXT,
  description TEXT NOT NULL,
  amount      FLOAT NOT NULL,
  date        TEXT NOT NULL,
  recurring   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 17. BOOKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.books (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  author        TEXT,
  type          TEXT NOT NULL DEFAULT 'book',
  status        TEXT NOT NULL DEFAULT 'reading',
  current_page  INT NOT NULL DEFAULT 0,
  total_pages   INT,
  notes         TEXT,
  highlights    TEXT,
  favorite_quote TEXT,
  rating        INT,
  cover_url     TEXT,
  progress      FLOAT NOT NULL DEFAULT 0,
  start_date    TEXT,
  end_date      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 18. KNOWLEDGE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'note',
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  folder      TEXT,
  tags        TEXT,
  source      TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 19. PLANNER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.planner_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  section    TEXT NOT NULL,
  time       TEXT,
  title      TEXT NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT false,
  "order"    INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date, section, "order")
);

-- ============================================================
-- 20. USER AI USAGE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_ai_usage (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  monthly_used   INT NOT NULL DEFAULT 0,
  monthly_limit  INT NOT NULL DEFAULT 100,
  total_used     INT NOT NULL DEFAULT 0,
  month          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 21. USER STORAGE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_storage (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  supabase_id   TEXT,
  email         TEXT,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  storage_used  INT NOT NULL DEFAULT 0,
  storage_limit INT NOT NULL DEFAULT 10485760,
  ai_limit      INT NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 22. APP CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 23. USER API KEYS (for MCP/external access)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT 'API Key',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_habits_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_journals_updated_at
  BEFORE UPDATE ON public.journals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_planner_items_updated_at
  BEFORE UPDATE ON public.planner_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_user_ai_usage_updated_at
  BEFORE UPDATE ON public.user_ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_user_storage_updated_at
  BEFORE UPDATE ON public.user_storage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_app_config_updated_at
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================================
-- RLS (Row Level Security) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.morning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all profiles, update their own
CREATE POLICY "Profiles: users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Profiles: users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Profiles: users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- User Settings
CREATE POLICY "Settings: users can view own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Settings: users can update own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Settings: users can insert own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User Achievements
CREATE POLICY "Achievements: users can view own"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Achievements: users can insert own"
  ON public.user_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Achievements: users can delete own"
  ON public.user_achievements FOR DELETE
  USING (auth.uid() = user_id);

-- Daily Scores
CREATE POLICY "Scores: users can view own"
  ON public.daily_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Scores: users can insert own"
  ON public.daily_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Scores: users can update own"
  ON public.daily_scores FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Scores: users can delete own"
  ON public.daily_scores FOR DELETE
  USING (auth.uid() = user_id);

-- Projects
CREATE POLICY "Projects: users can view own"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Projects: users can insert own"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Projects: users can update own"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Projects: users can delete own"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- Tasks
CREATE POLICY "Tasks: users can view own"
  ON public.tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Tasks: users can insert own"
  ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tasks: users can update own"
  ON public.tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Tasks: users can delete own"
  ON public.tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Subtasks (via task ownership)
CREATE POLICY "Subtasks: users can view own via task"
  ON public.subtasks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "Subtasks: users can insert own via task"
  ON public.subtasks FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "Subtasks: users can update own via task"
  ON public.subtasks FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "Subtasks: users can delete own via task"
  ON public.subtasks FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
  );

-- Goals
CREATE POLICY "Goals: users can view own"
  ON public.goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Goals: users can insert own"
  ON public.goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Goals: users can update own"
  ON public.goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Goals: users can delete own"
  ON public.goals FOR DELETE
  USING (auth.uid() = user_id);

-- Milestones (via goal ownership)
CREATE POLICY "Milestones: users can view own via goal"
  ON public.milestones FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
  );

CREATE POLICY "Milestones: users can insert own via goal"
  ON public.milestones FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
  );

CREATE POLICY "Milestones: users can update own via goal"
  ON public.milestones FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
  );

CREATE POLICY "Milestones: users can delete own via goal"
  ON public.milestones FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
  );

-- Habits
CREATE POLICY "Habits: users can view own"
  ON public.habits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Habits: users can insert own"
  ON public.habits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Habits: users can update own"
  ON public.habits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Habits: users can delete own"
  ON public.habits FOR DELETE
  USING (auth.uid() = user_id);

-- Habit Logs (via habit ownership)
CREATE POLICY "HabitLogs: users can view own via habit"
  ON public.habit_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.habits WHERE habits.id = habit_logs.habit_id AND habits.user_id = auth.uid())
  );

CREATE POLICY "HabitLogs: users can insert own via habit"
  ON public.habit_logs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.habits WHERE habits.id = habit_logs.habit_id AND habits.user_id = auth.uid())
  );

CREATE POLICY "HabitLogs: users can update own via habit"
  ON public.habit_logs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.habits WHERE habits.id = habit_logs.habit_id AND habits.user_id = auth.uid())
  );

CREATE POLICY "HabitLogs: users can delete own via habit"
  ON public.habit_logs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.habits WHERE habits.id = habit_logs.habit_id AND habits.user_id = auth.uid())
  );

-- Morning Logs
CREATE POLICY "MorningLogs: users can view own"
  ON public.morning_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "MorningLogs: users can insert own"
  ON public.morning_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "MorningLogs: users can update own"
  ON public.morning_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "MorningLogs: users can delete own"
  ON public.morning_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Journals
CREATE POLICY "Journals: users can view own"
  ON public.journals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Journals: users can insert own"
  ON public.journals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Journals: users can update own"
  ON public.journals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Journals: users can delete own"
  ON public.journals FOR DELETE
  USING (auth.uid() = user_id);

-- Focus Sessions
CREATE POLICY "FocusSessions: users can view own"
  ON public.focus_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "FocusSessions: users can insert own"
  ON public.focus_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "FocusSessions: users can update own"
  ON public.focus_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "FocusSessions: users can delete own"
  ON public.focus_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Health Logs
CREATE POLICY "HealthLogs: users can view own"
  ON public.health_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "HealthLogs: users can insert own"
  ON public.health_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "HealthLogs: users can update own"
  ON public.health_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "HealthLogs: users can delete own"
  ON public.health_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Finance Records
CREATE POLICY "FinanceRecords: users can view own"
  ON public.finance_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "FinanceRecords: users can insert own"
  ON public.finance_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "FinanceRecords: users can update own"
  ON public.finance_records FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "FinanceRecords: users can delete own"
  ON public.finance_records FOR DELETE
  USING (auth.uid() = user_id);

-- Books
CREATE POLICY "Books: users can view own"
  ON public.books FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Books: users can insert own"
  ON public.books FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Books: users can update own"
  ON public.books FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Books: users can delete own"
  ON public.books FOR DELETE
  USING (auth.uid() = user_id);

-- Knowledge Items
CREATE POLICY "KnowledgeItems: users can view own"
  ON public.knowledge_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "KnowledgeItems: users can insert own"
  ON public.knowledge_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "KnowledgeItems: users can update own"
  ON public.knowledge_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "KnowledgeItems: users can delete own"
  ON public.knowledge_items FOR DELETE
  USING (auth.uid() = user_id);

-- Planner Items
CREATE POLICY "PlannerItems: users can view own"
  ON public.planner_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "PlannerItems: users can insert own"
  ON public.planner_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "PlannerItems: users can update own"
  ON public.planner_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "PlannerItems: users can delete own"
  ON public.planner_items FOR DELETE
  USING (auth.uid() = user_id);

-- User AI Usage
CREATE POLICY "AIUsage: users can view own"
  ON public.user_ai_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "AIUsage: users can insert own"
  ON public.user_ai_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "AIUsage: users can update own"
  ON public.user_ai_usage FOR UPDATE
  USING (auth.uid() = user_id);

-- User Storage
CREATE POLICY "UserStorage: users can view own"
  ON public.user_storage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "UserStorage: users can insert own"
  ON public.user_storage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "UserStorage: users can update own"
  ON public.user_storage FOR UPDATE
  USING (auth.uid() = user_id);

-- App Config: readable by all, writable by none (server only via service_role)
CREATE POLICY "AppConfig: anyone can read"
  ON public.app_config FOR SELECT
  USING (true);

-- User API Keys
CREATE POLICY "APIKeys: users can view own"
  ON public.user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "APIKeys: users can insert own"
  ON public.user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "APIKeys: users can update own"
  ON public.user_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "APIKeys: users can delete own"
  ON public.user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_id ON public.habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_id ON public.habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON public.habit_logs(date);
CREATE INDEX IF NOT EXISTS idx_daily_scores_user_date ON public.daily_scores(user_id, date);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_journals_user_date ON public.journals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_id ON public.focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_user_date ON public.health_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_finance_records_user_id ON public.finance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_id ON public.knowledge_items(user_id);
CREATE INDEX IF NOT EXISTS idx_planner_items_user_date ON public.planner_items(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_key ON public.user_api_keys(key);
CREATE INDEX IF NOT EXISTS idx_morning_logs_user_date ON public.morning_logs(user_id, date);