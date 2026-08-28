'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import {
  BookOpen,
  Search,
  Save,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Flame,
  Smile,
  Calendar,
  Edit3,
  X,
  Lightbulb,
  Trophy,
  AlertTriangle,
  Heart,
  Battery,
  Tag,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { RiseIcon } from '@/components/rise/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { playSound } from '@/lib/sounds'
import { toast } from 'sonner'
import { toastSaved, toastDeleted, toastError, toastCreated } from '@/lib/toast-helpers'
import { getToday } from '@/lib/rise-utils'

/* ────────────── Types ────────────── */

interface JournalEntry {
  id: string
  date: string
  content: string
  gratitude: string
  wins: string
  challenges: string
  mood: number
  energy: number
  ideas: string
  tomorrowPlan: string
  tags: string
}

interface JournalData {
  journal: JournalEntry | null
  recentJournals: JournalEntry[]
}

/* ────────────── Constants ────────────── */

const MOOD_EMOJIS: { value: number; emoji: string; label: string; color: string }[] = [
  { value: 1, emoji: '😞', label: 'سيء جداً', color: 'bg-destructive/15 ring-glass/40' },
  { value: 2, emoji: '😐', label: 'سيء', color: 'bg-muted-foreground/15 ring-glass/40' },
  { value: 3, emoji: '🙂', label: 'عادي', color: 'bg-gold/15 ring-glass/40' },
  { value: 4, emoji: '😊', label: 'جيد', color: 'bg-emerald-accent/15 ring-glass/40' },
  { value: 5, emoji: '😄', label: 'ممتاز', color: 'bg-emerald-accent/20 ring-glass/60' },
]

const ENERGY_LABELS = ['منهك', 'متعب', 'عادي', 'نشيط', 'ممتليء طاقة']

const MOOD_STRIP_COLORS: Record<number, string> = {
  1: 'bg-destructive',
  2: 'bg-muted-foreground/40',
  3: 'bg-gold',
  4: 'bg-emerald-accent',
  5: 'bg-emerald-accent',
}

const MOOD_BG_GRADIENTS: Record<number, string> = {
  1: 'from-destructive/8 via-destructive/3 to-transparent',
  2: 'from-muted-foreground/8 via-muted-foreground/3 to-transparent',
  3: 'from-gold/8 via-gold/3 to-transparent',
  4: 'from-emerald-accent/8 via-emerald-accent/3 to-transparent',
  5: 'from-emerald-accent/12 via-emerald-accent/5 to-transparent',
}

const MOOD_GLOW_COLORS: Record<number, string> = {
  1: 'shadow-destructive/20 focus-within:shadow-[0_0_20px_color-mix(in_srgb,var(--destructive)_15%,transparent)]',
  2: 'shadow-muted-foreground/20 focus-within:shadow-[0_0_20px_color-mix(in_srgb,var(--muted-foreground)_15%,transparent)]',
  3: 'shadow-gold/20 focus-within:shadow-[0_0_20px_oklch(0.78_0.12_85/0.15)]',
  4: 'shadow-emerald-accent/20 focus-within:shadow-[0_0_20px_oklch(0.55_0.14_163/0.15)]',
  5: 'shadow-emerald-accent/25 focus-within:shadow-[0_0_20px_oklch(0.55_0.14_163/0.2)]',
}

const TEXTAREA_ACCENT_COLORS: Record<string, string> = {
  content: 'border-s-[3px] border-s-glass/50',
  gratitude: 'border-s-[3px] border-s-rose-accent/50',
  wins: 'border-s-[3px] border-s-gold/50',
  challenges: 'border-s-[3px] border-s-violet-accent/50',
  ideas: 'border-s-[3px] border-s-gold/50',
  tomorrowPlan: 'border-s-[3px] border-s-forest-light/50',
}

const EMPTY_FORM: Omit<JournalEntry, 'id' | 'date' | 'tags'> = {
  content: '',
  gratitude: '',
  wins: '',
  challenges: '',
  mood: 3,
  energy: 3,
  ideas: '',
  tomorrowPlan: '',
}

/* ────────────── Animations ────────────── */

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

const formVariants = {
  hidden: { opacity: 0, x: 40, scale: 0.98 },
  visible: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
  exit: { opacity: 0, x: 40, scale: 0.98, transition: { duration: 0.25, ease: 'easeIn' as const } },
}

