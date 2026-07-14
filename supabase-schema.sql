-- RiseOS Supabase Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable RLS
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL DEFAULT 'مستخدم',
  "email" TEXT UNIQUE NOT NULL,
  "avatar" TEXT,
  "level" INTEGER NOT NULL DEFAULT 1,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "xpToNextLevel" INTEGER NOT NULL DEFAULT 100,
  "streak" INTEGER NOT NULL DEFAULT 0,
  "longestStreak" INTEGER NOT NULL DEFAULT 0,
  "totalFocusMin" INTEGER NOT NULL DEFAULT 0,
  "totalTasksDone" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== USER SETTINGS ====================
CREATE TABLE IF NOT EXISTS "UserSettings" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "theme" TEXT NOT NULL DEFAULT 'system',
  "language" TEXT NOT NULL DEFAULT 'ar',
  "wakeUpTime" TEXT NOT NULL DEFAULT '06:00',
  "sleepTime" TEXT NOT NULL DEFAULT '22:00',
  "focusDuration" INTEGER NOT NULL DEFAULT 50,
  "dailyWaterGoal" INTEGER NOT NULL DEFAULT 8,
  "dailyReadingGoal" INTEGER NOT NULL DEFAULT 30,
  "weeklyExerciseGoal" INTEGER NOT NULL DEFAULT 5,
  "notifications" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== USER ACHIEVEMENTS ====================
CREATE TABLE IF NOT EXISTS "UserAchievement" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "badgeId" TEXT NOT NULL,
  "badgeName" TEXT NOT NULL,
  "badgeIcon" TEXT NOT NULL,
  "badgeDesc" TEXT NOT NULL,
  "earnedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== DAILY SCORE ====================
CREATE TABLE IF NOT EXISTS "DailyScore" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "score" REAL NOT NULL DEFAULT 0,
  "morningScore" REAL NOT NULL DEFAULT 0,
  "taskScore" REAL NOT NULL DEFAULT 0,
  "habitScore" REAL NOT NULL DEFAULT 0,
  "focusScore" REAL NOT NULL DEFAULT 0,
  "healthScore" REAL NOT NULL DEFAULT 0,
  "journalScore" REAL NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== PROJECTS ====================
CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#059669',
  "icon" TEXT,
  "progress" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== TASKS ====================
CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'todo',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "label" TEXT,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "dueDate" TEXT,
  "dueTime" TEXT,
  "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  "recurringPattern" TEXT,
  "estimatedMin" INTEGER,
  "xpReward" INTEGER NOT NULL DEFAULT 10,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "dependsOn" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0
);

-- ==================== SUBTASKS ====================
CREATE TABLE IF NOT EXISTS "SubTask" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== GOALS ====================
CREATE TABLE IF NOT EXISTS "Goal" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "vision" TEXT,
  "why" TEXT,
  "type" TEXT NOT NULL DEFAULT 'quarterly',
  "progress" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "deadline" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== MILESTONES ====================
CREATE TABLE IF NOT EXISTS "Milestone" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "goalId" TEXT NOT NULL REFERENCES "Goal"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== HABITS ====================
CREATE TABLE IF NOT EXISTS "Habit" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "color" TEXT NOT NULL DEFAULT '#059669',
  "frequency" TEXT NOT NULL DEFAULT 'daily',
  "targetCount" INTEGER NOT NULL DEFAULT 1,
  "reminderTime" TEXT,
  "xpReward" INTEGER NOT NULL DEFAULT 15,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== HABIT LOGS ====================
CREATE TABLE IF NOT EXISTS "HabitLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "habitId" TEXT NOT NULL REFERENCES "Habit"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "count" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== MORNING LOG ====================
CREATE TABLE IF NOT EXISTS "MorningLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "score" REAL NOT NULL DEFAULT 0,
  "completedItems" TEXT NOT NULL DEFAULT '[]',
  "totalItems" INTEGER NOT NULL,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== JOURNAL ====================
CREATE TABLE IF NOT EXISTS "Journal" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "gratitude" TEXT,
  "wins" TEXT,
  "challenges" TEXT,
  "mood" INTEGER,
  "energy" INTEGER,
  "ideas" TEXT,
  "tomorrowPlan" TEXT,
  "tags" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== FOCUS SESSION ====================
CREATE TABLE IF NOT EXISTS "FocusSession" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "duration" INTEGER NOT NULL,
  "actualMin" INTEGER NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL DEFAULT 'pomodoro',
  "notes" TEXT,
  "taskId" TEXT,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== HEALTH LOG ====================
CREATE TABLE IF NOT EXISTS "HealthLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "sleepHours" REAL,
  "sleepQuality" INTEGER,
  "waterGlasses" INTEGER,
  "steps" INTEGER,
  "calories" INTEGER,
  "weight" REAL,
  "mood" INTEGER,
  "energy" INTEGER,
  "exerciseType" TEXT,
  "exerciseMin" INTEGER,
  "exerciseNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== FINANCE RECORD ====================
CREATE TABLE IF NOT EXISTS "FinanceRecord" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "date" TEXT NOT NULL,
  "recurring" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== BOOKS ====================
