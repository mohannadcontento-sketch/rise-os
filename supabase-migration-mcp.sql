-- ============================================================
-- RiseOS — MCP Integration Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create UserApiKey table (for MCP/AI API key storage)
CREATE TABLE IF NOT EXISTS "UserApiKey" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_userApiKey_key ON "UserApiKey"("key");
CREATE INDEX IF NOT EXISTS idx_userApiKey_userId ON "UserApiKey"("userId");

-- 3. Enable RLS
ALTER TABLE "UserApiKey" ENABLE ROW LEVEL SECURITY;

-- 4. Only service role can manage API keys (users manage through the website API)
CREATE POLICY "Service role full access UserApiKey" ON "UserApiKey" FOR ALL USING (true) WITH CHECK (true);

-- 5. Verify: count existing API keys
SELECT COUNT(*) as existing_keys FROM "UserApiKey";

-- ============================================================
-- DONE! Now go to RiseOS Settings → Delete old API key → Create new one
-- ============================================================