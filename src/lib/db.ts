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

/** Minimal seed — creates user and essential data */
async function autoSeed() {
  const USER_ID = 'rise-default-user'
  const now = new Date().toISOString()

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

  // Projects
  await db.project.createMany({
    data: [
      { userId: USER_ID, name: 'تطوير تطبيق الويب', description: 'بناء تطبيق ويب متكامل', color: '#059669', progress: 65 },
      { userId: USER_ID, name: 'كتابة الكتاب', description: 'إكمال كتاب الإنتاجية', color: '#D4A853', progress: 35 },
      { userId: USER_ID, name: 'تعلم البرمجة', description: 'دورة متقدمة في TypeScript', color: '#6366F1', progress: 80 },
    ],
  })

  // Tasks
  await db.task.createMany({
    data: [
      { userId: USER_ID, title: 'إكمال التصميم', status: 'done', priority: 'high', xpReward: 25 },
      { userId: USER_ID, title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', xpReward: 30 },
      { userId: USER_ID, title: 'مراجعة الكود', status: 'todo', priority: 'medium', xpReward: 15 },
      { userId: USER_ID, title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20 },
      { userId: USER_ID, title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10 },
      { userId: USER_ID, title: 'اجتماع الفريق', status: 'todo', priority: 'high', xpReward: 15 },
      { userId: USER_ID, title: 'تحديث المدونة', status: 'todo', priority: 'low', xpReward: 20 },
      { userId: USER_ID, title: 'درس TypeScript', status: 'in_progress', priority: 'medium', xpReward: 15 },
      { userId: USER_ID, title: 'تخطيط الأسبوع', status: 'done', priority: 'medium', xpReward: 10 },
      { userId: USER_ID, title: 'مراجعة أهداف الشهر', status: 'todo', priority: 'high', xpReward: 15 },
    ],
  })

  // Habits
  await db.habit.createMany({
    data: [
      { userId: USER_ID, name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
      { userId: USER_ID, name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
      { userId: USER_ID, name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
      { userId: USER_ID, name: 'تأمل', icon: '🧘', color: '#8B5CF6', frequency: 'daily', targetCount: 1, xpReward: 15 },
      { userId: USER_ID, name: 'كتابة اليوميات', icon: '✍️', color: '#D4A853', frequency: 'daily', targetCount: 1, xpReward: 20 },
      { userId: USER_ID, name: 'تعلم مهارة جديدة', icon: '🎯', color: '#F97316', frequency: 'daily', targetCount: 1, xpReward: 20 },
      { userId: USER_ID, name: 'لا ساعة لمدة ساعة', icon: '📵', color: '#6366F1', frequency: 'daily', targetCount: 1, xpReward: 10 },
    ],
  })

  // Goals
  const goals = await db.goal.createMany({
    data: [
      { userId: USER_ID, title: 'إكمال كتاب الإنتاجية', vision: 'نشر كتاب يغيّر حياة الناس', why: 'للمساهمة في نشر المعرفة', type: 'quarterly', progress: 35 },
      { userId: USER_ID, title: 'الوصول لمستوى 10', vision: 'بناء نظام حياة متكامل', why: 'للتحول لشخص أفضل', type: 'annual', progress: 70 },
      { userId: USER_ID, title: 'قراءة 24 كتاب', vision: 'قراءة كتابين شهرياً', why: 'للتطور المستمر', type: 'annual', progress: 45 },
      { userId: USER_ID, title: 'تسجيل 500 ساعة عمل عميق', vision: 'إتقان التركيز العميق', why: 'لزيادة الإنتاجية', type: 'annual', progress: 65 },
    ],
  })

  // Books
  await db.book.createMany({
    data: [
      { userId: USER_ID, title: 'عادات ذرية', author: 'جيمس كلير', type: 'book', status: 'completed', totalPages: 320, currentPage: 320, progress: 100, rating: 5 },
      { userId: USER_ID, title: 'العمل العميق', author: 'كال نيوبورت', type: 'book', status: 'reading', totalPages: 296, currentPage: 180, progress: 61 },
      { userId: USER_ID, title: 'العادات السبع', author: 'ستيفن كوفي', type: 'book', status: 'reading', totalPages: 384, currentPage: 120, progress: 31 },
      { userId: USER_ID, title: 'التفكير السريع والبطيء', author: 'دانيال كانيمان', type: 'book', status: 'want_to_read', totalPages: 499 },
      { userId: USER_ID, title: 'دورة React المتقدمة', author: 'أونلاين', type: 'course', status: 'reading', totalPages: 50, currentPage: 30, progress: 60 },
    ],
  })

  // Achievements
  await db.userAchievement.createMany({
    data: [
      { userId: USER_ID, badgeId: 'streak_7', badgeName: 'أسبوع متواصل', badgeIcon: '🔥', badgeDesc: '7 أيام متتالية' },
      { userId: USER_ID, badgeId: 'streak_21', badgeName: 'ثلاثة أسابيع', badgeIcon: '⚡', badgeDesc: '21 يوم متتالي' },
      { userId: USER_ID, badgeId: 'tasks_100', badgeName: 'مائة مهمة', badgeIcon: '✅', badgeDesc: 'أكملت 100 مهمة' },
      { userId: USER_ID, badgeId: 'focus_50h', badgeName: '50 ساعة تركيز', badgeIcon: '🧠', badgeDesc: '50 ساعة عمل عميق' },
      { userId: USER_ID, badgeId: 'books_5', badgeName: 'قارئ نهم', badgeIcon: '📚', badgeDesc: 'أنهيت 5 كتب' },
    ],
  })

  // Daily scores for last 10 days
  const today = new Date().toISOString().split('T')[0]
  for (let i = 9; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().split('T')[0]
    await db.dailyScore.create({
      data: {
        userId: USER_ID, date,
        score: Math.round(40 + Math.random() * 55),
        morningScore: Math.round(30 + Math.random() * 70),
        taskScore: Math.round(30 + Math.random() * 70),
        habitScore: Math.round(30 + Math.random() * 70),
        focusScore: Math.round(20 + Math.random() * 80),
        healthScore: Math.round(30 + Math.random() * 70),
        journalScore: Math.round(20 + Math.random() * 80),
      },
    })
  }

  // Finance
  await db.financeRecord.createMany({
    data: [
      { userId: USER_ID, type: 'income', description: 'راتب شهري', amount: 15000, category: 'عمل', date: today },
      { userId: USER_ID, type: 'expense', description: 'إيجار', amount: 4000, category: 'سكن', date: today },
      { userId: USER_ID, type: 'expense', description: 'طعام', amount: 2000, category: 'غذاء', date: today },
      { userId: USER_ID, type: 'savings', description: 'ادخار شهري', amount: 3000, category: 'ادخار', date: today },
    ],
  })
}