CREATE TABLE IF NOT EXISTS "Book" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "author" TEXT,
  "type" TEXT NOT NULL DEFAULT 'book',
  "status" TEXT NOT NULL DEFAULT 'reading',
  "currentPage" INTEGER NOT NULL DEFAULT 0,
  "totalPages" INTEGER,
  "notes" TEXT,
  "highlights" TEXT,
  "favoriteQuote" TEXT,
  "rating" INTEGER,
  "coverUrl" TEXT,
  "progress" REAL NOT NULL DEFAULT 0,
  "startDate" TEXT,
  "endDate" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== KNOWLEDGE ITEM ====================
CREATE TABLE IF NOT EXISTS "KnowledgeItem" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL DEFAULT 'note',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "folder" TEXT,
  "tags" TEXT,
  "source" TEXT,
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== PLANNER ITEM ====================
CREATE TABLE IF NOT EXISTS "PlannerItem" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "time" TEXT,
  "title" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("userId", "date", "section", "order")
);

-- ==================== USER AI USAGE ====================
CREATE TABLE IF NOT EXISTS "UserAIUsage" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT UNIQUE NOT NULL,
  "monthlyUsed" INTEGER NOT NULL DEFAULT 0,
  "monthlyLimit" INTEGER NOT NULL DEFAULT 100,
  "totalUsed" INTEGER NOT NULL DEFAULT 0,
  "month" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== USER STORAGE ====================
CREATE TABLE IF NOT EXISTS "UserStorage" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT UNIQUE NOT NULL,
  "supabaseId" TEXT,
  "email" TEXT,
  "name" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "storageUsed" INTEGER NOT NULL DEFAULT 0,
  "storageLimit" INTEGER NOT NULL DEFAULT 10485760,
  "aiLimit" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== AUTO-UPDATE TRIGGER ====================
-- Automatically updates "updatedAt" on every row modification
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to all tables that have an "updatedAt" column
DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updatedAt'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON %I;
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    ', tbl, tbl);
  END LOOP;
END $$;

-- ==================== INDEXES ====================
-- Single-column indexes
CREATE INDEX IF NOT EXISTS idx_task_userId ON "Task"("userId");
CREATE INDEX IF NOT EXISTS idx_task_status ON "Task"("status");
CREATE INDEX IF NOT EXISTS idx_task_projectId ON "Task"("projectId");
CREATE INDEX IF NOT EXISTS idx_habit_userId ON "Habit"("userId");
CREATE INDEX IF NOT EXISTS idx_habitLog_habitId ON "HabitLog"("habitId");
CREATE INDEX IF NOT EXISTS idx_journal_userId ON "Journal"("userId");
CREATE INDEX IF NOT EXISTS idx_focusSession_userId ON "FocusSession"("userId");
CREATE INDEX IF NOT EXISTS idx_healthLog_userId ON "HealthLog"("userId");
CREATE INDEX IF NOT EXISTS idx_financeRecord_userId ON "FinanceRecord"("userId");
CREATE INDEX IF NOT EXISTS idx_book_userId ON "Book"("userId");
CREATE INDEX IF NOT EXISTS idx_knowledgeItem_userId ON "KnowledgeItem"("userId");
CREATE INDEX IF NOT EXISTS idx_plannerItem_userId ON "PlannerItem"("userId");
CREATE INDEX IF NOT EXISTS idx_goal_userId ON "Goal"("userId");
CREATE INDEX IF NOT EXISTS idx_project_userId ON "Project"("userId");
CREATE INDEX IF NOT EXISTS idx_morningLog_userId ON "MorningLog"("userId");
CREATE INDEX IF NOT EXISTS idx_dailyScore_userId ON "DailyScore"("userId");
CREATE INDEX IF NOT EXISTS idx_achievement_userId ON "UserAchievement"("userId");

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_habitLog_habitId_date ON "HabitLog"("habitId", "date");
CREATE INDEX IF NOT EXISTS idx_journal_userId_date ON "Journal"("userId", "date");
CREATE INDEX IF NOT EXISTS idx_healthLog_userId_date ON "HealthLog"("userId", "date");
CREATE INDEX IF NOT EXISTS idx_plannerItem_userId_date ON "PlannerItem"("userId", "date");
CREATE INDEX IF NOT EXISTS idx_morningLog_userId_date ON "MorningLog"("userId", "date");
CREATE INDEX IF NOT EXISTS idx_dailyScore_userId_date ON "DailyScore"("userId", "date");
CREATE INDEX IF NOT EXISTS idx_task_userId_status ON "Task"("userId", "status");
CREATE INDEX IF NOT EXISTS idx_focusSession_userId_startedAt ON "FocusSession"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS idx_financeRecord_userId_date ON "FinanceRecord"("userId", "date");
CREATE INDEX IF NOT EXISTS idx_book_userId_status ON "Book"("userId", "status");
CREATE INDEX IF NOT EXISTS idx_plannerItem_userId_date_section ON "PlannerItem"("userId", "date", "section");

