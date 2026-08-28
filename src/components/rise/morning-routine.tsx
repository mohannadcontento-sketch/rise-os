'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun,
  Flame,
  Wind,
  BookOpen,
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
  StopCircle,
  CalendarClock,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Stepper, type StepStatus } from './neo'
import { Skeleton } from '@/components/ui/skeleton'
import { RainbowCheckbox } from './kit-v2'
import { RiseIcon, RiseGlyphIcon } from './icons'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { playSound } from '@/lib/sounds'
import { toast } from 'sonner'
import { toastSaved } from '@/lib/toast-helpers'
import { notifyMorningComplete } from '@/lib/notifications'
import { getToday, toLocalDateStr } from '@/lib/rise-utils'

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
  accent: string
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
    iconBg: 'iw-lime',
    timerDefault: 20 * 60,
    accent: 'bg-emerald-accent',
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
    iconBg: 'iw-forest',
    timerDefault: 20 * 60,
    accent: 'bg-forest',
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
    iconBg: 'iw-amber',
    timerDefault: 20 * 60,
    accent: 'bg-gold',
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
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
            <span className="pill pill-success">
              <Sparkles className="w-3 h-3 me-1" />
              مكتمل
            </span>
          ) : (
            <span className={cn('num text-sm font-mono font-semibold', section.color)} dir="ltr">
              {formatTimer(timer.seconds)}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
        <motion.div
          className={cn(
            'h-full rounded-full transition-all',
            isComplete ? 'bg-gold' : section.color.replace('text-', 'bg-')
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
              : 'bg-gold/10 text-gold hover:bg-gold/20',
            isComplete && 'opacity-40 cursor-not-allowed'
          )}
        >
          {timer.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={timer.stop}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
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
            <span className={cn('text-[10px] font-semibold', log.score >= 80 ? 'text-gold' : 'text-muted-foreground')}>
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
                    ? 'bg-gradient-to-t from-gold to-gold-light'
                    : log.score >= 80
                      ? 'bg-gold/80'
                      : log.score >= 50
                        ? 'bg-gold/50'
                        : 'bg-muted-foreground/20'
                )}
              />
            </motion.div>
            <span className={cn('text-[9px] text-muted-foreground', isToday && 'text-gold font-semibold')}>
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
    { icon: Eye, label: 'عيون', desc: '٢٠ قدم', color: 'text-glass', bg: 'bg-glass/10', border: 'border-glass/30' },
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
          style={{ filter: 'drop-shadow(0 0 4px var(--color-gold))' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-gold)" />
            <stop offset="100%" stopColor="var(--color-gold-light)" />
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
  const wellClass = sectionColor.includes('forest')
    ? 'iw-forest'
    : sectionColor.includes('emerald')
      ? 'iw-lime'
      : 'iw-amber'

  return (
    <motion.div
      layout
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-all duration-300 cursor-pointer group hover:shadow-lift',
        checked ? 'bg-gold/10 border-gold/30' : 'bg-card border-border'
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
        <RainbowCheckbox checked={checked} onChange={() => onToggle(item.id)} />
      </motion.div>
      <motion.div
        animate={checked ? { scale: 1, backgroundColor: '#F59E0B', color: '#0B1015' } : { scale: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'icon-well w-8 h-8 transition-all duration-300',
          checked ? 'iw-amber' : wellClass
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
            <span className="pill bg-gold/15 text-gold">
              <Zap className="w-2.5 h-2.5 me-0.5" />
              {arabicNum(item.xp)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ────────────── Main Component ────────────── */

export default function MorningRoutine() {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<MorningLog[]>([])
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

  // FIX: completing the routine twice a day (toggle off/on) fired /earn-xp
  // again. Keyed per day to mirror the server's per-day dedupe policy.
  const xpAwardedRef = useRef<Set<string>>(new Set())

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
        const today = getToday()
        const storedDate = toLocalDateStr(new Date(startTime))
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

  const { refreshKey } = useDataRefresh()

  // Load data from API + scheduled tasks
  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`/api/rise/morning`)
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
          const tasksRes = await apiFetch(`/api/rise/tasks`)
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json()
            const todayStr = getToday()
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
  }, [refreshKey])

  // Generate mock history for last 7 days if no logs
  const displayLogs = (() => {
    if (logs.length > 0) return logs.slice(-7)

    const mockLogs: MorningLog[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      mockLogs.push({
        date: toLocalDateStr(d),
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
          const xpKey = `morning-routine:${dateStr}`
          if (!xpAwardedRef.current.has(xpKey)) {
            xpAwardedRef.current.add(xpKey)
            apiPost('/api/rise/earn-xp', { amount: totalXp, reason: 'morning-routine-complete' }).catch(() => {})
          }
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
          className="absolute inset-0 bg-gradient-to-bl from-gold/25 via-gold/10 to-forest/10"
          animate={{
            background: [
              'linear-gradient(135deg, oklch(0.87 0.13 80) 0%, oklch(0.83 0.11 65) 50%, oklch(0.76 0.12 50) 100%)',
              'linear-gradient(135deg, oklch(0.76 0.12 50) 0%, oklch(0.83 0.11 65) 50%, oklch(0.87 0.13 80) 100%)',
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
                  <RiseIcon glyph="sunrise" hue="amber" size="md" lift />
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
                  <Clock className="w-4 h-4 text-gold" />
                  <span className="num text-sm font-mono font-semibold text-foreground" dir="ltr">
                    {formatElapsed(elapsedMs)}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleStopMorning}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all me-1"
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
                  className="flex items-center gap-2 bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:bg-forest/90 dark:hover:bg-lime/90 shadow-lg rounded-xl h-12 px-6 text-sm font-semibold"
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
              <Zap className="w-4 h-4 text-gold" />
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
                  ? 'bg-gradient-to-l from-gold via-gold-light to-forest'
                  : 'bg-gradient-to-l from-gold to-gold-light'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Neo Stepper — section-by-section routine progress ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
      >
        <div className="neo-card p-5">
          <p className="eyebrow-ar mb-4">مراحل الروتين</p>
          <Stepper
            steps={SECTIONS.map((sec) => {
              const done = sec.items.filter((i) => completedIds.has(i.id)).length
              const status: StepStatus =
                done === sec.items.length ? 'completed' : done > 0 ? 'active' : 'pending'
              return {
                title: sec.title,
                description: `${arabicNum(done)} من ${arabicNum(sec.items.length)} مهام`,
                status,
              }
            })}
          />
        </div>
      </motion.div>

      {/* ── Top Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="neo-card card-lift rounded-2xl p-4 flex items-center gap-4"
        >
          <span className="icon-well iw-amber w-11 h-11">
            <Sun className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">نتيجة الصباح</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{arabicNum(score)}٪</span>
              {saving && (
                <motion.div
                  className="w-3 h-3 border-2 border-gold/30 border-t-gold rounded-full"
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
                  <stop offset="0%" stopColor="var(--gold)" />
                  <stop offset="100%" stopColor="var(--gold-light)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="neo-card card-lift rounded-2xl p-4 flex items-center gap-4"
        >
          <span className="icon-well iw-amber w-11 h-11">
            <Zap className="w-5 h-5" />
          </span>
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
          className="neo-card card-lift rounded-2xl p-4 flex items-center gap-4"
        >
          <span className="icon-well iw-amber w-11 h-11">
            {isAllDone ? (
              <Trophy className="w-5 h-5" />
            ) : (
              <Flame className="w-5 h-5" />
            )}
          </span>
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
                <span className="pill pill-lime">
                  <Sparkles className="w-3 h-3 me-1" />
                  مكتمل
                </span>
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
              <div className="neo-card card-lift overflow-hidden">
                {/* Section accent strip */}
                <div className={cn('h-1.5 w-full', section.accent)} />
                {/* Section Header */}
                <div className={cn('px-5 pt-4 pb-3 bg-gradient-to-b', section.bgGradient)}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className={cn('icon-well w-10 h-10', section.iconBg)}>
                        {section.id === 'movement' && <RiseGlyphIcon glyph="bolt" size={21} />}
                        {section.id === 'reflection' && <RiseGlyphIcon glyph="brain" size={21} />}
                        {section.id === 'growth' && <RiseGlyphIcon glyph="reading" size={21} />}
                      </span>
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
                <div className="p-3 pt-3 space-y-0.5">
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
                </div>
              </div>
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
            <div className="neo-card card-lift overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
                <span className="icon-well iw-amber w-9 h-9">
                  <Clock className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-foreground">مهمات مجدولة اليوم</h3>
                  <p className="text-[11px] text-muted-foreground">مهام لديها وقت محدد لهذا اليوم</p>
                </div>
              </div>
              <div className="pb-5 pt-1 px-3 space-y-2">
                {scheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-card border border-border hover:shadow-lift transition-shadow"
                  >
                    <CalendarClock className="w-4 h-4 text-gold shrink-0" />
                    <span className="text-sm flex-1 text-foreground">{task.title}</span>
                    <span className="pill pill-muted">
                      <span className="num" dir="ltr">{task.dueTime}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── History Section ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="neo-card card-lift overflow-hidden">
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="icon-well iw-forest w-9 h-9">
                <TrendingUp className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-foreground">آخر ٧ أيام</h3>
                <p className="text-[11px] text-muted-foreground">تتبع تقدمك اليومي</p>
              </div>
            </div>
            {todayLog && todayLog.score >= 80 && (
              <span className="pill pill-success">
                <Star className="w-3 h-3 me-1" />
                أداء ممتاز
              </span>
            )}
          </div>
          <div className="pb-5 pt-2 px-5">
            <HistoryChart logs={displayLogs} />
          </div>
        </div>
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
              <div className="absolute inset-0 bg-gradient-to-b from-gold/8 via-gold/4 to-forest/4 pointer-events-none" />

              <div className="relative z-10">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                >
                  <span className="icon-well iw-amber w-20 h-20 mx-auto shadow-2xl mb-5">
                    <PartyPopper className="w-10 h-10" />
                  </span>
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
                    الوقت المستغرق: <span className="num font-mono font-semibold text-foreground" dir="ltr">{formatElapsed(elapsedMs)}</span>
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