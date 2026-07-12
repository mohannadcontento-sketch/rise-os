'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Sun,
  Moon,
  Flame,
  Zap,
  CheckCircle2,
  Target,
  Clock,
  Trophy,
  Star,
  BookOpen,
  Heart,
  Droplets,
  Footprints,
  Smile,
  Battery,
  TrendingUp,
  Circle,
  Sparkles,
  Award,
  Quote,
  FolderKanban,
  Brain,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { calculateLevel, BADGES, type BadgeStats } from '@/lib/gamification'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
  today: {
    tasksCompleted: number
    tasksTotal: number
    habitsCompleted: number
    habitsTotal: number
    focusMin: number
    morningScore: number
  }
  tasks: {
    id: string
    title: string
    priority: string
    done: boolean
    projectName?: string
    projectColor?: string
  }[]
  habits: {
    id: string
    name: string
    icon: string
    color: string
    todayCompleted: boolean
    todayCount: number
    targetCount: number
    xpReward: number
  }[]
  recentFocus: {
    duration: number
    actualMin: number
    type: string
    completed: boolean
    startedAt: string
  }[]
  health: {
    sleepHours: number
    waterGlasses: number
    steps: number
    mood: string
    energy: string
  } | null
  morning: {
    score: number
    totalItems: number
  } | null
  achievements: {
    badgeIcon: string
    badgeName: string
    badgeDesc: string
  }[]
  dailyScores: {
    date: string
    score: number
    morningScore: number
    taskScore: number
    habitScore: number
    focusScore: number
  }[]
  projects: {
    id: string
    name: string
    color: string
    progress: number
    taskCount: number
    doneTaskCount: number
  }[]
  goals: {
    id: string
    title: string
    type: string
    progress: number
    deadline: string
  }[]
  books: {
    title: string
    author: string
    progress: number
    status: string
  }[]
  journals: {
    date: string
    content: string
    mood: string
    energy: string
  }[]
  weekDays: string[]
}

/* ────────────── Helpers ────────────── */

const ARABIC_DAYS: Record<string, string> = {
  Sun: 'الأحد',
  Mon: 'الإثنين',
  Tue: 'الثلاثاء',
  Wed: 'الأربعاء',
  Thu: 'الخميس',
  Fri: 'الجمعة',
  Sat: 'السبت',
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 4 && h < 12) return 'صباح الخير'
  if (h >= 12 && h < 17) return 'مساء النور'
  if (h >= 17 && h < 21) return 'مساء الخير'
  return 'مساء النجوم'
}

function toArabicNum(n: number): string {
  return n.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

function getDayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const dayEN = d.toLocaleDateString('en-US', { weekday: 'short' })
    return ARABIC_DAYS[dayEN] || dayEN
  } catch {
    return ''
  }
}

/* XP/Level now handled by calculateLevel from @/lib/gamification */

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'bg-red-500/15 text-red-600 dark:text-red-400'
    case 'medium':
      return 'bg-gold/15 text-gold'
    case 'low':
      return 'bg-emerald-accent/15 text-emerald-accent'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getPriorityBorderColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'border-r-2 border-r-red-500/60'
    case 'medium':
      return 'border-r-2 border-r-gold/60'
    case 'low':
      return 'border-r-2 border-r-emerald-accent/60'
    default:
      return 'border-r-2 border-r-border/40'
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'high':
      return 'عالية'
    case 'medium':
      return 'متوسطة'
    case 'low':
      return 'منخفضة'
    default:
      return priority
  }
}

function getMoodEmoji(mood: string): string {
  switch (mood) {
    case 'excellent':
      return '😊'
    case 'good':
      return '🙂'
    case 'okay':
      return '😐'
    case 'bad':
      return '😔'
    case 'terrible':
      return '😢'
    default:
      return '🙂'
  }
}

