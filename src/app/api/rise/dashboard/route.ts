import { NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'
import { getToday, getLast30Days, getWeekDays } from '@/lib/rise-utils'

// Vercel: extend serverless function timeout to 30s for cold starts
export const maxDuration = 30

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const dbReady = await ensureDb()
    if (!dbReady) return NextResponse.json(fallbackDashboard())
    const today = getToday()
    const last30 = getLast30Days()
    const weekDays = getWeekDays()

    const user = await db.user.findUnique({ where: { id: USER_ID } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [tasks, habits, todayHabitsLogs, focusSessions, healthLog, morningLog, achievements, dailyScores, projects, goals, books, journals] = await Promise.all([
      // Tasks
      db.task.findMany({
        where: { userId: USER_ID },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { project: { select: { name: true, color: true } } },
      }),
      // Habits
      db.habit.findMany({ where: { userId: USER_ID } }),
      // Today habit logs
      db.habitLog.findMany({
        where: { habit: { userId: USER_ID }, date: today },
      }),
      // Recent focus sessions (last 7 days)
      db.focusSession.findMany({
        where: { userId: USER_ID, startedAt: { gte: new Date(last30[0]) } },
        orderBy: { startedAt: 'desc' },
      }),
      // Today health
      db.healthLog.findFirst({ where: { userId: USER_ID, date: today } }),
      // Today morning
      db.morningLog.findFirst({ where: { userId: USER_ID, date: today } }),
      // Achievements
      db.userAchievement.findMany({
        where: { userId: USER_ID },
        orderBy: { earnedAt: 'desc' },
        take: 10,
      }),
      // Daily scores
      db.dailyScore.findMany({
        where: { userId: USER_ID, date: { in: last30 } },
      }),
      // Projects
      db.project.findMany({ where: { userId: USER_ID } }),
      // Goals
      db.goal.findMany({ where: { userId: USER_ID, status: 'active' }, take: 5 }),
      // Books
      db.book.findMany({ where: { userId: USER_ID, status: 'reading' } }),
      // Recent journals
      db.journal.findMany({
        where: { userId: USER_ID },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    const completedTasksToday = tasks.filter(t => t.completedAt && t.completedAt.toISOString().startsWith(today)).length
    const completedHabitsToday = todayHabitsLogs.filter(l => l.completed).length
    const totalHabits = habits.length
    const todayFocusMin = focusSessions
      .filter(s => s.startedAt.toISOString().startsWith(today) && s.completed)
      .reduce((sum, s) => sum + s.actualMin, 0)

    const totalTasks = tasks.length
    const doneTasks = tasks.filter(t => t.status === 'done').length

    return NextResponse.json({
      user: {
        name: user.name,
        level: user.level,
        xp: user.xp,
        streak: user.streak,
        longestStreak: user.longestStreak,
        totalFocusMin: user.totalFocusMin,
        totalTasksDone: user.totalTasksDone,
      },
      today: {
        tasksCompleted: completedTasksToday,
        tasksTotal: totalTasks,
        habitsCompleted: completedHabitsToday,
        habitsTotal: totalHabits,
        focusMin: todayFocusMin,
        morningScore: morningLog?.score || 0,
      },
      tasks: tasks.map(t => ({
        ...t,
        done: t.status === 'done',
        projectName: t.project?.name,
        projectColor: t.project?.color,
      })),
      habits: habits.map(h => ({
        ...h,
        todayCompleted: todayHabitsLogs.find(l => l.habitId === h.id)?.completed || false,
        todayCount: todayHabitsLogs.find(l => l.habitId === h.id)?.count || 0,
      })),
      recentFocus: focusSessions.slice(0, 5),
      health: healthLog,
      morning: morningLog,
      achievements,
      dailyScores: dailyScores.sort((a, b) => a.date.localeCompare(b.date)),
      projects: projects.map(p => ({
        ...p,
        taskCount: tasks.filter(t => t.projectId === p.id).length,
        doneTaskCount: tasks.filter(t => t.projectId === p.id && t.status === 'done').length,
      })),
      goals,
      books,
      journals,
      weekDays,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    // Return fallback demo data so the site works even without DB
    return NextResponse.json(fallbackDashboard())
  }
}

/** Fallback dashboard data when database is unavailable (e.g., cold start on Vercel) */
function fallbackDashboard() {
  return {
    user: { name: 'مستخدم RiseOS', level: 7, xp: 650, streak: 12, longestStreak: 21, totalFocusMin: 4200, totalTasksDone: 187, xpToNextLevel: 100, avatar: null },
    today: { tasksCompleted: 0, tasksTotal: 5, habitsCompleted: 0, habitsTotal: 3, focusMin: 0, morningScore: 0 },
    tasks: [
      { id: '1', title: 'إكمال التصميم', done: true, priority: 'high', xpReward: 25 },
      { id: '2', title: 'كتابة الفصل الثالث', done: false, priority: 'high', xpReward: 30 },
      { id: '3', title: 'مراجعة الكود', done: false, priority: 'medium', xpReward: 15 },
      { id: '4', title: 'تمرين رياضي', done: false, priority: 'medium', xpReward: 20 },
      { id: '5', title: 'قراءة 30 صفحة', done: false, priority: 'low', xpReward: 10 },
    ],
    habits: [
      { id: 'h1', name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
      { id: 'h2', name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
      { id: 'h3', name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
    ],
    todayHabitsLogs: [],
    focusSessions: [],
    healthLog: null,
    morningLog: null,
    achievements: [
      { id: 'a1', badgeName: 'أسبوع متواصل', badgeIcon: '🔥', badgeDesc: '7 أيام متتالية', earnedAt: new Date().toISOString() },
      { id: 'a2', badgeName: 'ثلاثة أسابيع', badgeIcon: '⚡', badgeDesc: '21 يوم متتالي', earnedAt: new Date().toISOString() },
    ],
    dailyScores: Array.from({ length: 10 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 9 + i)
      return { date: d.toISOString().split('T')[0], score: 40 + Math.round(Math.random() * 55), morningScore: 50, taskScore: 50, habitScore: 50, focusScore: 40, healthScore: 50, journalScore: 40 }
    }),
    projects: [
      { id: 'p1', name: 'تطوير تطبيق الويب', color: '#059669', progress: 65, taskCount: 3, doneTaskCount: 1 },
      { id: 'p2', name: 'كتابة الكتاب', color: '#D4A853', progress: 35, taskCount: 2, doneTaskCount: 0 },
      { id: 'p3', name: 'تعلم البرمجة', color: '#6366F1', progress: 80, taskCount: 1, doneTaskCount: 0 },
    ],
    goals: [
      { id: 'g1', title: 'إكمال كتاب الإنتاجية', progress: 35, status: 'active', deadline: '2025-12-31' },
      { id: 'g2', title: 'الوصول لمستوى 10', progress: 70, status: 'active', deadline: '2025-12-31' },
    ],
    books: [
      { id: 'b1', title: 'العمل العميق', author: 'كال نيوبورت', status: 'reading', progress: 61, totalPages: 296, currentPage: 180 },
      { id: 'b2', title: 'عادات ذرية', author: 'جيمس كلير', status: 'completed', progress: 100, rating: 5 },
    ],
    journals: [],
    weekDays: [],
  }
}