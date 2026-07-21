'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedData } from '@/hooks/use-persisted-data'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun,
  Flame,
  Wind,
  BookOpen,
  CheckCircle2,
  Timer,
  Trophy,
  Sparkles,
  Dumbbell,
  Droplets,
  HandHeart,
  Brain,
  PenLine,
  Smartphone,
  Sunrise,
  Heart,
  Star,
  Play,
  Pause,
  RotateCcw,
  Zap,
  TrendingUp,
  Clock,
  PartyPopper,
  Eye,
  Moon,
  StopCircle,
  CalendarClock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { playSound } from '@/lib/sounds'
import { toast } from 'sonner'
import { notifyMorningComplete } from '@/lib/notifications'

/* ────────────── Types ────────────── */

interface RoutineItem {
  id: string
  name: string
  icon: React.ElementType
  xp: number
}

interface RoutineSection {
  id: string
  title: string
  subtitle: string
  color: string
  bgGradient: string
  iconBg: string
  items: RoutineItem[]
  timerDefault: number // seconds
  borderColor: string
}

interface MorningLog {
  id?: string
  date: string
  score: number
  completedItems: string
  totalItems: number
  startedAt: string
  completedAt: string | null
}

/* ────────────── Constants ────────────── */

const SECTIONS: RoutineSection[] = [
  {
    id: 'movement',
    title: 'حركة',
    subtitle: '٢٠ دقيقة للحركة والنشاط',
    color: 'text-emerald-accent',
    bgGradient: 'from-emerald-accent/10 to-emerald-accent/5',
    iconBg: 'bg-emerald-accent/15',
    timerDefault: 20 * 60,
    borderColor: 'border-t-emerald-accent',
    items: [
      { id: 'wake-up', name: 'الاستيقاظ في الموعد', icon: Sunrise, xp: 10 },
      { id: 'prayer', name: 'صلاة الفجر', icon: HandHeart, xp: 15 },
      { id: 'water', name: 'شرب الماء', icon: Droplets, xp: 10 },
      { id: 'exercise', name: 'تمارين رياضية', icon: Dumbbell, xp: 20 },
      { id: 'stretch', name: 'تمارين الإطالة', icon: Wind, xp: 15 },
    ],
  },
  {
    id: 'reflection',
    title: 'تأمل',
    subtitle: '٢٠ دقيقة للتأمل والتفكير',
    color: 'text-forest',
    bgGradient: 'from-forest/10 to-forest/5',
    iconBg: 'bg-forest/15',
    timerDefault: 20 * 60,
    borderColor: 'border-t-violet-500',
    items: [
      { id: 'meditation', name: 'التأمل والهدوء', icon: Brain, xp: 20 },
      { id: 'breathing', name: 'تمارين التنفس', icon: Wind, xp: 15 },
      { id: 'gratitude', name: 'الشكر والامتنان', icon: Heart, xp: 15 },
    ],
  },
  {
    id: 'growth',
    title: 'نمو',
    subtitle: '٢٠ دقيقة للتعلم والتطوير',
    color: 'text-gold',
    bgGradient: 'from-gold/10 to-gold/5',
    iconBg: 'bg-gold/15',
    timerDefault: 20 * 60,
    borderColor: 'border-t-gold',
    items: [
      { id: 'reading', name: 'القراءة', icon: BookOpen, xp: 15 },
      { id: 'planning', name: 'التخطيط اليومي', icon: Star, xp: 20 },
      { id: 'journal', name: 'كتابة اليوميات', icon: PenLine, xp: 15 },
      { id: 'no-phone', name: 'بدون هاتف', icon: Smartphone, xp: 10 },
    ],
  },
]

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items)
const TOTAL_XP = ALL_ITEMS.reduce((sum, item) => sum + item.xp, 0)

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const MOTIVATIONAL_MESSAGES = [
  'يوم رائع يبدأ بروتين رائع! 🌟',
  'أنت تبني نسخة أفضل من نفسك كل صباح 💪',
  'الاستمرارية هي سر النجاح الحقيقي 🔥',
  'كل خطوة صغيرة تقربك من أهدافك الكبيرة 🚀',
  'صباحك هو مفتاح يومك — أحسنت! ✨',
]

/* ────────────── Helpers ────────────── */

function getMorningGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 3 && hour < 7) return 'صباح النور والبركة ✨'
  if (hour >= 7 && hour < 10) return 'صباح الخير والسعادة 🌤'
  if (hour >= 10 && hour < 12) return 'صباح مشرق ومثمر ☀️'
  if (hour >= 12 && hour < 15) return 'وقت الظهر — لا زال في أوان البدء 🌅'
  return 'كل وقت مناسب لبداية جديدة 🌟'
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

function formatTimer(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function arabicNum(n: number): string {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(n).replace(/[0-9]/g, (d) => digits[parseInt(d)])
}

function getSessionStorageKey(): string {
  try {
    const stored = localStorage.getItem('rise-auth')
    if (stored) {
      const session = JSON.parse(stored)
      const userId = session.user?.id || session.access_token?.slice(0, 20) || 'default'
      return `rise-morning-session-${userId}`
    }
  } catch { /* ignore */ }
  return 'rise-morning-session-default'
}

/* ────────────── Timer Hook ────────────── */

function useSectionTimer(defaultSeconds: number) {
  const [seconds, setSeconds] = useState(defaultSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isRunning && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            setIsRunning(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, seconds])

  const start = () => setIsRunning(true)
  const pause = () => setIsRunning(false)
  const reset = () => {
    setIsRunning(false)
    setSeconds(defaultSeconds)
  }
  const stop = () => {
    setIsRunning(false)
    setSeconds(0)
  }

  return { seconds, isRunning, start, pause, reset, stop, setSeconds }
}

/* ────────────── Section Timer Component ────────────── */

function SectionTimer({
  section,
  timer,
}: {
  section: RoutineSection
  timer: ReturnType<typeof useSectionTimer>
}) {
  const progress = 1 - timer.seconds / section.timerDefault
  const isComplete = timer.seconds === 0

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Timer className={cn('w-3.5 h-3.5', section.color)} />
          <span className="text-xs text-muted-foreground font-medium">المؤقت</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isComplete ? (
            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-accent/15 text-emerald-accent border-emerald-accent/20 hover:bg-emerald-accent/20">
              <Sparkles className="w-3 h-3 ml-1" />
              مكتمل
            </Badge>
          ) : (
            <span className={cn('text-sm font-mono font-semibold tabular-nums', section.color)}>
              {formatTimer(timer.seconds)}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
        <motion.div
          className={cn(
            'h-full rounded-full transition-all',
            isComplete ? 'bg-emerald-accent' : section.color.replace('text-', 'bg-')
          )}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <div className="flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={timer.isRunning ? timer.pause : timer.start}
          disabled={isComplete}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-lg transition-all',
            timer.isRunning
              ? 'bg-forest/10 text-forest hover:bg-forest/20'
              : 'bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20',
            isComplete && 'opacity-40 cursor-not-allowed'
          )}
        >
          {timer.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={timer.stop}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
        >
          <StopCircle className="w-3.5 h-3.5" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={timer.reset}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
        >
          <RotateCcw className="w-3 h-3" />
        </motion.button>
      </div>
    </div>
  )
}

/* ────────────── History Chart ────────────── */