function getEnergyEmoji(energy: string): string {
  switch (energy) {
    case 'high':
      return '⚡'
    case 'medium':
      return '🔋'
    case 'low':
      return '🪫'
    default:
      return '🔋'
  }
}

const QUOTES = [
  'النجاح ليس نهائياً والفشل ليس قاتلاً، بل الشجاعة للاستمرار هي ما يهم.',
  'الطريقة الوحيدة لعمل عمل عظيم هي أن تحب ما تفعله.',
  'ابدأ من حيث أنت. استخدم ما لديك. افعل ما يمكنك.',
  'لا تنتظر الفرصة، بل اصنعها.',
]

function getQuoteOfTheDay(): string {
  const today = new Date()
  const index = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % QUOTES.length
  return QUOTES[index]
}

/* ────────────── Mini Sparkline ────────────── */

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const barCount = data.length
  return (
    <div className="flex items-end gap-[2px] h-6">
      {data.map((val, i) => {
        const height = Math.max(((val - min) / range) * 100, 8)
        return (
          <motion.div
            key={i}
            className={cn('w-[3px] rounded-full', color)}
            initial={{ height: 0 }}
            animate={{ height: `${height}%` }}
            transition={{ delay: 0.6 + i * 0.04, duration: 0.3, ease: 'easeOut' }}
            style={{ opacity: 0.3 + (val / max) * 0.5 }}
          />
        )
      })}
    </div>
  )
}

/* ────────────── Animation Variants ────────────── */

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const scaleHover = {
  whileHover: { y: -2, transition: { duration: 0.2, ease: 'easeOut' } },
  whileTap: { scale: 0.98 },
}

/* ────────────── Animated Number ────────────── */

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let start = 0
    const end = value
    if (start === end) return
    const incrementTime = duration / Math.max(end, 1)
    const timer = setInterval(() => {
      start += 1
      setDisplay(start)
      if (start >= end) clearInterval(timer)
    }, incrementTime)
    return () => clearInterval(timer)
  }, [value, duration])

  return <>{toArabicNum(display)}</>
}

/* ────────────── Circular Progress ────────────── */

function CircularProgress({
  value,
  size = 80,
  strokeWidth = 6,
  color = 'stroke-emerald-accent',
}: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-primary/10"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-foreground">{toArabicNum(Math.round(value))}</span>
      </div>
    </div>
  )
}

/* ────────────── Loading Skeleton ────────────── */

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4 lg:p-6" dir="rtl">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-48 rounded-xl" />
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>

      {/* Chart */}
      <Skeleton className="h-64 rounded-2xl" />

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  )
}

/* ────────────── Custom Tooltip ────────────── */

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-4 py-2.5 text-xs shadow-xl border border-white/10 dark:border-white/5" dir="rtl">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-accent inline-block" />
          {entry.name}: {toArabicNum(Math.round(entry.value))}
        </p>
      ))}
    </div>
  )
}

/* ────────────── Section Header ────────────── */

function SectionHeader({ icon: Icon, children, badge, iconColor }: { icon: React.ElementType; children: React.ReactNode; badge?: React.ReactNode; iconColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <CardTitle className="text-[15px] font-bold tracking-tight flex items-center gap-2.5 border-r-[3px] border-r-emerald-accent pr-2.5 py-0.5">
        <Icon className={cn('w-4 h-4', iconColor || 'text-emerald-accent')} />
        {children}
      </CardTitle>
      {badge}
    </div>
  )
}

/* ────────────── Premium Glass Card ────────────── */

