import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getTodayCairo, isoToCairoDate, taskCompletedDay, computeStreakFromActivity } from '@/lib/rise-utils'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withAggregateCache } from '@/lib/aggregate-cache'
import { computeDailyScore, habitDueOn } from '@/lib/daily-score'

export const dynamic = 'force-dynamic'

async function getUserStreak(userId: string): Promise<number> {
  // Try Supabase admin first
  const supabase = await getSupabaseAdmin()
  if (supabase) {
    // FIX: chaining .catch() on the query builder crashed in the production
    // build ("catch is not a function"). Await + try/catch is equivalent
    // and safe.
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('streak')
        .eq('id', userId)
        .single()
      return (profile as { streak?: number } | null)?.streak || 0
    } catch {
      return 0
    }
  }
  // Mock mode: fetch from Prisma
  try {
    const { db } = await import('@/lib/db')
    const user = await (db as any).user.findUnique({ where: { id: userId }, select: { streak: true } })
    return user?.streak || 0
  } catch { return 0 }
}

// PERF: fetch each dataset exactly once for ALL requested dates, then score
// locally. The previous shape re-queried tasks/habits/focus (+streak) per date
// AND a second full pass for the breakdown — ~10 round trips per default GET.
async function computeScores(userId: string, dates: string[]) {
  const [tasks, habitsWithLogs, focusSessions, morningLogs, streak] = await Promise.all([
    data.tasks.list(userId),
    data.habits.list(userId),
    // BIG limit: per-date focus buckets span a month — the old default (50)
    // silently dropped older sessions from the charts.
    data.focusSessions.list(userId, 1000),
    data.morningLogs.list(userId, dates),
    getUserStreak(userId),
  ])

  // DAY-SCOPED per-date task score (matches the dashboard's smart day reset):
  // scheduled on that date (dueDate===date) + personal tasks completed that day
  // without a dueDate ("bonus"). Before: one all-time ratio applied to every date.
  const personal = tasks.filter((t: any) => !t.projectId && t.status !== 'cancelled')

  // LIVE STREAK (same rule as the dashboard route): the stored profiles.streak
  // never updates in Supabase mode — derive it from real activity instead.
  const streakActiveDays = new Set<string>()
  for (const h of habitsWithLogs as any[]) {
    for (const l of (h.logs || []) as any[]) {
      if (l.completed && l.date) streakActiveDays.add(String(l.date).slice(0, 10))
    }
  }
  for (const t of tasks as any[]) {
    if (t.status === 'done') {
      const day = taskCompletedDay(t)
      if (day) streakActiveDays.add(day)
    }
  }
  for (const s of focusSessions as any[]) {
    if (s.completed) {
      const day = isoToCairoDate(s.startedAt)
      if (day) streakActiveDays.add(day)
    }
  }
  for (const m of (morningLogs as any[]) || []) {
    if (m?.date) streakActiveDays.add(String(m.date).slice(0, 10))
  }
  const liveStreak = Math.max(
    computeStreakFromActivity(streakActiveDays, getTodayCairo()),
    streak || 0,
  )

  return dates.map((date) => {
    // DAY-SCOPED per-date task score (matches the dashboard's smart day reset):
    // scheduled on that date (dueDate===date) + personal tasks completed that day
    // without a dueDate ("bonus"). Before: one all-time ratio applied to every date.
    const scheduled = personal.filter((t: any) => t.dueDate === date)
    // TZ FIX: bucket completions into the Cairo day (was raw UTC slice).
    const bonus = personal.filter(
      (t: any) => !t.dueDate && t.status === 'done' && taskCompletedDay(t) === date,
    )
    const done = scheduled.filter((t: any) => t.status === 'done').length + bonus.length
    const tasksTotal = scheduled.length + bonus.length

    // HABITS: المستحقة في هذا التاريخ فقط (weekdays/weekends لا تجرّ يوم غيرها)
    // — كانت المقارنة على كل العادات مهما كانت مستحقة.
    const dueHabits = (habitsWithLogs as any[]).filter((h: any) => habitDueOn(h, date))
    const completedDue = dueHabits.reduce(
      (n: number, h: any) => n + ((h.logs || []) as any[]).filter(
        (l: any) => l.completed && l.date && String(l.date).slice(0, 10) === date,
      ).length,
      0,
    )

    const dayFocusSessions = focusSessions.filter(
      (s: any) => isoToCairoDate(s.startedAt) === date
    )
    const dayFocusMin = dayFocusSessions
      .filter((s: any) => s.completed)
      .reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)

    const morningLog = (morningLogs as any[]).find(
      (m: any) => m.date && String(m.date).slice(0, 10) === date
    ) || null

    // UNIFIED DAILY SCORE — نفس معادلة dashboard API حرفياً (كانت معادلتان
    // مختلفتان بأوزان مختلفة فكانت أرقام الداشبورد لا تطابق المراجعات).
    const { score, breakdown } = computeDailyScore({
      tasksCompleted: done,
      tasksTotal,
      habitsCompleted: completedDue,
      habitsTotal: dueHabits.length,
      focusMin: dayFocusMin,
      morningScore: morningLog?.score || 0,
      streak: liveStreak,
    })

    return { date, score, breakdown }
  })
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const datesParam = searchParams.get('dates')

    if (datesParam) {
      const dates = [...new Set(datesParam.split(',').map(d => d.trim()).filter(Boolean))]
      // _v in the cache key = cross-instance freshness after writes
      const { searchParams: sp } = new URL(req.url)
      const versionKey = sp.get('_v') || '0'
      const key = `agg:${userId}:scores:${[...dates].sort().join(',')}:v${versionKey}`
      const scores = await withAggregateCache(key, () => computeScores(userId, dates))
      return NextResponse.json({ scores })
    }

    // Default: calculate for today with breakdown
    const today = getTodayCairo()
    const result = (
      await withAggregateCache(`agg:${userId}:scores:${today}:v0`, () =>
        computeScores(userId, [today])
      )
    )[0]

    let grade: string
    if (result.score >= 90) grade = 'متميز'
    else if (result.score >= 70) grade = 'جيد جداً'
    else if (result.score >= 50) grade = 'جيد'
    else if (result.score >= 30) grade = 'مقبول'
    else grade = 'يحتاج تحسين'

    return NextResponse.json({
      score: result.score,
      breakdown: result.breakdown,
      grade,
    })
  } catch (error) {
    console.error('Productivity score error:', error)
    return NextResponse.json({ score: 0, breakdown: { tasks: 0, habits: 0, focus: 0, morning: 0, streak: 0 }, grade: 'يحتاج تحسين' })
  }
}
