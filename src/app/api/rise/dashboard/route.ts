import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getToday, getLast30Days, getWeekDays } from '@/lib/rise-utils'

// Vercel: extend serverless function timeout to 30s for cold starts
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json(emptyDashboard())
    }

    const today = getToday()
    const last30 = getLast30Days()
    const weekDays = getWeekDays()
    const last30StartDate = new Date(last30[0] + 'T00:00:00')

    // Fetch all data in parallel
    const [
      user,
      tasks,
      habits,
      focusSessions,
      healthLog,
      morningLog,
      achievements,
      dailyScores,
      projects,
      goals,
      books,
      journals,
    ] = await Promise.all([
      // User
      db.user.findUnique({ where: { id: userId } }),
      // Tasks with project join
      db.task.findMany({
        where: { userId },
        include: { subtasks: true, project: { select: { name: true, color: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      // Habits with today's logs
      db.habit.findMany({
        where: { userId },
        include: { logs: { where: { date: today } } },
      }),
      // Recent focus sessions (last 30 days)
      db.focusSession.findMany({
        where: { userId, startedAt: { gte: last30StartDate } },
        orderBy: { startedAt: 'desc' },
      }),
      // Today health log
      db.healthLog.findFirst({ where: { userId, date: today } }),
      // Today morning log
      db.morningLog.findFirst({ where: { userId, date: today } }),
      // Achievements
      db.userAchievement.findMany({
        where: { userId },
        orderBy: { earnedAt: 'desc' },
        take: 10,
      }),
      // Daily scores for last 30 days
      db.dailyScore.findMany({
        where: { userId, date: { in: last30 } },
      }),
      // Projects
      db.project.findMany({ where: { userId } }),
      // Active goals (top 5)
      db.goal.findMany({
        where: { userId, status: 'active' },
        take: 5,
      }),
      // Books currently reading
      db.book.findMany({ where: { userId, status: 'reading' } }),
      // Recent journals
      db.journal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    if (!user) {
      return NextResponse.json(emptyDashboard())
    }

    // Extract today habit logs from included logs
    const todayHabitsLogs = habits.flatMap(h =>
      h.logs.map(l => ({ ...l, habitId: h.id })),
    )

    // Computed metrics
    const completedTasksToday = tasks.filter(
      (t) => t.completedAt && String(t.completedAt).startsWith(today),
    ).length
    const completedHabitsToday = todayHabitsLogs.filter((l) => l.completed).length
    const totalHabits = habits.length
    const todayFocusMin = focusSessions
      .filter(
        (s) => String(s.startedAt).startsWith(today) && s.completed,
      )
      .reduce((sum, s) => sum + (s.actualMin || 0), 0)

    const totalTasks = tasks.length
    const doneTasks = tasks.filter((t) => t.status === 'done').length

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
      tasks: tasks.map((t) => ({
        ...t,
        done: t.status === 'done',
        projectName: t.project?.name,
        projectColor: t.project?.color,
      })),
      habits: habits.map((h) => ({
        ...h,
        todayCompleted:
          todayHabitsLogs.find((l) => l.habitId === h.id)?.completed || false,
        todayCount:
          todayHabitsLogs.find((l) => l.habitId === h.id)?.count || 0,
      })),
      recentFocus: focusSessions.slice(0, 5),
      health: healthLog,
      morning: morningLog,
      achievements,
      dailyScores: dailyScores.sort((a, b) => a.date.localeCompare(b.date)),
      projects: projects.map((p) => ({
        ...p,
        taskCount: tasks.filter((t) => t.projectId === p.id).length,
        doneTaskCount: tasks.filter(
          (t) => t.projectId === p.id && t.status === 'done',
        ).length,
      })),
      goals,
      books,
      journals,
      weekDays,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    // Return empty fallback when database is unavailable
    return NextResponse.json(emptyDashboard())
  }
}

function emptyDashboard() {
  return {
    user: { name: 'مستخدم', level: 1, xp: 0, streak: 0, longestStreak: 0, totalFocusMin: 0, totalTasksDone: 0, xpToNextLevel: 100, avatar: null },
    today: { tasksCompleted: 0, tasksTotal: 0, habitsCompleted: 0, habitsTotal: 0, focusMin: 0, morningScore: 0 },
    tasks: [],
    habits: [],
    todayHabitsLogs: [],
    recentFocus: [],
    health: null,
    morning: null,
    achievements: [],
    dailyScores: [],
    projects: [],
    goals: [],
    books: [],
    journals: [],
    weekDays: [],
    offline: true,
  }
}