function PremiumGlass({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'glass rounded-2xl border border-white/10 dark:border-white/5',
      'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.04)]',
      'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_3px_rgba(0,0,0,0.2)]',
      className
    )}>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
   ══════════════════════════════════════════════════════════════════════ */

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/rise/dashboard')
      if (!res.ok) throw new Error('فشل في تحميل البيانات')
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) return <DashboardSkeleton />

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <Circle className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-muted-foreground">{error || 'لا توجد بيانات'}</p>
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  const { user, today, tasks, habits, health, achievements, dailyScores, goals, books } = data
  const greeting = getGreeting()
  const quote = getQuoteOfTheDay()

  const levelInfo = calculateLevel(user.xp)
  const badgeStats: BadgeStats = {
    totalTasks: user.totalTasksDone,
    streak: user.streak,
    totalFocusMin: user.totalFocusMin,
    booksCompleted: 0,
    totalHabits: habits.length,
    journalStreak: 0,
  }

  const upcomingTasks = tasks.filter((t) => !t.done).slice(0, 5)
  const activeGoals = goals.slice(0, 4)
  const activeBooks = books.filter((b) => b.status === 'reading' || b.progress > 0).slice(0, 3)

  const chartData = dailyScores.map((d) => ({
    ...d,
    dayLabel: getDayLabel(d.date),
  }))

  // Sparkline data derived from daily scores
  const morningTrend = dailyScores.map(d => d.morningScore)
  const taskTrend = dailyScores.map(d => d.taskScore)
  const habitTrend = dailyScores.map(d => d.habitScore)
  const focusTrend = dailyScores.map(d => d.focusScore)

  return (
    <motion.div
      className="space-y-6 p-4 lg:p-6"
      dir="rtl"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* ══════════ 1. Top Welcome & Stats Bar ══════════ */}
      <motion.div variants={itemVariants} className="relative">
        {/* Gradient background for hero */}
        <div className="absolute inset-0 -m-4 lg:-m-6 rounded-3xl bg-gradient-to-bl from-forest/[0.04] via-emerald-accent/[0.03] to-transparent dark:from-emerald-accent/[0.06] dark:via-forest/[0.04] pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              {new Date().getHours() >= 4 && new Date().getHours() < 17 ? (
                <Sun className="w-4 h-4 text-gold" />
              ) : (
                <Moon className="w-4 h-4 text-emerald-accent" />
              )}
              <span>{greeting}،</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{user.name}</h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Level Badge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-3 min-w-[200px] border border-white/10 dark:border-white/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] cursor-default">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shrink-0 shadow-md">
                      <Zap className="w-5 h-5 text-forest-dark" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground">
                          المستوى {toArabicNum(levelInfo.level)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {toArabicNum(levelInfo.currentXp)} / {toArabicNum(levelInfo.xpToNext)}
                        </span>
                      </div>
                      {/* XP bar with glow */}
                      <div className="relative">
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-l from-gold/30 to-gold-light/20 blur-sm opacity-60" />
                        <div className="relative h-1.5 rounded-full bg-primary/10 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-l from-gold to-gold-light"
                            initial={{ width: 0 }}
                            animate={{ width: `${levelInfo.progress}%` }}
                            transition={{ duration: 1.2, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {toArabicNum(levelInfo.xpToNext - levelInfo.currentXp)} خبرة للمستوى التالي
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Streak */}
            <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-2.5 pulse-glow border border-white/10 dark:border-white/5">
              <Flame className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-sm font-bold leading-none">{toArabicNum(user.streak)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">أيام متتالية</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ══════════ 2. Score Cards Row ══════════ */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {/* Morning Score */}
        <motion.div {...scaleHover}>
          <PremiumGlass className="p-4 lg:p-5 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_25px_-5px_rgba(0,0,0,0.08)] dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_25px_-5px_rgba(0,0,0,0.3)] transition-shadow duration-300 cursor-default">
            <div className="flex items-center gap-4">
              <CircularProgress
                value={today.morningScore}
                size={64}
                strokeWidth={5}
                color="stroke-gold"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">درجة الصباح</p>
                <p className="text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.morningScore} />
                  <span className="text-sm font-normal text-muted-foreground mr-1">/ ١٠٠</span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">الاتجاه</span>
              <MiniSparkline data={morningTrend} color="bg-gold" />
            </div>
          </PremiumGlass>
        </motion.div>

        {/* Tasks Completed */}
        <motion.div {...scaleHover}>
          <PremiumGlass className="p-4 lg:p-5 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_25px_-5px_rgba(0,0,0,0.08)] dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_25px_-5px_rgba(0,0,0,0.3)] transition-shadow duration-300 cursor-default">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-accent/10 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
                <CheckCircle2 className="w-7 h-7 text-emerald-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">المهام المكتملة</p>
                <p className="text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.tasksCompleted} />
                  <span className="text-sm font-normal text-muted-foreground mr-1">
                    / {toArabicNum(today.tasksTotal)}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">الاتجاه</span>
              <MiniSparkline data={taskTrend} color="bg-emerald-accent" />
            </div>
          </PremiumGlass>
        </motion.div>

        {/* Habits */}
        <motion.div {...scaleHover}>
          <PremiumGlass className="p-4 lg:p-5 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_25px_-5px_rgba(0,0,0,0.08)] dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_25px_-5px_rgba(0,0,0,0.3)] transition-shadow duration-300 cursor-default">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-forest/10 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
                <Target className="w-7 h-7 text-forest" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">العادات</p>
                <p className="text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.habitsCompleted} />
                  <span className="text-sm font-normal text-muted-foreground mr-1">
                    / {toArabicNum(today.habitsTotal)}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">الاتجاه</span>
              <MiniSparkline data={habitTrend} color="bg-forest" />
            </div>
          </PremiumGlass>
        </motion.div>

        {/* Focus */}
        <motion.div {...scaleHover}>
          <PremiumGlass className="p-4 lg:p-5 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_25px_-5px_rgba(0,0,0,0.08)] dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_25px_-5px_rgba(0,0,0,0.3)] transition-shadow duration-300 cursor-default">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
                <Clock className="w-7 h-7 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">التركيز</p>
                <p className="text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.focusMin} />
                  <span className="text-sm font-normal text-muted-foreground mr-1">دقيقة</span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">الاتجاه</span>
              <MiniSparkline data={focusTrend} color="bg-gold" />
            </div>
          </PremiumGlass>
        </motion.div>
      </motion.div>

      {/* ══════════ 3. Weekly Score Chart ══════════ */}
      {chartData.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={TrendingUp} iconColor="text-emerald-accent">
                أداء الأسبوع
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <PremiumGlass className="p-4 lg:p-5" style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0.35} />
                        <stop offset="50%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="dayLabel"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'oklch(0.50 0.01 160)', fontSize: 11 }}
                      dy={8}
                    />
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'oklch(0.50 0.01 160)', fontSize: 11 }}
                      dx={-4}
                      width={28}
                    />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="oklch(0.55 0.14 163)"
                      strokeWidth={2.5}
                      fill="url(#scoreGradient)"
                      dot={{ r: 4, fill: 'oklch(0.55 0.14 163)', strokeWidth: 2, stroke: 'var(--card)' }}
                      activeDot={{ r: 6, fill: 'oklch(0.55 0.14 163)', strokeWidth: 2, stroke: 'var(--card)' }}
                      name="الدرجة"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </PremiumGlass>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ══════════ 4. Two-column Layout ══════════ */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Right Column: Tasks + Goals ── */}
        <div className="space-y-6">
          {/* Upcoming Tasks */}
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={CheckCircle2} iconColor="text-emerald-accent" badge={
                <Badge variant="secondary" className="text-[10px]">
                  {toArabicNum(upcomingTasks.length)} مهام
                </Badge>
              }>
                المهام القادمة
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <PremiumGlass className="divide-y divide-border/30 overflow-hidden">
                {upcomingTasks.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-gold/40" />
                    لا توجد مهام قادمة
                  </div>
                ) : (
                  upcomingTasks.map((task, i) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.06, duration: 0.35 }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 last:pb-3 first:pt-3 transition-all duration-200',
                        getPriorityBorderColor(task.priority),
                        'hover:bg-emerald-accent/[0.03] dark:hover:bg-emerald-accent/[0.05]'
                      )}
                    >
                      <span className="flex-1 text-sm font-medium text-foreground truncate">{task.title}</span>
                      {task.projectName && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium hidden sm:inline-block"
                          style={{ backgroundColor: `${task.projectColor}15`, color: task.projectColor }}
                        >
                          {task.projectName}
                        </span>
                      )}
                      <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', getPriorityColor(task.priority))}>
                        {getPriorityLabel(task.priority)}
                      </Badge>
                    </motion.div>
                  ))
                )}
              </PremiumGlass>
            </CardContent>
          </Card>

          {/* Active Goals */}
          {activeGoals.length > 0 && (
            <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
              <CardHeader className="pb-3 pt-0">
                <SectionHeader icon={Target} iconColor="text-forest" badge={
                  <Badge variant="secondary" className="text-[10px]">
                    {toArabicNum(activeGoals.length)} أهداف
                  </Badge>
                }>
                  الأهداف النشطة
                </SectionHeader>
              </CardHeader>
              <CardContent className="pt-0">
                <PremiumGlass className="p-4 space-y-4">
                  {activeGoals.map((goal, i) => (
                    <motion.div
                      key={goal.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.08, duration: 0.35 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-forest shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">{goal.title}</span>
                        </div>
                        <span className="text-xs font-semibold text-emerald-accent shrink-0 mr-2">
                          {toArabicNum(Math.round(goal.progress))}٪
                        </span>
                      </div>
                      <Progress value={goal.progress} className="h-1.5" />
                      <p className="text-[10px] text-muted-foreground">
                        الموعد: {new Date(goal.deadline).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                      </p>
                    </motion.div>
                  ))}
                </PremiumGlass>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Left Column: Habits + Achievements ── */}
        <div className="space-y-6">
          {/* Today's Habits */}
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={Flame} iconColor="text-orange-500" badge={
                <Badge variant="secondary" className="text-[10px]">
                  {toArabicNum(today.habitsCompleted)} / {toArabicNum(today.habitsTotal)}
                </Badge>
              }>
                تتبع العادات اليوم
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <PremiumGlass className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {habits.map((habit, i) => (
                    <motion.div
                      key={habit.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.35 + i * 0.06, duration: 0.3 }}
                      className={cn(
                        'flex items-center gap-3 rounded-xl p-3 transition-all duration-200',
                        habit.todayCompleted
                          ? 'bg-emerald-accent/5 border border-emerald-accent/15'
                          : 'hover:bg-primary/[0.02] border border-transparent'
                      )}
                    >
                      <Checkbox
                        checked={habit.todayCompleted}
                        disabled
                        className={cn(
                          habit.todayCompleted && 'data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent'
                        )}
                      />
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-lg transition-shadow duration-300',
                          habit.todayCompleted && 'pulse-glow'
                        )}
                        style={{
                          backgroundColor: `${habit.color}15`,
                          boxShadow: habit.todayCompleted ? `0 0 12px ${habit.color}40` : 'none',
                        }}
                      >
                        {habit.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium truncate', habit.todayCompleted ? 'text-foreground/60 line-through' : 'text-foreground')}>
                          {habit.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {toArabicNum(habit.todayCount)} / {toArabicNum(habit.targetCount)} · +{toArabicNum(habit.xpReward)} خبرة
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </PremiumGlass>
            </CardContent>
          </Card>

          {/* Recent Achievements */}
          {achievements.length > 0 && (
            <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
              <CardHeader className="pb-3 pt-0">
                <SectionHeader icon={Award} iconColor="text-gold">
                  الإنجازات الأخيرة
                </SectionHeader>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {achievements.map((ach, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.08, duration: 0.35 }}
                      whileHover={{ y: -3, transition: { duration: 0.2 } }}
                      className="shine glass rounded-xl p-3 min-w-[140px] flex-shrink-0 text-center space-y-2 border border-white/10 dark:border-white/5 cursor-default"
                    >
                      <div className="text-2xl">{ach.badgeIcon}</div>
                      <p className="text-xs font-semibold text-foreground truncate">{ach.badgeName}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{ach.badgeDesc}</p>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Available Badges */}
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={Trophy} iconColor="text-gold">
                الشارات المتاحة
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="glass rounded-2xl p-4 border border-white/10 dark:border-white/5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {BADGES.map((badge, i) => {
                    const earned = badge.condition(badgeStats)
                    return (
                      <motion.div
                        key={badge.id}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: earned ? 1 : 0.4, scale: 1 }}
                        transition={{ delay: 0.6 + i * 0.04, duration: 0.4, type: 'spring', stiffness: 200 }}
                        whileHover={earned ? { y: -3, scale: 1.03, transition: { duration: 0.2 } } : undefined}
                        className={cn(
                          'rounded-xl p-3 text-center space-y-1.5 border transition-shadow duration-300',
                          earned
                            ? 'bg-primary/[0.03] border-gold/20 shadow-[0_0_15px_oklch(0.78_0.12_85/0.08)]'
                            : 'bg-primary/[0.02] border-primary/10'
                        )}
                      >
                        <motion.div
                          className="text-2xl"
                          animate={earned ? { rotate: [0, -10, 10, -5, 5, 0], scale: [1, 1.2, 1] } : {}}
                          transition={{ delay: 0.8 + i * 0.04, duration: 0.6 }}
                        >
                          {badge.icon}
                        </motion.div>
                        <p className={cn('text-xs font-semibold truncate', earned ? 'text-foreground' : 'text-muted-foreground')}>
                          {badge.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                          {badge.desc}
                        </p>
                        {earned && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 1 + i * 0.04, type: 'spring', stiffness: 300 }}
                            className="flex justify-center"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-accent" />
                          </motion.div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* ══════════ 5. Bottom Row ══════════ */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* Today's Health */}
        {health && (
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={Heart} iconColor="text-red-500">
                الصحة اليوم
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <PremiumGlass className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* Sleep */}
                  <div className="bg-primary/[0.03] rounded-xl p-3 text-center space-y-1.5">
                    <Moon className="w-5 h-5 mx-auto text-indigo-400" />
                    <p className="text-lg font-bold text-foreground">{toArabicNum(health.sleepHours)}</p>
                    <p className="text-[10px] text-muted-foreground">ساعات نوم</p>
                  </div>
                  {/* Water */}
                  <div className="bg-primary/[0.03] rounded-xl p-3 text-center space-y-1.5">
                    <Droplets className="w-5 h-5 mx-auto text-blue-400" />
                    <p className="text-lg font-bold text-foreground">{toArabicNum(health.waterGlasses)}</p>
                    <p className="text-[10px] text-muted-foreground">كوب ماء</p>
                  </div>
                  {/* Steps */}
                  <div className="bg-primary/[0.03] rounded-xl p-3 text-center space-y-1.5">
                    <Footprints className="w-5 h-5 mx-auto text-emerald-accent" />
                    <p className="text-lg font-bold text-foreground">{toArabicNum(health.steps)}</p>
                    <p className="text-[10px] text-muted-foreground">خطوة</p>
                  </div>
                  {/* Mood & Energy */}
                  <div className="bg-primary/[0.03] rounded-xl p-3 text-center space-y-1.5">
                    <div className="flex justify-center gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg">{getMoodEmoji(health.mood)}</span>
                        <span className="text-[10px] text-muted-foreground">المزاج</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg">{getEnergyEmoji(health.energy)}</span>
                        <span className="text-[10px] text-muted-foreground">الطاقة</span>
                      </div>
                    </div>
                  </div>
                </div>
              </PremiumGlass>
            </CardContent>
          </Card>
        )}

        {/* Current Reading */}
        {activeBooks.length > 0 && (
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={BookOpen} iconColor="text-forest">
                القراءة الحالية
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <PremiumGlass className="p-4 space-y-4">
                {activeBooks.map((book, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.1, duration: 0.35 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{book.title}</p>
                        <p className="text-[10px] text-muted-foreground">{book.author}</p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-accent shrink-0 mr-2">
                        {toArabicNum(Math.round(book.progress))}٪
                      </span>
                    </div>
                    <Progress value={book.progress} className="h-1.5" />
                  </motion.div>
                ))}
              </PremiumGlass>
            </CardContent>
          </Card>
        )}

        {/* Quote of the Day */}
        <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
          <CardHeader className="pb-3 pt-0">
            <SectionHeader icon={Quote} iconColor="text-gold">
              اقتباس اليوم
            </SectionHeader>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="shine glass rounded-2xl p-5 lg:p-6 flex flex-col items-center justify-center text-center min-h-[200px] border border-white/10 dark:border-white/5 relative overflow-hidden">
              {/* Decorative watermark quotation mark */}
              <span className="absolute top-2 right-4 text-[120px] font-serif leading-none opacity-[0.04] dark:opacity-[0.06] text-foreground select-none pointer-events-none" aria-hidden="true">
                "
              </span>
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-gold/20 to-gold-light/20 flex items-center justify-center mb-4 shadow-[0_0_20px_oklch(0.78_0.12_85/0.1)]">
                <Star className="w-5 h-5 text-gold" />
              </div>
              <blockquote className="relative text-base lg:text-lg font-semibold leading-relaxed text-foreground/90 mb-3 max-w-xs">
                {quote}
              </blockquote>
              <div className="relative flex items-center gap-1.5">
                <div className="w-6 h-px bg-gold/40" />
                <Sparkles className="w-3 h-3 text-gold/60" />
                <div className="w-6 h-px bg-gold/40" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ══════════ Recent Focus Sessions ══════════ */}
      {data.recentFocus.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={Clock} iconColor="text-gold">
                جلسات التركيز الأخيرة
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {data.recentFocus.map((session, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.06, duration: 0.3 }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                    className="glass rounded-xl p-3 min-w-[120px] flex-shrink-0 text-center space-y-1.5 border border-white/10 dark:border-white/5"
                  >
                    <Brain className="w-5 h-5 mx-auto text-emerald-accent" />
                    <p className="text-sm font-bold text-foreground">{toArabicNum(session.actualMin)} د</p>
                    <p className="text-[10px] text-muted-foreground">{session.type === 'deep' ? 'عميق' : 'عادي'}</p>
                    <Badge variant="secondary" className={cn('text-[10px]', session.completed ? 'bg-emerald-accent/10 text-emerald-accent' : 'bg-gold/10 text-gold')}>
                      {session.completed ? 'مكتمل' : 'قيد التنفيذ'}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ══════════ Projects Overview ══════════ */}
      {data.projects.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={FolderKanban} iconColor="text-emerald-accent" badge={
                <Badge variant="secondary" className="text-[10px]">
                  {toArabicNum(data.projects.length)} مشاريع
                </Badge>
              }>
                المشاريع
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.projects.slice(0, 6).map((project, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.07, duration: 0.35 }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                    className="glass rounded-xl p-4 space-y-2.5 border border-white/10 dark:border-white/5 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_25px_-5px_rgba(0,0,0,0.08)] dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_25px_-5px_rgba(0,0,0,0.3)] transition-shadow duration-300 cursor-default"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-sm font-semibold text-foreground truncate flex-1">
                        {project.name}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{toArabicNum(project.doneTaskCount)} / {toArabicNum(project.taskCount)} مهمة</span>
                        <span>{toArabicNum(Math.round(project.progress))}٪</span>
                      </div>
                      <Progress value={project.progress} className="h-1.5" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}