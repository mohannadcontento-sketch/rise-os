import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getToday } from '@/lib/rise-utils'

async function calculateScoreForDate(userId: string, date: string) {
  const [tasks, habits, habitLogs, focusSessions, morningLog] = await Promise.all([
    db.task.findMany({ where: { userId } }),
    db.habit.findMany({ where: { userId } }),
    db.habitLog.findMany({
      where: { habit: { userId }, date },
    }),
    db.focusSession.findMany({
      where: {
        userId,
        startedAt: { gte: new Date(date + 'T00:00:00'), lt: new Date(date + 'T23:59:59') },
      },
    }),
    db.morningLog.findFirst({ where: { userId, date } }),
  ])

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(
    (t) => t.status === 'done' && t.completedAt && t.completedAt.toISOString().slice(0, 10) === date
  ).length
  const tasksScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const totalHabits = habits.length
  const completedHabits = habitLogs.filter((l) => l.completed).length
  const habitsScore = totalHabits > 0 ? (completedHabits / totalHabits) * 100 : 0

  const todayFocusMin = focusSessions.filter((s) => s.completed).reduce((sum, s) => sum + (s.actualMin || 0), 0)
  const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

  const morningScore = morningLog?.score || 0

  const user = await db.user.findUnique({ where: { id: userId }, select: { streak: true } })
  const streakScore = Math.min(((user?.streak || 0) / 30) * 100, 100)

  return Math.min(Math.round(
    tasksScore * 0.25 + habitsScore * 0.25 + focusScore * 0.20 + morningScore * 0.20 + streakScore * 0.10
  ), 100)
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ score: 0, breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 }, grade: 'يحتاج تحسين' })

    const { searchParams } = new URL(req.url)
    const datesParam = searchParams.get('dates')

    if (datesParam) {
      const dates = datesParam.split(',').filter(Boolean)
      const scores = await Promise.all(
        dates.map(async (date) => {
          const score = await calculateScoreForDate(userId, date.trim())
          return { date: date.trim(), score }
        })
      )
      return NextResponse.json({ scores })
    }

    // Default: calculate for today with breakdown
    const today = getToday()
    const score = await calculateScoreForDate(userId, today)

    // Recalculate breakdown for today specifically
    const [tasks, habits, todayHabitLogs, focusSessions, morningLog] = await Promise.all([
      db.task.findMany({ where: { userId } }),
      db.habit.findMany({ where: { userId } }),
      db.habitLog.findMany({
        where: { habit: { userId }, date: today },
      }),
      db.focusSession.findMany({
        where: {
          userId,
          startedAt: { gte: new Date(today + 'T00:00:00'), lt: new Date(today + 'T23:59:59') },
        },
      }),
      db.morningLog.findFirst({ where: { userId, date: today } }),
    ])

    const totalTasks = tasks.length
    const completedTasksToday = tasks.filter(
      (t) => t.status === 'done' && t.completedAt && t.completedAt.toISOString().slice(0, 10) === today
    ).length
    const tasksScore = totalTasks > 0 ? (completedTasksToday / totalTasks) * 100 : 0

    const totalHabits = habits.length
    const completedHabitsToday = todayHabitLogs.filter((l) => l.completed).length
    const habitsScore = totalHabits > 0 ? (completedHabitsToday / totalHabits) * 100 : 0

    const todayFocusMin = focusSessions.filter((s) => s.completed).reduce((sum, s) => sum + (s.actualMin || 0), 0)
    const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

    const morningScoreVal = morningLog?.score || 0

    const user = await db.user.findUnique({ where: { id: userId }, select: { streak: true } })
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
    return NextResponse.json({ score: 0, breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 }, grade: 'يحتاج تحسين' })
  }
}