import { PrismaClient } from '@prisma/client'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { SCHEMA_SQL } from './db-schema'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbReady: boolean
}

/**
 * Ensure database file path is valid.
 * On Vercel/serverless: use /tmp (writable, persists per-function instance).
 * Locally: use the path from DATABASE_URL or default.
 */
function ensureDatabasePath() {
  let url = process.env.DATABASE_URL || 'file:../db/custom.db'

  if (process.env.NODE_ENV === 'production') {
    const dbDir = '/tmp/riseos'
    if (!existsSync(dbDir)) {
      try { mkdirSync(dbDir, { recursive: true }) } catch { /* ignore */ }
    }
    const dbPath = join(dbDir, 'riseos.db')
    url = `file:${dbPath}`
    process.env.DATABASE_URL = url
  }

  return url
}

ensureDatabasePath()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  })

// Cache the instance globally (works in both dev and prod)
if (!globalForPrisma.prisma) globalForPrisma.prisma = db

/**
 * Ensures the database tables exist.
 * On first request in a serverless environment, this creates all tables.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
let _initPromise: Promise<void> | null = null

export async function ensureDb(): Promise<void> {
  if (globalForPrisma.dbReady) return
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    try {
      // Check if User table exists
      const result = await db.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='User' LIMIT 1"
      ) as Array<{ name: string }>

      if (result.length === 0) {
        // Tables don't exist — create them
        await db.$executeRawUnsafe(SCHEMA_SQL)
      }

      globalForPrisma.dbReady = true
    } catch (error) {
      console.error('[DB] Failed to initialize:', error)
      // Don't set dbReady so it retries next time
      _initPromise = null
    }
  })()

  return _initPromise
}