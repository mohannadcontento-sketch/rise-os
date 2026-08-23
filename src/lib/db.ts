// ============================================================
// P1#9 NOTE: This file is for LOCAL DEVELOPMENT only (mock mode).
// In production (Supabase mode), data goes through src/lib/supabase.ts
// and this file is not used. Do NOT use `db` directly in API routes —
// always go through data.ts → sb() which respects RLS.
// ============================================================
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db