import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withAggregateCache } from '@/lib/aggregate-cache'
import { computeDailyScore, habitDueOn, DAILY_FOCUS_TARGET_MIN } from '@/lib/daily-score'
import {
  getTodayCairo,
  isoToCairoDate,
  taskCompletedDay,
  computeStreakFromActivity,
} from '@/lib/rise-utils'

// ============================================================
// /api/rise/analytics — المرحلة 19: التحليلات تبدأ من التجميع
//
// حكم الخطة: «Analytics: charts تبدأ من aggregation وليس تنزيل
// records الخام». الواجهة القديمة كانت تجلب ٤ مجالات خام كاملة
// (سجلات العادات/جلسات التركيز/قياسات الصحة/لوحة الداشبورد)
// وتحسب كل السلاسل على الجهاز. هذا المسار يجمع كل شيء على
// السيرفر ويعيد السلاسل الجاهزة للرسم مباشرة:
//
//   dailyScores   — درجة كل يوم بتفصيلها (مرتّبة تصاعدياً)
//   habitTrend    — نسبة إتمام العادات لكل يوم في النافذة
//   focusByDay    — دقائق التركيز مجمّعة حسب يوم الأسبوع
//   healthTrend   — نقاط النوم/الماء/المزاج لكل يوم
//   records       — الأرقام القياسية (أعلى درجة/أكثر مهام/أطول جلسة)
//   user          — إحصاءات الحساب الحية (سلسلة/خبرة/إنجاز)
//
// الكاش: withAggregateCache بنفس نطاق agg:{userId} الذي تُبطله
// كل مسارات الكتابة تلقائياً (bustAggregateCache) — فأي طفرة
// (إتمام مهمة/عادة/جلسة…) تعني قراءة نظيفة بعدها مباشرة.
//
// درجة اليوم: تُحسب وتُخزن هنا أيضاً (نفس معادلة computeDailyScore
// الموحدة في الداشبورد) — ففتح التحليلات وحدها يكفي لظهور نقطة
// اليوم في الرسوم، تماماً كسلوك الداشبورد السابق.
// ============================================================

export const dynamic = 'force-dynamic'

export const maxDuration = 30

const DAY_NAMES_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** نافذة آخر n يوماً (تصاعدية، بخط Cairo المحلي) */
function lastNDates(n: number, today: string): string[] {
  const base = new Date(`${today}T00:00:00`)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out.push(d.toISOString().split('T')[0])
  }
  return out
}

