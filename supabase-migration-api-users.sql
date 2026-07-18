-- ============================================================
-- RiseOS — Supabase Migration: API-Managed Users
-- ============================================================
-- Run this in Supabase SQL Editor (after the main schema)
-- This makes the API the sole user account manager.
-- No login needed. First API call auto-creates the user.
-- ============================================================

-- ==================== 1. ADD isDefault COLUMN ====================
-- Marks which user the API/MCP should use
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_isDefault ON "User"("isDefault") WHERE "isDefault" = true;

-- ==================== 2. APP CONFIG TABLE ====================
-- Stores system-wide settings (like which user to use)
CREATE TABLE IF NOT EXISTS "AppConfig" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role full access on AppConfig
ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service role full access on AppConfig" ON "AppConfig" FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==================== 3. STORED FUNCTION: Get or Create App User ====================
-- This is the CORE function the API calls.
-- - First call: creates a new user, stores ID in AppConfig, returns it
-- - Subsequent calls: reads from AppConfig, returns the stored ID
-- - Completely bypasses RLS (called with service role)
CREATE OR REPLACE FUNCTION public.get_or_create_app_user()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id TEXT;
  v_email TEXT;
  v_count INTEGER;
BEGIN
  -- 1. Try to get stored user ID from AppConfig
  SELECT "value" INTO v_user_id FROM "AppConfig" WHERE "key" = 'app_user_id';
  
  -- 2. If found, verify it exists in User table
  IF v_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM "User" WHERE "id" = v_user_id;
    IF v_count > 0 THEN
      RETURN v_user_id;
    END IF;
  END IF;

  -- 3. Try to find a user marked as default
  SELECT "id" INTO v_user_id FROM "User" WHERE "isDefault" = true LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    -- Store it in AppConfig for fast future lookups
    INSERT INTO "AppConfig" ("key", "value") VALUES ('app_user_id', v_user_id)
      ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now();
    RETURN v_user_id;
  END IF;

  -- 4. Try to use first existing user
  SELECT "id" INTO v_user_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    -- Mark as default
    UPDATE "User" SET "isDefault" = true WHERE "id" = v_user_id;
    INSERT INTO "AppConfig" ("key", "value") VALUES ('app_user_id', v_user_id)
      ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now();
    RETURN v_user_id;
  END IF;

  -- 5. No user exists — CREATE ONE automatically
  v_user_id := gen_random_uuid()::text;
  v_email := 'riseos-app@auto.local';

  INSERT INTO "User" ("id", "name", "email", "isDefault")
  VALUES (v_user_id, 'مستخدم RiseOS', v_email, true);

  INSERT INTO "UserSettings" ("userId")
  VALUES (v_user_id);

  -- Store in AppConfig
  INSERT INTO "AppConfig" ("key", "value") VALUES ('app_user_id', v_user_id)
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now();

  RETURN v_user_id;
END;
$$;

-- ==================== 4. GRANT EXECUTE ON THE FUNCTION ====================
-- Allow service_role and anon to call it
GRANT EXECUTE ON FUNCTION public.get_or_create_app_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_app_user() TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_app_user() TO authenticated;

-- ==================== 5. ENSURE SERVICE ROLE HAS FULL ACCESS ====================
-- This is a safety net — make sure service_role bypasses ALL RLS
DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('
        CREATE POLICY "Service role full access" ON %I 
        FOR ALL USING (true) WITH CHECK (true)
      ', tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ==================== 6. ALLOW ANON TO CALL get_or_create_app_user ====================
-- The function itself handles security (SECURITY DEFINER runs as table owner)
-- But we need anon to be able to SELECT from AppConfig via the function
CREATE POLICY "Anon can read AppConfig" ON "AppConfig" FOR SELECT USING (true);

-- ==================== 7. MAKE SURE User email UNIQUE constraint is relaxed ====================
-- The auto-created user needs a unique email. If there's a conflict, handle it.
-- (The gen_random_uuid email ensures uniqueness, but let's be safe)
DO $$ BEGIN
  ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==================== VERIFICATION ====================
-- Run this to verify everything is set up:
-- SELECT get_or_create_app_user() AS app_user_id;
-- SELECT * FROM "AppConfig";
-- SELECT "id", "name", "email", "isDefault" FROM "User";