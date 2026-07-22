import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getToday, getLast30Days, getWeekDays } from '@/lib/rise-utils'
import { calculateDailyScore, saveDailyScore } from '@/lib/productivity'

export const dynamic = 'force-dynamic'

// Vercel: extend serverless function timeout to 30s for cold starts
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json(
        { error: 'مطلوب تسجيل الدخول', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))

    const today = getToday()
    const last30 = getLast30Days()
    const weekDays = getWeekDays()

    // ✅ FIX: Fetch user profile INCLUDING xp, level, streak from profiles table
    let userProfile: any = null
    let profileStats = {
      level: 1,
      xp: 0,
      streak: 0,
      longestStreak: 0,
      xpToNextLevel: 100,
    }
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const sb = admin as any
        const { data: profile } = await sb
          .from('profiles')
          .select(
            'name, email, avatar, role, xp, level, streak, longest_streak, xp_to_next_level',
          )
          .eq('id', userId)
          .maybeSingle()
        userProfile = profile
        if (profile) {
          profileStats = {
            level: profile.level || 1,
            xp: profile.xp || 0,
            streak: profile.streak || 0,
            longestStreak: profile.longest_streak || 0,
            xpToNextLevel: profile.xp_to_next_level || 100,
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Fetch all data in parallel
    const [
      tasksResult,
      habitsWithLogs,
      focusSessionsResult,
      healthResult,
      morningResult,
      achievements,
      dailyScoresRaw,
      projects,
      goals,
      books,
      journals,
    ] = await Promise.all([
      data.tasks.list(userId).catch(() => []),
      data.habits.list(userId).catch(() => []),
      data.focusSessions.list(userId).catch(() => []),
      data.healthLogs.list(userId, [today]).catch(() => []),
      data.morningLogs.list(userId, [today]).catch(() => []),
      data.userAchievements.list(userId).catch(() => []),
      // Daily scores for last 30 days
      (async () => {
        try {
          const supabase = await getSupabaseAdmin()
          if (!supabase) return []
          const { data: rows } = await (supabase as any)
            .from('daily_scores')
            .select('*')
            .eq('user_id', userId)
            .in('date', last30)
          return (rows ?? []).map((d: any) => ({
            date: d.date,
            score: d.score,
            morningScore: d.morning_score,
            taskScore: d.task_score,
            habitScore: d.habit_score,
            focusScore: d.focus_score,
            healthScore: d.health_score,
            journalScore: d.journal_score,
          }))
        } catch {
          return []
        }
      })(),
      data.projects.list(userId).catch(() => []),
      data.goals.list(userId).catch(() => []),
      data.books.list(userId).catch(() => []),
      data.journals.list(userId, 5).catch(() => []),
    ])

    // Re-sort tasks by createdAt desc and take top 10
    const tasks = [...(tasksResult as any[])]
      .sort((a: any, b: any) =>
        (b.createdAt || '').localeCompare(a.createdAt || ''),
      )
      .slice(0, 10)

    // Filter habits to only include today's logs
    const habits = (habitsWithLogs as any[]).map((h: any) => ({
      ...h,
      logs: (h.logs || []).filter((l: any) => l.date === today),
    }))

    // Filter focus sessions to last 30 days
    const focusSessions = (focusSessionsResult as any[]).filter(
      (s: any) => s.startedAt && s.startedAt >= last30[0],
    )

    // Extract today habit logs
    const todayHabitsLogs = habits.flatMap((h: any) =>
      (h.logs || []).map((l: any) => ({ ...l, habitId: h.id })),
    )

    // Computed metrics
    const completedTasksToday = tasks.filter(
      (t: any) => t.completedAt && String(t.completedAt).startsWith(today),
    ).length
    const completedHabitsToday = todayHabitsLogs.filter(
      (l: any) => l.completed,
    ).length
    const totalHabits = habits.length
    const todayFocusMin = focusSessions
      .filter(
        (s: any) => String(s.startedAt).startsWith(today) && s.completed,
      )
      .reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)

    const totalTasks = tasks.length
    const doneTasks = tasks.filter((t: any) => t.status === 'done').length

    // ✅ FIX: Calculate actual user totals instead of hardcoded zeros
    const totalFocusMin = (focusSessionsResult as any[])
      .filter((s: any) => s.completed)
      .reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)
    const totalTasksDone = (tasksResult as any[]).filter(
      (t: any) => t.status === 'done',
    ).length

    // Extract single records from arrays
    const healthLog = (healthResult as any[]).length > 0 ? (healthResult as any[])[0] : null
    const morningLog = (morningResult as any[]).length > 0 ? (morningResult as any[])[0] : null

    // ✅ FIX: Calculate & save today's productivity score so charts have data
    try {
      const { score: todayScore, breakdown: todayBreakdown } =
        await calculateDailyScore(userId, today, {
          tasks: tasksResult as any[],
          habitsWithLogs: habitsWithLogs as any[],
          focusSessions: focusSessionsResult as any[],
          morningLogs: morningResult as any[],
        })
      await saveDailyScore(userId, today, todayScore, todayBreakdown)
    } catch (e) {
      console.warn('[dashboard] Failed to calculate/save daily score:', e)
    }

    return NextResponse.json({
      user: {
        name: userProfile?.name || 'مستخدم RiseOS',
        // ✅ FIX: Use actual profile stats instead of hardcoded values
        level: profileStats.level,
        xp: profileStats.xp,
        streak: profileStats.streak,
        longestStreak: profileStats.longestStreak,
        totalFocusMin,
        totalTasksDone,
        xpToNextLevel: profileStats.xpToNextLevel,
        avatar: userProfile?.avatar || null,
      },
      today: {
        tasksCompleted: completedTasksToday,
        tasksTotal: totalTasks,
        habitsCompleted: completedHabitsToday,
        habitsTotal: totalHabits,
        focusMin: todayFocusMin,
        morningScore: morningLog?.score || 0,
      },
      tasks: tasks.map((t: any) => ({
        ...t,
        done: t.status === 'done',
        projectName: t.project?.name,
        projectColor: t.project?.color,
      })),
      habits: habits.map((h: any) => ({
        ...h,
        todayCompleted:
          todayHabitsLogs.find((l: any) => l.habitId === h.id)?.completed ||
          false,
        todayCount:
          todayHabitsLogs.find((l: any) => l.habitId === h.id)?.count || 0,
      })),
      recentFocus: focusSessions.slice(0, 5),
      health: healthLog,
      morning: morningLog,
      achievements,
      dailyScores: (dailyScoresRaw || []).sort((a: any, b: any) =>
        a.date.localeCompare(b.date),
      ),
      projects: projects.map((p: any) => ({
        ...p,
        taskCount: (tasksResult as any[]).filter((t: any) => t.projectId === p.id).length,
        doneTaskCount: (tasksResult as any[]).filter(
          (t: any) => t.projectId === p.id && t.status === 'done',
        ).length,
      })),
      goals,
      books,
      journals,
      weekDays,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في تحميل لوحة التحكم' },
      { status: 500 },
    )
  }
}
