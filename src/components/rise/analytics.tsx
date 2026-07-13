'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import {
  BarChart3,
  Zap,
  CheckCircle2,
  Clock,
  Flame,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Brain,
  Target,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
  Calendar,
  Timer,
  Star,
  AlertCircle,
  Lightbulb,
  Info,
  BarChart3 as BarChartIcon,
  ArrowLeftRight,
  Medal,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

/* ────────────── Types ────────────── */

interface DashboardData {
  user: {
    name: string
    level: number
    xp: number
    streak: number
    longestStreak: number
    totalFocusMin: number
    totalTasksDone: number
  }
  dailyScores: { date: string; score: number; morningScore: number; taskScore: number; habitScore: number; focusScore: number; healthScore: number; journalScore: number }[]
}

interface HabitData {
  habits: { id: string; name: string }[]
  logs: { habitId: string; date: string; completed: boolean }[]
}

interface FocusData {
  sessions: { id: string; duration: number; actualMin: number; completed: boolean; startedAt: string }[]
}

interface HealthData {
  logs: { date: string; sleepHours: number | null; waterGlasses: number | null; mood: number | null; energy: number | null }[]
}

type Period = 'weekly' | 'monthly' | 'yearly'

const periodLabels: Record<Period, string> = {
  weekly: 'أسبوعي',
  monthly: 'شهري',
  yearly: 'سنوي',
}

const CHART_COLORS = [
  'oklch(0.55 0.14 163)',
  'oklch(0.78 0.12 85)',
  'oklch(0.65 0.10 200)',
  'oklch(0.70 0.15 300)',
  'oklch(0.60 0.20 25)',
  'oklch(0.35 0.10 160)',
]

const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/* Glass-themed tooltip with dark mode support */
const ARABIC_LABELS: Record<string, string> = {
  score: 'الدرجة',
  rate: 'النسبة',
  hours: 'ساعات',
  minutes: 'دقائق',
  sleep: 'النوم (ساعات)',
  water: 'الماء (كؤوس)',
  mood: 'المزاج',
  thisWeek: 'هذا الأسبوع',
  lastWeek: 'الأسبوع الماضي',
}

function GlassTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  const isDark = document.documentElement.classList.contains('dark')
  return (
    <div
      className={cn(
        'rounded-xl px-3.5 py-2.5 text-xs space-y-1.5 shadow-lg',
        isDark
          ? 'bg-[oklch(0.18_0.02_155/0.92)] border border-[oklch(0.30_0.02_155)]'
          : 'bg-[oklch(0.98_0.002_106/0.92)] border border-[oklch(0.88_0.01_160)]'
      )}
      style={{ backdropFilter: 'blur(16px)', boxShadow: isDark ? '0 4px 24px oklch(0 0 0/0.3)' : '0 4px 24px oklch(0.55 0.14 163/0.08)' }}
    >
      <p className={cn('font-semibold', isDark ? 'text-[oklch(0.93_0.01_106)]' : 'text-[oklch(0.15_0.01_160)]')}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className={isDark ? 'text-[oklch(0.70_0.01_160)]' : 'text-[oklch(0.50_0.01_160)]'}>
              {ARABIC_LABELS[entry.dataKey || entry.name] || entry.name}
            </span>
          </div>
          <span className={cn('font-bold', isDark ? 'text-[oklch(0.93_0.01_106)]' : 'text-[oklch(0.15_0.01_160)]')}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ────────────── Animated Counter ────────────── */

function AnimatedCounter({ target, className }: { target: number; className?: string }) {
  const mv = useMotionValue(0)
  const display = useTransform(mv, v => Math.round(v))
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const controls = animate(mv, target, { duration: 0.8, ease: 'easeOut' })
    return controls.stop
  }, [mv, target])
  useEffect(() => {
    const unsubscribe = display.on('change', v => {
      if (ref.current) ref.current.textContent = String(v)
    })
    return unsubscribe
  }, [display])
  return <span ref={ref} className={className}>{target}</span>
}

/* ────────────── Performance Grade ────────────── */

