import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getToday } from '@/lib/rise-utils'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function getUserStreak(supabase: any, userId: string): Promise<number> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('streak')
    .eq('id', userId)
    .single()
    .catch(() => ({ data: null }))
  return profile?.streak || 0
}

async function calculateScoreForDate(userId: string, date: string) {
  const [tasks, habitsWithLogs, focusSessions, morningResult] = await Promise.all([
    data.tasks.list(userId),
    data.habits.list(userId),
    data.focusSessions.list(userId),
    data.morningLogs.list(userId, [date]),
  ])

  // Extract habit logs for the given date
  const habitLogs = habitsWithLogs.flatMap((h: any) =>
    (h.logs || []).filter((l: any) => l.date === date)
  )

  // Filter focus sessions for the given date
  const dayFocusSessions = focusSessions.filter(
    (s: any) => s.startedAt && s.startedAt.startsWith(date)
  )

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(
    (t: any) => t.status === 'done' && t.completedAt && String(t.completedAt).slice(0, 10) === date
  ).length
  const tasksScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const totalHabits = habitsWithLogs.length
  const completedHabits = habitLogs.filter((l: any) => l.completed).length
  const habitsScore = totalHabits > 0 ? (completedHabits / totalHabits) * 100 : 0

  const todayFocusMin = dayFocusSessions.filter((s: any) => s.completed).reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)
  const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

  const morningLog = morningResult.length > 0 ? morningResult[0] : null
  const morningScore = morningLog?.score || 0

  const supabase = await getSupabaseAdmin()
  const streak = supabase ? await getUserStreak(supabase, userId) : 0
  const streakScore = Math.min((streak / 30) * 100, 100)

  return Math.min(Math.round(
    tasksScore * 0.25 + habitsScore * 0.25 + focusScore * 0.20 + morningScore * 0.20 + streakScore * 0.10
  ), 100)
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ score: 0, breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 }, grade: 'يحتاج تحسين' })

    // If no Supabase, return empty score
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ score: 0, breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 }, grade: 'يحتاج تحسين' })
    }

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
    const [tasks, habitsWithLogs, focusSessions, morningResult] = await Promise.all([
      data.tasks.list(userId),
      data.habits.list(userId),
      data.focusSessions.list(userId),
      data.morningLogs.list(userId, [today]),
    ])

    const todayHabitLogs = habitsWithLogs.flatMap((h: any) =>
      (h.logs || []).filter((l: any) => l.date === today)
    )

    const totalTasks = tasks.length
    const completedTasksToday = tasks.filter(
      (t: any) => t.status === 'done' && t.completedAt && String(t.completedAt).slice(0, 10) === today
    ).length
    const tasksScore = totalTasks > 0 ? (completedTasksToday / totalTasks) * 100 : 0

    const totalHabits = habitsWithLogs.length
    const completedHabitsToday = todayHabitLogs.filter((l: any) => l.completed).length
    const habitsScore = totalHabits > 0 ? (completedHabitsToday / totalHabits) * 100 : 0

    const dayFocusSessions = focusSessions.filter(
      (s: any) => s.startedAt && s.startedAt.startsWith(today)
    )
    const todayFocusMin = dayFocusSessions.filter((s: any) => s.completed).reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)
    const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

    const morningLog = morningResult.length > 0 ? morningResult[0] : null
    const morningScoreVal = morningLog?.score || 0

    const supabase = await getSupabaseAdmin()
    const streak = supabase ? await getUserStreak(supabase, userId) : 0
    const streakScore = Math.min((streak / 30) * 100, 100)

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