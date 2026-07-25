-- ============================================================
-- RiseOS: Clean all fake data from database
-- Keeps ONLY the admin account: mohannadcontento@gmail.com
-- Run in Supabase SQL Editor > New Query
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- STEP 1: Get the admin user ID
-- ═══════════════════════════════════════════════════════════

-- Find the admin user by email
DO $$
DECLARE
    admin_user_id UUID;
    admin_record RECORD;
BEGIN
    -- Get admin user ID from profiles
    SELECT id INTO admin_user_id 
    FROM public.profiles 
    WHERE email = 'mohannadcontento@gmail.com'
    LIMIT 1;
    
    -- If not found in profiles, try auth.users
    IF admin_user_id IS NULL THEN
        SELECT id INTO admin_user_id
        FROM auth.users
        WHERE email = 'mohannadcontento@gmail.com'
        LIMIT 1;
    END IF;
    
    RAISE NOTICE 'Admin user ID: %', admin_user_id;
    
    -- ═══════════════════════════════════════════════════════════
    -- STEP 2: Delete ALL data EXCEPT admin's
    -- ═══════════════════════════════════════════════════════════
    
    -- Delete non-admin users' data from all tables
    
    -- Habit logs (for non-admin users)
    DELETE FROM public.habit_logs 
    WHERE habit_id IN (
        SELECT id FROM public.habits 
        WHERE user_id != admin_user_id OR user_id IS NULL
    );
    RAISE NOTICE 'Deleted habit_logs for non-admin users';
    
    -- Habits
    DELETE FROM public.habits WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted habits for non-admin users';
    
    -- Subtasks
    DELETE FROM public.subtasks 
    WHERE task_id IN (
        SELECT id FROM public.tasks 
        WHERE user_id != admin_user_id OR user_id IS NULL
    );
    RAISE NOTICE 'Deleted subtasks for non-admin users';
    
    -- Tasks
    DELETE FROM public.tasks WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted tasks for non-admin users';
    
    -- Milestones
    DELETE FROM public.milestones 
    WHERE goal_id IN (
        SELECT id FROM public.goals 
        WHERE user_id != admin_user_id OR user_id IS NULL
    );
    RAISE NOTICE 'Deleted milestones for non-admin users';
    
    -- Goals
    DELETE FROM public.goals WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted goals for non-admin users';
    
    -- Projects
    DELETE FROM public.projects WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted projects for non-admin users';
    
    -- Journals
    DELETE FROM public.journals WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted journals for non-admin users';
    
    -- Focus sessions
    DELETE FROM public.focus_sessions WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted focus_sessions for non-admin users';
    
    -- Health logs
    DELETE FROM public.health_logs WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted health_logs for non-admin users';
    
    -- Finance records
    DELETE FROM public.finance_records WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted finance_records for non-admin users';
    
    -- Books
    DELETE FROM public.books WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted books for non-admin users';
    
    -- Knowledge items
    DELETE FROM public.knowledge_items WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted knowledge_items for non-admin users';
    
    -- Planner items
    DELETE FROM public.planner_items WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted planner_items for non-admin users';
    
    -- Morning logs
    DELETE FROM public.morning_logs WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted morning_logs for non-admin users';
    
    -- Daily scores
    DELETE FROM public.daily_scores WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted daily_scores for non-admin users';
    
    -- User achievements
    DELETE FROM public.user_achievements WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted user_achievements for non-admin users';
    
    -- Notifications
    DELETE FROM public.notifications WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted notifications for non-admin users';
    
    -- ═══════════════════════════════════════════════════════════
    -- STEP 3: Delete non-admin user accounts
    -- ═══════════════════════════════════════════════════════════
    
    -- Delete user_storage for non-admin
    DELETE FROM public.user_storage WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted user_storage for non-admin users';
    
    -- Delete user_ai_usage for non-admin
    DELETE FROM public.user_ai_usage WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted user_ai_usage for non-admin users';
    
    -- Delete user_api_keys for non-admin
    DELETE FROM public.user_api_keys WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted user_api_keys for non-admin users';
    
    -- Delete user_settings for non-admin
    DELETE FROM public.user_settings WHERE user_id != admin_user_id OR user_id IS NULL;
    RAISE NOTICE 'Deleted user_settings for non-admin users';
    
    -- Delete profiles for non-admin
    DELETE FROM public.profiles WHERE id != admin_user_id;
    RAISE NOTICE 'Deleted non-admin profiles';
    
    -- Delete auth.users for non-admin (this removes login access)
    DELETE FROM auth.users WHERE id != admin_user_id;
    RAISE NOTICE 'Deleted non-admin auth users';
    
    -- ═══════════════════════════════════════════════════════════
    -- STEP 4: Ensure admin has proper settings
    -- ═══════════════════════════════════════════════════════════
    
    -- Set admin role
    UPDATE public.profiles 
    SET role = 'admin', 
        name = COALESCE(name, 'Admin'),
        email = COALESCE(email, 'mohannadcontento@gmail.com')
    WHERE id = admin_user_id;
    
    -- Ensure admin has storage record
    INSERT INTO public.user_storage (user_id, email, name, role, storage_used, storage_limit, ai_limit)
    VALUES (admin_user_id, 'mohannadcontento@gmail.com', 'Admin', 'admin', 0, 104857600, 1000)
    ON CONFLICT (user_id) DO UPDATE SET 
        role = 'admin',
        storage_limit = 104857600,
        ai_limit = 1000;
    
    -- Ensure admin has AI usage record
    INSERT INTO public.user_ai_usage (user_id, monthly_used, monthly_limit, total_used, month)
    VALUES (admin_user_id, 0, 1000, 0, to_char(now(), 'YYYY-MM'))
    ON CONFLICT (user_id) DO UPDATE SET 
        monthly_limit = 1000;
    
    RAISE NOTICE 'Admin account configured: 100MB storage, 1000 AI limit';
    
    -- ═══════════════════════════════════════════════════════════
    -- STEP 5: Clean up orphaned data
    -- ═══════════════════════════════════════════════════════════
    
    -- Delete any orphaned records (no matching user)
    DELETE FROM public.habit_logs WHERE habit_id NOT IN (SELECT id FROM public.habits);
    DELETE FROM public.subtasks WHERE task_id NOT IN (SELECT id FROM public.tasks);
    DELETE FROM public.milestones WHERE goal_id NOT IN (SELECT id FROM public.goals);
    
    RAISE NOTICE 'Cleaned up orphaned records';
    
    -- ═══════════════════════════════════════════════════════════
    -- DONE
    -- ═══════════════════════════════════════════════════════════
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CLEANUP COMPLETE!';
    RAISE NOTICE 'Admin account preserved: mohannadcontento@gmail.com';
    RAISE NOTICE 'All other users and data deleted.';
    RAISE NOTICE '========================================';
