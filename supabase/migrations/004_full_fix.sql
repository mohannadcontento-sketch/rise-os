-- ============================================================
-- RiseOS - شامل يظبط كل حاجة (شغله مرة واحدة)
-- Run in Supabase SQL Editor > New Query
-- This script is IDEMPOTENT: safe to run multiple times
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- PART 1: حذف الجداول المكررة (PascalCase)
-- ═══════════════════════════════════════════════════════════
DROP TABLE IF EXISTS public."SubTask" CASCADE;
DROP TABLE IF EXISTS public."Task" CASCADE;
DROP TABLE IF EXISTS public."Project" CASCADE;
DROP TABLE IF EXISTS public."Goal" CASCADE;
DROP TABLE IF EXISTS public."Milestone" CASCADE;
DROP TABLE IF EXISTS public."HabitLog" CASCADE;
DROP TABLE IF EXISTS public."Habit" CASCADE;
DROP TABLE IF EXISTS public."MorningLog" CASCADE;
DROP TABLE IF EXISTS public."Journal" CASCADE;
DROP TABLE IF EXISTS public."FocusSession" CASCADE;
DROP TABLE IF EXISTS public."HealthLog" CASCADE;
DROP TABLE IF EXISTS public."FinanceRecord" CASCADE;
DROP TABLE IF EXISTS public."Book" CASCADE;
DROP TABLE IF EXISTS public."KnowledgeItem" CASCADE;
DROP TABLE IF EXISTS public."PlannerItem" CASCADE;
DROP TABLE IF EXISTS public."UserAchievement" CASCADE;
DROP TABLE IF EXISTS public."DailyScore" CASCADE;
DROP TABLE IF EXISTS public."UserSettings" CASCADE;
DROP TABLE IF EXISTS public."User" CASCADE;
DROP TABLE IF EXISTS public."UserAIUsage" CASCADE;
DROP TABLE IF EXISTS public."UserStorage" CASCADE;
DROP TABLE IF EXISTS public."UserApiKey" CASCADE;
DROP TABLE IF EXISTS public."AppConfig" CASCADE;

-- ═══════════════════════════════════════════════════════════
-- PART 2: Extension
-- ═══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════
-- PART 3: profiles — إضافة عمود role
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- PART 4: user_settings — إضافة أعمدة جديدة
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'sound_enabled'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN sound_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'sound_volume'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN sound_volume REAL NOT NULL DEFAULT 0.5;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN avatar_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'push_subscription'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN push_subscription JSONB;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- PART 5: إنشاء الجداول الناقصة (لو مش موجودة)
-- ═══════════════════════════════════════════════════════════

-- user_achievements
DO $$ BEGIN
  CREATE TABLE public.user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    badge_icon TEXT NOT NULL,
    badge_desc TEXT NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- daily_scores
DO $$ BEGIN
  CREATE TABLE public.daily_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    morning_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    task_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    habit_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    focus_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    health_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    journal_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- projects
DO $$ BEGIN
  CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#059669',
    icon TEXT,
    progress DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- tasks
DO $$ BEGIN
  CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    label TEXT,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    due_date TEXT,
    due_time TEXT,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    recurring_pattern TEXT,
    estimated_min INT,
    xp_reward INT NOT NULL DEFAULT 10,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    depends_on UUID,
    "order" INT NOT NULL DEFAULT 0
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- subtasks
DO $$ BEGIN
  CREATE TABLE public.subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    "order" INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- goals
DO $$ BEGIN
  CREATE TABLE public.goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    vision TEXT,
    "why" TEXT,
    type TEXT NOT NULL DEFAULT 'quarterly',
    progress DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    deadline TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- milestones
DO $$ BEGIN
  CREATE TABLE public.milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    "order" INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- habits
DO $$ BEGIN
  CREATE TABLE public.habits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT NOT NULL DEFAULT '#059669',
    frequency TEXT NOT NULL DEFAULT 'daily',
    target_count INT NOT NULL DEFAULT 1,
    reminder_time TEXT,
    xp_reward INT NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- habit_logs
DO $$ BEGIN
  CREATE TABLE public.habit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- morning_logs
DO $$ BEGIN
  CREATE TABLE public.morning_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    completed_items TEXT NOT NULL DEFAULT '[]',
    total_items INT NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- journals
DO $$ BEGIN
  CREATE TABLE public.journals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    gratitude TEXT,
    wins TEXT,
    challenges TEXT,
    mood INT,
    energy INT,
    ideas TEXT,
    tomorrow_plan TEXT,
    tags TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- focus_sessions
DO $$ BEGIN
  CREATE TABLE public.focus_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    duration INT NOT NULL,
    actual_min INT NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'pomodoro',
    notes TEXT,
    task_id UUID,
    completed BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- health_logs
DO $$ BEGIN
  CREATE TABLE public.health_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    sleep_hours DOUBLE PRECISION,
    sleep_quality INT,
    water_glasses INT,
    steps INT,
    calories INT,
    weight DOUBLE PRECISION,
    mood INT,
    energy INT,
    exercise_type TEXT,
    exercise_min INT,
    exercise_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- finance_records
