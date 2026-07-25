import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

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

    // Fetch only what summary needs (3 queries vs 13 in monolithic)
    const [tasks, habits] = await Promise.all([
      data.tasks.list(userId).catch(() => []),
      data.habits.list(userId).catch(() => []),
    ])

    const today = new Date().toISOString().split('T')[0]
    const todayTasksDone = tasks.filter((t: any) => t.status === 'done').length
    const todayTasksTotal = tasks.length
    const todayHabitsDone = habits.filter((h: any) =>
      h.logs?.some((l: any) => l.date === today && l.completed)
    ).length
    const todayHabitsTotal = habits.length

    // Get user profile for level/streak
    let userProfile: any = null
    try {
      const { getDefaultUser } = await import('@/lib/supabase')
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        userProfile = await getDefaultUser()
      } else {
        const { getSupabaseAdmin } = await import('@/lib/supabase')
        const admin = await getSupabaseAdmin()
        if (admin) {
          const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single()
          userProfile = profile
        }
      }
    } catch { /* ignore */ }

    return NextResponse.json({
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
    })
  } catch (error) {
    console.error('Dashboard summary error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
