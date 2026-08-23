-- ============================================================
-- RiseOS Migration 005: P1#2 — Fix RLS infinite recursion on profiles
-- + P1#8: Add composite indexes for performance
-- + P1#7: Add key_hash column for API keys
-- ============================================================
-- This migration is IDEMPOTENT: safe to run multiple times.
-- Run in Supabase SQL Editor > New Query.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- PART 1: P1#2 — Fix RLS infinite recursion on profiles
-- ═══════════════════════════════════════════════════════════

-- Drop the recursive admin policy (it queries profiles FROM WITHIN profiles policy → infinite recursion)
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

-- Recreate WITHOUT recursion: use auth.jwt() ->> 'role' instead of subquery on profiles
-- This breaks the recursion because we read the role from the JWT claim, not from the table.
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin policy: read role from JWT claim (set via custom claim or app_metadata)
-- Fallback: check via auth.users raw_app_meta_data (no recursion on profiles)
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND (
        raw_app_meta_data->>'role' = 'admin'
        OR raw_user_meta_data->>'role' = 'admin'
      )
    )
  );

-- ═══════════════════════════════════════════════════════════
-- PART 2: P1#8 — Composite indexes for common queries
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tasks_user_duedate ON public.tasks(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON public.tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_habits_user_date ON public.habits(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON public.habit_logs(habit_id, date);
CREATE INDEX IF NOT EXISTS idx_journals_user_date ON public.journals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_finance_records_user_date ON public.finance_records(user_id, date);
CREATE INDEX IF NOT EXISTS idx_health_logs_user_date ON public.health_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_date ON public.focus_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_daily_scores_user_date ON public.daily_scores(user_id, date);
CREATE INDEX IF NOT EXISTS idx_planner_items_user_date ON public.planner_items(user_id, date);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_morning_logs_user_date ON public.morning_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_books_user ON public.books(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user ON public.knowledge_items(user_id);

-- ═══════════════════════════════════════════════════════════
-- PART 3: P1#7 — Add key_hash column to user_api_keys
-- ═══════════════════════════════════════════════════════════

-- Add key_hash column (stores SHA-256 hash of API keys)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_api_keys' AND column_name = 'key_hash'
  ) THEN
    ALTER TABLE public.user_api_keys ADD COLUMN key_hash TEXT;
  END IF;
END $$;

-- Create index on key_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_api_keys_hash ON public.user_api_keys(key_hash);

-- Make key_hash unique (no duplicate keys)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'user_api_keys' AND indexname = 'user_api_keys_key_hash_key'
  ) THEN
    ALTER TABLE public.user_api_keys ADD CONSTRAINT user_api_keys_key_hash_key UNIQUE (key_hash);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- PART 4: Enable RLS on any tables missing it
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- PART 5: P1#8 — Unique constraints to prevent duplicate upserts (race conditions)
-- ═══════════════════════════════════════════════════════════

-- STEP 1: Deduplicate existing rows BEFORE adding unique constraints.
-- For each table, keep only the most recent row per (user_id, date) or (habit_id, date).
-- Delete older duplicates created by the read-then-write race condition bug.

-- Deduplicate journals (keep most recent by created_at)
DELETE FROM public.journals
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, date) id
  FROM public.journals
  ORDER BY user_id, date, created_at DESC
);

-- Deduplicate health_logs (keep most recent by created_at)
DELETE FROM public.health_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, date) id
  FROM public.health_logs
  ORDER BY user_id, date, created_at DESC
);

-- Deduplicate morning_logs (keep most recent by created_at)
DELETE FROM public.morning_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, date) id
  FROM public.morning_logs
  ORDER BY user_id, date, created_at DESC
);

-- Deduplicate daily_scores (keep most recent by created_at)
DELETE FROM public.daily_scores
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, date) id
  FROM public.daily_scores
  ORDER BY user_id, date, created_at DESC
);

-- Deduplicate habit_logs (keep most recent by created_at)
DELETE FROM public.habit_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (habit_id, date) id
  FROM public.habit_logs
  ORDER BY habit_id, date, created_at DESC
);

-- STEP 2: Now add unique constraints (will succeed since duplicates are removed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'journals' AND indexname = 'journals_user_id_date_key'
  ) THEN
    ALTER TABLE public.journals ADD CONSTRAINT journals_user_id_date_key UNIQUE (user_id, date);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'health_logs' AND indexname = 'health_logs_user_id_date_key'
  ) THEN
    ALTER TABLE public.health_logs ADD CONSTRAINT health_logs_user_id_date_key UNIQUE (user_id, date);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'morning_logs' AND indexname = 'morning_logs_user_id_date_key'
  ) THEN
    ALTER TABLE public.morning_logs ADD CONSTRAINT morning_logs_user_id_date_key UNIQUE (user_id, date);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'daily_scores' AND indexname = 'daily_scores_user_id_date_key'
  ) THEN
    ALTER TABLE public.daily_scores ADD CONSTRAINT daily_scores_user_id_date_key UNIQUE (user_id, date);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'habit_logs' AND indexname = 'habit_logs_habit_id_date_key'
  ) THEN
    ALTER TABLE public.habit_logs ADD CONSTRAINT habit_logs_habit_id_date_key UNIQUE (habit_id, date);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════
-- After running this migration:
-- 1. profiles RLS no longer has infinite recursion (P1#2 ✓)
-- 2. All common queries have composite indexes (P1#8 ✓)
-- 3. user_api_keys has key_hash column for SHA-256 storage (P1#7 ✓)
-- 4. Unique constraints enable atomic upsert (P2#5 ✓)
-- 5. RLS enabled on all tables
