'use client'

// ============================================================
// deep-work.tsx — وحدة «العمل العميق»
//
// جلسات تركيز بمؤقت دائري: بومودورو ٢٥ أو عميق ٥٠/٩٠/١٢٠ أو
// مخصص ١-٤٨٠ دقيقة، مع أصوات محيطية Web Audio، «منطقة تركيز»
// ملء الشاشة أثناء التشغيل، ملاحظات سريعة محفوظة محليًا، ربط
// الجلسة المكتملة بمهمة (dialog)، وإحصاءات وسجل ورسم ١٤ يومًا
// (recharts). منطق المؤقت كله في use-focus-timer والأصوات في
// use-ambient-sounds — هذا الملف عرض + حفظ عبر apiFetch/apiPost
// /apiPut (لا يعرف Supabase).
//
// البنية الداخلية:
//   1) الأنواع: FocusSession / FocusData / TaskOption
//   2) الثوابت: خيارات المدد، الأصوات المحيطية (8)، حركات
//      framer-motion، اقتباسات التحفيز
//   3) أدوات مساعدة: اقتباس الجلسة (حسب عدد الجلسات) + تنسيق
//      الوقت + تسمية المدة
//   4) DeepWork: جلب الجلسات + حفظها (completed أو جزئي)
//      + ربط المهمة + XP (earn-xp) + فور قائمة المزامنة عبر
//      رأس X-Offline-Queued
//   5) الرسم: مؤقت SVG متدرج يتحول بنفسجي→ذهبي→أحمر مع
//      التقدم، حلقة نبض خارجية، انفجار احتفالي، موجات
//      الأصوات النشطة، BarChart للتركيز اليومي
//
// مبادئ UX/تقنية: المؤقت timestamp-based فلا يزيغ في خلفية
// التبويب و يُستعاد عند التحميل؛ تجاوز 50%/80% من التقدم يغيّر
// لون الحلقة والتوهج؛ الإنهاء المبكر يحفظ الجلسة غير المكتملة
// بالدقائق الفعلية؛ الملاحظات تُحفظ debounce 500ms في
// user-storage؛ حفظ offline يُصفّ في طابور apiFetch مع toast
// «سيتم المزامنة لاحقًا».
// ============================================================

import { getUserStorage, setUserStorage, removeUserStorage } from '@/lib/user-storage'
import { useAmbientSounds } from '@/hooks/use-ambient-sounds'
import { useFocusTimer } from '@/hooks/use-focus-timer'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import {
  Brain,
  Play,
  Pause,
  RotateCcw,
  Square,
  CloudRain,
  TreePine,
  Waves,
  Flame,
  Wind,
  Clock,
  Trophy,
  Zap,
  StickyNote,
  PartyPopper,
  Timer,
  TrendingUp,
  Target,
  Sparkles,
  Star,
  Check,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Quote,
  Link2,
  Loader2,
  Settings,
  History,
  Moon,
  Droplets,
  CloudLightning,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost, apiPut } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { toastSaved } from '@/lib/toast-helpers'
import { playSound } from '@/lib/sounds'
import { notifyFocusComplete } from '@/lib/notifications'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getToday, toLocalDateStr } from '@/lib/rise-utils'
import { RiseIcon } from '@/components/rise/icons'

// ─── القسم: الأنواع ─────────────────────────────

/* ────────────── Types ────────────── */

interface FocusSession {
  id: string
  duration: number
  actualMin: number
  type: string
  completed: boolean
  startedAt: string
  completedAt: string | null
  notes: string
}

interface FocusData {
  sessions: FocusSession[]
}

interface TaskOption {
  id: string
  title: string
  priority: string
}

// ─── القسم: الثوابت (المدد والأصوات المحيطية) ─────────────────────────────

/* ────────────── Constants ────────────── */

const DURATION_OPTIONS = [
  { label: 'بومودورو', value: 25, icon: Timer, color: 'text-rose-accent', bgAccent: 'bg-rose-accent/5' },
  { label: 'عميق ٥٠', value: 50, icon: Brain, color: 'text-violet-accent', bgAccent: 'bg-violet-accent/5' },
  { label: 'عميق ٩٠', value: 90, icon: Target, color: 'text-forest', bgAccent: 'bg-forest/5' },
  { label: 'عميق ١٢٠', value: 120, icon: Zap, color: 'text-gold', bgAccent: 'bg-gold/5' },
  { label: 'مخصص', value: 0, icon: Settings, color: 'text-violet-accent', bgAccent: 'bg-violet-accent/5' },
]