END $$;

-- ═══════════════════════════════════════════════════════════
-- Verification: Show remaining data
-- ═══════════════════════════════════════════════════════════

SELECT 'profiles' as table_name, count(*) as remaining FROM public.profiles
UNION ALL SELECT 'tasks', count(*) FROM public.tasks
UNION ALL SELECT 'habits', count(*) FROM public.habits
UNION ALL SELECT 'goals', count(*) FROM public.goals
UNION ALL SELECT 'projects', count(*) FROM public.projects
UNION ALL SELECT 'journals', count(*) FROM public.journals
UNION ALL SELECT 'focus_sessions', count(*) FROM public.focus_sessions
UNION ALL SELECT 'finance_records', count(*) FROM public.finance_records
UNION ALL SELECT 'books', count(*) FROM public.books
UNION ALL SELECT 'knowledge_items', count(*) FROM public.knowledge_items
UNION ALL SELECT 'planner_items', count(*) FROM public.planner_items
UNION ALL SELECT 'morning_logs', count(*) FROM public.morning_logs
UNION ALL SELECT 'daily_scores', count(*) FROM public.daily_scores
UNION ALL SELECT 'notifications', count(*) FROM public.notifications
UNION ALL SELECT 'user_achievements', count(*) FROM public.user_achievements
UNION ALL SELECT 'user_storage', count(*) FROM public.user_storage
UNION ALL SELECT 'user_ai_usage', count(*) FROM public.user_ai_usage
UNION ALL SELECT 'auth_users', count(*) FROM auth.users
ORDER BY table_name;
