import { PrismaClient } from '@prisma/client'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { SCHEMA_SQL } from './db-schema'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbReady: boolean
  dbInitFailed: boolean
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
    // Ensure the file exists (SQLite needs this)
    if (!existsSync(dbPath)) {
      try { writeFileSync(dbPath, '') } catch { /* ignore */ }
    }
    url = `file:${dbPath}`
    process.env.DATABASE_URL = url
  } else {
    // Local dev: ensure db directory exists
    const dbDir = join(process.cwd(), 'db')
    if (!existsSync(dbDir)) {
      try { mkdirSync(dbDir, { recursive: true }) } catch { /* ignore */ }
    }
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
 * Ensures the database tables exist and has seed data.
 * On first request in a serverless environment, this creates all tables
 * and seeds them. Safe to call multiple times.
 *
 * Returns true if DB is ready, false if initialization failed.
 * Routes should check this and return fallback data on failure.
 */
let _initPromise: Promise<boolean> | null = null

export async function ensureDb(): Promise<boolean> {
  if (globalForPrisma.dbReady) return true
  if (globalForPrisma.dbInitFailed) return false
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    try {
      // Verify Prisma can connect
      await db.$queryRawUnsafe('SELECT 1')

      // Check if User table exists
      const result = await db.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='User' LIMIT 1"
      ) as Array<{ name: string }>

      if (result.length === 0) {
        // Tables don't exist — create them one by one for safety
        const statements = SCHEMA_SQL.split(';').filter(s => s.trim())
        for (const stmt of statements) {
          try {
            await db.$executeRawUnsafe(stmt)
          } catch (e) {
            console.error('[DB] Statement failed (may already exist):', (e as Error).message?.substring(0, 100))
          }
        }
      }

      // Auto-seed if no user exists (handles cold starts on Vercel)
      try {
        const userCount = await db.user.count()
        if (userCount === 0) {
          await autoSeed()
        }
      } catch (seedErr) {
        console.error('[DB] Seed failed:', (seedErr as Error).message?.substring(0, 100))
        // Don't fail the whole init — seed is optional
      }

      globalForPrisma.dbReady = true
      return true
    } catch (error) {
      console.error('[DB] Failed to initialize:', (error as Error).message?.substring(0, 200))
      globalForPrisma.dbInitFailed = true
      _initPromise = null
      return false
    }
  })()

  return _initPromise
}

/**
 * Reset the init state — allows retrying DB initialization.
 * Useful when a previous cold start failed.
 */
export function resetDbInit() {
  _initPromise = null
  globalForPrisma.dbInitFailed = false
}

/** Minimal seed — creates user + settings + demo data */
async function autoSeed() {
  const USER_ID = 'rise-default-user'

  await db.user.create({
    data: {
      id: USER_ID,
      email: 'user@riseos.app',
      name: 'مستخدم RiseOS',
      level: 7, xp: 650, streak: 12, longestStreak: 21,
      totalFocusMin: 4200, totalTasksDone: 187,
    },
  })

  await db.userSettings.create({
    data: {
      userId: USER_ID, theme: 'system', language: 'ar',
      wakeUpTime: '06:00', sleepTime: '22:00', focusDuration: 50,
    },
  })
}