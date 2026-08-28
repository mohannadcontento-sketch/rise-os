import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { withAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

async function computeSummary(userId: string) {
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

  const today = new Date().toISOString().split('T')[0]
  const todayTasksDone = tasks.filter((t: any) => t.status === 'done').length
  const todayTasksTotal = tasks.length
  const todayHabitsDone = habits.filter((h: any) =>
    h.logs?.some((l: any) => l.date === today && l.completed)
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

    const summary = await withAggregateCache(`agg:${userId}:summary`, () => computeSummary(userId))
    return NextResponse.json(summary)
  } catch (error) {
    console.error('Dashboard summary error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
