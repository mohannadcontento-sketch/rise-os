'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import {
  Heart,
  Moon,
  Droplets,
  Footprints,
  Flame,
  Smile,
  Battery,
  Save,
  Plus,
  Minus,
  Dumbbell,
  TrendingUp,
  Scale,
  Calendar,
  Activity,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ────────────── Types ────────────── */

interface HealthLog {
  id: string
  date: string
  sleepHours: number
  sleepQuality: number
  waterGlasses: number
  steps: number
  calories: number
  weight: number | null
  mood: number
  energy: number
  exerciseType: string
  exerciseMin: number
}

interface HealthData {
  logs: HealthLog[]
  todayLog: HealthLog | null
}

/* ────────────── Constants ────────────── */

const MOOD_EMOJIS = ['😞', '😐', '🙂', '😊', '😄']
const MOOD_LABELS = ['سيء جداً', 'سيء', 'عادي', 'جيد', 'ممتاز']
const ENERGY_LABELS = ['منهك', 'متعب', 'عادي', 'نشيط', 'ممتليء']
const EXERCISE_TYPES = [
  { value: 'جري', label: 'جري', icon: '🏃' },
  { value: 'مشي', label: 'مشي', icon: '🚶' },
  { value: 'أوزان', label: 'أوزان', icon: '🏋️' },
  { value: 'يوغا', label: 'يوغا', icon: '🧘' },
  { value: 'سباحة', label: 'سباحة', icon: '🏊' },
  { value: 'أخرى', label: 'أخرى', icon: '⚡' },
]

const SLEEP_QUALITY_LABELS = ['سيئة جداً', 'سيئة', 'متوسطة', 'جيدة', 'ممتازة']

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

const EMPTY_LOG = {
  sleepHours: 0,
  sleepQuality: 3,
  waterGlasses: 0,
  steps: 0,
  calories: 0,
  weight: null as number | null,
  mood: 3,
  energy: 3,
  exerciseType: '',
  exerciseMin: 0,
  exerciseNotes: '',
}

/* ────────────── Animated Counter ────────────── */

function AnimatedCounter({ target }: { target: number }) {
  const mv = useMotionValue(0)
  const display = useTransform(mv, v => Math.round(v))
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const controls = animate(mv, target, { duration: 1.2, ease: 'easeOut' })
    return controls.stop
  }, [mv, target])
  useEffect(() => {
    const unsubscribe = display.on('change', v => {
      if (ref.current) ref.current.textContent = String(v)
    })
    return unsubscribe
  }, [display])
  return <span ref={ref}>{target}</span>
}

/* ────────────── Component ────────────── */

