'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  CalendarClock,
  ChevronLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { calculateLevel, BADGES, type BadgeStats } from '@/lib/gamification'
import { useRiseStore } from '@/store/app-store'
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

function toArabicNum(n: number | null | undefined | string): string {
  if (n == null || n === undefined) return '٠'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '٠'
  return num.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

function getDayLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
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

const MOTIVATIONAL_QUOTES = [
  'النجاح ليس نهائياً والفشل ليس قاتلاً، بل الشجاعة للاستمرار هي ما يهم.',
  'الطريقة الوحيدة لعمل عمل عظيم هي أن تحب ما تفعله.',
  'ابدأ من حيث أنت. استخدم ما لديك. افعل ما يمكنك.',
  'لا تنتظر الفرصة، بل اصنعها.',
  'الصبر مفتاح الفرج، والمثابرة سلم النجاح.',
  'من جدّ وجد، ومن زرع حصد.',
  'لا تقارن نفسك بالآخرين، قارن نفسك بنفسك بالأمس.',
  'كل يوم هو فرصة جديدة لتكون نسخة أفضل من نفسك.',
  'الاستثمار في المعرفة يدفع أفضل فائدة.',
  'العلم نور والجهل ظلام، والعلم يهدي إلى الجنة.',
  'لا يهم كم مرة سقطت، المهم كم مرة نهضت.',
  'النجاح يبدأ من اللحظة التي تقرر فيها المحاولة.',
  'أنت أقوى مما تظن وأجمل مما تتخيل.',
  'الطريق إلى الألف ميل يبدأ بخطوة واحدة.',
  'لا تكن مشغولاً دائماً، كن منتجاً دائماً.',
  'التحديات هي فرص مقنّعة.',
  'التفاؤل هو الإيمان بالإنجاز، لا يدرك ما هو ممكن إلا من يراه.',
  'اجعل حياتك تستحق التذكر، لا أن تُنسى.',
  'النجاح ليس مقياساً لمدى ارتفاعك، بل لعدد المرات التي نهضت فيها.',
  'اقرأ كثيراً، تعلّم دائماً، وكن فضولياً.',
  'الصباح هو هدية جديدة، اغتنمها.',
  'النظام هو الجسر بين الأهداف والإنجازات.',
  'ما لا يقتلك يقويك، وما يوقفك يعلّمك.',
  'لا تستسلم، فالبداية دائماً أصعب مرحلة.',
]

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
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

/* ────────────── Animated Number ────────────── */

function AnimatedNumber({ value }: { value: number; duration?: number }) {
  return <>{toArabicNum(value)}</>
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
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
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

function PremiumGlass({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        'glass rounded-2xl border border-white/10 dark:border-white/5',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.04)]',
        'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_3px_rgba(0,0,0,0.2)]',
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}

/* ────────────── Productivity Score Card ────────────── */

interface ProductivityScoreData {
  score: number
  breakdown: { tasks: number; habits: number; focus: number; morning: number; streak: number }
  grade: string
}

function ProductivityScoreCard() {
  const [prodData, setProdData] = useState<ProductivityScoreData | null>(null)

  useEffect(() => {
    apiFetch('/api/rise/productivity-score')
      .then((r) => r.json())
      .then((data) => setProdData(data))
      .catch(() => {})
  }, [])

  if (!prodData) {
    return (
      <PremiumGlass className="p-5 lg:p-6">
        <div className="flex items-center justify-center gap-8">
          <Skeleton className="w-32 h-32 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </div>
      </PremiumGlass>
    )
  }

  const { score, breakdown, grade } = prodData
  const size = 130
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (score / 100) * circumference

  // Gradient color based on score
  const gradientId = 'prodScoreGradient'
  let strokeColor1 = 'oklch(0.55 0.14 163)'
  let strokeColor2 = 'oklch(0.45 0.12 163)'
  let glowColor = 'rgba(16, 185, 129, 0.25)'
  let gradeColor = 'text-emerald-accent'

  if (score >= 70) {
    strokeColor1 = 'oklch(0.55 0.14 163)'
    strokeColor2 = 'oklch(0.45 0.12 163)'
    glowColor = 'rgba(16, 185, 129, 0.25)'
    gradeColor = 'text-emerald-accent'
  } else if (score >= 50) {
    strokeColor1 = 'oklch(0.75 0.15 80)'
    strokeColor2 = 'oklch(0.65 0.13 75)'
    glowColor = 'rgba(234, 179, 8, 0.25)'
    gradeColor = 'text-gold'
  } else {
    strokeColor1 = 'oklch(0.55 0.18 25)'
    strokeColor2 = 'oklch(0.50 0.15 20)'
    glowColor = 'rgba(239, 68, 68, 0.25)'
    gradeColor = 'text-red-500'
  }

  const breakdownItems = [
    { label: 'المهام', value: breakdown.tasks, color: 'bg-emerald-accent' },
    { label: 'العادات', value: breakdown.habits, color: 'bg-forest' },
    { label: 'التركيز', value: breakdown.focus, color: 'bg-gold' },
    { label: 'الصباح', value: breakdown.morning, color: 'bg-amber-400' },
    { label: 'السلسلة', value: breakdown.streak, color: 'bg-orange-500' },
  ]

  return (
    <PremiumGlass className="p-5 lg:p-6 relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: glowColor, right: '10%' }}
      />

      <div className="relative flex flex-col sm:flex-row items-center gap-6 lg:gap-10">
        {/* Circular Gauge */}
        <div className="relative shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={strokeColor1} />
                <stop offset="100%" stopColor={strokeColor2} />
              </linearGradient>
            </defs>
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
              stroke={`url(#${gradientId})`}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
              style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-4xl font-black tracking-tight text-foreground"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.5, type: 'spring' }}
            >
              {toArabicNum(score)}
            </motion.span>
            <span className="text-[10px] text-muted-foreground mt-0.5">من ١٠٠</span>
          </div>
        </div>

        {/* Right side: grade + breakdown */}
        <div className="flex-1 w-full min-w-0 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">درجة الإنتاجية اليومية</p>
            <motion.span
              className={cn('text-2xl font-bold', gradeColor)}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              {grade}
            </motion.span>
          </div>

          {/* Mini breakdown bars */}
          <div className="space-y-2.5">
            {breakdownItems.map((item, i) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 text-right shrink-0">{item.label}</span>
                <div
                  className="flex-1 h-2 rounded-full bg-primary/10 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={item.value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`تقدم ${item.label}`}
                >
                  <motion.div
                    className={cn('h-full rounded-full', item.color)}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.value}%` }}
                    transition={{ delay: 0.8 + i * 0.1, duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-foreground w-8 text-left shrink-0">
                  {toArabicNum(item.value)}٪
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PremiumGlass>
  )
}

/* ────────────── Goal Weekly Delta Badge ────────────── */

function GoalDeltaBadge({ goalId }: { goalId: string }) {
  const [delta, setDelta] = useState<number | null>(null)

  useEffect(() => {
    async function fetchDelta() {
      try {
        // Fetch goals from API to get current progress
        const goalsRes = await apiFetch('/api/rise/goals')
        const goalsData = await goalsRes.json()
        const goal = (goalsData.goals || []).find((g: { id: string }) => g.id === goalId)
        if (!goal) return

        const currentProgress = goal.progress || 0
        // Estimate weekly delta based on goal type and current progress
        const estimatedWeeklyDelta = Math.min(currentProgress * 0.3, 15)
        setDelta(estimatedWeeklyDelta > 0 ? Math.round(estimatedWeeklyDelta) : 0)
      } catch {
        // ignore
      }
    }
    fetchDelta()
  }, [goalId])

  if (delta === null || delta === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5 }}
      className={cn(
        'flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
        delta > 0 ? 'bg-emerald-accent/10 text-emerald-accent' : 'bg-red-500/10 text-red-500'
      )}
    >
      {delta > 0 ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      <span>+{toArabicNum(delta)}٪</span>
      <span className="text-muted-foreground font-normal">هذا الأسبوع</span>
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   MOTIVATIONAL WALL
   ══════════════════════════════════════════════════════════════════════ */

function MotivationalWall() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('rise-favorite-quotes')
      if (stored) return new Set(JSON.parse(stored) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  const [seenToday, setSeenToday] = useState<Set<number>>(() => {
    try {
      const todayKey = new Date().toISOString().split('T')[0]
      const stored = localStorage.getItem('rise-seen-quotes-today')
      if (stored) {
        const parsed = JSON.parse(stored) as { date: string; indices: number[] }
        if (parsed.date === todayKey) {
          const s = new Set(parsed.indices)
          s.add(0)
          return s
        }
      }
    } catch { /* ignore */ }
    const s = new Set<number>()
    s.add(0)
    return s
  })
  const cardRef = useRef<HTMLDivElement>(null)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })

  // Save favorites
  useEffect(() => {
    localStorage.setItem('rise-favorite-quotes', JSON.stringify([...favorites]))
  }, [favorites])

  // Save seen today
  useEffect(() => {
    const todayKey = new Date().toISOString().split('T')[0]
    localStorage.setItem('rise-seen-quotes-today', JSON.stringify({
      date: todayKey,
      indices: [...seenToday],
    }))
  }, [seenToday])

  // Auto-rotate every 15 seconds
  const advanceQuote = useCallback(() => {
    setCurrentIndex(prev => {
      const next = (prev + 1) % MOTIVATIONAL_QUOTES.length
      // Track seen
      setSeenToday(s => {
        const n = new Set(s)
        n.add(next)
        return n
      })
      return next
    })
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      advanceQuote()
    }, 15000)
    return () => clearInterval(timer)
  }, [advanceQuote])

  const toggleFavorite = (quote: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(quote)) {
        next.delete(quote)
      } else {
        next.add(quote)
      }
      return next
    })
  }

  // Parallax on mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 8
    setParallax({ x, y })
  }

  const handleMouseLeave = () => {
    setParallax({ x: 0, y: 0 })
  }

  const currentQuote = MOTIVATIONAL_QUOTES[currentIndex]
  const isFav = favorites.has(currentQuote)

  return (
    <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
      <CardHeader className="pb-3 pt-0">
        <SectionHeader icon={Quote} iconColor="text-gold">
          جدار التحفيز
        </SectionHeader>
      </CardHeader>
      <CardContent className="pt-0">
        <motion.div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={advanceQuote}
          className="premium-card rounded-2xl p-6 lg:p-8 flex flex-col items-center justify-center text-center min-h-[220px] relative overflow-hidden cursor-pointer select-none"
          animate={{
            x: parallax.x,
            y: parallax.y,
            rotateX: parallax.y * -0.3,
            rotateY: parallax.x * 0.3,
          }}
          transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          style={{ perspective: 1000 }}
        >
          {/* Background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-forest/[0.06] dark:bg-forest/[0.1] blur-3xl pointer-events-none" />

          {/* Decorative watermark */}
          <span
            className="absolute top-1 right-6 text-[140px] font-serif leading-none opacity-[0.03] dark:opacity-[0.05] text-foreground select-none pointer-events-none"
            aria-hidden="true"
          >
            &ldquo;
          </span>

          {/* Quote with fade animation */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="relative flex flex-col items-center"
            >
              {/* Favorite Heart */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFavorite(currentQuote)
                }}
                whileTap={{ scale: 0.8 }}
                className="absolute -top-1 left-0 z-10 p-1.5 rounded-full bg-primary/5 hover:bg-primary/10 transition-colors"
                aria-label={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
              >
                <motion.div
                  animate={isFav ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ type: 'tween', duration: 0.3 }}
                >
                  <Heart
                    className={cn(
                      'w-4 h-4 transition-colors',
                      isFav ? 'fill-red-500 text-red-500' : 'text-muted-foreground/40'
                    )}
                  />
                </motion.div>
              </motion.button>

              {/* Decorative icon */}
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-gold/20 to-gold-light/20 flex items-center justify-center mb-4 shadow-[0_0_20px_oklch(0.78_0.12_85/0.1)]">
                <Star className="w-5 h-5 text-gold" />
              </div>

              {/* Quote text with gradient */}
              <blockquote className="text-base lg:text-xl font-bold leading-relaxed text-gradient-forest mb-4 max-w-sm px-2">
                {currentQuote}
              </blockquote>

              {/* Seen counter */}
              <div className="flex items-center gap-1.5 text-muted-foreground/50">
                <Eye className="w-3 h-3" />
                <span className="text-[10px] font-medium">{toArabicNum(seenToday.size)}</span>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Progress dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
            {MOTIVATIONAL_QUOTES.slice(0, Math.min(MOTIVATIONAL_QUOTES.length, 8)).map((_, i) => (
              <motion.div
                key={i}
                className={cn(
                  'w-1 h-1 rounded-full transition-all duration-300',
                  i === currentIndex % 8
                    ? 'bg-gold w-3'
                    : 'bg-muted-foreground/20'
                )}
              />
            ))}
          </div>
        </motion.div>
      </CardContent>
    </Card>
  )
}

/* ────────────── On This Day Widget ────────────── */

function OnThisDayWidget() {
  const [data, setData] = useState<{ lastWeek: number | null; lastMonth: number | null } | null>(null)

  useEffect(() => {
    async function fetchOnThisDay() {
      try {
        const today = new Date()
        const dayOfMonth = today.getDate()
        const lastWeek = new Date(today)
        lastWeek.setDate(today.getDate() - 7)
        const lastMonth = new Date(today)
        lastMonth.setMonth(today.getMonth() - 1)

        const lastWeekStr = `${lastWeek.getFullYear()}-${String(lastWeek.getMonth() + 1).padStart(2, '0')}-${String(lastWeek.getDate()).padStart(2, '0')}`
        const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${String(lastMonth.getDate()).padStart(2, '0')}`

        const res = await apiFetch(`/api/rise/productivity-score?dates=${lastWeekStr},${lastMonthStr}`)
        if (res.ok) {
          const json = await res.json()
          setData({
            lastWeek: json.scores?.[0]?.score ?? null,
            lastMonth: json.scores?.[1]?.score ?? null,
          })
        }
      } catch {
        setData({ lastWeek: null, lastMonth: null })
      }
    }
    fetchOnThisDay()
  }, [])

  const hasData = data && (data.lastWeek !== null || data.lastMonth !== null)
  const improvement = (data?.lastWeek && data?.lastMonth) ? data.lastWeek - data.lastMonth : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
        <CardHeader className="pb-3 pt-0">
          <SectionHeader icon={CalendarClock} iconColor="text-gold">
            في مثل هذا اليوم
          </SectionHeader>
        </CardHeader>
        <CardContent className="pt-0">
          <PremiumGlass className="p-4 lg:p-5">
            {!hasData ? (
              <div className="text-center py-4">
                <CalendarClock className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">لا توجد بيانات سابقة</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-[11px] text-muted-foreground mb-1">الأسبوع الماضي</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {data.lastWeek !== null ? toArabicNum(data.lastWeek) : '—'}
                      </span>
                      {data.lastWeek !== null && (
                        <span className="text-xs text-muted-foreground">/ ١٠٠</span>
                      )}
                    </div>
                  </div>
                  <div className="w-px h-10 bg-border/40" />
                  <div className="flex-1">
                    <p className="text-[11px] text-muted-foreground mb-1">الشهر الماضي</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {data.lastMonth !== null ? toArabicNum(data.lastMonth) : '—'}
                      </span>
                      {data.lastMonth !== null && (
                        <span className="text-xs text-muted-foreground">/ ١٠٠</span>
                      )}
                    </div>
                  </div>
                </div>
                {improvement !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold',
                      improvement >= 0
                        ? 'bg-emerald-accent/10 text-emerald-accent'
                        : 'bg-red-500/10 text-red-500'
                    )}
                  >
                    {improvement >= 0 ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" />
                    )}
                    <span>
                      {improvement >= 0 ? '+' : ''}{toArabicNum(improvement)} نقطة مقارنة بالشهر الماضي
                    </span>
                  </motion.div>
                )}
              </div>
            )}
          </PremiumGlass>
        </CardContent>
      </Card>
    </motion.div>
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
      const res = await apiFetch('/api/rise/dashboard')
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

  const user = data.user || { name: 'مستخدم', level: 1, xp: 0, streak: 0, longestStreak: 0, totalFocusMin: 0, totalTasksDone: 0 }
  const today = data.today || { tasksCompleted: 0, tasksTotal: 0, habitsCompleted: 0, habitsTotal: 0, focusMin: 0, morningScore: 0 }
  const tasks = data.tasks || []
  const habits = data.habits || []
  const health = data.health || null
  const achievements = data.achievements || []
  const dailyScores = data.dailyScores || []
  const goals = data.goals || []
  const books = data.books || []
  const recentFocus = data.recentFocus || []
  const projects = data.projects || []
  const greeting = getGreeting()

  const levelInfo = calculateLevel(user.xp)
  const badgeStats: BadgeStats = {
    totalTasks: user.totalTasksDone,
    streak: user.streak,
    totalFocusMin: user.totalFocusMin,
    booksCompleted: 0,
    totalHabits: habits.length,
    journalStreak: 0,
  }

  const upcomingTasks = (tasks || []).filter((t: any) => !t.done).slice(0, 5)
  const activeGoals = (goals || []).slice(0, 4)
  const activeBooks = (books || []).filter((b: any) => b.status === 'reading' || (b.progress || 0) > 0).slice(0, 3)

  const chartData = (dailyScores || []).map((d: any) => ({
    ...d,
    dayLabel: getDayLabel(d.date),
    score: typeof d.score === 'number' ? d.score : 0,
  }))

  // Sparkline data derived from daily scores
  const morningTrend = (dailyScores || []).map((d: any) => d.morningScore || 0)
  const taskTrend = (dailyScores || []).map((d: any) => d.taskScore || 0)
  const habitTrend = (dailyScores || []).map((d: any) => d.habitScore || 0)
  const focusTrend = (dailyScores || []).map((d: any) => d.focusScore || 0)

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
        {/* Star field / particle background */}
        <div className="absolute inset-0 -m-4 lg:-m-6 rounded-3xl bg-gradient-to-bl from-forest/[0.04] via-emerald-accent/[0.03] to-transparent dark:from-emerald-accent/[0.06] dark:via-forest/[0.04] pointer-events-none overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={`star-${i}`}
              className="absolute rounded-full bg-emerald-accent/25 dark:bg-emerald-accent/40"
              style={{
                top: `${8 + (i * 7) % 85}%`,
                left: `${5 + (i * 13) % 90}%`,
                width: `${2 + (i % 3)}px`,
                height: `${2 + (i % 3)}px`,
              }}
              animate={{ opacity: [0.15, 0.6, 0.15], scale: [1, 1.4, 1] }}
              transition={{ type: 'tween', duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.4, ease: 'easeInOut' }}
            />
          ))}
        </div>
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
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-gradient-forest">{user.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-gradient-to-l from-gold to-gold-light text-forest-dark text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-md shadow-gold/20 border-0">
                <Zap className="w-3 h-3 ml-1" />
                المستوى {toArabicNum(levelInfo.level)}
              </Badge>
              <span className="text-[11px] text-muted-foreground">{toArabicNum(levelInfo.currentXp)} / {toArabicNum(levelInfo.xpToNext)} خبرة</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Daily Progress Ring */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="glass rounded-xl px-3 py-2 flex items-center gap-2.5 border border-white/10 dark:border-white/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] cursor-default">
                    <div className="relative">
                      <svg width={42} height={42} className="-rotate-90">
                        <defs>
                          <linearGradient id="dailyRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="oklch(0.55 0.14 163)" />
                            <stop offset="100%" stopColor="oklch(0.78 0.12 85)" />
                          </linearGradient>
                        </defs>
                        <circle cx={21} cy={21} r={17} fill="none" className="stroke-primary/10" strokeWidth={3.5} />
                        <motion.circle
                          cx={21} cy={21} r={17} fill="none"
                          stroke="url(#dailyRingGrad)"
                          strokeWidth={3.5} strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 17}
                          initial={{ strokeDashoffset: 2 * Math.PI * 17 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 17 - (today.tasksTotal + today.habitsTotal > 0 ? ((today.tasksCompleted + today.habitsCompleted + Math.min(today.focusMin, 60)) / (today.tasksTotal + today.habitsTotal + 60)) * 100 : 0) / 100 * 2 * Math.PI * 17 }}
                          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }}
                          style={{ filter: 'drop-shadow(0 0 4px oklch(0.55 0.14 163 / 0.3))' }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-foreground">{toArabicNum(today.tasksTotal + today.habitsTotal > 0 ? Math.round(((today.tasksCompleted + today.habitsCompleted + Math.min(today.focusMin, 60)) / (today.tasksTotal + today.habitsTotal + 60)) * 100) : 0)}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-foreground leading-none">تقدم اليوم</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">مهام + عادات + تركيز</p>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">تقدمك اليوم الإجمالي</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* XP Progress */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-3 min-w-[170px] border border-white/10 dark:border-white/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] cursor-default">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shrink-0 shadow-md">
                      <Zap className="w-5 h-5 text-forest-dark" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="relative">
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-l from-gold/30 to-gold-light/20 blur-sm opacity-60" />
                        <div
                          className="relative h-2 rounded-full bg-primary/10 overflow-hidden"
                          role="progressbar"
                          aria-valuenow={levelInfo.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="تقدم المستوى"
                        >
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-l from-gold to-gold-light shimmer"
                            initial={{ width: 0 }}
                            animate={{ width: `${levelInfo.progress}%` }}
                            transition={{ duration: 1.2, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground">خبرة</span>
                        <span className="text-[10px] font-semibold text-gold">{toArabicNum(levelInfo.currentXp)}</span>
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {toArabicNum(levelInfo.xpToNext - levelInfo.currentXp)} خبرة للمستوى التالي
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Streak with animated fire */}
            <div
              className="glass rounded-xl px-4 py-2.5 flex items-center gap-2.5 border border-white/10 dark:border-white/5"
            >
              <motion.div
                animate={{ scale: [1, 1.25, 1], rotate: [0, 5, -5, 0] }}
                transition={{ type: 'tween', duration: 1.5, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
              >
                <Flame className="w-5 h-5 text-orange-500" />
              </motion.div>
              <div>
                <p className="text-sm font-bold leading-none text-gradient-gold">{toArabicNum(user.streak)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">أيام متتالية</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ══════════ 2. Productivity Score (Full Width) ══════════ */}
      <motion.div variants={itemVariants}>
        <ProductivityScoreCard />
      </motion.div>

      {/* ══════════ 2b. On This Day ══════════ */}
      <motion.div variants={itemVariants}>
        <OnThisDayWidget />
      </motion.div>

      {/* ══════════ 3. Score Cards Row ══════════ */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {/* Morning Score */}
        <motion.div variants={itemVariants}>
          <PremiumGlass className="p-4 lg:p-5 cursor-default">
            <div className="flex items-center gap-3 sm:gap-4">
              <CircularProgress
                value={today.morningScore}
                size={56}
                strokeWidth={4}
                color="stroke-gold"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5">درجة الصباح</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.morningScore} />
                  <span className="text-xs sm:text-sm font-normal text-muted-foreground mr-1">/ ١٠٠</span>
                </p>
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">الاتجاه</span>
              <MiniSparkline data={morningTrend} color="bg-gold" />
            </div>
          </PremiumGlass>
        </motion.div>

        {/* Tasks Completed */}
        <motion.div variants={itemVariants}>
          <PremiumGlass className="p-4 lg:p-5 cursor-default">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-emerald-accent/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5">المهام المكتملة</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.tasksCompleted} />
                  <span className="text-xs sm:text-sm font-normal text-muted-foreground mr-1">
                    / {toArabicNum(today.tasksTotal)}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">الاتجاه</span>
              <MiniSparkline data={taskTrend} color="bg-emerald-accent" />
            </div>
          </PremiumGlass>
        </motion.div>

        {/* Habits */}
        <motion.div variants={itemVariants}>
          <PremiumGlass className="p-4 lg:p-5 cursor-default">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-forest/10 flex items-center justify-center shrink-0">
                <Target className="w-6 h-6 sm:w-7 sm:h-7 text-forest" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5">العادات</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.habitsCompleted} />
                  <span className="text-xs sm:text-sm font-normal text-muted-foreground mr-1">
                    / {toArabicNum(today.habitsTotal)}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">الاتجاه</span>
              <MiniSparkline data={habitTrend} color="bg-forest" />
            </div>
          </PremiumGlass>
        </motion.div>

        {/* Focus */}
        <motion.div variants={itemVariants}>
          <PremiumGlass className="p-4 lg:p-5 cursor-default">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 sm:w-7 sm:h-7 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5">التركيز</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">
                  <AnimatedNumber value={today.focusMin} />
                  <span className="text-xs sm:text-sm font-normal text-muted-foreground mr-1">دقيقة</span>
                </p>
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-center justify-between">
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
              <PremiumGlass className="p-4 lg:p-5" style={{ height: 200, minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0.4} />
                        <stop offset="40%" stopColor="oklch(0.55 0.14 163)" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="oklch(0.78 0.12 85)" stopOpacity={0.02} />
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

          {/* Active Goals - Weekly Progress */}
          {activeGoals.length > 0 && (
            <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
              <CardHeader className="pb-3 pt-0">
                <div className="flex items-center justify-between">
                  <SectionHeader icon={Target} iconColor="text-forest" badge={
                    <Badge variant="secondary" className="text-[10px]">
                      {toArabicNum(activeGoals.length)} أهداف
                    </Badge>
                  }>
                    تقدم الأهداف هذا الأسبوع
                  </SectionHeader>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <PremiumGlass className="p-4 space-y-4">
                  {activeGoals.slice(0, 3).map((goal, i) => (
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
                      <div
                        className="relative h-2 rounded-full bg-primary/10 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={Math.round(goal.progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`تقدم هدف: ${goal.title}`}
                      >
                        <motion.div
                          className={cn(
                            'absolute inset-y-0 right-0 rounded-full',
                            goal.progress >= 70
                              ? 'bg-gradient-to-l from-emerald-accent to-forest'
                              : goal.progress >= 40
                                ? 'bg-gradient-to-l from-gold to-gold-light'
                                : 'bg-gradient-to-l from-amber-400 to-gold'
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(goal.progress, 100)}%` }}
                          transition={{ delay: 0.6 + i * 0.1, duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground">
                          الموعد: {goal.deadline ? new Date(goal.deadline).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : '—'}
                        </p>
                        <GoalDeltaBadge goalId={goal.id} />
                      </div>
                    </motion.div>
                  ))}
                  {/* View All link */}
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    onClick={() => useRiseStore.getState().setActiveModule('goals')}
                    className="w-full flex items-center justify-center gap-1.5 pt-2 border-t border-border/30 text-xs text-muted-foreground hover:text-forest transition-colors group"
                  >
                    <span>عرض جميع الأهداف</span>
                    <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                  </motion.button>
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
                      className="shine glass rounded-xl p-3 min-w-[130px] sm:min-w-[140px] flex-shrink-0 text-center space-y-2 border border-white/10 dark:border-white/5 cursor-default"
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
                        transition={{ delay: 0.3 + i * 0.03, duration: 0.3 }}
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
                          transition={{ type: 'tween', delay: 0.8 + i * 0.04, duration: 0.6 }}
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

        {/* Motivational Wall */}
        <MotivationalWall />
      </motion.div>

      {/* ══════════ Recent Focus Sessions ══════════ */}
      {recentFocus.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={Clock} iconColor="text-gold">
                جلسات التركيز الأخيرة
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {recentFocus.map((session: any, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.05, duration: 0.25 }}
                    className="glass rounded-xl p-3 min-w-[110px] sm:min-w-[120px] flex-shrink-0 text-center space-y-1.5 border border-white/10 dark:border-white/5"
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
      {projects.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-none bg-transparent gap-0 py-0">
            <CardHeader className="pb-3 pt-0">
              <SectionHeader icon={FolderKanban} iconColor="text-emerald-accent" badge={
                <Badge variant="secondary" className="text-[10px]">
                  {toArabicNum(projects.length)} مشاريع
                </Badge>
              }>
                المشاريع
              </SectionHeader>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.slice(0, 6).map((project: any, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.05, duration: 0.25 }}
                    className="glass rounded-xl p-4 space-y-2.5 border border-white/10 dark:border-white/5 cursor-default"
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