-- ============================================================
-- RiseOS: Comprehensive Row-Level Security (RLS) Migration
-- Version: 008
-- Description: Enables RLS on all user tables and enforces strict isolation
-- ============================================================

-- 1. Enable RLS on all core tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- ملاحظة أمنية هامة: 
-- تم استبعاد الجداول الفرعية (subtasks, milestones, habit_logs) عمداً.
-- سبب الاستبعاد: هذه الجداول لا تحتوي على user_id، بل تحتوي على (task_id, goal_id, habit_id).
-- الحماية هنا تتم تلقائياً: بما أن الجدول الأب (tasks, goals, habits) محمي بـ RLS، 
-- فإن المستخدم لا يستطيع الوصول إلى الجدول الأب إلا إذا كان يملكه، وبالتالي لا يستطيع الوصول إلى أبنائه.

-- 2. Dynamic Policy Generation for tables with "user_id"
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
        EXECUTE format('DROP POLICY IF EXISTS "Users can view their own %s" ON %I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Users can view their own %s" ON %I FOR SELECT USING (auth.uid() = user_id);', tbl, tbl);
        
        -- INSERT Policy
        EXECUTE format('DROP POLICY IF EXISTS "Users can insert their own %s" ON %I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Users can insert their own %s" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id);', tbl, tbl);
        
        -- UPDATE Policy
        EXECUTE format('DROP POLICY IF EXISTS "Users can update their own %s" ON %I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Users can update their own %s" ON %I FOR UPDATE USING (auth.uid() = user_id);', tbl, tbl);
        
        -- DELETE Policy
        EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own %s" ON %I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Users can delete their own %s" ON %I FOR DELETE USING (auth.uid() = user_id);', tbl, tbl);
    END LOOP;
END $$;

-- 3. Special Policies for "profiles" table (uses "id" instead of "user_id")
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Security Best Practices
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;