export default function Health() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ ...EMPTY_LOG })
  const [exerciseNotes, setExerciseNotes] = useState('')

  const today = new Date().toISOString().split('T')[0]

  /* ─── Fetch ─── */
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/rise/health')
      if (res.ok) {
        const json = await res.json()
        setData(json)
        if (json.todayLog) {
          const t = json.todayLog
          setForm({
            sleepHours: t.sleepHours || 0,
            sleepQuality: t.sleepQuality || 3,
            waterGlasses: t.waterGlasses || 0,
            steps: t.steps || 0,
            calories: t.calories || 0,
            weight: t.weight || null,
            mood: t.mood || 3,
            energy: t.energy || 3,
            exerciseType: t.exerciseType || '',
            exerciseMin: t.exerciseMin || 0,
            exerciseNotes: '',
          })
        }
      }
    } catch {
      toast.error('فشل في تحميل بيانات الصحة')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  /* ─── Save ─── */
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/rise/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          date: today,
          exerciseNotes,
        }),
      })
      if (res.ok) {
        toast.success('تم حفظ بيانات الصحة بنجاح 💪')
        fetchHealth()
      } else {
        toast.error('فشل في حفظ البيانات')
      }
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const updateForm = (field: string, value: number | string | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /* ─── Chart Data ─── */
  const last14 = useMemo(() => {
    const days: { date: string; label: string }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      days.push({
        date: key,
        label: d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }),
      })
    }
    return days
  }, [])

  const logsMap = useMemo(() => {
    const map: Record<string, HealthLog> = {}
    ;(data?.logs || []).forEach((l) => {
      map[l.date] = l
    })
    return map
  }, [data])

  const sleepChartData = useMemo(
    () =>
      last14.map((d) => {
        const log = logsMap[d.date]
        return {
          day: d.label,
          ساعات: log?.sleepHours || 0,
          جودة: log?.sleepQuality || 0,
        }
      }),
    [last14, logsMap]
  )

  const waterChartData = useMemo(
    () =>
      last14.map((d) => {
        const log = logsMap[d.date]
        return {
          day: d.label,
          أكواب: log?.waterGlasses || 0,
        }
      }),
    [last14, logsMap]
  )

  const stepsChartData = useMemo(
    () =>
      last14.map((d) => {
        const log = logsMap[d.date]
        return {
          day: d.label,
          خطوات: log?.steps || 0,
        }
      }),
    [last14, logsMap]
  )

  const moodEnergyChartData = useMemo(
    () =>
      last14.map((d) => {
        const log = logsMap[d.date]
        return {
          day: d.label,
          المزاج: log?.mood || 0,
          الطاقة: log?.energy || 0,
        }
      }),
    [last14, logsMap]
  )

  const weightChartData = useMemo(() => {
    const weightLogs = (data?.logs || [])
      .filter((l) => l.weight && l.weight > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
    return weightLogs.map((l) => ({
      day: new Date(l.date).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }),
      الوزن: l.weight,
    }))
  }, [data])

  /* ─── Health Score ─── */
  const healthScore = useMemo(() => {
    const log = data?.todayLog
    if (!log) return 50
    let score = 0
    // Sleep (0-25)
    const sleepScore = Math.min(25, (log.sleepHours || 0) / 8 * 25)
    score += sleepScore
    // Water (0-25) - 8 glasses = max
    const waterScore = Math.min(25, (log.waterGlasses || 0) / 8 * 25)
    score += waterScore
    // Exercise (0-25) - 30 min = max
    const exerciseScore = Math.min(25, (log.exerciseMin || 0) / 30 * 25)
    score += exerciseScore
    // Mood (0-25)
    const moodScore = (log.mood || 3) / 5 * 25
    score += moodScore
    return Math.round(score)
  }, [data?.todayLog])

  const healthScoreColor = healthScore >= 70 ? 'text-emerald-accent' : healthScore >= 40 ? 'text-gold' : 'text-red-500'
  const healthScoreBg = healthScore >= 70 ? 'from-emerald-accent' : healthScore >= 40 ? 'from-gold' : 'from-red-500'

  /* ─── Weekly Comparison ─── */
  const weeklyComparison = useMemo(() => {
    const logs = data?.logs || []
    const today = new Date()
    const thisWeekLogs = logs.filter(l => {
      const d = new Date(l.date)
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 7)
      return d >= weekAgo && d <= today
    })
    const lastWeekLogs = logs.filter(l => {
      const d = new Date(l.date)
      const twoWeeksAgo = new Date(today)
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
      const oneWeekAgo = new Date(today)
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      return d >= twoWeeksAgo && d < oneWeekAgo
    })
    const avg = (arr: HealthLog[]) => arr.length > 0
      ? arr.reduce((s, l) => s + (l.mood || 3), 0) / arr.length
      : 0
    const avgWater = (arr: HealthLog[]) => arr.length > 0
      ? arr.reduce((s, l) => s + (l.waterGlasses || 0), 0) / arr.length
      : 0
    return {
      thisMood: Math.round(avg(thisWeekLogs) * 10) / 10,
      lastMood: Math.round(avg(lastWeekLogs) * 10) / 10,
      thisWater: Math.round(avgWater(thisWeekLogs) * 10) / 10,
      lastWater: Math.round(avgWater(lastWeekLogs) * 10) / 10,
    }
  }, [data?.logs])

  /* ─── Insight Cards ─── */
  const healthInsights = useMemo(() => {
    const items: { text: string; type: 'positive' | 'negative' | 'neutral'; icon: string }[] = []
    const logs = data?.logs || []
    if (logs.length >= 2) {
      const recent = logs.slice(-3)
      const avgSleep = recent.reduce((s, l) => s + (l.sleepHours || 0), 0) / recent.length
      if (avgSleep >= 7) items.push({ text: 'نومك أفضل هذا الأسبوع! 👏', type: 'positive', icon: '🌙' })
      else if (avgSleep < 6) items.push({ text: 'تحتاج لزيادة ساعات النوم', type: 'negative', icon: '😴' })
      const avgWater = recent.reduce((s, l) => s + (l.waterGlasses || 0), 0) / recent.length
      if (avgWater >= 6) items.push({ text: 'شربك للماء ممتاز! 💧', type: 'positive', icon: '💧' })
      else if (avgWater < 4) items.push({ text: 'تحتاج لشرب مزيد من الماء', type: 'negative', icon: '💧' })
      const avgMood = recent.reduce((s, l) => s + (l.mood || 3), 0) / recent.length
      if (avgMood >= 4) items.push({ text: 'مزاجك إيجابي هذه الأيام! 😊', type: 'positive', icon: '😊' })
    }
    if (items.length === 0) items.push({ text: 'استمر في تتبع بياناتك اليومية!', type: 'neutral', icon: '💪' })
    return items.slice(0, 3)
  }, [data?.logs])

  const tooltipStyle = {
    backgroundColor: 'var(--color-popover)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    fontSize: '12px',
    direction: 'rtl' as const,
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center shadow-lg">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">الصحة</h2>
            <p className="text-xs text-muted-foreground">تتبع صحتك وعافيتك اليومية</p>
          </div>
        </div>
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg rounded-xl h-10 text-sm font-semibold"
          >
            {saving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Save className="w-4 h-4 ml-1" />
              </motion.div>
            ) : (
              <Save className="w-4 h-4 ml-1" />
            )}
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </Button>
        </motion.div>
      </motion.div>

      {/* Health Score Hero */}
      <motion.div variants={itemVariants}>
        <div className="premium-card rounded-2xl overflow-hidden relative">
          <div className={cn("noise-bg absolute inset-0 bg-gradient-to-l", healthScoreBg, "/8 via-transparent to-transparent pointer-events-none")} />
          <div className="relative z-10 p-6 flex flex-col items-center text-center gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">درجة الصحة اليوم</p>
            <motion.div
              className={cn("text-7xl font-black tabular-nums", healthScoreColor)}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <AnimatedCounter target={healthScore} />
            </motion.div>
            <p className={cn("text-sm font-semibold", healthScoreColor)}>
              {healthScore >= 70 ? 'ممتاز 🎉' : healthScore >= 40 ? 'جيد 👍' : 'يحتاج تحسين 💪'}
            </p>
            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
              <span>نوم {data?.todayLog?.sleepHours || 0}س</span>
              <span>·</span>
              <span>ماء {data?.todayLog?.waterGlasses || 0} كوب</span>
              <span>·</span>
              <span>خطوات {data?.todayLog?.steps?.toLocaleString('ar-SA') || '٠'}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Daily Checklist + Weekly Comparison */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily Checklist */}
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-accent" />
              قائمة اليوم
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Water glasses as clickable icons */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">الماء (هدف: ٨ أكواب)</p>
              <div className="flex items-center gap-2 flex-wrap">
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => updateForm('waterGlasses', i < form.waterGlasses ? i : i + 1)}
                    className="text-2xl transition-all"
                  >
                    <motion.span
                      animate={{ scale: i < form.waterGlasses ? 1 : 0.8, opacity: i < form.waterGlasses ? 1 : 0.3 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      💧
                    </motion.span>
                  </motion.button>
                ))}
              </div>
            </div>
            {/* Exercise toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-emerald-accent" />
                <span className="text-xs font-semibold text-muted-foreground">تمارين اليوم</span>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => updateForm('exerciseType', form.exerciseType ? '' : 'مشي')}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  form.exerciseType ? "bg-emerald-accent" : "bg-muted"
                )}
              >
                <motion.div
                  className={cn("absolute top-0.5 w-5 h-5 rounded-full shadow-md", form.exerciseType ? "left-0.5 bg-white" : "right-0.5 bg-muted-foreground/50")}
                  animate={{ x: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </motion.button>
            </div>
            {/* Sleep quality stars */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">جودة النوم</p>
                <span className="text-[10px] text-muted-foreground">{SLEEP_QUALITY_LABELS[form.sleepQuality - 1]}</span>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => updateForm('sleepQuality', i + 1)}
                  >
                    <Moon
                      className={cn(
                        "w-6 h-6 transition-colors",
                        i < form.sleepQuality ? "text-indigo-400 fill-indigo-400" : "text-muted/30"
                      )}
                    />
                  </motion.button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Comparison Mini Bar */}
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-accent" />
              مقارنة أسبوعية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mood comparison */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">المزاج</span>
                <span className="text-foreground font-medium">{weeklyComparison.thisMood} vs {weeklyComparison.lastMood}</span>
              </div>
              <div className="flex gap-2 h-4">
                <div className="flex-1 bg-muted rounded-full overflow-hidden flex justify-end">
                  <motion.div
                    className="h-full bg-gold/50 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(weeklyComparison.lastMood / 5) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <div className="flex-1 bg-muted rounded-full overflow-hidden flex justify-end">
                  <motion.div
                    className="h-full bg-gold rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(weeklyComparison.thisMood / 5) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>الأسبوع الماضي</span>
                <span>هذا الأسبوع</span>
              </div>
            </div>
            {/* Water comparison */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">الماء</span>
                <span className="text-foreground font-medium">{weeklyComparison.thisWater} vs {weeklyComparison.lastWater}</span>
              </div>
              <div className="flex gap-2 h-4">
                <div className="flex-1 bg-muted rounded-full overflow-hidden flex justify-end">
                  <motion.div
                    className="h-full bg-cyan-500/50 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (weeklyComparison.lastWater / 8) * 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <div className="flex-1 bg-muted rounded-full overflow-hidden flex justify-end">
                  <motion.div
                    className="h-full bg-cyan-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (weeklyComparison.thisWater / 8) * 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>الأسبوع الماضي</span>
                <span>هذا الأسبوع</span>
              </div>
            </div>
            {/* Insight cards */}
            <div className="space-y-2 pt-2">
              {healthInsights.map((insight, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl text-xs",
                    insight.type === 'positive' && "bg-emerald-accent/8 text-emerald-accent border border-emerald-accent/15",
                    insight.type === 'negative' && "bg-red-500/8 text-red-500 border border-red-500/15",
                    insight.type === 'neutral' && "bg-muted/30 text-muted-foreground"
                  )}
                >
                  <span className="text-base">{insight.icon}</span>
                  <span className="font-medium">{insight.text}</span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Today's Overview - 2x3 Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {/* Sleep */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Moon className="w-4 h-4 text-indigo-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">النوم</span>
            </div>
            <div className="flex items-baseline gap-1">
              <Input
                type="number"
                value={form.sleepHours ? Number(form.sleepHours.toFixed(1)) : ''}
                onChange={(e) => updateForm('sleepHours', parseFloat(e.target.value) || 0)}
                className="w-16 h-8 text-lg font-bold text-center rounded-lg border-0 bg-muted/50 focus:bg-muted text-foreground p-0"
                placeholder="٠"
                min={0}
                max={24}
                step={0.5}
              />
              <span className="text-xs text-muted-foreground">ساعة</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>الجودة</span>
                <span>{SLEEP_QUALITY_LABELS[form.sleepQuality - 1]}</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                value={form.sleepQuality}
                onChange={(e) => updateForm('sleepQuality', parseInt(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-400"
                style={{
                  background: `linear-gradient(to left, rgb(129 140 248) ${((form.sleepQuality - 1) / 4) * 100}%, var(--color-muted) ${((form.sleepQuality - 1) / 4) * 100}%)`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Water */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Droplets className="w-4 h-4 text-cyan-500" />
              </div>
              <span className="text-sm font-semibold text-foreground">الماء</span>
            </div>
            <div className="flex items-center justify-center gap-4">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => updateForm('waterGlasses', Math.max(0, form.waterGlasses - 1))}
                className="w-9 h-9 rounded-xl bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
              >
                <Minus className="w-4 h-4 text-muted-foreground" />
              </motion.button>
              <div className="text-center">
                <span className="text-2xl font-bold text-foreground">{form.waterGlasses}</span>
                <span className="text-xs text-muted-foreground block">كوب</span>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => updateForm('waterGlasses', form.waterGlasses + 1)}
                className="w-9 h-9 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4 text-cyan-500" />
              </motion.button>
            </div>
            {/* Water visual */}
            <div className="flex items-center gap-1 justify-center">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    backgroundColor: i < form.waterGlasses ? 'var(--color-cyan-500)' : 'var(--color-muted)',
                    scale: i < form.waterGlasses ? 1 : 0.8,
                  }}
                  className="w-2.5 h-2.5 rounded-full transition-colors"
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Steps */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-accent/10 flex items-center justify-center">
                <Footprints className="w-4 h-4 text-emerald-accent" />
              </div>
              <span className="text-sm font-semibold text-foreground">الخطوات</span>
            </div>
            <div className="flex items-baseline gap-1">
              <Input
                type="number"
                value={form.steps || ''}
                onChange={(e) => updateForm('steps', parseInt(e.target.value) || 0)}
                className="w-24 h-8 text-lg font-bold rounded-lg border-0 bg-muted/50 focus:bg-muted text-foreground p-0 text-center"
                placeholder="٠"
                min={0}
              />
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-l from-emerald-accent to-forest"
                animate={{ width: `${Math.min(100, (form.steps / 10000) * 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              الهدف: ١٠,٠٠٠ خطوة ({Math.round((form.steps / 10000) * 100)}%)
            </span>
          </CardContent>
        </Card>

        {/* Calories */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Flame className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-sm font-semibold text-foreground">السعرات</span>
            </div>
            <div className="flex items-baseline gap-1">
              <Input
                type="number"
                value={form.calories || ''}
                onChange={(e) => updateForm('calories', parseInt(e.target.value) || 0)}
                className="w-24 h-8 text-lg font-bold rounded-lg border-0 bg-muted/50 focus:bg-muted text-foreground p-0 text-center"
                placeholder="٠"
                min={0}
              />
              <span className="text-xs text-muted-foreground">سعرة</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-l from-orange-400 to-orange-600"
                animate={{ width: `${Math.min(100, (form.calories / 2500) * 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              الهدف: ٢,٥٠٠ سعرة
            </span>
          </CardContent>
        </Card>

        {/* Mood */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                <Smile className="w-4 h-4 text-gold" />
              </div>
              <span className="text-sm font-semibold text-foreground">المزاج</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1">
              {MOOD_EMOJIS.map((emoji, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => updateForm('mood', i + 1)}
                  className={cn(
                    'text-2xl p-1.5 rounded-lg transition-all',
                    form.mood === i + 1
                      ? 'bg-gold/15 scale-110'
                      : 'opacity-50 hover:opacity-100'
                  )}
                >
                  {emoji}
                </motion.button>
              ))}
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              {MOOD_LABELS[form.mood - 1]}
            </p>
          </CardContent>
        </Card>

        {/* Energy */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
                <Battery className="w-4 h-4 text-forest" />
              </div>
              <span className="text-sm font-semibold text-foreground">الطاقة</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-3xl font-bold text-forest">
              {form.energy}
            </div>
            <div className="space-y-1">
              <input
                type="range"
                min={1}
                max={5}
                value={form.energy}
                onChange={(e) => updateForm('energy', parseInt(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-accent"
                style={{
                  background: `linear-gradient(to left, var(--color-emerald-accent) ${((form.energy - 1) / 4) * 100}%, var(--color-muted) ${((form.energy - 1) / 4) * 100}%)`,
                }}
              />
              <p className="text-center text-[11px] text-muted-foreground">
                {ENERGY_LABELS[form.energy - 1]}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Exercise Section */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-emerald-accent" />
              التمارين
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {EXERCISE_TYPES.map((type) => (
                <motion.button
                  key={type.value}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => updateForm('exerciseType', form.exerciseType === type.value ? '' : type.value)}
                  className={cn(
                    'rounded-xl p-3 text-center text-sm font-medium transition-all border',
                    form.exerciseType === type.value
                      ? 'border-emerald-accent/40 bg-emerald-accent/5 text-emerald-accent shadow-sm'
                      : 'border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <span className="text-lg block mb-0.5">{type.icon}</span>
                  {type.label}
                </motion.button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">المدة (دقائق)</label>
                <Input
                  type="number"
                  value={form.exerciseMin || ''}
                  onChange={(e) => updateForm('exerciseMin', parseInt(e.target.value) || 0)}
                  className="rounded-xl border-0 bg-muted/50 focus:bg-muted text-sm"
                  placeholder="٣٠"
                  min={0}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
                <Input
                  value={exerciseNotes}
                  onChange={(e) => setExerciseNotes(e.target.value)}
                  className="rounded-xl border-0 bg-muted/50 focus:bg-muted text-sm"
                  placeholder="ملاحظات إضافية..."
                  dir="rtl"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Weight Tracking */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Scale className="w-4 h-4 text-forest" />
              تتبع الوزن
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={form.weight ?? ''}
                onChange={(e) => updateForm('weight', parseFloat(e.target.value) || null)}
                className="w-32 h-10 rounded-xl border-0 bg-muted/50 focus:bg-muted text-sm text-center"
                placeholder="كجم"
                min={0}
                step={0.1}
              />
              <span className="text-sm text-muted-foreground">كيلوغرام</span>
            </div>

            {weightChartData.length > 1 && (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightChartData}>
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
                      width={40}
                      domain={['dataMin - 2', 'dataMax + 2']}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value} كجم`, 'الوزن']} />
                    <Line
                      type="monotone"
                      dataKey="الوزن"
                      stroke="var(--color-emerald-accent)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--color-emerald-accent)', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Section */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-accent" />
              الرسوم البيانية (آخر ١٤ يوم)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sleep" className="w-full">
              <TabsList className="w-full grid grid-cols-4 h-auto p-1 bg-muted/50 rounded-xl">
                <TabsTrigger
                  value="sleep"
                  className="text-xs rounded-lg py-2 data-[state=active]:bg-emerald-accent data-[state=active]:text-white"
                >
                  النوم
                </TabsTrigger>
                <TabsTrigger
                  value="water"
                  className="text-xs rounded-lg py-2 data-[state=active]:bg-cyan-500 data-[state=active]:text-white"
                >
                  الماء
                </TabsTrigger>
                <TabsTrigger
                  value="steps"
                  className="text-xs rounded-lg py-2 data-[state=active]:bg-emerald-accent data-[state=active]:text-white"
                >
                  الخطوات
                </TabsTrigger>
                <TabsTrigger
                  value="mood"
                  className="text-xs rounded-lg py-2 data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
                >
                  المزاج
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sleep" className="mt-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sleepChartData} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} width={25} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <defs>
                        <linearGradient id="sleepBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-emerald-accent)" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="var(--color-emerald-accent)" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <Bar dataKey="ساعات" fill="url(#sleepBarGrad)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="water" className="mt-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waterChartData} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} width={25} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <defs>
                        <linearGradient id="waterBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-cyan-500)" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="var(--color-cyan-500)" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <Bar dataKey="أكواب" fill="url(#waterBarGrad)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="steps" className="mt-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stepsChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value.toLocaleString('ar-SA')}`, 'خطوات']} />
                      <defs>
                        <linearGradient id="stepsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-emerald-accent)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="var(--color-emerald-accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="خطوات" stroke="var(--color-emerald-accent)" strokeWidth={2} fill="url(#stepsGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="mood" className="mt-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={moodEnergyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} width={25} domain={[0, 5]} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="المزاج" stroke="var(--color-gold)" strokeWidth={2} dot={{ fill: 'var(--color-gold)', r: 3 }} />
                      <Line type="monotone" dataKey="الطاقة" stroke="var(--color-emerald-accent)" strokeWidth={2} dot={{ fill: 'var(--color-emerald-accent)', r: 3 }} />
                      <defs>
                        <linearGradient id="moodLineGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}