-- ==================== ROW LEVEL SECURITY ====================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserAchievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Milestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Habit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HabitLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MorningLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Journal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FocusSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HealthLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Book" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlannerItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserAIUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserStorage" ENABLE ROW LEVEL SECURITY;

-- ==================== RLS POLICIES ====================
-- Tables with direct "userId" column — auto-generate policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  -- Only tables that actually HAVE a "userId" column
  FOR tbl IN
    SELECT t.table_name
    FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public'
      AND c.column_name = 'userId'
      AND t.table_name NOT IN ('User', 'UserAIUsage', 'UserStorage', 'SubTask', 'Milestone', 'HabitLog')
  LOOP
    EXECUTE format('CREATE POLICY "Users can view own data" ON %I FOR SELECT USING ("userId" = auth.uid()::text)', tbl);
    EXECUTE format('CREATE POLICY "Users can insert own data" ON %I FOR INSERT WITH CHECK ("userId" = auth.uid()::text)', tbl);
    EXECUTE format('CREATE POLICY "Users can update own data" ON %I FOR UPDATE USING ("userId" = auth.uid()::text)', tbl);
    EXECUTE format('CREATE POLICY "Users can delete own data" ON %I FOR DELETE USING ("userId" = auth.uid()::text)', tbl);
  END LOOP;
END $$;

-- SubTask: access through parent Task's userId
CREATE POLICY "SubTask select via task owner" ON "SubTask" FOR SELECT
  USING ("taskId" IN (SELECT "id" FROM "Task" WHERE "userId" = auth.uid()::text));
CREATE POLICY "SubTask insert via task owner" ON "SubTask" FOR INSERT
  WITH CHECK ("taskId" IN (SELECT "id" FROM "Task" WHERE "userId" = auth.uid()::text));
CREATE POLICY "SubTask update via task owner" ON "SubTask" FOR UPDATE
  USING ("taskId" IN (SELECT "id" FROM "Task" WHERE "userId" = auth.uid()::text));
CREATE POLICY "SubTask delete via task owner" ON "SubTask" FOR DELETE
  USING ("taskId" IN (SELECT "id" FROM "Task" WHERE "userId" = auth.uid()::text));

-- Milestone: access through parent Goal's userId
CREATE POLICY "Milestone select via goal owner" ON "Milestone" FOR SELECT
  USING ("goalId" IN (SELECT "id" FROM "Goal" WHERE "userId" = auth.uid()::text));
CREATE POLICY "Milestone insert via goal owner" ON "Milestone" FOR INSERT
  WITH CHECK ("goalId" IN (SELECT "id" FROM "Goal" WHERE "userId" = auth.uid()::text));
CREATE POLICY "Milestone update via goal owner" ON "Milestone" FOR UPDATE
  USING ("goalId" IN (SELECT "id" FROM "Goal" WHERE "userId" = auth.uid()::text));
CREATE POLICY "Milestone delete via goal owner" ON "Milestone" FOR DELETE
  USING ("goalId" IN (SELECT "id" FROM "Goal" WHERE "userId" = auth.uid()::text));

-- HabitLog: access through parent Habit's userId
CREATE POLICY "HabitLog select via habit owner" ON "HabitLog" FOR SELECT
  USING ("habitId" IN (SELECT "id" FROM "Habit" WHERE "userId" = auth.uid()::text));
CREATE POLICY "HabitLog insert via habit owner" ON "HabitLog" FOR INSERT
  WITH CHECK ("habitId" IN (SELECT "id" FROM "Habit" WHERE "userId" = auth.uid()::text));
CREATE POLICY "HabitLog update via habit owner" ON "HabitLog" FOR UPDATE
  USING ("habitId" IN (SELECT "id" FROM "Habit" WHERE "userId" = auth.uid()::text));
CREATE POLICY "HabitLog delete via habit owner" ON "HabitLog" FOR DELETE
  USING ("habitId" IN (SELECT "id" FROM "Habit" WHERE "userId" = auth.uid()::text));

-- User table: users can read/update their own row
CREATE POLICY "Users view own profile" ON "User" FOR SELECT USING ("id" = auth.uid()::text);
CREATE POLICY "Users update own profile" ON "User" FOR UPDATE USING ("id" = auth.uid()::text);

-- UserAIUsage: users manage their own
CREATE POLICY "Users view own AI usage" ON "UserAIUsage" FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "Users insert own AI usage" ON "UserAIUsage" FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "Users update own AI usage" ON "UserAIUsage" FOR UPDATE USING ("userId" = auth.uid()::text);

-- UserStorage: users view their own
CREATE POLICY "Users view own storage" ON "UserStorage" FOR SELECT USING ("userId" = auth.uid()::text);

-- Service role can do everything
DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LOOP
    EXECUTE format('CREATE POLICY "Service role full access" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;

-- ==================== FUNCTION: Auto-create user profile on signup ====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."User" ("id", "name", "email")
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email::text),
    NEW.email::text
  );
  INSERT INTO public."UserSettings" ("userId")
  VALUES (NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: automatically create User + UserSettings on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();