DO $$ BEGIN
  CREATE TABLE public.finance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    category TEXT,
    description TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    date TEXT NOT NULL,
    recurring BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- books
DO $$ BEGIN
  CREATE TABLE public.books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT,
    type TEXT NOT NULL DEFAULT 'book',
    status TEXT NOT NULL DEFAULT 'reading',
    current_page INT NOT NULL DEFAULT 0,
    total_pages INT,
    notes TEXT,
    highlights TEXT,
    favorite_quote TEXT,
    rating INT,
    cover_url TEXT,
    progress DOUBLE PRECISION NOT NULL DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- knowledge_items
DO $$ BEGIN
  CREATE TABLE public.knowledge_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'note',
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    folder TEXT,
    tags TEXT,
    source TEXT,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- planner_items
DO $$ BEGIN
  CREATE TABLE public.planner_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    section TEXT NOT NULL,
    time TEXT,
    title TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    "order" INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- user_ai_usage
DO $$ BEGIN
  CREATE TABLE public.user_ai_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    monthly_used INT NOT NULL DEFAULT 0,
    monthly_limit INT NOT NULL DEFAULT 100,
    total_used INT NOT NULL DEFAULT 0,
    month TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- user_storage
DO $$ BEGIN
  CREATE TABLE public.user_storage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    supabase_id TEXT,
    email TEXT,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    storage_used INT NOT NULL DEFAULT 0,
    storage_limit INT NOT NULL DEFAULT 10485760,
    ai_limit INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- user_api_keys
DO $$ BEGIN
  CREATE TABLE public.user_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'API Key',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- app_config
DO $$ BEGIN
  CREATE TABLE public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- PART 6: notifications (جدول جديد)
-- ═══════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    type TEXT NOT NULL DEFAULT 'info',
    icon TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, "read") WHERE NOT "read";

-- ═══════════════════════════════════════════════════════════
-- PART 7: Trigger — updated_at
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
    AND column_name = 'updated_at'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    ', tbl, tbl);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- PART 8: Trigger — auto-create profile on signup
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- فقط الأعمدة المضمونة وجودها (role و avatar ليهم DEFAULT)
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- حذف التريجر القديم اللي كان بيشتغل على profiles عشان handle_new_user شامل
DROP TRIGGER IF EXISTS on_profile_created_settings ON public.profiles;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════
-- PART 9: RLS — تفعيل على كل الجداول
-- ═══════════════════════════════════════════════════════════
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
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- PART 10: RLS Policies — حذف القديم وإنشاء جديد
-- ═══════════════════════════════════════════════════════════

-- profiles
DROP POLICY IF EXISTS "Profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles admin select all" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: select own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: update own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: insert own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: admin select all" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- user_settings
DROP POLICY IF EXISTS "Settings own" ON public.user_settings;
DROP POLICY IF EXISTS "Settings: own" ON public.user_settings;
CREATE POLICY "settings_all" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

-- user_achievements
DROP POLICY IF EXISTS "Achievements own" ON public.user_achievements;
DROP POLICY IF EXISTS "Achievements: own" ON public.user_achievements;
CREATE POLICY "achievements_all" ON public.user_achievements FOR ALL USING (auth.uid() = user_id);

-- daily_scores
DROP POLICY IF EXISTS "Scores own" ON public.daily_scores;
DROP POLICY IF EXISTS "Scores: own" ON public.daily_scores;
CREATE POLICY "scores_all" ON public.daily_scores FOR ALL USING (auth.uid() = user_id);

-- projects
DROP POLICY IF EXISTS "Projects own" ON public.projects;
DROP POLICY IF EXISTS "Projects: own" ON public.projects;
CREATE POLICY "projects_all" ON public.projects FOR ALL USING (auth.uid() = user_id);

-- tasks
DROP POLICY IF EXISTS "Tasks own" ON public.tasks;
DROP POLICY IF EXISTS "Tasks: own" ON public.tasks;
CREATE POLICY "tasks_all" ON public.tasks FOR ALL USING (auth.uid() = user_id);

-- subtasks
DROP POLICY IF EXISTS "Subtasks own" ON public.subtasks;
DROP POLICY IF EXISTS "Subtasks: own" ON public.subtasks;
CREATE POLICY "subtasks_all" ON public.subtasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
);

-- goals
DROP POLICY IF EXISTS "Goals own" ON public.goals;
DROP POLICY IF EXISTS "Goals: own" ON public.goals;
CREATE POLICY "goals_all" ON public.goals FOR ALL USING (auth.uid() = user_id);

-- milestones
DROP POLICY IF EXISTS "Milestones own" ON public.milestones;
DROP POLICY IF EXISTS "Milestones: own" ON public.milestones;
CREATE POLICY "milestones_all" ON public.milestones FOR ALL USING (
  EXISTS (SELECT 1 FROM public.goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
);

-- habits
DROP POLICY IF EXISTS "Habits own" ON public.habits;
DROP POLICY IF EXISTS "Habits: own" ON public.habits;
CREATE POLICY "habits_all" ON public.habits FOR ALL USING (auth.uid() = user_id);

-- habit_logs
DROP POLICY IF EXISTS "HabitLogs own" ON public.habit_logs;
DROP POLICY IF EXISTS "HabitLogs: own" ON public.habit_logs;
CREATE POLICY "habit_logs_all" ON public.habit_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.habits WHERE habits.id = habit_logs.habit_id AND habits.user_id = auth.uid())
);

