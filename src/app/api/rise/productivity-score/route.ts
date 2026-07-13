import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'
import { getToday } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

async function calculateScoreForDate(date: string) {
  const [tasks, habits, habitLogs, focusSessions, morningLog] = await Promise.all([
    db.task.findMany({ where: { userId: USER_ID } }),
    db.habit.findMany({ where: { userId: USER_ID } }),
    db.habitLog.findMany({ where: { habit: { userId: USER_ID }, date } }),
    db.focusSession.findMany({
      where: { userId: USER_ID, startedAt: { gte: new Date(date + 'T00:00:00'), lt: new Date(date + 'T23:59:59') } },
    }),
    db.morningLog.findFirst({ where: { userId: USER_ID, date } }),
  ])

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(
    (t) => t.status === 'done' && t.completedAt && t.completedAt.toISOString().startsWith(date)
  ).length
  const tasksScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const totalHabits = habits.length
  const completedHabits = habitLogs.filter((l) => l.completed).length
  const habitsScore = totalHabits > 0 ? (completedHabits / totalHabits) * 100 : 0

  const todayFocusMin = focusSessions.filter((s) => s.completed).reduce((sum, s) => sum + s.actualMin, 0)
  const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

  const morningScore = morningLog?.score || 0

  const user = await db.user.findUnique({ where: { id: USER_ID } })
  const streakScore = Math.min(((user?.streak || 0) / 30) * 100, 100)

  return Math.min(Math.round(
    tasksScore * 0.25 + habitsScore * 0.25 + focusScore * 0.20 + morningScore * 0.20 + streakScore * 0.10
  ), 100)
}

export async function GET(req: NextRequest) {
  try {
    await ensureDb()
    // Support fetching scores for specific dates (comma-separated)
    const { searchParams } = new URL(req.url)
    const datesParam = searchParams.get('dates')

    if (datesParam) {
      const dates = datesParam.split(',').filter(Boolean)
      const scores = await Promise.all(
        dates.map(async (date) => {
          const score = await calculateScoreForDate(date.trim())
          return { date: date.trim(), score }
        })
      )
      return NextResponse.json({ scores })
    }

    // Default: calculate for today
    const today = getToday()
    const score = await calculateScoreForDate(today)

    // Recalculate breakdown for today specifically
    const [tasks, habits, todayHabitLogs, focusSessions, morningLog] = await Promise.all([
      db.task.findMany({ where: { userId: USER_ID } }),
      db.habit.findMany({ where: { userId: USER_ID } }),
      db.habitLog.findMany({ where: { habit: { userId: USER_ID }, date: today } }),
      db.focusSession.findMany({
        where: { userId: USER_ID, startedAt: { gte: new Date(today) } },
      }),
      db.morningLog.findFirst({ where: { userId: USER_ID, date: today } }),
    ])

    const totalTasks = tasks.length
    const completedTasksToday = tasks.filter(
      (t) => t.status === 'done' && t.completedAt && t.completedAt.toISOString().startsWith(today)
    ).length
    const tasksScore = totalTasks > 0 ? (completedTasksToday / totalTasks) * 100 : 0

    const totalHabits = habits.length
    const completedHabitsToday = todayHabitLogs.filter((l) => l.completed).length
    const habitsScore = totalHabits > 0 ? (completedHabitsToday / totalHabits) * 100 : 0

    const todayFocusMin = focusSessions.filter((s) => s.completed).reduce((sum, s) => sum + s.actualMin, 0)
    const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

    const morningScoreVal = morningLog?.score || 0

    const user = await db.user.findUnique({ where: { id: USER_ID } })
    const streakScore = Math.min(((user?.streak || 0) / 30) * 100, 100)

    let grade: string
    if (score >= 90) grade = 'متميز'
    else if (score >= 70) grade = 'جيد جداً'
    else if (score >= 50) grade = 'جيد'
    else if (score >= 30) grade = 'مقبول'
    else grade = 'يحتاج تحسين'

    return NextResponse.json({
      score,
      breakdown: {
        tasks: Math.round(tasksScore),
        habits: Math.round(habitsScore),
        focus: Math.round(focusScore),
        morning: Math.round(morningScoreVal),
        streak: Math.round(streakScore),
      },
      grade,
    })
  } catch (error) {
    console.error('Productivity score error:', error)
    return NextResponse.json({ score: 0, breakdown: {} })
  }
}