const AMBIENT_SOUNDS = [
  { label: 'ضوء القمر', icon: Moon, file: '/sounds/moonlight-sonata.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(129, 140, 248, 0.08)' },
  { label: 'مطر', icon: CloudRain, file: '/sounds/rain.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(96, 165, 250, 0.06)' },
  { label: 'غابة', icon: TreePine, file: '/sounds/forest.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(16, 185, 129, 0.06)' },
  { label: 'محيط', icon: Waves, file: '/sounds/ocean.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(6, 182, 212, 0.06)' },
  { label: 'نار', icon: Flame, file: '/sounds/fire.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(249, 115, 22, 0.08)' },
  { label: 'رياح', icon: Wind, file: '/sounds/wind.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(45, 212, 191, 0.06)' },
  { label: 'جدول ماء', icon: Droplets, file: '/sounds/stream.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(56, 189, 248, 0.06)' },
  { label: 'عاصفة', icon: CloudLightning, file: '/sounds/storm.mp3', color: 'bg-violet-accent/15 text-violet-accent', waveColor: 'rgba(168, 85, 247, 0.08)' },
]

// Map label → MP3 file URL (for fast lookup)
const AMBIENT_SOUND_URLS: Record<string, string> = Object.fromEntries(
  AMBIENT_SOUNDS.map((s) => [s.label, s.file])
)

// ─── القسم: حركات framer-motion ─────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

// ─── القسم: اقتباسات التحفيز ─────────────────────────────

const FOCUS_QUOTES = [
  '« التركيز هو القدرة على قول «لا» لمئات الأفكار الجيدة. » — ستيف جوبز',
  '« العمق هو الشيء النادر والقيم في عالمنا السطحي. » — كال نيوبورت',
  '« أنت لا تحتاج وقتاً أكثر، بل تركيزاً أعمق. »',
  '« ساعة من التركيز العميق تساوي أربع ساعات من العمل المشتت. »',
  '« النجاح المتسارع يأتي من التركيز المكثف على مهمة واحدة. »',
  '« عقلك أقوى مما تعتقد — استثمره بالتركيز. »',
  '« كل جلسة تركيز تبني مساراً أعصبياً أقوى نحو التميز. »',
  '« الأشخاص الناجحون لا يفعلون أشياء مختلفة — إنهم يفعلون الأشياء بشكل مختلف. »',
]

// ─── القسم: أدوات مساعدة ─────────────────────────────

/* ────────────── Helper ────────────── */

