import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getToday } from '@/lib/rise-utils'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const today = getToday()

    const user = await db.user.findUnique({ where: { id: USER_ID } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [tasks, habits, todayHabitLogs, focusSessions, morningLog] = await Promise.all([
      db.task.findMany({ where: { userId: USER_ID } }),
      db.habit.findMany({ where: { userId: USER_ID } }),
      db.habitLog.findMany({ where: { habit: { userId: USER_ID }, date: today } }),
      db.focusSession.findMany({
        where: { userId: USER_ID, startedAt: { gte: new Date(today) } },
      }),
      db.morningLog.findFirst({ where: { userId: USER_ID, date: today } }),
    ])

    // 1. Tasks completion rate (25% weight)
    const totalTasks = tasks.length
    const completedTasksToday = tasks.filter(
      (t) => t.status === 'done' && t.completedAt && t.completedAt.toISOString().startsWith(today)
    ).length
    const tasksScore = totalTasks > 0 ? (completedTasksToday / totalTasks) * 100 : 0

    // 2. Habits completion rate (25% weight)
    const totalHabits = habits.length
    const completedHabitsToday = todayHabitLogs.filter((l) => l.completed).length
    const habitsScore = totalHabits > 0 ? (completedHabitsToday / totalHabits) * 100 : 0

    // 3. Focus minutes (max 120 min = 100%, 20% weight)
    const todayFocusMin = focusSessions
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + s.actualMin, 0)
    const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

    // 4. Morning routine score (20% weight)
    const morningScore = morningLog?.score || 0

    // 5. Streak bonus (max 30 day streak = 100%, 10% weight)
    const streakScore = Math.min((user.streak / 30) * 100, 100)

    // Calculate weighted total
    const score = Math.round(
      tasksScore * 0.25 +
      habitsScore * 0.25 +
      focusScore * 0.20 +
      morningScore * 0.20 +
      streakScore * 0.10
    )

    // Determine grade
    let grade: string
    if (score >= 90) grade = 'متميز'
    else if (score >= 70) grade = 'جيد جداً'
    else if (score >= 50) grade = 'جيد'
    else if (score >= 30) grade = 'مقبول'
    else grade = 'يحتاج تحسين'

    return NextResponse.json({
      score: Math.min(score, 100),
      breakdown: {
        tasks: Math.round(tasksScore),
        habits: Math.round(habitsScore),
        focus: Math.round(focusScore),
        morning: Math.round(morningScore),
        streak: Math.round(streakScore),
      },
      grade,
    })
  } catch (error) {
    console.error('Productivity score error:', error)
    return NextResponse.json({ error: 'Failed to calculate productivity score' }, { status: 500 })
  }
}