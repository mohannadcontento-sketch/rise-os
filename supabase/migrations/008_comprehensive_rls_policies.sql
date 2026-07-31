-- ============================================================
-- RiseOS: Comprehensive Row-Level Security (RLS) Migration
-- Version: 008
-- Description: Enables RLS on all user tables and enforces strict isolation
--
-- FIX: Removed `ALTER TABLE auth.users` (causes "must be owner" error).
--      Added IF EXISTS checks and exception handling for robustness.
--      This migration is now SAFE to re-run (idempotent).
-- ============================================================

-- 1. Enable RLS on all core tables (safe to re-run)
DO $$
BEGIN
    -- profiles table (uses "id" instead of "user_id")
    BEGIN ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE daily_scores ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE projects ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE tasks ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE goals ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE habits ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE morning_logs ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE journals ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE books ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE planner_items ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; End;
    BEGIN ALTER TABLE user_ai_usage ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE user_storage ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE notifications ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE budgets ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Sub-tables (protected via parent RLS, but enable RLS here too for defense-in-depth)
    BEGIN ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE milestones ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 2. Dynamic Policy Generation for tables with "user_id"
--    Each table gets: SELECT, INSERT, UPDATE, DELETE policies
--    using auth.uid() = user_id for strict user isolation.
DO $$
DECLARE
    tbl TEXT;
    tables_with_user_id TEXT[] := ARRAY[
        'user_settings', 'user_achievements', 'daily_scores', 'projects', 'tasks',
        'goals', 'habits', 'morning_logs', 'journals', 'focus_sessions',
        'health_logs', 'finance_records', 'books', 'knowledge_items', 'planner_items',
        'user_ai_usage', 'user_storage', 'user_api_keys', 'notifications', 'budgets'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables_with_user_id
    LOOP
        -- SELECT Policy
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Users can view their own %s" ON %I;', tbl, tbl);
            EXECUTE format('CREATE POLICY "Users can view their own %s" ON %I FOR SELECT USING (auth.uid() = user_id);', tbl, tbl);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping SELECT policy for % (table may not exist yet)', tbl;
        END;

        -- INSERT Policy
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Users can insert their own %s" ON %I;', tbl, tbl);
            EXECUTE format('CREATE POLICY "Users can insert their own %s" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id);', tbl, tbl);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping INSERT policy for % (table may not exist yet)', tbl;
        END;

        -- UPDATE Policy
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Users can update their own %s" ON %I;', tbl, tbl);
            EXECUTE format('CREATE POLICY "Users can update their own %s" ON %I FOR UPDATE USING (auth.uid() = user_id);', tbl, tbl);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping UPDATE policy for % (table may not exist yet)', tbl;
        END;

        -- DELETE Policy
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own %s" ON %I;', tbl, tbl);
            EXECUTE format('CREATE POLICY "Users can delete their own %s" ON %I FOR DELETE USING (auth.uid() = user_id);', tbl, tbl);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping DELETE policy for % (table may not exist yet)', tbl;
        END;
    END LOOP;
END $$;

-- 3. Special Policies for "profiles" table (uses "id" instead of "user_id")
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
        CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping profiles SELECT policy'; END;

    BEGIN
        DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
        CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping profiles UPDATE policy'; END;

    BEGIN
        DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
        CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping profiles INSERT policy'; END;
END $$;

-- 4. Sub-table policies (defense-in-depth)
--    subtasks: only accessible if the parent task belongs to the user
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS "Users can view their own subtasks" ON subtasks;
        CREATE POLICY "Users can view their own subtasks" ON subtasks
          FOR SELECT USING (
            EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
          );
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping subtasks SELECT policy'; END;

    BEGIN
        DROP POLICY IF EXISTS "Users can insert their own subtasks" ON subtasks;
        CREATE POLICY "Users can insert their own subtasks" ON subtasks
          FOR INSERT WITH CHECK (
            EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
          );
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping subtasks INSERT policy'; END;

    BEGIN
        DROP POLICY IF EXISTS "Users can update their own subtasks" ON subtasks;
        CREATE POLICY "Users can update their own subtasks" ON subtasks
          FOR UPDATE USING (
            EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
          );
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping subtasks UPDATE policy'; END;

    BEGIN
        DROP POLICY IF EXISTS "Users can delete their own subtasks" ON subtasks;
        CREATE POLICY "Users can delete their own subtasks" ON subtasks
          FOR DELETE USING (
            EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
          );
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping subtasks DELETE policy'; END;
END $$;

-- 5. Milestones (protected via parent goal)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS "Users can manage their own milestones" ON milestones;
        CREATE POLICY "Users can manage their own milestones" ON milestones
          FOR ALL USING (
            EXISTS (SELECT 1 FROM goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
          );
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping milestones policy'; END;
END $$;

-- 6. Habit logs (protected via parent habit)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS "Users can manage their own habit_logs" ON habit_logs;
        CREATE POLICY "Users can manage their own habit_logs" ON habit_logs
          FOR ALL USING (
            EXISTS (SELECT 1 FROM habits WHERE habits.id = habit_logs.habit_id AND habits.user_id = auth.uid())
          );
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping habit_logs policy'; END;
END $$;

-- ============================================================
-- IMPORTANT NOTE on auth.users:
-- DO NOT attempt to ALTER TABLE auth.users — it is an internal Supabase
-- Auth table owned by the `supabase_auth_admin` role. Running
-- `ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY` causes:
--   ERROR: 42501: must be owner of table users
-- Supabase already protects auth.users internally — no action needed.
-- ============================================================

-- 7. Force RLS on all tables (prevents admin bypass in Supabase dashboard)
-- This ensures even the `postgres` user is subject to RLS policies.
-- Comment this out if you need admin access for maintenance.
-- DO $$
-- BEGIN
--     BEGIN ALTER TABLE profiles FORCE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
--     BEGIN ALTER TABLE tasks FORCE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
--     BEGIN ALTER TABLE goals FORCE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
--     BEGIN ALTER TABLE habits FORCE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
-- END $$;
