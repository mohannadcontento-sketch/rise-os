import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getToday } from '@/lib/rise-utils'

async function calculateScoreForDate(supabase: ReturnType<typeof getSupabase>, userId: string, date: string) {
  const [tasksRes, habitsRes, habitLogsRes, focusSessionsRes, morningLogRes] = await Promise.all([
    supabase.from('Task').select('*').eq('userId', userId),
    supabase.from('Habit').select('*').eq('userId', userId),
    supabase.from('HabitLog').select('*').eq('userId', userId).eq('date', date),
    supabase.from('FocusSession').select('*').eq('userId', userId).gte('startedAt', date + 'T00:00:00').lt('startedAt', date + 'T23:59:59'),
    supabase.from('MorningLog').select('*').eq('userId', userId).eq('date', date).single(),
  ])

  const tasks = tasksRes.data || []
  const habits = habitsRes.data || []
  const habitLogs = habitLogsRes.data || []
  const focusSessions = focusSessionsRes.data || []
  const morningLog = morningLogRes.data

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(
    (t) => t.status === 'done' && t.completedAt?.startsWith(date)
  ).length
  const tasksScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const totalHabits = habits.length
  const completedHabits = habitLogs.filter((l) => l.completed).length
  const habitsScore = totalHabits > 0 ? (completedHabits / totalHabits) * 100 : 0

  const todayFocusMin = focusSessions.filter((s) => s.completed).reduce((sum, s) => sum + (s.actualMin || 0), 0)
  const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

  const morningScore = morningLog?.score || 0

  const { data: user } = await supabase.from('User').select('streak').eq('id', userId).single()
  const streakScore = Math.min(((user?.streak || 0) / 30) * 100, 100)

  return Math.min(Math.round(
    tasksScore * 0.25 + habitsScore * 0.25 + focusScore * 0.20 + morningScore * 0.20 + streakScore * 0.10
  ), 100)
}

export async function GET(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ score: 0, breakdown: {} })
    const supabase = getSupabase()

    const { searchParams } = new URL(req.url)
    const datesParam = searchParams.get('dates')

    if (datesParam) {
      const dates = datesParam.split(',').filter(Boolean)
      const scores = await Promise.all(
        dates.map(async (date) => {
          const score = await calculateScoreForDate(supabase, userId, date.trim())
          return { date: date.trim(), score }
        })
      )
      return NextResponse.json({ scores })
    }

    // Default: calculate for today with breakdown
    const today = getToday()
    const score = await calculateScoreForDate(supabase, userId, today)

    // Recalculate breakdown for today specifically
    const [tasksRes, habitsRes, todayHabitLogsRes, focusSessionsRes, morningLogRes] = await Promise.all([
      supabase.from('Task').select('*').eq('userId', userId),
      supabase.from('Habit').select('*').eq('userId', userId),
      supabase.from('HabitLog').select('*').eq('userId', userId).eq('date', today),
      supabase.from('FocusSession').select('*').eq('userId', userId).gte('startedAt', today + 'T00:00:00').lt('startedAt', today + 'T23:59:59'),
      supabase.from('MorningLog').select('*').eq('userId', userId).eq('date', today).single(),
    ])

    const tasks = tasksRes.data || []
    const habits = habitsRes.data || []
    const todayHabitLogs = todayHabitLogsRes.data || []
    const focusSessions = focusSessionsRes.data || []
    const morningLog = morningLogRes.data

    const totalTasks = tasks.length
    const completedTasksToday = tasks.filter(
      (t) => t.status === 'done' && t.completedAt?.startsWith(today)
    ).length
    const tasksScore = totalTasks > 0 ? (completedTasksToday / totalTasks) * 100 : 0

    const totalHabits = habits.length
    const completedHabitsToday = todayHabitLogs.filter((l) => l.completed).length
    const habitsScore = totalHabits > 0 ? (completedHabitsToday / totalHabits) * 100 : 0

    const todayFocusMin = focusSessions.filter((s) => s.completed).reduce((sum, s) => sum + (s.actualMin || 0), 0)
    const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

    const morningScoreVal = morningLog?.score || 0

    const { data: user } = await supabase.from('User').select('streak').eq('id', userId).single()
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