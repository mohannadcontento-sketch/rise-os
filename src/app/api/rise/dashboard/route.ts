import { NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'
import { getToday, getLast30Days, getWeekDays } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
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
      tasks,
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
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}