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
 * Ensures the database tables exist and has seed data.
 * On first request in a serverless environment, this creates all tables
 * and seeds them. Safe to call multiple times.
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

      // Auto-seed if no user exists (handles cold starts on Vercel)
      const userCount = await db.user.count()
      if (userCount === 0) {
        await autoSeed()
      }

      globalForPrisma.dbReady = true
    } catch (error) {
      console.error('[DB] Failed to initialize:', error)
      _initPromise = null
    }
  })()

  return _initPromise
}

/** Minimal seed — creates user only for first request to succeed */
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