async function computeAnalytics(userId: string, days: number) {
  const today = getTodayCairo()
  const windowDates = lastNDates(days, today)
  const windowSet = new Set(windowDates)

  const [
    userProfile,
    allTasks,
    habitsWithLogs,
    focusSessions,
    healthRows,
    morningRows,
    dailyScoresRaw,
  ] = await Promise.all([
    data.profiles.get(userId).catch(() => null),
    data.tasks.list(userId),
    data.habits.list(userId),
    // كامل السجل: يغذي أرقام العمر (إجمالي/أطول جلسة) وتوزيع الأسبوع
    data.focusSessions.list(userId, 1000),
    data.healthLogs.list(userId, windowDates),
    data.morningLogs.list(userId, [today]),
    data.dailyScores.list(userId, windowDates),
  ])

  // ── درجة اليوم (نفس مسار الداشبورد بالضبط — معادلة موحدة) ──────
  const personal = (allTasks as any[]).filter((t) => !t.projectId && t.status !== 'cancelled')
  const scheduledToday = personal.filter((t) => t.dueDate === today)
  const bonusDoneToday = personal.filter(
    (t) => !t.dueDate && t.status === 'done' && taskCompletedDay(t) === today,
  )
  const scheduledDone = scheduledToday.filter((t) => t.status === 'done').length
  const tasksCompleted = scheduledDone + bonusDoneToday.length
  const tasksTotal = scheduledToday.length + bonusDoneToday.length

  const allHabitLogs = (habitsWithLogs as any[]).flatMap((h) =>
    (h.logs || []).map((l: any) => ({ ...l, habitId: h.id })),
  )
  const todayLogs = allHabitLogs.filter((l: any) => l.date === today)
  const dueHabits = (habitsWithLogs as any[]).filter((h: any) => habitDueOn(h, today))
  const dueHabitIds = new Set(dueHabits.map((h: any) => h.id))
  const completedHabitsToday = todayLogs.filter(
    (l: any) => l.completed && dueHabitIds.has(l.habitId),
  ).length
  const totalHabitsDue = dueHabits.length

  const todayFocusMin = (focusSessions as any[])
    .filter((s: any) => isoToCairoDate(s.startedAt) === today && s.completed)
    .reduce((sum: number, s: any) => sum + (s.actualMin || 0), 0)

  const morningLog = (morningRows as any[])?.[0] ?? null
  const morningScore = morningLog?.score || 0

  // السلسلة الحية — أي نشاط مكتمل يوقّع يومه (نفس منطق الداشبورد)
  const activeDays = new Set<string>()
  for (const l of allHabitLogs as any[]) {
    if (l.completed && l.date) activeDays.add(String(l.date).slice(0, 10))
  }
  for (const t of allTasks as any[]) {
    if (t.status === 'done') {
      const day = taskCompletedDay(t)
      if (day) activeDays.add(day)
    }
  }
  for (const s of focusSessions as any[]) {
    if (s.completed) {
      const day = isoToCairoDate(s.startedAt)
      if (day) activeDays.add(day)
    }
  }
  for (const m of (morningRows as any[]) || []) {
    if (m?.date) activeDays.add(String(m.date).slice(0, 10))
  }
  const liveStreak = Math.max(
    computeStreakFromActivity(activeDays, today),
    userProfile?.streak || 0,
  )

  const taskScore = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0
  const habitScore = totalHabitsDue > 0 ? Math.round((completedHabitsToday / totalHabitsDue) * 100) : 0
  const focusScore = Math.min(100, Math.round((todayFocusMin / DAILY_FOCUS_TARGET_MIN) * 100))
  const { score: overallScore } = computeDailyScore({
    tasksCompleted,
    tasksTotal,
    habitsCompleted: completedHabitsToday,
    habitsTotal: totalHabitsDue,
    focusMin: todayFocusMin,
    morningScore,
    streak: liveStreak,
  })

  try {
    await data.dailyScores.upsert(userId, today, {
      score: overallScore,
      morningScore,
      taskScore,
      habitScore,
      focusScore,
      journalScore: 0,
    })
  } catch { /* غير حرجة — السلسلة التاريخية تكفي */ }

  // ── dailyScores: السلسلة النهائية مع نقطة اليوم محدّثة ─────────
  const scoreMap = new Map<string, any>()
  for (const s of (dailyScoresRaw || []) as any[]) {
    if (s?.date && windowSet.has(s.date)) scoreMap.set(s.date, s)
  }
  scoreMap.set(today, {
    date: today,
    score: overallScore,
    morningScore,
    taskScore,
    habitScore,
    focusScore,
    healthScore: 0,
    journalScore: 0,
  })
  const dailyScores = windowDates
    .map((date) => {
      const s = scoreMap.get(date)
      return s
        ? {
            date,
            score: s.score || 0,
            morningScore: s.morningScore || 0,
            taskScore: s.taskScore || 0,
            habitScore: s.habitScore || 0,
            focusScore: s.focusScore || 0,
            healthScore: s.healthScore || 0,
            journalScore: s.journalScore || 0,
          }
        : null
    })
    .filter(Boolean)

  // ── habitTrend: نسبة الإتمام اليومية (ضمن نافذة السجلات ٣٠ يوماً) ─
  // data.habits.list يجلب سجلات آخر ٣٠ يوماً فقط — النافذة الأطول
  // تُقصّ عليها (نفس سلوك العميل القديم الذي كان يقرأ نفس المجال).
  const logWindow = Math.min(days, 30)
  const habitCount = (habitsWithLogs as any[]).length
  const logsByDate = new Map<string, number>()
  for (const l of allHabitLogs as any[]) {
    if (l.completed && l.date) {
      logsByDate.set(l.date, (logsByDate.get(l.date) || 0) + 1)
    }
  }
  const habitTrend = lastNDates(logWindow, today).map((date) => ({
    date: date.slice(5),
    rate: habitCount > 0 ? Math.round(((logsByDate.get(date) || 0) / habitCount) * 100) : 0,
  }))
  const todayHabitRate =
    habitCount > 0
      ? Math.round(
          ((todayLogs.filter((l: any) => l.completed).length) / habitCount) * 100,
        )
      : 0

  // أطول سلسلة عادات — تتابع تواريخ الإتمام الفريدة
  let habitLongestStreak = 0
  {
    const dates = [...logsByDate.keys()].sort()
    let streak = 1
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(`${dates[i - 1]}T00:00:00`).getTime()
      const curr = new Date(`${dates[i]}T00:00:00`).getTime()
      const diff = (curr - prev) / 86_400_000
      if (Math.abs(diff - 1) < 0.5) {
        streak++
        habitLongestStreak = Math.max(habitLongestStreak, streak)
      } else {
        streak = 1
      }
    }
    if (habitLongestStreak === 0 && dates.length > 0) habitLongestStreak = 1
  }

  // ── focusByDay: التوزيع حسب يوم الأسبوع (خِطّة القاهرة المحلية) ─
  const dayMinutes = new Array(7).fill(0)
  let longestSessionMin = 0
  let totalFocusMin = 0
  let focusCompletedCount = 0
  for (const s of focusSessions as any[]) {
    if (!s.completed) continue
    focusCompletedCount++
    const min = s.actualMin || 0
    totalFocusMin += min
    if (min > longestSessionMin) longestSessionMin = min
    const day = isoToCairoDate(s.startedAt)
    if (day) {
      const idx = new Date(`${day}T00:00:00`).getDay()
      dayMinutes[idx] += min
    }
  }
  const focusByDay = dayMinutes.map((minutes, idx) => ({
    day: DAY_NAMES_AR[idx],
    minutes: Math.round(minutes),
    hours: Math.round((minutes / 60) * 10) / 10,
  }))

  // دقائق هذا الأسبوع/الأسبوع الماضي (بأيام القاهرة)
  const todayMs = new Date(`${today}T00:00:00`).getTime()
  const dayMs = 86_400_000
  let thisWeekMin = 0
  let lastWeekMin = 0
  for (const s of focusSessions as any[]) {
    if (!s.completed) continue
    const day = isoToCairoDate(s.startedAt)
    if (!day) continue
    const diff = (todayMs - new Date(`${day}T00:00:00`).getTime()) / dayMs
    if (diff >= 0 && diff < 7) thisWeekMin += s.actualMin || 0
    else if (diff >= 7 && diff < 14) lastWeekMin += s.actualMin || 0
  }

  // ── healthTrend: نقاط القياس اليومية (تصاعدية) ─────────────────
  const healthTrend = (healthRows as any[])
    .map((l: any) => ({
      date: String(l.date).slice(0, 10),
      sleep: l.sleepHours || 0,
      water: l.waterGlasses || 0,
      mood: l.mood || 0,
    }))
    .filter((l) => windowSet.has(l.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({ ...l, date: l.date.slice(5) }))

  // ── records: الأرقام القياسية ──────────────────────────────────
  const scores = dailyScores.map((s: any) => s.score || 0)
  const records = {
    highestScore: scores.length > 0 ? Math.round(Math.max(...scores) * 10) / 10 : 0,
    mostTasksInDay:
      dailyScores.length > 0
        ? Math.round(Math.max(...dailyScores.map((s: any) => s.taskScore || 0)) * 10) / 10
        : 0,
    longestFocusMin: longestSessionMin,
  }

  return {
    period: days,
    date: today,
    user: {
      xp: userProfile?.xp || 0,
      level: userProfile?.level || 1,
      streak: liveStreak,
      longestStreak: Math.max(userProfile?.longestStreak || 0, liveStreak),
      totalFocusMin,
      totalTasksDone: (allTasks as any[]).filter((t) => t.status === 'done').length,
    },
    dailyScores,
    habitTrend,
    todayHabitRate,
    habitLongestStreak,
    focusByDay,
    focusTotals: {
      thisWeekMin,
      lastWeekMin,
      totalMin: totalFocusMin,
      completedCount: focusCompletedCount,
      longestSessionMin,
    },
    healthTrend,
    records,
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const raw = Number(searchParams.get('days'))
    const days = raw === 7 || raw === 30 || raw === 90 ? raw : 30

    const payload = await withAggregateCache(
      `agg:${userId}:analytics:${days}`,
      () => computeAnalytics(userId, days),
    )

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Analytics GET error:', error)
    return NextResponse.json({ error: 'تعذر تحميل التحليلات' }, { status: 500 })
  }
}