function getSessionQuote(): string {
  const sessionCount = parseInt(getUserStorage('rise-focus-session-count') || '0')
  return FOCUS_QUOTES[sessionCount % FOCUS_QUOTES.length]
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getDurationLabel(min: number): string {
  return DURATION_OPTIONS.find((d) => d.value === min)?.label || `${min} دقيقة`
}

// ─── القسم: المكون الرئيسي DeepWork ─────────────────────────────

/* ────────────── Component ────────────── */

export default function DeepWork() {
  const [data, setData] = useState<FocusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Timer state — الاستعادة والنبض والتحكم كلها في use-focus-timer
  // (timestamp-based: البقاء في خلفية التبويب لا يزيغ الوقت)
  const {
    selectedDuration, customDuration, timeRemaining,
    isRunning, isPaused, sessionCompleted, sessionStartTime, celebrateKey,
    setCustomDuration, setSessionCompleted, setSessionStartTime, setTimeRemaining,
    start: timerStart, pause: timerPause, resume: timerResume,
    reset: timerReset, stop: timerStop,
    durationSelect: timerDurationSelect, customDurationSet: timerCustomDurationSet,
    elapsedMin: timerElapsedMin,
  } = useFocusTimer({
    start: () => playSound('click'),
    pause: () => playSound('toggle'),
    resume: () => playSound('click'),
    reset: () => playSound('click'),
    navigate: () => playSound('navigate'),
    complete: () => {
      playSound('timer-done')
      setTimeout(() => playSound('achievement'), 400)
    },
  })
  const QUICK_NOTES_KEY = 'rise-deep-work-quick-notes'
  const [sessionNotes, setSessionNotes] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return getUserStorage(QUICK_NOTES_KEY) || '' } catch { return '' }
  })
  const [notesSaved, setNotesSaved] = useState(true)

  // Auto-save notes to localStorage with debounce
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleNotesChange = (val: string) => {
    setSessionNotes(val)
    setNotesSaved(false)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      try { setUserStorage(QUICK_NOTES_KEY, val) } catch { /* ignore */ }
      setNotesSaved(true)
    }, 500)
  }
  // celebrateKey يعيش داخل use-focus-timer (يتزايد عند كل اكتمال)

  // Ambient sounds (real Web Audio)
  const [activeSounds, setActiveSounds] = useState<Set<string>>(new Set())
  const { startSound, stopSound } = useAmbientSounds()
  // Focus zone mode
  const [focusZone, setFocusZone] = useState(false)
  // Motivational quote
  const [sessionQuote] = useState(getSessionQuote)

  // Task linking after session
  const [linkTaskOpen, setLinkTaskOpen] = useState(false)
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none')
  const [lastSessionXp, setLastSessionXp] = useState(0)
  const [lastSessionMin, setLastSessionMin] = useState(0)
  const [linkingTask, setLinkingTask] = useState(false)
  const [lastSessionId, setLastSessionId] = useState<string | null>(null)

  // intervalRef/endTimeRef و مفتاح التخزين — داخل use-focus-timer

  /* ─── Fetch ─── */
  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/rise/focus`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      toast.error('فشل في تحميل جلسات العمل')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // استعادة المؤقت عند التحميل + منطق النبض (timestamp-based) — انتقلا إلى use-focus-timer


  /* ─── Save Session ─── */
  const saveSession = async (completed: boolean) => {
    if (!sessionStartTime) return
    setSaving(true)
    try {
      const elapsedMin = Math.round((selectedDuration * 60 - timeRemaining) / 60)
      const res = await apiPost('/api/rise/focus', {
        duration: selectedDuration,
        actualMin: elapsedMin,
        type: getDurationLabel(selectedDuration),
        completed,
        startedAt: sessionStartTime,
        completedAt: completed ? new Date().toISOString() : null,
        notes: sessionNotes,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error('فشل في حفظ الجلسة', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        return
      }

      // Check if response is an offline queued response
      const isOfflineQueued = res.headers.get('X-Offline-Queued') === 'true'
      if (isOfflineQueued) {
        if (completed) {
          const xp = Math.round(elapsedMin * 2)
          notifyFocusComplete(elapsedMin, xp)
          toast.success('تم حفظ الجلسة (سيتم المزامنة لاحقاً)')
        } else {
          toast.success('تم حفظ الجلسة (سيتم المزامنة لاحقاً)')
        }
        fetchSessions()
        return
      }

      const sessionData = await res.json()
      if (completed) {
        const xp = Math.round(elapsedMin * 2)
        notifyFocusComplete(elapsedMin, xp)
        apiPost('/api/rise/earn-xp', { amount: Math.floor(elapsedMin / 10), reason: `focus:${selectedDuration}min` }).catch(() => {})
        setLastSessionXp(xp)
        setLastSessionMin(elapsedMin)
        setLastSessionId(sessionData.id)
        fetchTasksForLinking()
      } else {
        toastSaved('الجلسة')
      }
      fetchSessions()
    } catch {
      toast.error('فشل في حفظ الجلسة')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Task Linking ─── */
  const fetchTasksForLinking = async () => {
    try {
      const res = await apiFetch(`/api/rise/tasks`)
      if (res.ok) {
        const data = await res.json()
        const eligible = (data.tasks || []).filter(
          (t: { status: string }) => t.status === 'in_progress' || t.status === 'todo'
        )
        if (eligible.length > 0) {
          setTaskOptions(eligible.map((t: TaskOption) => ({ id: t.id, title: t.title, priority: t.priority })))
          setLinkTaskOpen(true)
        }
      }
    } catch {
      // ignore
    }
  }

  const handleLinkTask = async () => {
    if (selectedTaskId === 'none' || !lastSessionId) {
      setLinkTaskOpen(false)
      return
    }
    setLinkingTask(true)
    try {
      const res = await apiPut('/api/rise/focus', { id: lastSessionId, taskId: selectedTaskId })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error('فشل في ربط الجلسة', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        setLinkTaskOpen(false)
        return
      }
      const taskName = taskOptions.find((t) => t.id === selectedTaskId)?.title
      toastSaved('ربط الجلسة')
      fetchSessions()
      playSound('complete')
    } catch {
      toast.error('فشل في ربط الجلسة')
    } finally {
      setLinkingTask(false)
      setLinkTaskOpen(false)
      setSelectedTaskId('none')
    }
  }

  /* ─── Controls ── أزرار المؤقت تُفوّض إلى use-focus-timer (الأصوات عبر أحداثه) ── */
  const handleStart = timerStart
  const handlePause = timerPause
  const handleResume = timerResume
  const handleReset = timerReset

  const handleStop = () => {
    // الدقائق المنقضية تُحسب قبل التصفير (نفس ترتيب السلوك الأصلي)
    const elapsed = timerElapsedMin()
    timerStop()
    if (elapsed > 0) {
      saveSession(false)
      playSound('save')
    } else {
      playSound('click')
    }
  }

  const handleDurationSelect = timerDurationSelect
  const handleCustomDurationSet = timerCustomDurationSet

  const toggleSound = (label: string) => {
    const isActive = activeSounds.has(label)
    if (isActive) {
      stopSound(label)
      setActiveSounds((prev) => {
        const next = new Set(prev)
        next.delete(label)
        return next
      })
    } else {
      startSound(label)
      setActiveSounds((prev) => {
        const next = new Set(prev)
        next.add(label)
        return next
      })
    }
    playSound('toggle')
  }

  /* ─── Computed ─── */
  const totalSeconds = selectedDuration * 60
  const progress = totalSeconds > 0 ? ((totalSeconds - timeRemaining) / totalSeconds) * 100 : 0

  const circumference = 2 * Math.PI * 120
  const strokeDashoffset = circumference - (progress / 100) * circumference

  const stats = useMemo(() => {
    const sessions = data?.sessions || []
    const totalMin = sessions.reduce((sum, s) => sum + (s.actualMin || 0), 0)
    const todayStr = getToday()
    const todaySessions = sessions.filter((s) => s.startedAt?.startsWith(todayStr))
    const todayMin = todaySessions.reduce((sum, s) => sum + (s.actualMin || 0), 0)
    const avgMin = sessions.length
      ? Math.round(totalMin / sessions.length)
      : 0
    return { totalMin, todaySessions: todaySessions.length, todayMin, avgMin }
  }, [data])

  /* ─── Chart Data ─── */
  const chartData = useMemo(() => {
    const sessions = data?.sessions || []
    const days: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = toLocalDateStr(d)
      days[key] = 0
    }
    sessions.forEach((s) => {
      const day = s.startedAt?.split('T')[0]
      if (day && days[day] !== undefined) {
        days[day] += s.actualMin || 0
      }
    })
    return Object.entries(days).map(([date, min]) => ({
      day: new Date(date).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' }),
      دقائق: min,
    }))
  }, [data])

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex justify-center">
          <Skeleton className="h-72 w-72 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  const mainContent = (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className={cn('space-y-6 p-4 md:p-6 relative', focusZone && 'max-w-2xl mx-auto')}
    >
      {/* Header with Focus Zone toggle */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RiseIcon glyph="focus" hue="violet" size="md" lift />
          <div>
            <h2 className="text-xl font-bold text-foreground">العمل العميق</h2>
            <p className="text-xs text-muted-foreground">ركّز وحقق أقصى إنتاجية</p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setFocusZone(!focusZone)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all',
            focusZone
              ? 'bg-forest/20 text-forest border border-forest/30 shadow-sm shadow-forest/10'
              : 'glass hover:bg-muted/30 text-muted-foreground'
          )}
        >
          {focusZone ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          {focusZone ? 'خروج من المنطقة' : 'منطقة التركيز'}
        </motion.button>
      </motion.div>

      {/* Motivational Quote */}
      <motion.div
        variants={itemVariants}
        className="flex items-start gap-3 p-4 rounded-2xl bg-gradient-to-l from-violet-accent/5 via-transparent to-gold/5 border border-violet-accent/10"
      >
        <Quote className="w-4 h-4 text-violet-accent/60 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed italic">{sessionQuote}</p>
      </motion.div>

      {/* Duration Selector with glow */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DURATION_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isActive = selectedDuration === opt.value && !isRunning
          return (
            <motion.button
              key={opt.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleDurationSelect(opt.value)}
              disabled={isRunning}
              className={cn(
                'glass rounded-2xl p-4 text-center transition-all duration-200 relative overflow-hidden',
                isActive
                  ? 'ring-2 ring-violet-accent/60 bg-violet-accent/5 shadow-lg shadow-violet-accent/10'
                  : 'hover:bg-muted/30',
                isRunning && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isActive && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  animate={{
                    boxShadow: [
                      'inset 0 0 15px rgba(139, 92, 246, 0.06)',
                      'inset 0 0 25px rgba(139, 92, 246, 0.12)',
                      'inset 0 0 15px rgba(139, 92, 246, 0.06)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <Icon className={cn('w-5 h-5 mx-auto mb-1.5', opt.color)} />
              <span className="text-sm font-bold text-foreground block">{opt.value} دقيقة</span>
              <span className="text-[11px] text-muted-foreground">{opt.label}</span>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Custom duration input (shown when "مخصص" is selected) */}
      {selectedDuration === 0 && !isRunning && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 p-4 rounded-2xl glass"
        >
          <Clock className="w-5 h-5 text-violet-accent shrink-0" />
          <input
            type="number"
            min="1"
            max="480"
            value={customDuration}
            onChange={(e) => setCustomDuration(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCustomDurationSet() }}
            placeholder="أدخل عدد الدقائق (1-480)"
            className="flex-1 h-10 px-3 rounded-xl border border-border/60 bg-card/50 text-sm focus:border-violet-accent/50 focus:outline-none"
            autoFocus
          />
          <Button
            onClick={handleCustomDurationSet}
            size="sm"
            className="bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:opacity-90 shrink-0"
          >
            <Check className="w-4 h-4 me-1" />
            تعيين
          </Button>
        </motion.div>
      )}

      {/* Timer with dramatic pulsing outer ring */}
      <motion.div variants={itemVariants} className="flex justify-center">
        <div className="relative">
          {/* Pulsing outer ring that changes color */}
          {isRunning && !isPaused && (
            <motion.div
              className="absolute rounded-full"
              style={{ inset: -16 }}
              animate={{
                scale: [1, 1.03, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{ type: 'tween', duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
            />
          )}
          <AnimatePresence>
            {sessionCompleted && (
              <motion.div
                key={celebrateKey}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 flex flex-col items-center justify-center z-10"
              >
                {/* Celebration burst particles */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: i % 2 === 0 ? 'var(--color-gold)' : 'var(--color-emerald-accent)',
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                    animate={{
                      x: Math.cos((i / 8) * Math.PI * 2) * 100,
                      y: Math.sin((i / 8) * Math.PI * 2) * 100,
                      opacity: 0,
                      scale: [0, 1.5, 0.5],
                    }}
                    transition={{ type: 'tween', duration: 1.2, ease: 'easeOut' }}
                  />
                ))}
                <motion.div
                  animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
                  transition={{ type: 'tween', duration: 0.5, repeat: 3, repeatType: 'reverse' }}
                >
                  <PartyPopper className="w-12 h-12 text-gold mb-2" />
                </motion.div>
                <p className="text-lg font-bold text-foreground">أحسنت! 🎉</p>
                <p className="text-sm text-muted-foreground">أكملت جلسة العمل</p>
                <Button
                  onClick={() => {
                    setSessionCompleted(false)
                    saveSession(true)
                    setTimeRemaining(selectedDuration * 60)
                    setSessionStartTime(null)
                  }}
                  className="mt-4 bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:opacity-90 rounded-xl"
                  size="sm"
                >
                  <Trophy className="w-4 h-4 me-1" />
                  حفظ الجلسة
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pulsing outer ring + breathing glow wrapper with color shift */}
          <motion.div
            animate={isRunning && !isPaused ? {
              boxShadow: [
                '0 0 20px rgba(139, 92, 246, 0.15)',
                '0 0 40px rgba(139, 92, 246, 0.25)',
                '0 0 20px rgba(139, 92, 246, 0.15)',
              ],
            } : isPaused ? {
              boxShadow: [
                '0 0 15px rgba(234, 179, 8, 0.1)',
                '0 0 25px rgba(234, 179, 8, 0.18)',
                '0 0 15px rgba(234, 179, 8, 0.1)',
              ],
            } : {}}
            transition={{
              duration: isPaused ? 3 : 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="rounded-full"
          >
            <svg width="280" height="280" viewBox="0 0 280 280" className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/50"
              />
              {/* Outer pulsing ring */}
              {isRunning && !isPaused && (
                <motion.circle
                  cx="140" cy="140" r="128"
                  fill="none" strokeWidth="2"
                  animate={{ opacity: [0.1, 0.4, 0.1], r: [128, 131, 128] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ stroke: progress > 80 ? '#EF4444' : progress > 50 ? '#F59E0B' : '#8B5CF6' }}
                />
              )}
              {/* Dynamic gradient */}
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={progress > 80 ? '#EF4444' : progress > 50 ? '#F59E0B' : '#8B5CF6'} />
                  <stop offset="100%" stopColor={progress > 80 ? '#DC2626' : progress > 50 ? '#D97706' : '#6D28D9'} />
                </linearGradient>
              </defs>
              {/* Progress circle */}
              <motion.circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke="url(#timerGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  filter: isRunning && !isPaused
                    ? `drop-shadow(0 0 8px ${progress > 80 ? '#EF4444' : 'var(--color-violet-accent)'})`
                    : isPaused
                      ? 'drop-shadow(0 0 4px var(--color-gold))'
                      : 'none',
                }}
              />
            </svg>
          </motion.div>

          {/* Timer text overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              key={timeRemaining}
              initial={{ scale: 1.02 }}
              animate={{ scale: 1 }}
              className="num font-mono text-5xl md:text-6xl font-extrabold text-foreground tracking-tight"
              style={{ direction: 'ltr' }}
            >
              {formatTime(timeRemaining)}
            </motion.span>
            <span className="text-xs text-muted-foreground mt-1">
              {isRunning && !isPaused && 'جاري التركيز...'}
              {isPaused && 'متوقف مؤقتاً'}
              {!isRunning && !isPaused && !sessionCompleted && 'جاهز للبدء'}
            </span>
            {isRunning && !isPaused && (
              <motion.div
                className="w-2 h-2 rounded-full bg-violet-accent mt-2"
                animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                transition={{ type: 'tween', duration: 1.5, repeat: Infinity, repeatType: 'reverse' }}
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div variants={itemVariants} className="flex items-center justify-center gap-3">
        {!isRunning && !sessionCompleted && (
          <motion.div whileTap={{ scale: 0.95 }} className="flex gap-3">
            <Button
              onClick={handleStart}
              className="bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:opacity-90 shadow-lg rounded-xl h-12 px-8"
            >
              <Play className="w-5 h-5 me-2" />
              ابدأ
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-xl h-12 px-6"
            >
              <RotateCcw className="w-4 h-4 me-1" />
              إعادة
            </Button>
          </motion.div>
        )}

        {isRunning && !isPaused && (
          <motion.div whileTap={{ scale: 0.95 }} className="flex gap-3">
            <Button
              onClick={handlePause}
              variant="outline"
              className="rounded-xl h-12 px-8 border-gold/30 text-gold hover:bg-gold/10"
            >
              <Pause className="w-5 h-5 me-2" />
              استراحة
            </Button>
            <Button
              onClick={handleStop}
              variant="outline"
              className="rounded-xl h-12 px-6 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Square className="w-4 h-4 me-1" />
              إنهاء
            </Button>
          </motion.div>
        )}

        {isPaused && (
          <motion.div whileTap={{ scale: 0.95 }} className="flex gap-3">
            <Button
              onClick={handleResume}
              className="bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:opacity-90 shadow-lg rounded-xl h-12 px-8"
            >
              <Play className="w-5 h-5 me-2" />
              استئناف
            </Button>
            <Button
              onClick={handleStop}
              variant="outline"
              className="rounded-xl h-12 px-6 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Square className="w-4 h-4 me-1" />
              إنهاء
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-xl h-12 px-6"
            >
              <RotateCcw className="w-4 h-4 me-1" />
              إعادة
            </Button>
          </motion.div>
        )}
      </motion.div>

      {/* Quick Notes — always visible, auto-saved */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto"
      >
        <div className="neo-card card-lift p-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-gold" />
                ملاحظات سريعة
              </label>
              {notesSaved ? (
                <span className="text-[10px] text-emerald-accent/60 flex items-center gap-1">
                  <Check className="w-3 h-3" /> محفوظ
                </span>
              ) : (
                <span className="text-[10px] text-gold/70">جاري الحفظ...</span>
              )}
            </div>
            <Textarea
              value={sessionNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="اكتب ملاحظاتك وأفكارك هنا..."
              className="min-h-[100px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-colors text-sm"
              dir="rtl"
            />
          </div>
        </div>
      </motion.div>

      {/* Ambient Sounds with unique colors and wave animation */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift p-5">
          <div className="flex items-center gap-2.5 pb-3">
            <span className="icon-well iw-violet w-8 h-8">
              <Waves className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-foreground">أصوات محيطية</h3>
          </div>
          <div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {AMBIENT_SOUNDS.map((sound) => {
                const Icon = sound.icon
                const isActive = activeSounds.has(sound.label)
                return (
                  <motion.button
                    key={sound.label}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleSound(sound.label)}
                    className={cn(
                      'rounded-2xl p-3 flex flex-col items-center gap-1.5 transition-all duration-200 border relative overflow-hidden',
                      isActive
                        ? 'border-violet-accent/40 shadow-sm'
                        : 'border-transparent hover:bg-muted/30'
                    )}
                  >
                    {/* Wave animation background for active sounds */}
                    {isActive && (
                      <div className="absolute inset-0 overflow-hidden rounded-2xl">
                        <motion.div
                          className="absolute bottom-0 inset-x-0 h-full"
                          style={{ backgroundColor: sound.waveColor }}
                          animate={{
                            backgroundPosition: ['0% 100%', '100% 0%', '0% 100%'],
                          }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        {[...Array(3)].map((_, waveIdx) => (
                          <motion.div
                            key={waveIdx}
                            className="absolute bottom-0 inset-x-0 rounded-full"
                            style={{
                              backgroundColor: sound.waveColor,
                              height: '40%',
                              transformOrigin: 'bottom',
                            }}
                            animate={{
                              scaleX: [0.3, 0.7, 0.3],
                              opacity: [0.3, 0.7, 0.3],
                              y: [0, -5, 0],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                              delay: waveIdx * 0.4,
                            }}
                          />
                        ))}
                      </div>
                    )}

                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative z-10',
                        isActive ? sound.color : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium relative z-10',
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {sound.label}
                    </span>
                    {isActive && (
                      <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }}
                        transition={{ type: 'tween', duration: 1.5, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                        className="w-1.5 h-1.5 rounded-full bg-violet-accent relative z-10"
                      />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Statistics with glass gradient borders */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="neo-card card-lift p-4 flex flex-col items-center text-center gap-1.5 relative overflow-hidden">
          <span className="icon-well iw-violet w-8 h-8">
            <Clock className="w-4 h-4" />
          </span>
          <span dir="ltr" className="num text-2xl font-extrabold text-foreground count-up">{stats.totalMin}</span>
          <span className="text-[11px] text-muted-foreground">إجمالي الدقائق</span>
        </div>
        <div className="neo-card card-lift p-4 flex flex-col items-center text-center gap-1.5 relative overflow-hidden">
          <span className="icon-well iw-amber w-8 h-8">
            <Zap className="w-4 h-4" />
          </span>
          <span dir="ltr" className="num text-2xl font-extrabold text-foreground count-up">{stats.todaySessions}</span>
          <span className="text-[11px] text-muted-foreground">جلسات اليوم</span>
        </div>
        <div className="neo-card card-lift p-4 flex flex-col items-center text-center gap-1.5 relative overflow-hidden">
          <span className="icon-well iw-forest w-8 h-8">
            <TrendingUp className="w-4 h-4" />
          </span>
          <span dir="ltr" className="num text-2xl font-extrabold text-foreground count-up">{stats.avgMin}</span>
          <span className="text-[11px] text-muted-foreground">متوسط الجلسة</span>
        </div>
      </motion.div>

      {/* Focus Chart */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift p-5">
          <div className="flex items-center gap-2.5 pb-2">
            <span className="icon-well iw-violet w-8 h-8">
              <Timer className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-foreground">التركيز اليومي (آخر ١٤ يوم)</h3>
          </div>
          <div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      direction: 'rtl',
                    }}
                    labelStyle={{ color: 'var(--color-foreground)', fontWeight: 'bold' }}
                    formatter={(value: number) => [`${value} دقيقة`, 'التركيز']}
                  />
                  <Bar dataKey="دقائق" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry['دقائق'] > 0 ? 'var(--color-violet-accent)' : 'var(--color-muted)'}
                        fillOpacity={entry['دقائق'] > 0 ? 0.8 : 0.3}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Session History with duration color coding */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift p-5">
          <div className="flex items-center gap-2.5 pb-3">
            <span className="icon-well iw-violet w-8 h-8">
              <History className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-foreground">سجل الجلسات</h3>
          </div>
          <div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(!data?.sessions || data.sessions.length === 0) ? (
                <div className="text-center py-10">
                  <RiseIcon glyph="focus" hue="violet" size="lg" className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">لا توجد جلسات سابقة</p>
                </div>
              ) : (
                data.sessions.slice(0, 20).map((session, index) => {
                  const durationColor = session.actualMin >= 45
                    ? 'border-s-violet-accent'
                    : session.actualMin >= 20
                      ? 'border-s-gold'
                      : 'border-s-muted-foreground/30'
                  const iconColor = session.actualMin >= 45
                    ? 'bg-violet-accent/15 text-violet-accent'
                    : session.actualMin >= 20
                      ? 'bg-gold/15 text-gold'
                      : 'bg-muted/30 text-muted-foreground'

                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={cn('neo-card flex items-center gap-3 p-3 rounded-xl transition-colors border-s-4', durationColor)}
                    >
                      <div
                        className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconColor)}
                      >
                        {session.completed ? (
                          <Trophy className="w-4 h-4" />
                        ) : (
                          <Clock className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {session.type}
                          </span>
                          <span
                            className={cn('pill', session.completed ? 'pill-success' : 'pill-muted')}
                          >
                            {session.completed ? 'مكتمل' : 'غير مكتمل'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className={cn('num font-semibold', session.actualMin >= 45 ? 'text-violet-accent' : session.actualMin >= 20 ? 'text-gold' : '')}>{session.actualMin} دقيقة</span>
                          <span>•</span>
                          <span>
                            {new Date(session.startedAt).toLocaleDateString('ar-EG', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {session.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                            {session.notes}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </motion.div>
      {/* Task Linking Dialog */}
      <Dialog open={linkTaskOpen} onOpenChange={(open) => { if (!open) { setLinkTaskOpen(false); setSelectedTaskId('none') } }}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Link2 className="w-5 h-5 text-violet-accent" />
              هل تريد ربط هذه الجلسة بمهمة؟
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              اختر مهمة لربط جلسة التركيز بها
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Session Summary */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-l from-violet-accent/10 via-gold/5 to-transparent border border-violet-accent/20">
              <div className="w-10 h-10 rounded-xl bg-violet-accent/15 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-violet-accent" />
              </div>
              <div className="flex-1">
                <p className="num text-sm font-bold">{lastSessionMin} دقيقة من التركيز</p>
                <p className="num text-xs text-gold font-medium">+{lastSessionXp} خبرة</p>
              </div>
            </div>

            {/* Task Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">اختر مهمة (اختياري)</label>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger className="rounded-xl text-right">
                  <SelectValue placeholder="اختر مهمة..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون ربط</SelectItem>
                  {taskOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          'w-2 h-2 rounded-full',
                          t.priority === 'urgent' ? 'bg-destructive' : t.priority === 'high' ? 'bg-gold' : t.priority === 'medium' ? 'bg-violet-accent' : 'bg-glass'
                        )} />
                        {t.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => { setLinkTaskOpen(false); setSelectedTaskId('none') }}
              className="rounded-xl"
            >
              تخطي
            </Button>
            <Button
              onClick={handleLinkTask}
              disabled={selectedTaskId === 'none' || linkingTask}
              className="rounded-xl bg-forest text-paper-soft dark:bg-lime dark:text-ink"
            >
              {linkingTask && <Loader2 className="w-4 h-4 me-1.5 animate-spin" />}
              ربط الجلسة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )

  // Focus zone wrapper
  if (focusZone && isRunning) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center overflow-y-auto py-8">
        <div className="w-full max-w-2xl">
          {mainContent}
        </div>
      </div>
    )
  }

  return mainContent
}
