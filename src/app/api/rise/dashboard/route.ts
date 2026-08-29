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

/**
 * DAY-SCOPED TASK SET (the "smart day reset" solution):
 *
 * قبل كده الداشبورد كان يحسب كل المهام المكتملة في التاريخ (status==='done')
 * كأنها "إنجاز النهاردة" — فبعد ما اليوم يخلص الأرقام تفضل ثابتة ومش بتتصفر.
 *
 * القواعد الجديدة:
 *  1. "مهام النهاردة" = مهام شخصية (غير مملوكة لمشروع) dueDate === today.
 *  2. أي مهمة شخصية بلا dueDate اتنهضت النهاردة (completedAt today) تعد
 *     "إنجاز إضافي" — بتدخل الأرقام كمكافأة على المبادرة.
 *  3. المهام المتأخرة (dueDate < today && !done) بتشوف في شريط "متأخرة"
 *     منفصل — مش بتحسب في إنجاز النهاردة، فاليوم الجديد بيبدأ بصفر.
 *  4. مهام المشاريع (projectId != null) منفصلة تمامًا — بتظهر في موديول
 *     المشاريع وكروت المشاريع فقط.
 *
 * date comes from the CLIENT (useToday → ?date=) so Cairo-local days are
 * respected instead of the server's UTC clock.
 */
function dayScopedCounts(allTasks: any[], date: string) {
  const personal = allTasks.filter((t: any) => !t.projectId && t.status !== 'cancelled')

  const scheduledToday = personal.filter((t: any) => t.dueDate === date)
  const bonusDoneToday = personal.filter(
    (t: any) => !t.dueDate && t.status === 'done' &&
      t.completedAt && String(t.completedAt).slice(0, 10) === date,
  )

  const scheduledDone = scheduledToday.filter((t: any) => t.status === 'done').length
  const tasksCompleted = scheduledDone + bonusDoneToday.length
  const tasksTotal = scheduledToday.length + bonusDoneToday.length

  const overdue = personal
    .filter((t: any) => t.dueDate && t.dueDate < date && t.status !== 'done')
    .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)))

  return { scheduledToday, bonusDoneToday, tasksCompleted, tasksTotal, overdue }
}

async function computeDashboard(userId: string, req: NextRequest) {
  // Client-driven local date (Cairo) — falls back to server date if absent
  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get('date')
  const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getToday()
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

  const allTasks = tasksResult as any[]
  // Upcoming list: personal (non-project) tasks only — project tasks live in
  // their project board, they shouldn't clutter the dashboard list.
  const tasks = allTasks
    .filter((t: any) => !t.projectId)
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

  // DAY-SCOPED counting — see dayScopedCounts doc above.
  const { tasksCompleted: completedTasksToday, tasksTotal, overdue } = dayScopedCounts(allTasks, today)
  const completedHabitsToday = todayHabitsLogs.filter((l: any) => l.completed).length
  const totalHabits = habits.length
  const todayFocusMin = focusSessions
    .filter(
      (s: any) => String(s.startedAt).startsWith(today) && s.completed,
    )
    .reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)

  // Extract single records from arrays
  const healthLog = healthResult.length > 0 ? healthResult[0] : null
  const morningLog = morningResult.length > 0 ? morningResult[0] : null

  const taskScore = tasksTotal > 0 ? Math.round((completedTasksToday / tasksTotal) * 100) : 0
  const habitScore = totalHabits > 0 ? Math.round((completedHabitsToday / totalHabits) * 100) : 0
  const morningScore = morningLog?.score || 0
  const focusScore = Math.min(100, Math.round((todayFocusMin / 50) * 100))
  // Weighted average that RENORMALIZES when a component has no data today
  // (e.g. zero tasks scheduled) so empty components never drag the score down.
  const scoreParts: [number, number][] = []
  if (tasksTotal > 0) scoreParts.push([taskScore, 0.35])
  if (totalHabits > 0) scoreParts.push([habitScore, 0.25])
  if (morningScore > 0) scoreParts.push([morningScore, 0.2])
  if (focusScore > 0) scoreParts.push([focusScore, 0.2])
  const overallScore = scoreParts.length > 0
    ? Math.round(scoreParts.reduce((s, [v, w]) => s + v * w, 0) / scoreParts.reduce((s, [, w]) => s + w, 0))
    : 0

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
      tasksTotal,
      habitsCompleted: completedHabitsToday,
      habitsTotal: totalHabits,
      focusMin: todayFocusMin,
      morningScore: morningLog?.score || 0,
      overdueCount: overdue.length,
    },
    // Top 5 overdue tasks for the "don't forget" strip (smart rollover UX)
    overdueTasks: overdue.slice(0, 5).map((t: any) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
    })),
    date: today,
    dayScoped: true,
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

    // Cache key MUST include the requested date — day-scoped payloads differ
    // per day (yesterday's cached numbers must never leak into today).
    const dateKey = (() => {
      const { searchParams } = new URL(req.url)
      const d = searchParams.get('date')
      return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : 'server'
    })()
    const payload = await withAggregateCache(`agg:${userId}:dashboard:${dateKey}`, () =>
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
