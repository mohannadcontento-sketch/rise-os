/**
 * productivity.ts — Shared daily productivity score logic.
 * Used by both /api/rise/productivity-score and /api/rise/dashboard
 * to avoid code duplication and ensure consistent scoring.
 */

import { data } from '@/lib/data'
import { getSupabaseAdmin } from '@/lib/supabase'

export interface ScoreBreakdown {
  tasks: number
  habits: number
  focus: number
  morning: number
  streak: number
}

/**
 * Get user's current streak from profiles table.
 */
export async function getUserStreak(userId: string): Promise<number> {
  try {
    const supabase = await getSupabaseAdmin()
    if (!supabase) return 0
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('streak')
      .eq('id', userId)
      .single()
    return (profile as any)?.streak || 0
  } catch {
    return 0
  }
}

/**
 * Calculate the daily productivity score for a given date.
 *
 * Weights:
 *   tasks   25%
 *   habits  25%
 *   focus   20%
 *   morning 20%
 *   streak  10%
 *
 * @param userId   The user's ID
 * @param date     Date string in 'yyyy-MM-dd' format
 * @param preloaded  Optional pre-fetched data to avoid duplicate DB calls
 */
export async function calculateDailyScore(
  userId: string,
  date: string,
  preloaded?: {
    tasks?: any[]
    habitsWithLogs?: any[]
    focusSessions?: any[]
    morningLogs?: any[]
  },
): Promise<{ score: number; breakdown: ScoreBreakdown }> {
  // Use preloaded data if available, otherwise fetch from DB
  const [tasks, habitsWithLogs, focusSessions, morningResult] = preloaded
    ? [
        preloaded.tasks ?? [],
        preloaded.habitsWithLogs ?? [],
        preloaded.focusSessions ?? [],
        preloaded.morningLogs ?? [],
      ]
    : await Promise.all([
        data.tasks.list(userId),
        data.habits.list(userId),
        data.focusSessions.list(userId),
        data.morningLogs.list(userId, [date]),
      ])

  // ── Tasks Score (25%) ──
  const totalTasks = tasks.length
  // FIX: Accept tasks with status 'done' even if completedAt is null (legacy data)
  // For new data, completedAt is auto-set by the tasks API route
  const completedTasks = tasks.filter(
    (t: any) =>
      t.status === 'done' &&
      (!t.completedAt || String(t.completedAt).slice(0, 10) === date),
  ).length
  const tasksScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  // ── Habits Score (25%) ──
  const habitLogs = habitsWithLogs.flatMap((h: any) =>
    (h.logs || []).filter((l: any) => l.date === date),
  )
  const totalHabits = habitsWithLogs.length
  const completedHabits = habitLogs.filter((l: any) => l.completed).length
  const habitsScore = totalHabits > 0 ? (completedHabits / totalHabits) * 100 : 0

  // ── Focus Score (20%) ──
  const dayFocusSessions = focusSessions.filter(
    (s: any) => s.startedAt && s.startedAt.startsWith(date),
  )
  const todayFocusMin = dayFocusSessions
    .filter((s: any) => s.completed)
    .reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)
  const focusScore = Math.min((todayFocusMin / 120) * 100, 100)

  // ── Morning Score (20%) ──
  const morningLog = morningResult.length > 0 ? morningResult[0] : null
  const morningScore = morningLog?.score || 0

  // ── Streak Score (10%) ──
  const streak = await getUserStreak(userId)
  const streakScore = Math.min((streak / 30) * 100, 100)

  const breakdown: ScoreBreakdown = {
    tasks: Math.round(tasksScore),
    habits: Math.round(habitsScore),
    focus: Math.round(focusScore),
    morning: Math.round(morningScore),
    streak: Math.round(streakScore),
  }

  const score = Math.min(
    Math.round(
      tasksScore * 0.25 +
        habitsScore * 0.25 +
        focusScore * 0.2 +
        morningScore * 0.2 +
        streakScore * 0.1,
    ),
    100,
  )

  return { score, breakdown }
}

/**
 * Save the daily score to the daily_scores table.
 * Silently fails if the table doesn't exist or write fails.
 */
export async function saveDailyScore(
  userId: string,
  date: string,
  score: number,
  breakdown: ScoreBreakdown,
): Promise<void> {
  try {
    await data.dailyScores.upsert(userId, date, {
      score,
      taskScore: breakdown.tasks,
      habitScore: breakdown.habits,
      focusScore: breakdown.focus,
      morningScore: breakdown.morning,
    })
  } catch (e) {
    console.warn('[productivity] Failed to save daily score:', e)
  }
}

/**
 * Get Arabic grade label for a score.
 */
export function getGrade(score: number): string {
  if (score >= 90) return 'متميز'
  if (score >= 70) return 'جيد جداً'
  if (score >= 50) return 'جيد'
  if (score >= 30) return 'مقبول'
  return 'يحتاج تحسين'
}