function getGrade(score: number): { letter: string; color: string; glow: string } {
  if (score >= 95) return { letter: 'A+', color: 'text-emerald-accent', glow: 'glow-emerald' }
  if (score >= 85) return { letter: 'A', color: 'text-emerald-accent', glow: '' }
  if (score >= 75) return { letter: 'B+', color: 'text-forest', glow: '' }
  if (score >= 65) return { letter: 'B', color: 'text-forest', glow: '' }
  if (score >= 55) return { letter: 'C+', color: 'text-gold', glow: '' }
  if (score >= 45) return { letter: 'C', color: 'text-gold', glow: '' }
  if (score >= 35) return { letter: 'D', color: 'text-orange-500', glow: '' }
  return { letter: 'F', color: 'text-red-500', glow: '' }
}

/* ────────────── Component ────────────── */

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('weekly')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [habits, setHabits] = useState<HabitData | null>(null)
  const [focus, setFocus] = useState<FocusData | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [compareMode, setCompareMode] = useState(false)

  // Average score for performance grade
  const avgScore = useMemo(() => {
    if (!dashboard?.dailyScores?.length) return 0
    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90
    const recent = dashboard.dailyScores.slice(-days)
    return recent.length > 0 ? Math.round(recent.reduce((s, d) => s + d.score, 0) / recent.length) : 0
  }, [dashboard, period])

  const grade = getGrade(avgScore)

  useEffect(() => {
    async function load() {
      try {
        const [dashRes, habitRes, focusRes, healthRes] = await Promise.all([
          fetch('/api/rise/dashboard'),
          fetch('/api/rise/habits'),
          fetch('/api/rise/focus'),
          fetch('/api/rise/health'),
        ])
        const [dash, habit, foc, hlt] = await Promise.all([
          dashRes.json(),
          habitRes.json(),
          focusRes.json(),
          healthRes.json(),
        ])
        setDashboard(dash)
        setHabits(habit)
        setFocus(foc)
        setHealth(hlt)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ─── Computed Charts ───

  const productivityData = useMemo(() => {
    if (!dashboard?.dailyScores) return []
    const scores = dashboard.dailyScores.slice(-(period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90))
    return scores.map((s) => ({
      date: s.date.slice(5),
      score: Math.round(s.score),
    }))
  }, [dashboard, period])

  const habitTrendData = useMemo(() => {
    if (!habits) return []
    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90
    const today = new Date()
    const result: { date: string; rate: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      const dayLogs = habits.logs.filter((l) => l.date === key)
      const total = habits.habits.length
      const completed = dayLogs.filter((l) => l.completed).length
      result.push({
        date: key.slice(5),
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      })
    }
    return result
  }, [habits, period])

  const focusByDayData = useMemo(() => {
    if (!focus) return []
    const dayMap: Record<string, number> = {}
    dayNamesAr.forEach((d) => (dayMap[d] = 0))
    focus.sessions
      .filter((s) => s.completed)
      .forEach((s) => {
        const day = new Date(s.startedAt).getDay()
        dayMap[dayNamesAr[day]] = (dayMap[dayNamesAr[day]] || 0) + s.actualMin
      })
    return dayNamesAr.map((name) => ({
      day: name,
      minutes: dayMap[name],
      hours: Math.round((dayMap[name] / 60) * 10) / 10,
    }))
  }, [focus])

  const taskCompletionData = useMemo(() => {
    if (!dashboard?.dailyScores) return []
    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90
    const scores = dashboard.dailyScores.slice(-days)
    return scores.map((s) => ({
      date: s.date.slice(5),
      tasks: Math.round(s.taskScore * 10) / 10,
    }))
  }, [dashboard, period])

  const healthTrendsData = useMemo(() => {
    if (!health?.logs) return []
    const logs = health.logs.slice(-(period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90)).reverse()
    return logs.map((l) => ({
      date: l.date.slice(5),
      sleep: l.sleepHours || 0,
      water: l.waterGlasses || 0,
      mood: l.mood || 0,
    }))
  }, [health, period])

  const goalDistributionData = useMemo(() => {
    if (!dashboard?.dailyScores?.length) return []
    const latest = dashboard.dailyScores[dashboard.dailyScores.length - 1]
    if (!latest) return []
    return [
      { name: 'الصباح', value: Math.round(latest.morningScore) || 1 },
      { name: 'المهام', value: Math.round(latest.taskScore) || 1 },
      { name: 'العادات', value: Math.round(latest.habitScore) || 1 },
      { name: 'التركيز', value: Math.round(latest.focusScore) || 1 },
      { name: 'الصحة', value: Math.round(latest.healthScore) || 1 },
      { name: 'اليوميات', value: Math.round(latest.journalScore) || 1 },
    ]
  }, [dashboard])

  // Best/Worst Day
  const { bestDay, worstDay } = useMemo(() => {
    if (!dashboard?.dailyScores || dashboard.dailyScores.length < 2) {
      return { bestDay: null, worstDay: null }
    }
    const dayScores: Record<number, { total: number; count: number }> = {}
    dashboard.dailyScores.forEach((s) => {
      const day = new Date(s.date).getDay()
      if (!dayScores[day]) dayScores[day] = { total: 0, count: 0 }
      dayScores[day].total += s.score
      dayScores[day].count++
    })
    let bestKey = 0, worstKey = 0, bestAvg = 0, worstAvg = 10
    Object.entries(dayScores).forEach(([day, { total, count }]) => {
      const avg = total / count
      if (avg > bestAvg) { bestAvg = avg; bestKey = parseInt(day) }
      if (avg < worstAvg) { worstAvg = avg; worstKey = parseInt(day) }
    })
    return {
      bestDay: { name: dayNamesAr[bestKey], avg: Math.round(bestAvg * 10) / 10 },
      worstDay: { name: dayNamesAr[worstKey], avg: Math.round(worstAvg * 10) / 10 },
    }
  }, [dashboard])

  // Personal Records
  const personalRecords = useMemo(() => {
    if (!dashboard?.dailyScores || !focus) return null
    const scores = dashboard.dailyScores
    const highestScore = scores.length > 0 ? Math.round(Math.max(...scores.map((s) => s.score)) * 10) / 10 : 0
    const longestFocus = focus.sessions.length > 0 ? Math.max(...focus.sessions.filter((s) => s.completed).map((s) => s.actualMin || 0)) : 0

    // Most tasks in a day
    const mostTasks = scores.length > 0 ? Math.round(Math.max(...scores.map((s) => s.taskScore)) * 10) / 10 : 0

    // Longest habit streak
    let longestStreak = 0
    if (habits?.logs?.length && habits?.habits?.length) {
      const allDates = [...new Set(habits.logs.filter((l) => l.completed).map((l) => l.date))].sort()
      let streak = 1
      for (let i = 1; i < allDates.length; i++) {
        const prev = new Date(allDates[i - 1])
        const curr = new Date(allDates[i])
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
        if (Math.abs(diffDays - 1) < 0.5) {
          streak++
          longestStreak = Math.max(longestStreak, streak)
        } else {
          streak = 1
        }
      }
      if (longestStreak === 0 && allDates.length > 0) longestStreak = 1
    }

    return { highestScore, longestFocus, mostTasks, longestStreak }
  }, [dashboard, focus, habits])

  // Weekly Comparison
  const weeklyComparison = useMemo(() => {
    if (!dashboard?.dailyScores || dashboard.dailyScores.length < 7) return null
    const scores = dashboard.dailyScores
    const thisWeek = scores.slice(-7)
    const lastWeek = scores.slice(-14, -7)
    if (lastWeek.length === 0) return null

    const avgThis = thisWeek.length > 0 ? Math.round((thisWeek.reduce((s, d) => s + d.score, 0) / thisWeek.length) * 10) / 10 : 0
    const avgLast = lastWeek.length > 0 ? Math.round((lastWeek.reduce((s, d) => s + d.score, 0) / lastWeek.length) * 10) / 10 : 0

    const focusThis = focus?.sessions?.filter((s) => {
      const d = new Date(s.startedAt)
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      return s.completed && d >= weekAgo
    }).reduce((sum, s) => sum + (s.actualMin || 0), 0) || 0

    const focusLast = focus?.sessions?.filter((s) => {
      const d = new Date(s.startedAt)
      const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
      const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      return s.completed && d >= twoWeeksAgo && d < oneWeekAgo
    }).reduce((sum, s) => sum + (s.actualMin || 0), 0) || 0

    return {
      scoreData: [
        { name: 'الأسبوع الماضي', value: avgLast },
        { name: 'هذا الأسبوع', value: avgThis },
      ],
      focusData: [
        { name: 'الأسبوع الماضي', value: Math.round(focusLast / 60 * 10) / 10 },
        { name: 'هذا الأسبوع', value: Math.round(focusThis / 60 * 10) / 10 },
      ],
      scoreChange: avgLast > 0 ? Math.round(((avgThis - avgLast) / avgLast) * 100) : 0,
    }
  }, [dashboard, focus])

  const insights = useMemo(() => {
    const items: { icon: React.ElementType; text: string; type: 'positive' | 'negative' | 'neutral'; label: string }[] = []
    if (dashboard) {
      const { streak, longestStreak, totalTasksDone, totalFocusMin } = dashboard.user
      items.push({
        icon: Flame,
        text: streak > 0 ? `سلسلتك الحالية: ${streak} يوم متتالي` : 'ابدأ سلسلتك اليوم!',
        type: streak > 0 ? 'positive' : 'neutral',
        label: 'السلسلة',
      })
      items.push({
        icon: Award,
        text: `أطول سلسلة: ${longestStreak} يوم`,
        type: longestStreak >= 7 ? 'positive' : 'neutral',
        label: 'إنجاز',
      })
      items.push({
        icon: CheckCircle2,
        text: `إجمالي المهام المنجزة: ${totalTasksDone}`,
        type: totalTasksDone > 0 ? 'positive' : 'neutral',
        label: 'إنتاجية',
      })
      items.push({
        icon: Clock,
        text: `إجمالي وقت التركيز: ${Math.round(totalFocusMin / 60)} ساعة`,
        type: totalFocusMin >= 600 ? 'positive' : totalFocusMin > 0 ? 'neutral' : 'negative',
        label: 'تركيز',
      })
      if (dashboard.dailyScores?.length >= 2) {
        const lastWeek = dashboard.dailyScores.slice(-7)
        const avg = lastWeek.reduce((s, d) => s + d.score, 0) / lastWeek.length
        items.push({
          icon: avg >= 7 ? TrendingUp : TrendingDown,
          text: `متوسط الدرجات هذا الأسبوع: ${Math.round(avg * 10) / 10}`,
          type: avg >= 7 ? 'positive' : 'negative',
          label: 'اتجاه',
        })
      }
    }
    if (habits) {
      const today = new Date().toISOString().split('T')[0]
      const todayCompleted = habits.logs.filter((l) => l.date === today && l.completed).length
      const rate = habits.habits.length > 0 ? Math.round((todayCompleted / habits.habits.length) * 100) : 0
      items.push({
        icon: Target,
        text: `إكمال العادات اليوم: ${rate}%`,
        type: rate >= 80 ? 'positive' : rate >= 50 ? 'neutral' : 'negative',
        label: 'عادات',
      })
    }
    return items
  }, [dashboard, habits])

  const totalXP = dashboard?.user.xp || 0
  const totalTasks = dashboard?.user.totalTasksDone || 0
  const totalFocusHours = Math.round((dashboard?.user.totalFocusMin || 0) / 60)
  const currentStreak = dashboard?.user.streak || 0

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-accent" />
            التحليلات
          </h2>
          <p className="text-sm text-muted-foreground mt-1">نظرة شاملة على أدائك وتقدمك</p>
        </div>
        {/* Period Selector with glass gradient border */}
        <motion.div
          className="p-[1px] rounded-xl bg-gradient-to-l from-emerald-accent/40 via-emerald-accent/15 to-amber-500/30 shadow-lg shadow-emerald-accent/5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-0.5 bg-background/60 dark:bg-card/60 rounded-xl p-1" style={{ backdropFilter: 'blur(12px)' }}>
            {(Object.keys(periodLabels) as Period[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant="ghost"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-lg text-xs transition-all',
                  period === p
                    ? 'bg-gradient-to-l from-emerald-accent to-emerald-accent/80 text-white font-semibold shadow-md shadow-emerald-accent/20'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {periodLabels[p]}
              </Button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الخبرة', value: totalXP, icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: 'المهام المنجزة', value: totalTasks, icon: CheckCircle2, color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
          { label: 'ساعات التركيز', value: totalFocusHours, icon: Clock, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-700/10 dark:bg-emerald-400/10' },
          { label: 'السلسلة الحالية', value: currentStreak, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn('p-2 rounded-xl', stat.bg, stat.color)}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold"><AnimatedCounter target={stat.value} /></p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Performance Grade Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <div className={cn("premium-card rounded-2xl overflow-hidden relative", grade.glow)}>
          <div className="noise-bg" />
          <div className="relative z-10 p-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="flex flex-col items-center">
              <motion.div
                key={grade.letter}
                initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <p className={cn("text-8xl font-black", grade.color)}>{grade.letter}</p>
              </motion.div>
              <div className="flex items-center gap-1 mt-1">
                <Medal className="w-3.5 h-3.5 text-gold" />
                <p className="text-xs text-muted-foreground">التقدير العام</p>
              </div>
            </div>
            <div className="flex-1 text-center sm:text-right space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">متوسط الدرجة ({periodLabels[period]})</p>
                <p className="text-4xl font-black text-foreground">
                  <AnimatedCounter target={avgScore} className={grade.color} />
                  <span className="text-lg text-muted-foreground">/ ١٠٠</span>
                </p>
              </div>
              <div className="flex items-center gap-2 justify-center sm:justify-start flex-wrap">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">الأفضل:</span>
                  {bestDay && <span className="font-bold text-emerald-accent">{bestDay.name} ({bestDay.avg})</span>}
                </div>
                <span className="text-muted-foreground/30">|</span>
                <div className="flex items-center gap-1 text-xs">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCompareMode(!compareMode)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                      compareMode
                        ? "bg-emerald-accent/15 text-emerald-accent border border-emerald-accent/30"
                        : "bg-muted/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    {compareMode ? 'إخفاء المقارنة' : 'وضع المقارنة'}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Best Day with Trophy */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bestDay && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <Card className="glass border-emerald-accent/20 overflow-hidden">
              <div className="bg-gradient-to-l from-emerald-accent/8 to-transparent p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-emerald-accent/15">
                    <Trophy className="w-4 h-4 text-amber-500" />
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">أفضل يوم</p>
                </div>
                <p className="text-3xl font-bold text-emerald-accent mb-1">{bestDay.name}</p>
                <p className="text-sm text-muted-foreground">
                  متوسط الدرجة: <span className="font-bold text-foreground text-lg">{bestDay.avg}</span>
                </p>
              </div>
            </Card>
          </motion.div>
        )}
        {worstDay && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Card className="glass border-rose-500/20 overflow-hidden">
              <div className="bg-gradient-to-l from-rose-500/8 to-transparent p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-rose-500/15">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">يوم يحتاج تحسين</p>
                </div>
                <p className="text-3xl font-bold text-rose-500 mb-1">{worstDay.name}</p>
                <p className="text-sm text-muted-foreground">
                  متوسط الدرجة: <span className="font-bold text-foreground text-lg">{worstDay.avg}</span>
                </p>
              </div>
            </Card>
          </motion.div>
        )}
        {weeklyComparison && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <Card className="glass border-blue-500/20 overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  مقارنة أسبوعية
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyComparison.scoreData} barSize={28}>
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'oklch(0.5 0.01 160)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: 'oklch(0.5 0.01 160)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<GlassTooltip />} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} name="الدرجة">
                        {weeklyComparison.scoreData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? 'oklch(0.70 0.05 200 / 0.5)' : 'oklch(0.55 0.14 163)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  {weeklyComparison.scoreChange >= 0 ? (
                    <Badge className="bg-emerald-accent/10 text-emerald-accent border-0 text-[10px] gap-0.5">
                      <ArrowUpRight className="w-3 h-3" />
                      +{Math.abs(weeklyComparison.scoreChange)}%
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-500/10 text-rose-500 border-0 text-[10px] gap-0.5">
                      <ArrowDownRight className="w-3 h-3" />
                      {weeklyComparison.scoreChange}%
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Personal Records */}
      {personalRecords && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <Card className="glass border-amber-500/20 overflow-hidden border-r-4 border-r-amber-500">
            <div className="bg-gradient-to-l from-amber-500/8 to-transparent p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-amber-500/15">
                  <Trophy className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-sm font-semibold">الأرقام القياسية الشخصية</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-xl bg-background/50">
                  <div className="p-2 w-10 h-10 mx-auto rounded-xl bg-amber-500/10 mb-2">
                    <Star className="w-5 h-5 text-amber-500 mx-auto" />
                  </div>
                  <p className="text-2xl font-bold">{personalRecords.highestScore}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">أعلى درجة يومية</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-background/50">
                  <div className="p-2 w-10 h-10 mx-auto rounded-xl bg-emerald-accent/10 mb-2">
                    <Timer className="w-5 h-5 text-emerald-accent mx-auto" />
                  </div>
                  <p className="text-2xl font-bold">{personalRecords.longestFocus}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">أطول جلسة تركيز (دقيقة)</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-background/50">
                  <div className="p-2 w-10 h-10 mx-auto rounded-xl bg-emerald-700/10 dark:bg-emerald-400/10 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 mx-auto" />
                  </div>
                  <p className="text-2xl font-bold">{personalRecords.mostTasks}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">أعلى إنجاز مهام</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-background/50">
                  <div className="p-2 w-10 h-10 mx-auto rounded-xl bg-orange-500/10 mb-2">
                    <Flame className="w-5 h-5 text-orange-500 mx-auto" />
                  </div>
                  <p className="text-2xl font-bold">{personalRecords.longestStreak}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">أطول سلسلة عادات</p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Charts Row 1 - Glass Cards */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Productivity Trend */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-accent" />
                اتجاه الإنتاجية
              </CardTitle>
            </CardHeader>
            <CardContent>
              {productivityData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={productivityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.85 0.005 160)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'oklch(0.5 0.01 160)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'oklch(0.5 0.01 160)' }} />
                      <Tooltip content={<GlassTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="oklch(0.55 0.14 163)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: 'oklch(0.55 0.14 163)' }}
                        activeDot={{ r: 5 }}
                        name="الدرجة"
                      >
                        <defs>
                          <linearGradient id="prodLineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Habit Completion Trend */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="glass overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                نسبة إكمال العادات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {habitTrendData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={habitTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.85 0.005 160)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'oklch(0.5 0.01 160)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'oklch(0.5 0.01 160)' }} unit="%" />
                      <Tooltip content={<GlassTooltip />} />
                      <defs>
                        <linearGradient id="habitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="rate"
                        stroke="oklch(0.55 0.14 163)"
                        fill="url(#habitGrad)"
                        strokeWidth={2}
                        name="النسبة"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 2 - Glass Cards */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Focus Time Distribution */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="glass overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-amber-500" />
                توزيع وقت التركيز (بالساعات)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={focusByDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.85 0.005 160)" />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'oklch(0.5 0.01 160)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'oklch(0.5 0.01 160)' }} />
                    <Tooltip content={<GlassTooltip />} />
                    <Bar
                      dataKey="hours"
                      fill="oklch(0.55 0.14 163)"
                      radius={[6, 6, 0, 0]}
                      name="ساعات"
                    >
                      <defs>
                        <linearGradient id="focusBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.55 0.14 163)" stopOpacity={1} />
                          <stop offset="100%" stopColor="oklch(0.35 0.10 160)" stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Goal Progress Distribution (Pie) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="glass overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                توزيع التقدم حسب المجال
              </CardTitle>
            </CardHeader>
            <CardContent>
              {goalDistributionData.length > 0 ? (
                <div className="h-56 flex items-center">
                  <div className="w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={goalDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {goalDistributionData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<GlassTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-1/2 space-y-2">
                    {goalDistributionData.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs text-muted-foreground flex-1">{item.name}</span>
                        <span className="text-xs font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Health Trends - Glass Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="glass overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-500" />
              اتجاهات الصحة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthTrendsData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthTrendsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.85 0.005 160)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'oklch(0.5 0.01 160)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'oklch(0.5 0.01 160)' }} />
                    <Tooltip content={<GlassTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, direction: 'rtl' }} />
                    <Line type="monotone" dataKey="sleep" stroke="oklch(0.55 0.10 250)" strokeWidth={2} name="النوم (ساعات)" />
                    <Line type="monotone" dataKey="water" stroke="oklch(0.60 0.15 200)" strokeWidth={2} name="الماء (كؤوس)" />
                    <Line type="monotone" dataKey="mood" stroke="oklch(0.78 0.12 85)" strokeWidth={2} name="المزاج" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات صحية</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Insights - Colored Cards */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="glass overflow-hidden border-r-4 border-r-emerald-accent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              رؤى وتحليلات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Auto-generated Arabic insights */}
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {bestDay && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3.5 rounded-xl bg-emerald-accent/5 border border-emerald-accent/10"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-emerald-accent" />
                    <span className="text-xs font-semibold text-emerald-accent">أكثر إنتاجية</span>
                  </div>
                  <p className="text-sm text-foreground">أنت أكثر إنتاجية يوم {bestDay.name} 📈</p>
                </motion.div>
              )}
              {personalRecords && personalRecords.longestStreak >= 3 && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3.5 rounded-xl bg-gold/5 border border-gold/10"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="w-4 h-4 text-gold" />
                    <span className="text-xs font-semibold text-gold">سلسلة قوية</span>
                  </div>
                  <p className="text-sm text-foreground">أطول سلسلة عادات: {personalRecords.longestStreak} يوم متتالي 🔥</p>
                </motion.div>
              )}
              {personalRecords && personalRecords.longestFocus >= 30 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/10"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-4 h-4 text-sky-500" />
                    <span className="text-xs font-semibold text-sky-500">تركيز عميق</span>
                  </div>
                  <p className="text-sm text-foreground">أطول جلسة تركيز: {personalRecords.longestFocus} دقيقة 🧠</p>
                </motion.div>
              )}
              {weeklyComparison && weeklyComparison.scoreChange !== 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "p-3.5 rounded-xl border",
                    weeklyComparison.scoreChange >= 0
                      ? "bg-emerald-accent/5 border-emerald-accent/10"
                      : "bg-red-500/5 border-red-500/10"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {weeklyComparison.scoreChange >= 0
                      ? <TrendingUp className="w-4 h-4 text-emerald-accent" />
                      : <TrendingDown className="w-4 h-4 text-red-500" />
                    }
                    <span className={cn("text-xs font-semibold", weeklyComparison.scoreChange >= 0 ? "text-emerald-accent" : "text-red-500")}>
                      {weeklyComparison.scoreChange >= 0 ? 'تحسن' : 'تراجع'}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
                    {weeklyComparison.scoreChange >= 0
                      ? `أداؤك أفضل بـ ${Math.abs(weeklyComparison.scoreChange)}% هذا الأسبوع 📈`
                      : `أداؤك انخفض بـ ${Math.abs(weeklyComparison.scoreChange)}% ⚠️`
                    }
                  </p>
                </motion.div>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {insights.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: i % 2 === 0 ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  className={cn(
                    'flex items-start gap-3 p-3.5 rounded-xl transition-colors',
                    item.type === 'positive' && 'bg-emerald-accent/5 border border-emerald-accent/10',
                    item.type === 'negative' && 'bg-rose-500/5 border border-rose-500/10',
                    item.type === 'neutral' && 'bg-muted/30 border border-border/20'
                  )}
                >
                  <div className={cn(
                    'p-2 rounded-xl shrink-0',
                    item.type === 'positive' && 'bg-emerald-accent/10 text-emerald-accent',
                    item.type === 'negative' && 'bg-rose-500/10 text-rose-500',
                    item.type === 'neutral' && 'bg-muted/50 text-muted-foreground'
                  )}>
                    {item.type === 'positive' ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : item.type === 'negative' ? (
                      <ArrowDownRight className="w-4 h-4" />
                    ) : (
                      <Info className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <item.icon className="w-3 h-3 text-muted-foreground" />
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[9px] px-1.5 py-0 h-4 border-0',
                          item.type === 'positive' && 'bg-emerald-accent/10 text-emerald-accent',
                          item.type === 'negative' && 'bg-rose-500/10 text-rose-500',
                          item.type === 'neutral' && 'bg-muted/50 text-muted-foreground'
                        )}
                      >
                        {item.label}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed">{item.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}