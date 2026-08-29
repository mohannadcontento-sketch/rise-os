import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { withAggregateCache } from '@/lib/aggregate-cache'
import { taskCompletedDay, getTodayCairo } from '@/lib/rise-utils'

export const dynamic = 'force-dynamic'

async function computeSummary(userId: string, date: string) {
  // PERF: profile fetch runs in the SAME Promise.all as the data queries
  // (was a second sequential round trip), so worst-case latency is one
  // Supabase hop instead of two.
  const [tasks, habits, userProfile] = await Promise.all([
    data.tasks.list(userId).catch(() => []),
    data.habits.list(userId).catch(() => []),
    (async () => {
      try {
        const { getDefaultUser, getSupabaseAdmin } = await import('@/lib/supabase')
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
          return await getDefaultUser()
        }
        const admin = await getSupabaseAdmin()
        if (admin) {
          const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single()
          return profile
        }
      } catch { /* ignore */ }
      return null
    })(),
  ])

  // DAY-SCOPED + Cairo-local (client sends ?date=) — matches the main
  // dashboard route. Before: UTC date + ALL tasks ever = numbers that
  // never reset when the day ends.
  const personal = tasks.filter((t: any) => !t.projectId && t.status !== 'cancelled')
  const scheduledToday = personal.filter((t: any) => t.dueDate === date)
  // TZ FIX: bucket completedAt into the Cairo day (was raw UTC slice).
  const bonusDoneToday = personal.filter(
    (t: any) => !t.dueDate && t.status === 'done' && taskCompletedDay(t) === date,
  )
  const todayTasksDone = scheduledToday.filter((t: any) => t.status === 'done').length + bonusDoneToday.length
  const todayTasksTotal = scheduledToday.length + bonusDoneToday.length
  const todayHabitsDone = habits.filter((h: any) =>
    h.logs?.some((l: any) => l.date === date && l.completed)
  ).length
  const todayHabitsTotal = habits.length

  return {
    user: userProfile ? {
      name: userProfile.name,
      level: userProfile.level,
      xp: userProfile.xp,
      xpToNextLevel: userProfile.xpToNextLevel,
      streak: userProfile.streak,
      totalFocusMin: userProfile.totalFocusMin,
      totalTasksDone: userProfile.totalTasksDone,
    } : null,
    today: {
      tasksCompleted: todayTasksDone,
      tasksTotal: todayTasksTotal,
      habitsCompleted: todayHabitsDone,
      habitsTotal: todayHabitsTotal,
    },
  }
}

/**
 * P2#3: Decomposed dashboard — summary sub-endpoint
 * GET /api/rise/dashboard/summary
 * Returns: user profile, today's task/habit counts, streak, level
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) {
      return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    }

    // Client-local date (Cairo) — same contract as /api/rise/dashboard
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get('date')
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getTodayCairo()

    // _v in the cache key = cross-instance freshness after writes (see
    // api-fetch.ts data-version docs)
    const versionKey = searchParams.get('_v') || '0'
    const summary = await withAggregateCache(`agg:${userId}:summary:${date}:v${versionKey}`, () => computeSummary(userId, date))
    return NextResponse.json(summary)
  } catch (error) {
    console.error('Dashboard summary error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
