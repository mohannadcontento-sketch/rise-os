import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getSupabaseAdmin, getSupabaseWithAuth } from '@/lib/supabase'
import { getToday, getLast30Days, getWeekDays } from '@/lib/rise-utils'
import { withAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

// Vercel: extend serverless function timeout to 30s for cold starts
export const maxDuration = 30

// PERF/EGRESS: this endpoint is hit on every dashboard open
// (dashboard/sidebar/settings/analytics), so its payload is cached per user.
// Write routes call bustAggregateCache() so a fresh read right after a
// mutation never serves pre-mutation numbers. On cache hits the embedded
// dailyScores.upsert is skipped too — fewer Supabase writes per view.
async function fetchUserProfile(userId: string, req: NextRequest): Promise<any> {
  try {
    // Try admin client first (has full access)
    const admin = await getSupabaseAdmin()
    if (admin) {
      const { data: profile } = await admin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      return profile ?? null
    }
    // Try per-user client (RLS allows reading own profile)
    const userClient = await getSupabaseWithAuth(req)
    if (userClient) {
      const { data: profile } = await userClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      return profile ?? null
    }
    // Mock mode: fetch from local Prisma DB
    const { db } = await import('@/lib/db')
    return await (db as any).user.findUnique({ where: { id: userId } })
  } catch {
    return null
  }
}

async function computeDashboard(userId: string, req: NextRequest) {
  const today = getToday()
  const last30 = getLast30Days()
  const weekDays = getWeekDays()

  // Profile fetch runs INSIDE the Promise.all (was a sequential round trip
  // before the data queries) — worst case stays one Supabase hop.
  const [
    userProfile,
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
    fetchUserProfile(userId, req),
    data.tasks.list(userId).catch(() => []),
    data.habits.list(userId).catch(() => []),
    data.focusSessions.list(userId).catch(() => []),
    data.healthLogs.list(userId, [today]).catch(() => []),
    data.morningLogs.list(userId, [today]).catch(() => []),
    data.userAchievements.list(userId).catch(() => []),
    // Daily scores for last 30 days — use data layer (works in both Supabase + mock mode)
    data.dailyScores.list(userId, last30).catch(() => []),
    data.projects.list(userId).catch(() => []),
    data.goals.list(userId).catch(() => []),
    data.books.list(userId).catch(() => []),
    data.journals.list(userId, 5).catch(() => []),
  ])

  // FIX: Use ALL tasks for score calculation, only limit for display
  const allTasks = tasksResult as any[]
  const tasks = [...allTasks]
    .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 10)

  // Filter habits to only include today's logs
  const habits = habitsWithLogs.map((h: any) => ({
    ...h,
    logs: (h.logs || []).filter((l: any) => l.date === today),
  }))

  // Filter focus sessions to last 30 days
  const focusSessions = focusSessionsResult.filter(
    (s: any) => s.startedAt && s.startedAt >= last30[0]
  )

  // Extract today habit logs
  const todayHabitsLogs = habits.flatMap((h: any) =>
    (h.logs || []).map((l: any) => ({ ...l, habitId: h.id })),
  )

  // FIX: Count ALL done tasks (not just the 10 displayed) — user wants any
  // task marked as "done" to count, regardless of dueDate or completedAt
  const completedTasksToday = allTasks.filter(
    (t: any) => t.status === 'done',
  ).length
  const completedHabitsToday = todayHabitsLogs.filter((l: any) => l.completed).length
  const totalHabits = habits.length
  const todayFocusMin = focusSessions
    .filter(
      (s: any) => String(s.startedAt).startsWith(today) && s.completed,
    )
    .reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)

  // FIX: Calculate score using ALL tasks (not just the 10 displayed)
  const totalTasksAll = allTasks.length
  const doneTasksAll = allTasks.filter((t: any) => t.status === 'done').length
  const totalTasks = totalTasksAll
  const doneTasks = doneTasksAll

  // Extract single records from arrays
  const healthLog = healthResult.length > 0 ? healthResult[0] : null
  const morningLog = morningResult.length > 0 ? morningResult[0] : null

  const taskScore = totalTasksAll > 0 ? Math.round((doneTasksAll / totalTasksAll) * 100) : 0
  const habitScore = totalHabits > 0 ? Math.round((completedHabitsToday / totalHabits) * 100) : 0
  const morningScore = morningLog?.score || 0
  const focusScore = Math.min(100, Math.round((todayFocusMin / 50) * 100))
  const overallScore = Math.round(
    taskScore * 0.35 + habitScore * 0.25 + morningScore * 0.2 + focusScore * 0.2
  )

  try {
    await data.dailyScores.upsert(userId, today, {
      score: overallScore,
      morningScore,
      taskScore,
      habitScore,
      focusScore,
      journalScore: 0,
    })
    // Update the dailyScoresRaw with today's new score so the response
    // includes the freshly calculated score (not the old cached one)
    const todayIdx = (dailyScoresRaw || []).findIndex((s: any) => s.date === today)
    const todayScore = { date: today, score: overallScore, morningScore, taskScore, habitScore, focusScore, healthScore: 0, journalScore: 0 }
    if (todayIdx >= 0) {
      (dailyScoresRaw as any[])[todayIdx] = todayScore
    } else {
      (dailyScoresRaw as any[]).push(todayScore)
    }
  } catch { /* non-critical */ }

  return {
    productivityScore: overallScore,
    user: {
      name: userProfile?.name || 'مستخدم RiseOS',
      level: userProfile?.level || 1,
      xp: userProfile?.xp || 0,
      streak: userProfile?.streak || 0,
      longestStreak: userProfile?.longestStreak || 0,
      totalFocusMin: userProfile?.totalFocusMin || 0,
      totalTasksDone: userProfile?.totalTasksDone || 0,
      xpToNextLevel: userProfile?.xpToNextLevel || 100,
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
        todayHabitsLogs.find((l: any) => l.habitId === h.id)?.completed || false,
      todayCount:
        todayHabitsLogs.find((l: any) => l.habitId === h.id)?.count || 0,
    })),
    recentFocus: focusSessions.slice(0, 5),
    health: healthLog,
    morning: morningLog,
    achievements,
    dailyScores: (dailyScoresRaw || []).map((s: any) => ({
      date: s.date,
      score: s.score || 0,
      morningScore: s.morningScore || 0,
      taskScore: s.taskScore || 0,
      focusScore: s.focusScore || 0,
      healthScore: s.healthScore || 0,
      journalScore: s.journalScore || 0,
    })).sort((a: any, b: any) => a.date.localeCompare(b.date)),
    projects: projects.map((p: any) => ({
      ...p,
      taskCount: tasksResult.filter((t: any) => t.projectId === p.id).length,
      doneTaskCount: tasksResult.filter(
        (t: any) => t.projectId === p.id && t.status === 'done',
      ).length,
    })),
    goals,
    books,
    journals,
    weekDays,
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json(
        { error: 'مطلوب تسجيل الدخول', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    setCurrentAuthToken(req)

    const payload = await withAggregateCache(`agg:${userId}:dashboard`, () =>
      computeDashboard(userId, req)
    )
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في تحميل لوحة التحكم' },
      { status: 500 }
    )
  }
}