-- morning_logs
DROP POLICY IF EXISTS "MorningLogs own" ON public.morning_logs;
DROP POLICY IF EXISTS "MorningLogs: own" ON public.morning_logs;
CREATE POLICY "morning_logs_all" ON public.morning_logs FOR ALL USING (auth.uid() = user_id);

-- journals
DROP POLICY IF EXISTS "Journals own" ON public.journals;
DROP POLICY IF EXISTS "Journals: own" ON public.journals;
CREATE POLICY "journals_all" ON public.journals FOR ALL USING (auth.uid() = user_id);

-- focus_sessions
DROP POLICY IF EXISTS "FocusSessions own" ON public.focus_sessions;
DROP POLICY IF EXISTS "FocusSessions: own" ON public.focus_sessions;
CREATE POLICY "focus_sessions_all" ON public.focus_sessions FOR ALL USING (auth.uid() = user_id);

-- health_logs
DROP POLICY IF EXISTS "HealthLogs own" ON public.health_logs;
DROP POLICY IF EXISTS "HealthLogs: own" ON public.health_logs;
CREATE POLICY "health_logs_all" ON public.health_logs FOR ALL USING (auth.uid() = user_id);

-- finance_records
DROP POLICY IF EXISTS "FinanceRecords own" ON public.finance_records;
DROP POLICY IF EXISTS "FinanceRecords: own" ON public.finance_records;
CREATE POLICY "finance_records_all" ON public.finance_records FOR ALL USING (auth.uid() = user_id);

-- books
DROP POLICY IF EXISTS "Books own" ON public.books;
DROP POLICY IF EXISTS "Books: own" ON public.books;
CREATE POLICY "books_all" ON public.books FOR ALL USING (auth.uid() = user_id);

-- knowledge_items
DROP POLICY IF EXISTS "KnowledgeItems own" ON public.knowledge_items;
DROP POLICY IF EXISTS "KnowledgeItems: own" ON public.knowledge_items;
CREATE POLICY "knowledge_items_all" ON public.knowledge_items FOR ALL USING (auth.uid() = user_id);

-- planner_items
DROP POLICY IF EXISTS "PlannerItems own" ON public.planner_items;
DROP POLICY IF EXISTS "PlannerItems: own" ON public.planner_items;
CREATE POLICY "planner_items_all" ON public.planner_items FOR ALL USING (auth.uid() = user_id);

-- user_ai_usage
DROP POLICY IF EXISTS "AIUsage own" ON public.user_ai_usage;
DROP POLICY IF EXISTS "AIUsage: own" ON public.user_ai_usage;
CREATE POLICY "user_ai_usage_all" ON public.user_ai_usage FOR ALL USING (auth.uid() = user_id);

-- user_storage
DROP POLICY IF EXISTS "Storage own" ON public.user_storage;
DROP POLICY IF EXISTS "Storage: own" ON public.user_storage;
CREATE POLICY "user_storage_all" ON public.user_storage FOR ALL USING (auth.uid() = user_id);

-- user_api_keys
DROP POLICY IF EXISTS "APIKeys own" ON public.user_api_keys;
DROP POLICY IF EXISTS "APIKeys: own" ON public.user_api_keys;
CREATE POLICY "user_api_keys_all" ON public.user_api_keys FOR ALL USING (auth.uid() = user_id);

-- notifications
DROP POLICY IF EXISTS "Notifications: own select" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own insert" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own update" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own delete" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- app_config
DROP POLICY IF EXISTS "AppConfig select" ON public.app_config;
DROP POLICY IF EXISTS "AppConfig: select" ON public.app_config;
DROP POLICY IF EXISTS "AppConfig: admin update" ON public.app_config;
CREATE POLICY "app_config_select" ON public.app_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "app_config_admin_update" ON public.app_config FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══════════════════════════════════════════════════════════
-- PART 11: Indexes
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON public.tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_habits_user ON public.habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON public.habit_logs(habit_id, date);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON public.focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_scores_user_date ON public.daily_scores(user_id, date);
CREATE INDEX IF NOT EXISTS idx_journals_user_date ON public.journals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_planner_items_user_date ON public.planner_items(user_id, date);
CREATE INDEX IF NOT EXISTS idx_health_logs_user_date ON public.health_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_finance_records_user ON public.finance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON public.goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);

-- ═══════════════════════════════════════════════════════════
-- PART 12: تعيين أدمن (غير الإيميل ده لإيميلك)
-- ═══════════════════════════════════════════════════════════
-- ⚠️ غيّر الإيميل ده لإيميلك الصح
UPDATE public.profiles SET role = 'admin' WHERE email = 'mohannadcontento@gmail.com';

-- ✅ تم! كل حاجة جاهزة
-- ============================================================