/* ────────────── Mood Sparkline ────────────── */

function MoodSparkline({ moods }: { moods: number[] }) {
  if (moods.length < 2) return null
  const w = 140, h = 36, pad = 4
  const max = 5, min = 1
  const stepX = (w - pad * 2) / (moods.length - 1)
  const points = moods.map((m, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (m - min) / (max - min)) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  const lastMood = moods[moods.length - 1]
  const lastX = pad + (moods.length - 1) * stepX
  const lastY = pad + (1 - (lastMood - min) / (max - min)) * (h - pad * 2)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9 opacity-60">
      <defs>
        <linearGradient id="moodSparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--glass-blue)' }} stopOpacity={0.25} />
          <stop offset="100%" style={{ stopColor: 'var(--glass-blue)' }} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${points} ${lastX},${h - pad}`}
        fill="url(#moodSparkGrad)"
      />
      <polyline points={points} fill="none" style={{ stroke: 'var(--glass-blue)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" style={{ fill: 'var(--glass-blue)' }} />
      <circle cx={lastX} cy={lastY} r="6" style={{ fill: 'var(--glass-blue)' }} opacity={0.2}>
        <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

/* ────────────── Animated Number ────────────── */

function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(0)
  const display = useTransform(mv, (v) => Math.round(v))
  const nodeRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: 'easeOut' })
    return controls.stop
  }, [mv, value])
  useEffect(() => {
    const unsubscribe = display.on('change', (v) => {
      if (nodeRef.current) nodeRef.current.textContent = String(v)
    })
    return unsubscribe
  }, [display])
  return <span ref={nodeRef}>{value}</span>
}

/* ────────────── Component ────────────── */

export default function Journal() {
  const [data, setData] = useState<JournalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [tagInput, setTagInput] = useState('')

  const today = getToday()

  /* ─── Fetch ─── */
  const { refreshKey } = useDataRefresh()

  const fetchJournal = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/rise/journal`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        if (json.journal) {
          setForm({
            content: json.journal.content || '',
            gratitude: json.journal.gratitude || '',
            wins: json.journal.wins || '',
            challenges: json.journal.challenges || '',
            mood: json.journal.mood || 3,
            energy: json.journal.energy || 3,
            ideas: json.journal.ideas || '',
            tomorrowPlan: json.journal.tomorrowPlan || '',
          })
          setTagInput(json.journal.tags || '')
        }
      }
    } catch {
      toast.error('فشل في تحميل اليوميات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJournal()
  }, [fetchJournal, refreshKey])

  /* ─── Save ─── */
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiPost('/api/rise/journal', {
          ...form,
          tags: tagInput,
          date: today,
        })
      if (res.ok) {
        const result = await res.json().catch(() => null)
        // FIX: Optimistic update — add the new/updated journal to local state IMMEDIATELY
        if (result && result.id) {
          setData((prev) => {
            if (!prev) return prev
            const exists = prev.recentJournals?.some((j: any) => j.id === result.id)
            return {
              ...prev,
              recentJournals: exists
                ? prev.recentJournals?.map((j: any) => j.id === result.id ? result : j)
                : [result, ...(prev.recentJournals || [])],
            }
          })
        }
        toastSaved('اليوميات')
        playSound('save')
        setIsEditing(false)
        fetchJournal()
      } else {
        toastError('حفظ اليوميات')
      }
    } catch {
      toastError('الحفظ')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Filtered recent ─── */
  const filteredJournals = useMemo(() => {
    if (!data?.recentJournals) return []
    if (!searchQuery.trim()) return data.recentJournals
    const q = searchQuery.toLowerCase()
    return data.recentJournals.filter(
      (j) =>
        j.content?.toLowerCase().includes(q) ||
        j.gratitude?.toLowerCase().includes(q) ||
        j.wins?.toLowerCase().includes(q) ||
        j.ideas?.toLowerCase().includes(q) ||
        j.tags?.toLowerCase().includes(q)
    )
  }, [data?.recentJournals, searchQuery])

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    const journals = data?.recentJournals || []
    const total = journals.length
    const moods = journals.filter((j) => typeof j.mood === 'number').map((j) => j.mood)
    const avgMood = moods.length
      ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)
      : '—'

    // Calculate streak
    let streak = 0
    const sortedDates = journals
      .map((j) => j.date)
      .sort()
      .reverse()
    if (sortedDates.length > 0) {
      const checkDate = new Date(today)
      for (const d of sortedDates) {
        const entryDate = new Date(d)
        const diffDays = Math.floor(
          (checkDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        if (diffDays <= 1) {
          streak++
          checkDate.setTime(entryDate.getTime())
        } else {
          break
        }
      }
    }

    return { total, streak, avgMood }
  }, [data?.recentJournals, today])

  /* ─── Mood Trend (last 7 days) ─── */
  const moodTrend = useMemo(() => {
    const journals = data?.recentJournals || []
    const sorted = [...journals].sort((a, b) => a.date.localeCompare(b.date))
    const last7 = sorted.slice(-7)
    return last7.map(j => j.mood || 3)
  }, [data?.recentJournals])

  /* ─── Helpers ─── */
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getMoodEmoji = (mood: number) => MOOD_EMOJIS.find((m) => m.value === mood)?.emoji || '🙂'

  const updateForm = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  const hasTodayEntry = !!data?.journal
  const showForm = !hasTodayEntry || isEditing

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RiseIcon glyph="journal" hue="cyan" size="md" lift />
          <div>
            <h2 className="text-xl font-bold text-foreground">اليوميات</h2>
            <p className="text-xs text-muted-foreground">سجّل أفكارك وانتصاراتك اليومية</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="neo-card card-lift p-4 flex flex-col items-center text-center gap-1">
          <span className="icon-well iw-cyan w-8 h-8">
            <Calendar className="w-4 h-4" />
          </span>
          <span className="num text-2xl font-bold text-foreground count-up" dir="ltr">{stats.total}</span>
          <span className="text-[11px] text-muted-foreground">إجمالي المدخلات</span>
        </div>
        <div className={cn("neo-card card-lift p-4 flex flex-col items-center text-center gap-1", stats.streak >= 3 && "glow-gold")}>
          <div className="relative">
            <span className="icon-well iw-amber w-8 h-8">
              <Flame className="w-4 h-4" />
            </span>
            {stats.streak >= 3 && (
              <motion.div
                className="absolute -top-1 -start-1 w-3.5 h-3.5 rounded-full bg-gold flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <span className="num text-[7px] font-black text-ink">{stats.streak}</span>
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="num text-2xl font-bold text-foreground count-up" dir="ltr">{stats.streak}</span>
            {stats.streak >= 7 && <Sparkles className="w-3.5 h-3.5 text-gold" />}
          </div>
          <span className="text-[11px] text-muted-foreground">أيام متتالية {stats.streak >= 3 ? '🔥' : ''}</span>
        </div>
        <div className="neo-card card-lift p-4 flex flex-col items-center text-center gap-1">
          <span className="icon-well iw-forest w-8 h-8">
            <Smile className="w-4 h-4" />
          </span>
          <span className="num text-2xl font-bold text-foreground count-up" dir="ltr">{stats.avgMood}</span>
          <span className="text-[11px] text-muted-foreground">متوسط المزاج</span>
        </div>
      </motion.div>

      {/* Today's Mood Hero */}
      <motion.div variants={itemVariants}>
        <div className="neo-card rounded-2xl overflow-hidden relative">
          <div className={cn(
            "absolute inset-0 pointer-events-none bg-gradient-to-b",
            MOOD_BG_GRADIENTS[form.mood] || MOOD_BG_GRADIENTS[3]
          )} />
          <div className="noise-bg" />
          <div className="relative z-10 p-6 flex flex-col items-center text-center gap-3">
            <motion.p
              key={form.mood}
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-7xl"
            >
              {getMoodEmoji(form.mood)}
            </motion.p>
            <div>
              <p className="text-lg font-bold text-foreground">
                {MOOD_EMOJIS.find(m => m.value === form.mood)?.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            {moodTrend.length >= 2 && (
              <div className="w-48 mt-1">
                <p className="text-[10px] text-muted-foreground mb-1">اتجاه المزاج — آخر ٧ أيام</p>
                <MoodSparkline moods={moodTrend} />
              </div>
            )}
            {stats.streak > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-1.5 bg-gold/10 px-3 py-1.5 rounded-full"
              >
                <Flame className="w-3.5 h-3.5 text-gold" />
                <span className="text-xs font-semibold text-gold">سلسلة <span className="num" dir="ltr">{stats.streak}</span> يوم</span>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Today's Entry Form or View */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift overflow-hidden">
          <div className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold" />
                {showForm ? (hasTodayEntry ? 'تعديل اليوميات' : 'يوميات اليوم') : "يومية اليوم"}
              </h3>
              {hasTodayEntry && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="text-glass hover:text-glass/80 hover:bg-glass/10"
                >
                  <Edit3 className="w-4 h-4 me-1" />
                  تعديل
                </Button>
              )}
              {isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false)
                    if (data?.journal) {
                      setForm({
                        content: data.journal.content || '',
                        gratitude: data.journal.gratitude || '',
                        wins: data.journal.wins || '',
                        challenges: data.journal.challenges || '',
                        mood: data.journal.mood || 3,
                        energy: data.journal.energy || 3,
                        ideas: data.journal.ideas || '',
                        tomorrowPlan: data.journal.tomorrowPlan || '',
                      })
                      setTagInput(data.journal.tags || '')
                    }
                  }}
                  className="text-muted-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(today)}
            </p>
          </div>

          <div className="px-5 pb-5 space-y-5">
            <AnimatePresence mode="wait">
            {showForm ? (
              <motion.div
                key="form"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
              <>
                {/* Paper texture form background */}
                <div className={cn(
                  "rounded-2xl p-4 -mx-2 space-y-5 noise-bg",
                  "bg-[repeating-linear-gradient(0deg,transparent,transparent_27px,oklch(0.5_0_0/0.03)_27px,oklch(0.5_0_0/0.03)_28px)]"
                )}>
                  {/* Journal Content */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-glass" />
                      اليوميات
                    </label>
                    <Textarea
                      value={form.content}
                      onChange={(e) => updateForm('content', e.target.value)}
                      placeholder="اكتب أفكارك ومشاعرك اليوم..."
                      className={cn(
                        'min-h-[120px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-300 text-sm',
                        TEXTAREA_ACCENT_COLORS.content,
                        MOOD_GLOW_COLORS[form.mood] || MOOD_GLOW_COLORS[3]
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Gratitude */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Heart className="w-4 h-4 text-rose-accent" />
                      الامتنان
                    </label>
                    <Textarea
                      value={form.gratitude}
                      onChange={(e) => updateForm('gratitude', e.target.value)}
                      placeholder="ما الذي تشكر الله عليه اليوم؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.gratitude
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Wins */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-gold" />
                      الانتصارات
                    </label>
                    <Textarea
                      value={form.wins}
                      onChange={(e) => updateForm('wins', e.target.value)}
                      placeholder="ما هي إنجازاتك اليوم؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.wins
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Challenges */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-violet-accent" />
                      التحديات
                    </label>
                    <Textarea
                      value={form.challenges}
                      onChange={(e) => updateForm('challenges', e.target.value)}
                      placeholder="ما هي التحديات التي واجهتها؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.challenges
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Mood Selector with spring animation */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Smile className="w-4 h-4 text-emerald-accent" />
                      المزاج
                    </label>
                    <div className="flex items-center gap-3 justify-center py-2 overflow-x-auto px-2 scrollbar-none">
                      {MOOD_EMOJIS.map((m) => (
                        <motion.button
                          key={m.value}
                          whileHover={{ scale: 1.25, y: -4 }}
                          whileTap={{ scale: 0.85 }}
                          animate={form.mood === m.value ? { scale: [1, 1.4, 1.15] } : { scale: 1, y: 0 }}
                          transition={form.mood === m.value
                            ? { type: 'tween', stiffness: 400, damping: 10, duration: 0.5 }
                            : { duration: 0.2 }
                          }
                          onClick={() => updateForm('mood', m.value)}
                          className={cn(
                            'text-4xl p-3 rounded-2xl transition-all duration-300 ring-2 shrink-0',
                            form.mood === m.value
                              ? `${m.color} shadow-lg`
                              : 'ring-transparent hover:bg-muted/50 opacity-50 hover:opacity-100'
                          )}
                          title={m.label}
                        >
                          {m.emoji}
                        </motion.button>
                      ))}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <motion.span
                        key={form.mood}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm font-medium text-foreground"
                      >
                        {MOOD_EMOJIS.find((m) => m.value === form.mood)?.label}
                      </motion.span>
                    </div>
                  </div>

                  {/* Energy Slider with gradient fill */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Battery className="w-4 h-4 text-forest" />
                      الطاقة: <span className="text-emerald-accent font-bold">{ENERGY_LABELS[form.energy - 1]}</span>
                    </label>
                    <div className="flex items-center gap-3 px-1">
                      <span className="text-xs text-muted-foreground">١</span>
                      <div className="flex-1 relative">
                        <div className="absolute inset-0 h-2 rounded-full top-1/2 -translate-y-1/2 bg-muted" />
                        <div
                          className="absolute inset-y-0 start-0 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${((form.energy - 1) / 4) * 100}%`,
                            background: 'linear-gradient(to left, #ef4444, #f97316, #eab308, #22c55e, #10b981)',
                          }}
                        />
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={form.energy}
                          onChange={(e) => updateForm('energy', parseInt(e.target.value))}
                          className="relative z-10 w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-accent bg-transparent"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">٥</span>
                    </div>
                  </div>

                  {/* Ideas */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-gold" />
                      أفكار
                    </label>
                    <Textarea
                      value={form.ideas}
                      onChange={(e) => updateForm('ideas', e.target.value)}
                      placeholder="أي أفكار جديدة أو إلهامات..."
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.ideas
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Tomorrow's Plan */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-forest-light" />
                      خطة الغد
                    </label>
                    <Textarea
                      value={form.tomorrowPlan}
                      onChange={(e) => updateForm('tomorrowPlan', e.target.value)}
                      placeholder="ما الذي تخطط لفعله غداً؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.tomorrowPlan
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Tags */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      الوسوم
                    </label>
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="أدخل وسوم مفصولة بفواصل..."
                      className="rounded-xl border-0 bg-muted/50 focus:bg-muted transition-colors text-sm"
                      dir="rtl"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:opacity-90 shadow-lg rounded-xl h-12 text-sm font-semibold"
                  >
                    {saving ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Save className="w-4 h-4 me-2" />
                      </motion.div>
                    ) : (
                      <Save className="w-4 h-4 me-2" />
                    )}
                    {saving ? 'جاري الحفظ...' : 'حفظ اليوميات'}
                  </Button>
                </motion.div>
              </>
              </motion.div>
            ) : (
              /* View Mode */
              data?.journal && (
                <motion.div
                  key="view"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                <div className="space-y-4">
                  {/* Mood & Energy */}
                  <div className="flex items-center gap-4 justify-center py-2">
                    <div className="flex items-center gap-2 glass rounded-xl px-4 py-2">
                      <Smile className="w-4 h-4 text-muted-foreground" />
                      <span className="text-2xl">{getMoodEmoji(data.journal.mood)}</span>
                    </div>
                    <div className="flex items-center gap-2 glass rounded-xl px-4 py-2">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{ENERGY_LABELS[(data.journal.energy || 3) - 1]}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {data.journal.tags && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {data.journal.tags.split(',').map(
                        (tag, i) =>
                          tag.trim() && (
                            <span
                              key={i}
                              className="pill bg-glass/10 text-glass"
                            >
                              {tag.trim()}
                            </span>
                          )
                      )}
                    </div>
                  )}

                  {/* Sections */}
                  {[
                    { label: 'اليوميات', content: data.journal.content, icon: BookOpen, color: 'text-glass' },
                    { label: 'الامتنان', content: data.journal.gratitude, icon: Heart, color: 'text-rose-accent' },
                    { label: 'الانتصارات', content: data.journal.wins, icon: Trophy, color: 'text-gold' },
                    { label: 'التحديات', content: data.journal.challenges, icon: AlertTriangle, color: 'text-violet-accent' },
                    { label: 'أفكار', content: data.journal.ideas, icon: Lightbulb, color: 'text-gold' },
                    { label: 'خطة الغد', content: data.journal.tomorrowPlan, icon: Calendar, color: 'text-forest-light' },
                  ].map(
                    (section) =>
                      section.content && (
                        <div key={section.label} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <section.icon className={cn('w-4 h-4', section.color)} />
                            <span className="text-sm font-semibold text-foreground">{section.label}</span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-xl p-3">
                            {section.content}
                          </p>
                        </div>
                      )
                  )}
                </div>
                </motion.div>
              )
            )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Recent Entries */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-base font-bold">المدخلات السابقة</h3>
          </div>
          <div className="px-5 pb-5 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في اليوميات..."
                className="ps-9 rounded-xl border-0 bg-muted/50 focus:bg-muted transition-colors text-sm"
                dir="rtl"
              />
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredJournals.length === 0 ? (
                <div className="text-center py-10">
                  <span className="icon-well w-14 h-14 bg-secondary text-muted-foreground/50 mx-auto mb-3">
                    <BookOpen className="w-7 h-7" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد مدخلات سابقة بعد'}
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredJournals.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, scale: 0.95 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <button
                        onClick={() =>
                          setExpandedId(expandedId === entry.id ? null : entry.id)
                        }
                        className="w-full text-start"
                      >
                        <div
                          className={cn(
                            'rounded-2xl border bg-card border-border p-4 transition-all duration-200 relative overflow-hidden noise-bg',
                            'hover:shadow-lift',
                            expandedId === entry.id && 'bg-muted/30 border-glass/40'
                          )}
                        >
                          {/* Mood color strip */}
                          <div className={cn(
                            'absolute top-0 start-0 bottom-0 w-1 rounded-s-xl',
                            MOOD_STRIP_COLORS[entry.mood] || 'bg-muted-foreground/40'
                          )} />

                          <div className="flex items-center justify-between mb-2 ps-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{getMoodEmoji(entry.mood)}</span>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CalendarDays className="w-3 h-3" />
                                <span>
                                  {new Date(entry.date).toLocaleDateString('ar-EG', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {entry.tags &&
                                entry.tags.split(',').slice(0, 2).map(
                                  (tag, i) =>
                                    tag.trim() && (
                                      <span
                                        key={i}
                                        className="pill bg-glass/10 text-glass text-[10px]"
                                      >
                                        {tag.trim()}
                                      </span>
                                    )
                                )}
                              {expandedId === entry.id ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-foreground/80 line-clamp-2 ps-2">
                            {entry.content || 'لا يوجد محتوى'}
                          </p>

                          <AnimatePresence>
                            {expandedId === entry.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-3 mt-3 border-t border-border/50 space-y-3 ps-2">
                                  {entry.gratitude && (
                                    <div>
                                      <span className="text-xs font-semibold text-rose-accent flex items-center gap-1 mb-1">
                                        <Heart className="w-3 h-3" /> الامتنان
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.gratitude}
                                      </p>
                                    </div>
                                  )}
                                  {entry.wins && (
                                    <div>
                                      <span className="text-xs font-semibold text-gold flex items-center gap-1 mb-1">
                                        <Trophy className="w-3 h-3" /> الانتصارات
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.wins}
                                      </p>
                                    </div>
                                  )}
                                  {entry.challenges && (
                                    <div>
                                      <span className="text-xs font-semibold text-violet-accent flex items-center gap-1 mb-1">
                                        <AlertTriangle className="w-3 h-3" /> التحديات
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.challenges}
                                      </p>
                                    </div>
                                  )}
                                  {entry.ideas && (
                                    <div>
                                      <span className="text-xs font-semibold text-gold flex items-center gap-1 mb-1">
                                        <Lightbulb className="w-3 h-3" /> أفكار
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.ideas}
                                      </p>
                                    </div>
                                  )}
                                  {entry.tomorrowPlan && (
                                    <div>
                                      <span className="text-xs font-semibold text-forest-light flex items-center gap-1 mb-1">
                                        <Calendar className="w-3 h-3" /> خطة الغد
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.tomorrowPlan}
                                      </p>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                                    <span>
                                      الطاقة: {ENERGY_LABELS[(entry.energy || 3) - 1]}
                                    </span>
                                    <span>
                                      المزاج: {getMoodEmoji(entry.mood)}{' '}
                                      {MOOD_EMOJIS.find((m) => m.value === entry.mood)?.label}
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}// Force recompile: 1785702715
