-- ============================================================
-- RiseOS Migration 006: P3#4 — Convert TEXT date columns to DATE type
-- + P3#8: Migration strategy baseline
-- ============================================================
-- This migration is IDEMPOTENT: safe to run multiple times.
-- Run in Supabase SQL Editor > New Query.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- PART 1: P3#4 — Convert date columns from TEXT to DATE
-- ═══════════════════════════════════════════════════════════
-- Date columns stored as TEXT prevent native date queries,
-- date validation, and proper indexing. Convert to DATE type.
-- Uses USING clause to cast existing TEXT values to DATE.

-- Helper function: check if column type is TEXT
DO $$
BEGIN
  -- tasks.due_date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'due_date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.tasks ALTER COLUMN due_date TYPE DATE USING due_date::DATE;
  END IF;

  -- habit_logs.date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'habit_logs' AND column_name = 'date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.habit_logs ALTER COLUMN date TYPE DATE USING date::DATE;
  END IF;

  -- journals.date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journals' AND column_name = 'date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.journals ALTER COLUMN date TYPE DATE USING date::DATE;
  END IF;

  -- finance_records.date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'finance_records' AND column_name = 'date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.finance_records ALTER COLUMN date TYPE DATE USING date::DATE;
  END IF;

  -- health_logs.date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'health_logs' AND column_name = 'date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.health_logs ALTER COLUMN date TYPE DATE USING date::DATE;
  END IF;

  -- morning_logs.date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'morning_logs' AND column_name = 'date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.morning_logs ALTER COLUMN date TYPE DATE USING date::DATE;
  END IF;

  -- daily_scores.date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_scores' AND column_name = 'date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.daily_scores ALTER COLUMN date TYPE DATE USING date::DATE;
  END IF;

  -- planner_items.date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'planner_items' AND column_name = 'date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.planner_items ALTER COLUMN date TYPE DATE USING date::DATE;
  END IF;

  -- books.start_date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'start_date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.books ALTER COLUMN start_date TYPE DATE USING start_date::DATE;
  END IF;

  -- books.end_date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'end_date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.books ALTER COLUMN end_date TYPE DATE USING end_date::DATE;
  END IF;

  -- goals.deadline
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'deadline' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.goals ALTER COLUMN deadline TYPE DATE USING deadline::DATE;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- PART 2: Rebuild indexes after type change (DATE indexes are faster)
-- ═══════════════════════════════════════════════════════════

-- Drop old text-based indexes and recreate for DATE type
DROP INDEX IF EXISTS idx_habit_logs_habit_date;
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON public.habit_logs(habit_id, date);

DROP INDEX IF EXISTS idx_journals_user_date;
CREATE INDEX IF NOT EXISTS idx_journals_user_date ON public.journals(user_id, date);

DROP INDEX IF EXISTS idx_finance_records_user_date;
CREATE INDEX IF NOT EXISTS idx_finance_records_user_date ON public.finance_records(user_id, date);

DROP INDEX IF EXISTS idx_health_logs_user_date;
CREATE INDEX IF NOT EXISTS idx_health_logs_user_date ON public.health_logs(user_id, date);

DROP INDEX IF EXISTS idx_morning_logs_user_date;
CREATE INDEX IF NOT EXISTS idx_morning_logs_user_date ON public.morning_logs(user_id, date);

DROP INDEX IF EXISTS idx_daily_scores_user_date;
CREATE INDEX IF NOT EXISTS idx_daily_scores_user_date ON public.daily_scores(user_id, date);

DROP INDEX IF EXISTS idx_planner_items_user_date;
CREATE INDEX IF NOT EXISTS idx_planner_items_user_date ON public.planner_items(user_id, date);

DROP INDEX IF EXISTS idx_tasks_user_duedate;
CREATE INDEX IF NOT EXISTS idx_tasks_user_duedate ON public.tasks(user_id, due_date);

-- ═══════════════════════════════════════════════════════════
-- PART 3: P3#8 — Add updated_at trigger for tables missing it
-- ═══════════════════════════════════════════════════════════

-- Ensure update_updated_at function exists
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for tables that have updated_at but no trigger
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
    AND table_name NOT IN (
      SELECT DISTINCT event_object_table FROM information_schema.triggers
      WHERE event_object_schema = 'public'
    )
  LOOP
    BEGIN
      EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════
-- After running:
-- 1. All date columns are DATE type (faster queries, proper indexing)
-- 2. All indexes rebuilt for DATE type
-- 3. updated_at triggers on all tables with updated_at column