function HistoryChart({ logs }: { logs: MorningLog[] }) {
  const maxScore = 100

  return (
    <div className="flex items-end gap-2 h-20 px-1">
      {logs.map((log, i) => {
        const height = Math.max((log.score / maxScore) * 100, 4)
        const dayLabel = ARABIC_DAYS[new Date(log.date).getDay()]
        const isToday = log.date === getTodayStr()

        return (
          <div key={log.date} className="flex-1 flex flex-col items-center gap-1.5">
            <span className={cn('text-[10px] font-semibold', log.score >= 80 ? 'text-emerald-accent' : 'text-muted-foreground')}>
              {arabicNum(log.score)}٪
            </span>
            <motion.div
              className="w-full max-w-[28px] rounded-t-md relative overflow-hidden"
              style={{ height: `${height}%`, minHeight: '4px', transformOrigin: 'bottom' }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
            >
              <div
                className={cn(
                  'absolute inset-0 rounded-t-md',
                  isToday
                    ? 'bg-gradient-to-t from-emerald-accent to-forest-light'
                    : log.score >= 80
                      ? 'bg-emerald-accent/70'
                      : log.score >= 50
                        ? 'bg-gold/60'
                        : 'bg-muted-foreground/20'
                )}
              />
            </motion.div>
            <span className={cn('text-[9px] text-muted-foreground', isToday && 'text-emerald-accent font-semibold')}>
              {dayLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ────────────── 20/20/20 Timeline ────────────── */

function RoutineTimeline() {
  const steps = [
    { icon: Eye, label: 'عيون', desc: '٢٠ قدم', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' },
    { icon: Dumbbell, label: 'حركة', desc: '٢٠ تمرين', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10', border: 'border-emerald-accent/30' },
    { icon: BookOpen, label: 'قراءة', desc: '٢٠ صفحة', color: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/30' },
  ]

  return (
    <div className="flex items-center justify-center gap-0 py-2">
      {steps.map((step, i) => {
        const Icon = step.icon
        return (
          <div key={step.label} className="flex items-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15 }}
              className={cn('flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border', step.border, step.bg)}
            >
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4, ease: 'easeInOut' }}
              >
                <Icon className={cn('w-5 h-5', step.color)} />
              </motion.div>
              <span className={cn('text-xs font-bold', step.color)}>{step.label}</span>
              <span className="text-[10px] text-muted-foreground">{step.desc}</span>
            </motion.div>
            {i < steps.length - 1 && (
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: i * 0.15 + 0.1, duration: 0.4 }}
                className="w-8 h-[2px] bg-gradient-to-l from-transparent via-border to-transparent mx-1"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ────────────── Progress Ring ────────────── */

function CompletionRing({ score }: { score: number }) {
  const size = 64
  const strokeWidth = 5
  const radius = Math.max(1, (size - strokeWidth) / 2)
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#ringGrad)" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ filter: 'drop-shadow(0 0 4px var(--color-emerald-accent))' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-emerald-accent)" />
            <stop offset="100%" stopColor="var(--color-forest)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-foreground">{arabicNum(score)}٪</span>
      </div>
    </div>
  )
}

/* ────────────── Routine Item Row ────────────── */

function RoutineItemRow({
  item,
  sectionColor,
  checked,
  onToggle,
}: {
  item: RoutineItem
  sectionColor: string
  checked: boolean
  onToggle: (id: string) => void
}) {
  const Icon = item.icon

  return (
    <motion.div
      layout
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 cursor-pointer group',
        'hover:bg-muted/50',
        checked && 'bg-emerald-accent/8'
      )}
      onClick={() => onToggle(item.id)}
      whileTap={{ scale: 0.99 }}
    >
      <motion.div
        initial={false}
        animate={checked ? { scale: [1, 1.25, 1] } : { scale: 1 }}
        transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
        whileTap={{ scale: 0.85 }}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(item.id)}
          className={cn(
            'w-5 h-5 rounded-lg border-2 transition-all duration-300',
            checked
              ? 'border-emerald-accent bg-emerald-accent text-white data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent shadow-sm shadow-emerald-accent/30'
              : 'border-muted-foreground/30 hover:border-muted-foreground/50'
          )}
        />
      </motion.div>
      <motion.div
        animate={checked ? { scale: 1, backgroundColor: 'var(--color-emerald-accent)', color: 'white' } : { scale: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300',
          checked ? 'bg-emerald-accent/15 text-emerald-accent' : `bg-muted/60 ${sectionColor} opacity-60`
        )}
      >
        <Icon className="w-4 h-4" />
      </motion.div>
      <motion.span
        animate={checked ? { opacity: 0.5 } : { opacity: 1 }}
        className={cn(
          'flex-1 text-sm font-medium transition-all duration-300',
          checked ? 'line-through text-muted-foreground' : 'text-foreground'
        )}
      >
        {item.name}
      </motion.span>
      <AnimatePresence>
        {checked && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3, x: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.3, x: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Badge className="text-[10px] px-1.5 py-0 bg-gold/15 text-gold border-gold/20 hover:bg-gold/20">
              <Zap className="w-2.5 h-2.5 ml-0.5" />
              {arabicNum(item.xp)}
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ────────────── Main Component ────────────── */

export default function MorningRoutine() {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [logs, setLogs] = usePersistedData<MorningLog[]>('morning-routine', [])
  const [todayLog, setTodayLog] = useState<MorningLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [scheduledTasks, setScheduledTasks] = useState<{ id: string; title: string; dueTime: string }[]>([])

  // Session timer state
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const sessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevAllDoneRef = useRef(false)

  const movementTimer = useSectionTimer(SECTIONS[0].timerDefault)
  const reflectionTimer = useSectionTimer(SECTIONS[1].timerDefault)
  const growthTimer = useSectionTimer(SECTIONS[2].timerDefault)

  const timers = [movementTimer, reflectionTimer, growthTimer]

  // Calculate score
  const completedCount = completedIds.size
  const totalCount = ALL_ITEMS.length
  const score = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const earnedXP = ALL_ITEMS.filter((item) => completedIds.has(item.id)).reduce((sum, item) => sum + item.xp, 0)
  const isAllDone = completedCount === totalCount

  // Notify when all items completed (transition from false → true)
  useEffect(() => {
    if (isAllDone && !prevAllDoneRef.current) {
      notifyMorningComplete(score, earnedXP)
    }
    prevAllDoneRef.current = isAllDone
  }, [isAllDone, score, earnedXP])

  // Session timer logic
  useEffect(() => {
    if (sessionActive && sessionStartTime) {
      sessionIntervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - sessionStartTime)
      }, 1000)
    }
    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current)
    }
  }, [sessionActive, sessionStartTime])

  // Restore session from localStorage + listen for auth changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getSessionStorageKey())
      if (stored) {
        const startTime = parseInt(stored)
        const today = new Date().toISOString().split('T')[0]
        const storedDate = new Date(startTime).toISOString().split('T')[0]
        if (storedDate === today) {
          setSessionActive(true)
          setSessionStartTime(startTime)
          setElapsedMs(Date.now() - startTime)
        } else {
          localStorage.removeItem(getSessionStorageKey())
        }
      }
    } catch { /* ignore */ }

    const handleSessionChange = () => {
      localStorage.removeItem(getSessionStorageKey())
      setSessionActive(false)
      setSessionStartTime(null)
      setElapsedMs(0)
      // Also reset section timers
      movementTimer.reset()
      reflectionTimer.reset()
      growthTimer.reset()
    }

    window.addEventListener('rise:session-expired', handleSessionChange)
    window.addEventListener('rise:auth-refreshed', handleSessionChange)

    return () => {
      window.removeEventListener('rise:session-expired', handleSessionChange)
      window.removeEventListener('rise:auth-refreshed', handleSessionChange)
    }
  }, [])

  const handleStartMorning = () => {
    const now = Date.now()
    setSessionActive(true)
    setSessionStartTime(now)
    setElapsedMs(0)
    localStorage.setItem(getSessionStorageKey(), String(now))
  }

  const handleStopMorning = () => {
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current)
    localStorage.removeItem(getSessionStorageKey())
    setSessionActive(false)
    // Don't reset elapsedMs so user can see final time briefly
    setTimeout(() => {
      setElapsedMs(0)
      setSessionStartTime(null)
    }, 3000)
  }

  // Clear session timer when all items are completed
  useEffect(() => {
    if (isAllDone && sessionActive) {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current)
      localStorage.removeItem(getSessionStorageKey())
      setSessionActive(false)
      // Keep elapsed time visible
    }
  }, [isAllDone, sessionActive])

  // Load data from API + scheduled tasks
  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/rise/morning')
        if (res.ok) {
          const data = await res.json()
          setLogs(data.logs || [])
          if (data.todayLog) {
            setTodayLog(data.todayLog)
            const items: string[] = JSON.parse(data.todayLog.completedItems || '[]')
            setCompletedIds(new Set(items))
            setStartedAt(data.todayLog.startedAt)
          }
        }

        // Fetch today's scheduled tasks (tasks with dueDate = today and dueTime set)
        try {
          const tasksRes = await apiFetch('/api/rise/tasks')
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json()
            const todayStr = new Date().toISOString().split('T')[0]
            const todayScheduled = (tasksData.tasks || []).filter(
              (t: any) => t.dueDate === todayStr && t.dueTime && t.status !== 'done'
            ).map((t: any) => ({ id: t.id, title: t.title, dueTime: t.dueTime }))
            todayScheduled.sort((a: any, b: any) => a.dueTime.localeCompare(b.dueTime))
            setScheduledTasks(todayScheduled)
          }
        } catch { /* ignore */ }
      } catch {
        // Use empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Generate mock history for last 7 days if no logs
  const displayLogs = (() => {
    if (logs.length > 0) return logs.slice(-7)

    const mockLogs: MorningLog[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      mockLogs.push({
        date: d.toISOString().split('T')[0],
        score: i === 0 ? score : Math.floor(Math.random() * 60) + 40,
        completedItems: '[]',
        totalItems: totalCount,
        startedAt: d.toISOString(),
        completedAt: i === 0 && isAllDone ? new Date().toISOString() : null,
      })
    }
    return mockLogs
  })()

  // Save to API
  const saveToAPI = useCallback(
    async (ids: Set<string>) => {
      setSaving(true)
      const now = new Date().toISOString()
      const dateStr = getTodayStr()

      const payload: MorningLog = {
        date: dateStr,
        score: totalCount > 0 ? Math.round((ids.size / totalCount) * 100) : 0,
        completedItems: JSON.stringify(Array.from(ids)),
        totalItems: totalCount,
        startedAt: startedAt || now,
        completedAt: ids.size === totalCount ? now : null,
      }

      try {
        const res = await apiPost('/api/rise/morning', payload)
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          toast.error('فشل في حفظ الروتين', { description: errData.error || errData.details || 'حاول مرة أخرى' })
          return
        }
        if (!startedAt) setStartedAt(now)
        setTodayLog(payload)
        // Award XP when all items completed
        if (ids.size === totalCount && totalCount > 0) {
          playSound('achievement')
          const totalXp = SECTIONS.reduce((sum, s) => sum + s.items.reduce((isum, item) => isum + item.xp, 0), 0)
          apiPost('/api/rise/earn-xp', { amount: totalXp, reason: 'morning-routine-complete' }).catch(() => {})
        }
      } catch {
        toast.error('فشل الاتصال بالخادم')
      } finally {
        setSaving(false)
      }
    },
    [startedAt, totalCount]
  )

  const handleToggle = useCallback(
    (id: string) => {
      setCompletedIds((prev) => {
        const isChecking = !prev.has(id)
        if (isChecking) playSound('habit-check')
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        // Save after state update
        setTimeout(() => saveToAPI(next), 0)
        return next
      })
    },
    [saveToAPI]
  )

  if (loading) {
    return (
      <div dir="rtl" className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    )
  }

  // Pick a random motivational message
  const motivationalMsg = MOTIVATIONAL_MESSAGES[Math.floor((Date.now() / 86400000) % MOTIVATIONAL_MESSAGES.length)]

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── Sunrise Gradient Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-6 md:p-8"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-bl from-gold/20 via-emerald-accent/10 to-forest/15"
          animate={{
            background: [
              'linear-gradient(135deg, oklch(0.85 0.12 85) 0%, oklch(0.75 0.1 160) 50%, oklch(0.5 0.12 155) 100%)',
              'linear-gradient(135deg, oklch(0.5 0.12 155) 0%, oklch(0.75 0.1 160) 50%, oklch(0.85 0.12 85) 100%)',
            ],
          }}
          transition={{ duration: 8, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          style={{ backgroundSize: '200% 200%' }}
        />
        <div className="absolute inset-0 noise-bg opacity-40" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                  transition={{ type: 'tween', duration: 3, repeat: Infinity, repeatDelay: 3 }}
                >
                  <Sunrise className="w-6 h-6 text-gold" />
                </motion.div>
                <span className="text-gradient-gold">الروتين الصباحي</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{getMorningGreeting()}</p>
            </div>
            <div className="flex items-center gap-3">
              {sessionActive && sessionStartTime && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 glass rounded-xl px-4 py-2.5"
                >
                  <Clock className="w-4 h-4 text-emerald-accent" />
                  <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
                    {formatElapsed(elapsedMs)}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleStopMorning}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all mr-1"
                    title="إيقاف"
                  >
                    <StopCircle className="w-4 h-4" />
                  </motion.button>
                </motion.div>
              )}
              {!sessionActive && (
                <motion.button
                  onClick={handleStartMorning}
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ type: 'tween', duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-2 bg-gradient-to-l from-emerald-accent to-forest hover:from-emerald-accent/90 hover:to-forest/90 text-white shadow-lg shadow-emerald-accent/20 rounded-xl h-12 px-6 text-sm font-semibold"
                >
                  <Play className="w-4 h-4" />
                  ابدأ الصباح
                </motion.button>
              )}
            </div>
          </div>
          {/* 20/20/20 Timeline */}
          <div className="mt-5">
            <RoutineTimeline />
          </div>
        </div>
      </motion.div>

      {/* ── Overall Progress with Ring ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-accent" />
              <span className="text-sm font-semibold text-foreground">التقدم الكلي للروتين</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">{arabicNum(completedCount)} من {arabicNum(totalCount)}</span>
              <CompletionRing score={score} />
            </div>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full transition-colors',
                isAllDone
                  ? 'bg-gradient-to-l from-gold via-emerald-accent to-forest'
                  : 'bg-gradient-to-l from-emerald-accent to-forest-light'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Top Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="glass rounded-2xl p-4 flex items-center gap-4"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-lg">
            <Sun className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">نتيجة الصباح</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{arabicNum(score)}٪</span>
              {saving && (
                <motion.div
                  className="w-3 h-3 border-2 border-emerald-accent/30 border-t-emerald-accent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>
          </div>
          <div className="w-12 h-12 relative">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/50" />
              <motion.circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke="url(#scoreGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 18 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 18 * (1 - score / 100) }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
              <defs>
                <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--emerald-accent)" />
                  <stop offset="100%" stopColor="var(--forest)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="glass rounded-2xl p-4 flex items-center gap-4"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-forest-dark" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">الخبرة المكتسبة</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground">{arabicNum(earnedXP)}</span>
              <span className="text-xs text-muted-foreground">/ {arabicNum(TOTAL_XP)}</span>
            </div>
          </div>
          <div className="text-right">
            <Progress value={(earnedXP / TOTAL_XP) * 100} className="w-16 h-2" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="glass rounded-2xl p-4 flex items-center gap-4"
        >
          <div className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center shadow-lg',
            isAllDone
              ? 'bg-gradient-to-br from-emerald-accent to-forest'
              : 'bg-gradient-to-br from-forest/30 to-forest/10'
          )}>
            {isAllDone ? (
              <Trophy className="w-5 h-5 text-white" />
            ) : (
              <Flame className="w-5 h-5 text-forest" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">التقدم</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{arabicNum(completedCount)}</span>
              <span className="text-xs text-muted-foreground">/ {arabicNum(totalCount)} عنصر</span>
            </div>
          </div>
          <AnimatePresence>
            {isAllDone && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Badge className="bg-emerald-accent text-white border-emerald-accent text-xs px-2 py-0.5">
                  <Sparkles className="w-3 h-3 ml-1" />
                  مكتمل
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── 3 Section Cards (with colored top borders) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {SECTIONS.map((section, si) => {
          const sectionCompleted = section.items.filter((item) => completedIds.has(item.id)).length
          const sectionTotal = section.items.length
          const sectionScore = sectionTotal > 0 ? Math.round((sectionCompleted / sectionTotal) * 100) : 0
          const sectionXP = section.items.filter((item) => completedIds.has(item.id)).reduce((s, i) => s + i.xp, 0)

          return (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + si * 0.1 }}
            >
              <Card className={cn('overflow-hidden rounded-2xl border-0 shadow-sm hover:shadow-md transition-shadow duration-300 gap-0 border-t-4', section.borderColor)}>
                {/* Section Header */}
                <div className={cn('px-5 pt-5 pb-3 bg-gradient-to-b', section.bgGradient)}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', section.iconBg)}>
                        {section.id === 'movement' && <Sun className={cn('w-5 h-5', section.color)} />}
                        {section.id === 'reflection' && <Brain className={cn('w-5 h-5', section.color)} />}
                        {section.id === 'growth' && <BookOpen className={cn('w-5 h-5', section.color)} />}
                      </div>
                      <div>
                        <h3 className={cn('text-lg font-bold', section.color)}>{section.title}</h3>
                        <p className="text-[11px] text-muted-foreground">{section.subtitle}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <span className={cn('text-lg font-bold', sectionScore === 100 ? 'text-emerald-accent' : section.color)}>
                        {arabicNum(sectionScore)}٪
                      </span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', sectionScore === 100 ? 'bg-emerald-accent' : section.color.replace('text-', 'bg-'))}
                      animate={{ width: `${sectionScore}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                {/* Items */}
                <CardContent className="p-3 pt-3 space-y-0.5">
                  {section.items.map((item, ii) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 + si * 0.1 + ii * 0.04 }}
                    >
                      <RoutineItemRow
                        item={item}
                        sectionColor={section.color}
                        checked={completedIds.has(item.id)}
                        onToggle={handleToggle}
                      />
                    </motion.div>
                  ))}

                  {/* Section Timer */}
                  <SectionTimer section={section} timer={timers[si]} />

                  {/* Section XP Summary */}
                  {sectionCompleted > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between"
                    >
                      <span className="text-xs text-muted-foreground">خبرة القسم</span>
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-gold" />
                        <span className="text-xs font-semibold text-gold">{arabicNum(sectionXP)}</span>
                        <span className="text-[10px] text-muted-foreground">/ {arabicNum(section.items.reduce((s, i) => s + i.xp, 0))}</span>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* ── Today's Scheduled Tasks ── */}
      <AnimatePresence>
        {scheduledTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            <Card className="overflow-hidden rounded-2xl border-0 shadow-sm gap-0">
              <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gold/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">مهمات مجدولة اليوم</h3>
                  <p className="text-[11px] text-muted-foreground">مهام لديها وقت محدد لهذا اليوم</p>
                </div>
              </div>
              <CardContent className="pb-5 pt-1 space-y-2">
                {scheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted/80 transition-colors"
                  >
                    <CalendarClock className="w-4 h-4 text-gold shrink-0" />
                    <span className="text-sm flex-1 text-foreground">{task.title}</span>
                    <Badge variant="secondary" className="text-[10px] font-mono tabular-nums">
                      {task.dueTime}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── History Section ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Card className="overflow-hidden rounded-2xl border-0 shadow-sm gap-0">
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-forest/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-forest" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">آخر ٧ أيام</h3>
                <p className="text-[11px] text-muted-foreground">تتبع تقدمك اليومي</p>
              </div>
            </div>
            {todayLog && todayLog.score >= 80 && (
              <Badge className="bg-emerald-accent/10 text-emerald-accent border-emerald-accent/20 hover:bg-emerald-accent/15">
                <Star className="w-3 h-3 ml-1" />
                أداء ممتاز
              </Badge>
            )}
          </div>
          <CardContent className="pb-5 pt-2">
            <HistoryChart logs={displayLogs} />
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Completion Celebration Overlay ── */}
      <AnimatePresence>
        {isAllDone && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.5, type: 'spring', damping: 20 }}
          >
            <div className="glass rounded-2xl p-8 text-center shine relative overflow-hidden">
              {/* Background confetti-like effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-gold/5 via-emerald-accent/5 to-forest/5 pointer-events-none" />

              <div className="relative z-10">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                >
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-gold via-emerald-accent to-forest flex items-center justify-center shadow-2xl mb-5">
                    <PartyPopper className="w-10 h-10 text-white" />
                  </div>
                </motion.div>
                <h3 className="text-2xl font-bold text-foreground mb-2">مبهر! أكملت روتينك الصباحي بالكامل</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  {motivationalMsg}
                </p>
                <div className="flex items-center justify-center gap-3 mb-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.3 }}
                    className="flex items-center gap-2 bg-gold/10 border border-gold/20 rounded-xl px-4 py-2"
                  >
                    <Zap className="w-5 h-5 text-gold" />
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">إجمالي الخبرة</p>
                      <p className="text-lg font-bold text-gold">{arabicNum(earnedXP)} XP</p>
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.4 }}
                    className="flex items-center gap-2 bg-emerald-accent/10 border border-emerald-accent/20 rounded-xl px-4 py-2"
                  >
                    <Sparkles className="w-5 h-5 text-emerald-accent" />
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">النتيجة</p>
                      <p className="text-lg font-bold text-emerald-accent">{arabicNum(score)}٪</p>
                    </div>
                  </motion.div>
                </div>
                {sessionStartTime && (
                  <p className="text-xs text-muted-foreground">
                    الوقت المستغرق: <span className="font-mono font-semibold text-foreground">{formatElapsed(elapsedMs)}</span>
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}