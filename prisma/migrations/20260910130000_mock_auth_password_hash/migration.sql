-- Local mock-auth password verification.
-- Supabase users authenticate through Supabase Auth; this field is only used
-- by the local Prisma/SQLite fallback.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
