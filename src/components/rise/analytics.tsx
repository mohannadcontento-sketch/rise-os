'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
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

const dayNamesAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/* ────────────── Component ────────────── */

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('weekly')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [habits, setHabits] = useState<HabitData | null>(null)
  const [focus, setFocus] = useState<FocusData | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

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

  // Productivity trend (daily scores)
  const productivityData = useMemo(() => {
    if (!dashboard?.dailyScores) return []
    const scores = dashboard.dailyScores.slice(-(period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90))
    return scores.map((s) => ({
      date: s.date.slice(5),
      score: Math.round(s.score),
    }))
  }, [dashboard, period])

  // Habit completion rate trend
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

  // Focus time by day of week
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

  // Task completion (from dashboard)
  const taskCompletionData = useMemo(() => {
    if (!dashboard?.dailyScores) return []
    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90
    const scores = dashboard.dailyScores.slice(-days)
    return scores.map((s) => ({
      date: s.date.slice(5),
      tasks: Math.round(s.taskScore * 10) / 10,
    }))
  }, [dashboard, period])

  // Health trends
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

  // Goal progress distribution (pie chart - from scores breakdown)
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

  // Insights
  const insights = useMemo(() => {
    const items: { icon: React.ElementType; text: string; type: 'positive' | 'negative' | 'neutral' }[] = []
    if (dashboard) {
      const { streak, longestStreak, totalTasksDone, totalFocusMin, dailyScores } = dashboard.user
      items.push({
        icon: Flame,
        text: streak > 0 ? `سلسلتك الحالية: ${streak} يوم متتالي` : 'ابدأ سلسلتك اليوم!',
        type: streak > 0 ? 'positive' : 'neutral',
      })
      items.push({
        icon: Award,
        text: `أطول سلسلة: ${longestStreak} يوم`,
        type: 'neutral',
      })
      items.push({
        icon: CheckCircle2,
        text: `إجمالي المهام المنجزة: ${totalTasksDone}`,
        type: 'positive',
      })
      items.push({
        icon: Clock,
        text: `إجمالي وقت التركيز: ${Math.round(totalFocusMin / 60)} ساعة`,
        type: 'positive',
      })
      if (dailyScores.length >= 2) {
        const lastWeek = dailyScores.slice(-7)
        const avg = lastWeek.reduce((s, d) => s + d.score, 0) / lastWeek.length
        items.push({
          icon: avg >= 7 ? TrendingUp : TrendingDown,
          text: `متوسط الدرجات هذا الأسبوع: ${Math.round(avg * 10) / 10}`,
          type: avg >= 7 ? 'positive' : 'negative',
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
        <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant="ghost"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-lg text-xs',
                period === p && 'bg-background shadow-sm text-foreground font-semibold'
              )}
            >
              {periodLabels[p]}
            </Button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الخبرة', value: totalXP, icon: Zap, color: 'text-gold', bg: 'bg-gold/10' },
          { label: 'المهام المنجزة', value: totalTasks, icon: CheckCircle2, color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
          { label: 'ساعات التركيز', value: totalFocusHours, icon: Clock, color: 'text-forest', bg: 'bg-forest/10' },
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
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Productivity Trend */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass">
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
                      <Tooltip
                        contentStyle={{
                          background: 'oklch(0.995 0.001 106)',
                          border: '1px solid oklch(0.90 0.01 160)',
                          borderRadius: '12px',
                          fontSize: 12,
                          direction: 'rtl',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="oklch(0.55 0.14 163)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: 'oklch(0.55 0.14 163)' }}
                        activeDot={{ r: 5 }}
                        name="الدرجة"
                      />
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
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-forest" />
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
                      <Tooltip
                        contentStyle={{
                          background: 'oklch(0.995 0.001 106)',
                          border: '1px solid oklch(0.90 0.01 160)',
                          borderRadius: '12px',
                          fontSize: 12,
                          direction: 'rtl',
                        }}
                        formatter={(v: number) => [`${v}%`, 'النسبة']}
                      />
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

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Focus Time Distribution */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-gold" />
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
                    <Tooltip
                      contentStyle={{
                        background: 'oklch(0.995 0.001 106)',
                        border: '1px solid oklch(0.90 0.01 160)',
                        borderRadius: '12px',
                        fontSize: 12,
                        direction: 'rtl',
                      }}
                      formatter={(v: number) => [`${v} ساعة`, 'التركيز']}
                    />
                    <Bar
                      dataKey="hours"
                      fill="oklch(0.55 0.14 163)"
                      radius={[6, 6, 0, 0]}
                      name="ساعات"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Goal Progress Distribution (Pie) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="glass">
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
                        <Tooltip
                          contentStyle={{
                            background: 'oklch(0.995 0.001 106)',
                            border: '1px solid oklch(0.90 0.01 160)',
                            borderRadius: '12px',
                            fontSize: 12,
                            direction: 'rtl',
                          }}
                        />
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

      {/* Health Trends */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="glass">
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
                    <Tooltip
                      contentStyle={{
                        background: 'oklch(0.995 0.001 106)',
                        border: '1px solid oklch(0.90 0.01 160)',
                        borderRadius: '12px',
                        fontSize: 12,
                        direction: 'rtl',
                      }}
                    />
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

      {/* Insights */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-emerald-accent" />
              رؤى وتحليلات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {insights.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: i % 2 === 0 ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-xl',
                    item.type === 'positive' && 'bg-emerald-accent/5 border border-emerald-accent/10',
                    item.type === 'negative' && 'bg-rose-500/5 border border-rose-500/10',
                    item.type === 'neutral' && 'bg-muted/30'
                  )}
                >
                  <div className={cn(
                    'p-1.5 rounded-lg shrink-0',
                    item.type === 'positive' && 'bg-emerald-accent/10 text-emerald-accent',
                    item.type === 'negative' && 'bg-rose-500/10 text-rose-500',
                    item.type === 'neutral' && 'bg-muted/50 text-muted-foreground'
                  )}>
                    {item.type === 'positive' ? <ArrowUpRight className="w-3.5 h-3.5" /> :
                     item.type === 'negative' ? <ArrowDownRight className="w-3.5 h-3.5" /> :
                     <item.icon className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <item.icon className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs font-medium">{item.type === 'positive' ? 'إيجابي' : item.type === 'negative' ? 'تحذير' : 'معلومات'}</span>
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