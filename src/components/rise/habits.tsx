'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flame,
  Plus,
  Zap,
  Trophy,
  TrendingUp,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Crown,
  CalendarDays,
  Star,
  Target,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { apiDelete, apiFetch, apiPost, apiPut } from '@/lib/api-fetch'
import { notifyHabitComplete } from '@/lib/notifications'
import { HabitReminders, ReminderBell } from './habit-reminders'

/* ────────────── Types ────────────── */

interface Habit {
  id: string
  name: string
  icon: string
  color: string
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom'
  targetCount: number
  xpReward: number
  reminderTime?: string | null
}

interface HabitLog {
  habitId: string
  date: string
  completed: boolean
  count: number
}

interface HabitsResponse {
  habits: Habit[]
  logs: HabitLog[]
}

const PRESET_COLORS = [
  { name: 'أخضر زمردي', value: '#10b981' },
  { name: 'ذهبي', value: '#eab308' },
  { name: 'برتقالي', value: '#f97316' },
  { name: 'وردي', value: '#ec4899' },
  { name: 'بنفسجي', value: '#8b5cf6' },
  { name: 'أحمر', value: '#ef4444' },
  { name: 'سماوي', value: '#06b6d4' },
  { name: 'ليموني', value: '#84cc16' },
]

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'يومياً',
  weekdays: 'أيام الأسبوع',
  weekends: 'عطلة نهاية الأسبوع',
  custom: 'مخصص',
}

/* ────────────── Helpers ────────────── */

function getHeatLevel(completed: boolean, count: number, target: number): number {
  if (!completed) return 0
  if (target <= 1) return count > 0 ? 4 : 0
  const ratio = count / target
  if (ratio >= 1) return 4
  if (ratio >= 0.75) return 3
  if (ratio >= 0.5) return 2
  return 1
}

function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-SA', { weekday: 'long' })
}

function getShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
}

function calcStreak(logs: HabitLog[], habitId: string): { current: number; longest: number } {
  const habitLogs = logs
    .filter((l) => l.habitId === habitId && l.completed)
    .map((l) => l.date)
    .sort()

  if (habitLogs.length === 0) return { current: 0, longest: 0 }

  const today = getTodayStr()
  const todayLog = habitLogs.includes(today)
  let current = 0
  let longest = 0
  let streak = 1

  if (todayLog) {
    current = 1
  }

  // Calculate all streaks
  for (let i = 1; i < habitLogs.length; i++) {
    const prev = new Date(habitLogs[i - 1])
    const curr = new Date(habitLogs[i])
    const diffMs = curr.getTime() - prev.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      streak++
    } else {
      longest = Math.max(longest, streak)
      streak = 1
    }
  }
  longest = Math.max(longest, streak)

  // Calculate current streak
  if (todayLog && habitLogs.length > 1) {
    const sorted = [...habitLogs].reverse()
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1])
      const curr = new Date(sorted[i])
      const diffMs = prev.getTime() - curr.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays === 1) {
        current++
      } else {
        break
      }
    }
  }

  return { current, longest }
}

function generateLast30Days(): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return days
}

function getCompletionRate(logs: HabitLog[], habitId: string): number {
  const habitLogs = logs.filter((l) => l.habitId === habitId)
  if (habitLogs.length === 0) return 0
  const completed = habitLogs.filter((l) => l.completed).length
  return Math.round((completed / habitLogs.length) * 100)
}

/* ────────────── Component ────────────── */

export function HabitsView() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [flashCard, setFlashCard] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formIcon, setFormIcon] = useState('🎯')
  const [formColor, setFormColor] = useState('#10b981')
  const [formFrequency, setFormFrequency] = useState<Habit['frequency']>('daily')
  const [formTarget, setFormTarget] = useState('1')

  const todayStr = getTodayStr()

  /* ---- Fetch ---- */
  useEffect(() => {
    async function fetchHabits() {
      try {
        const res = await apiFetch('/api/rise/habits')
        if (res.ok) {
          const data: HabitsResponse = await res.json()
          setHabits(data.habits)
          setLogs(data.logs)
        }
      } catch {
        // empty
      } finally {
        setLoading(false)
      }
    }
    fetchHabits()
  }, [])

  /* ---- Toggle today's habit ---- */
  const toggleTodayHabit = useCallback(
    async (habitId: string) => {
      const existingLog = logs.find((l) => l.habitId === habitId && l.date === todayStr)
      const newCompleted = existingLog ? !existingLog.completed : true

      // Flash animation
      setFlashCard(habitId)
      setTimeout(() => setFlashCard(null), 400)

      // Optimistic update
      if (existingLog) {
        setLogs((prev) =>
          prev.map((l) =>
            l.habitId === habitId && l.date === todayStr
              ? { ...l, completed: newCompleted, count: newCompleted ? 1 : 0 }
              : l
          )
        )
      } else {
        setLogs((prev) => [
          ...prev,
          { habitId, date: todayStr, completed: newCompleted, count: newCompleted ? 1 : 0 },
        ])
      }

      try {
        await apiPut('/api/rise/habits', {
          habitId,
          date: todayStr,
          completed: newCompleted,
        })
        if (newCompleted) {
          const habit = habits.find((h) => h.id === habitId)
          if (habit) {
            const streak = calcStreak(
              [...logs, { habitId, date: todayStr, completed: true, count: 1 }],
              habitId
            )
            notifyHabitComplete(habit.name, streak.current)
          }
          if (!existingLog) {
            apiPost('/api/rise/earn-xp', { amount: habit?.xpReward || 15, reason: `habit:${habitId}` }).catch(() => {})
          }
        }
      } catch {
        // Revert
        if (existingLog) {
          setLogs((prev) =>
            prev.map((l) =>
              l.habitId === habitId && l.date === todayStr
                ? { ...l, completed: existingLog.completed, count: existingLog.count }
                : l
            )
          )
        } else {
          setLogs((prev) => prev.filter((l) => !(l.habitId === habitId && l.date === todayStr)))
        }
      }
    },
    [logs, todayStr, habits]
  )

  /* ---- Add habit ---- */
  async function handleAddHabit() {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const res = await apiPost('/api/rise/habits', {
          name: formName,
          icon: formIcon,
          color: formColor,
          frequency: formFrequency,
          targetCount: parseInt(formTarget) || 1,
        })
      if (res.ok) {
        const data = await res.json()
        setHabits((prev) => [...prev, data])
        setAddOpen(false)
        resetForm()
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }

  /* ---- Delete habit ---- */
  async function deleteHabit(id: string) {
    setHabits((prev) => prev.filter((h) => h.id !== id))
    try {
      await apiDelete(`/api/rise/habits?id=${id}`)
    } catch {
      // silently fail
    }
  }

  function resetForm() {
    setFormName('')
    setFormIcon('🎯')
    setFormColor('#10b981')
    setFormFrequency('daily')
    setFormTarget('1')
  }

  /* ---- Toggle reminder time ---- */
  const handleToggleReminder = useCallback(async (habitId: string, time: string | null) => {
    try {
      await apiPut('/api/rise/habits', { id: habitId, reminderTime: time })
      setHabits((prev) =>
        prev.map((h) => (h.id === habitId ? { ...h, reminderTime: time } : h))
      )
      if (time) {
        toast.success('تم تعيين التذكير', { description: `الساعة ${time}` })
      } else {
        toast('تم إزالة التذكير')
      }
    } catch {
      // silently fail
    }
  }, [])

  /* ---- Stats ---- */
  const stats = useMemo((): { total: number; todayRate: number; longestStreak: number; currentStreak: number; bestHabit: Habit | null; bestRate: number } => {
    const total = habits.length
    const todayLogs = logs.filter((l) => l.date === todayStr)
    const todayCompleted = todayLogs.filter((l) => l.completed).length
    const todayRate = total > 0 ? Math.round((todayCompleted / total) * 100) : 0

    let longestStreak = 0
    let bestHabit: Habit | null = null
    let bestRate = 0

    habits.forEach((h) => {
      const s = calcStreak(logs, h.id)
      if (s.longest > longestStreak) longestStreak = s.longest
      const rate = getCompletionRate(logs, h.id)
      if (rate > bestRate) {
        bestRate = rate
        bestHabit = h
      }
    })

    const currentStreak =
      habits.length > 0
        ? Math.max(...habits.map((h) => calcStreak(logs, h.id).current))
        : 0

    return { total, todayRate, longestStreak, currentStreak, bestHabit, bestRate }
  }, [habits, logs, todayStr])

  /* ---- Heatmap data ---- */
  const last30Days = useMemo(() => generateLast30Days(), [])

  /* ---- Day-of-week labels (Arabic, Sun=أحد through Sat=سبت) ---- */
  const dayLabels = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة']
  // getDay() returns 0=Sun ... 6=Sat. We want Sat=0, Sun=1, Mon=2 ... Fri=6
  function getDayIndex(dateStr: string): number {
    const d = new Date(dateStr)
    const g = d.getDay() // 0=Sun
    return (g + 1) % 7 // shift: Sun→1, Mon→2, ..., Sat→0
  }

  /* ──────────── Render ──────────── */

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6 p-4 md:p-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-lg">
              <Flame className="w-5 h-5 text-forest-dark" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">تتبع العادات</h1>
              <p className="text-xs text-muted-foreground">
                كرر العادات الجيدة كل يوم وحقق النجاح
              </p>
            </div>
          </div>

          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm() }}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-xl bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg shadow-emerald-accent/20"
              >
                <Plus className="w-4 h-4 ml-1.5" />
                عادة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-right">إضافة عادة جديدة</DialogTitle>
                <DialogDescription className="text-right">
                  بنِ عادات قوية تُقربك من أهدافك
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
                  <div className="space-y-2">
                    <Label className="text-right text-sm font-medium">الأيقونة</Label>
                    <Input
                      value={formIcon}
                      onChange={(e) => setFormIcon(e.target.value)}
                      className="w-16 text-center text-2xl h-12 rounded-xl"
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-right text-sm font-medium">اسم العادة</Label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="مثال: قراءة 30 دقيقة"
                      className="rounded-xl text-right"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-right text-sm font-medium">اللون</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setFormColor(c.value)}
                        className={cn(
                          'w-8 h-8 rounded-full transition-all duration-200 border-2',
                          formColor === c.value
                            ? 'ring-2 ring-offset-2 ring-offset-background scale-110'
                            : 'hover:scale-105'
                        )}
                        style={{
                          backgroundColor: c.value,
                          borderColor: formColor === c.value ? c.value : 'transparent',
                          ...(formColor === c.value ? { ['--tw-ring-color' as string]: c.value } : {}),
                        }}
                      >
                        <span className="sr-only">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-right text-sm font-medium">التكرار</Label>
                    <Select
                      value={formFrequency}
                      onValueChange={(v) => setFormFrequency(v as Habit['frequency'])}
                    >
                      <SelectTrigger className="rounded-xl text-right">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">يومياً</SelectItem>
                        <SelectItem value="weekdays">أيام الأسبوع</SelectItem>
                        <SelectItem value="weekends">نهاية الأسبوع</SelectItem>
                        <SelectItem value="custom">مخصص</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-right text-sm font-medium">الهدف اليومي</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formTarget}
                      onChange={(e) => setFormTarget(e.target.value)}
                      className="rounded-xl text-right"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                  className="rounded-xl"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleAddHabit}
                  disabled={!formName.trim() || saving}
                  className="rounded-xl bg-gradient-to-l from-emerald-accent to-forest text-white"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-1.5" />
                  ) : (
                    <Plus className="w-4 h-4 ml-1.5" />
                  )}
                  إضافة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Reminders Banner ── */}
        <HabitReminders habits={habits} onToggleReminder={handleToggleReminder} />

        {/* ── Today's Score Hero Card ── */}
        {habits.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="premium-card rounded-2xl p-6 relative overflow-hidden glow-emerald"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-emerald-accent/[0.06] blur-3xl pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-center gap-6">
              {/* Completion Ring */}
              <div className="relative">
                <svg width={90} height={90} className="-rotate-90">
                  <defs>
                    <linearGradient id="habitScoreRing" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="oklch(0.55 0.14 163)" />
                      <stop offset="100%" stopColor="oklch(0.78 0.12 85)" />
                    </linearGradient>
                  </defs>
                  <circle cx={45} cy={45} r={38} fill="none" className="stroke-primary/10" strokeWidth={5} />
                  <motion.circle
                    cx={45} cy={45} r={38} fill="none"
                    stroke="url(#habitScoreRing)"
                    strokeWidth={5} strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 38}
                    initial={{ strokeDashoffset: 2 * Math.PI * 38 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 38 - (stats.todayRate / 100) * 2 * Math.PI * 38 }}
                    transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
                    style={{ filter: 'drop-shadow(0 0 6px oklch(0.55 0.14 163 / 0.3))' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-gradient-forest">{stats.todayRate}</span>
                  <span className="text-[9px] text-muted-foreground">٪</span>
                </div>
              </div>

              <div className="flex-1 text-center sm:text-right">
                <p className="text-xs text-muted-foreground mb-1">درجة إنجاز اليوم</p>
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <span className={cn(
                    'text-3xl font-black',
                    stats.todayRate >= 80 ? 'text-gradient-forest' : stats.todayRate >= 50 ? 'text-gradient-gold' : 'text-muted-foreground'
                  )}>
                    {stats.todayRate >= 80 ? 'A' : stats.todayRate >= 60 ? 'B' : stats.todayRate >= 40 ? 'C' : 'D'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {logs.filter((l) => l.date === todayStr && l.completed).length} من {habits.length} عادة مكتملة
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  {stats.todayRate >= 80 ? '🌟 أداء ممتاز! استمر على هذا النحو' : stats.todayRate >= 50 ? '💪 جيد! واصل التحسن' : stats.todayRate >= 25 ? '🌱 لا بأس، كل خطوة مهمة' : '✨ ابدأ بإتمام عادة واحدة'}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Best Streak Celebration ── */}
        {stats.longestStreak > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <div className="premium-card rounded-2xl p-4 relative overflow-hidden" style={{ border: '1px solid oklch(0.78 0.12 85 / 0.25)' }}>
              <div className="absolute top-1/2 -translate-y-1/2 left-4 w-20 h-20 rounded-full bg-gold/[0.06] blur-2xl pointer-events-none" />
              <div className="relative flex items-center gap-3">
                <motion.div
                  animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
                  transition={{ type: 'tween', duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-lg shrink-0"
                >
                  <Trophy className="w-5 h-5 text-forest-dark" />
                </motion.div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gradient-gold">أفضل سلسلة: {stats.longestStreak} يوم</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {stats.longestStreak >= 30 ? '🏆 إنجاز خارق! أنت منضبط جداً' : stats.longestStreak >= 14 ? '🔥 سلسلة رائعة! واصل الحماس' : '💪 بداية جيدة! حافظ على الاستمرارية'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Statistics ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="rounded-2xl border-0 shadow-sm glass relative overflow-hidden">
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-emerald-accent/20 via-transparent to-gold/20 pointer-events-none" />
              <CardContent className="p-4 flex items-center gap-3 relative">
                <div className="w-9 h-9 rounded-xl bg-emerald-accent/10 flex items-center justify-center">
                  <Target className="w-4.5 h-4.5 text-emerald-accent" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.total}</p>
                  <p className="text-[10px] text-muted-foreground">إجمالي العادات</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
          >
            <Card className="rounded-2xl border-0 shadow-sm glass relative overflow-hidden">
              <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-gold/20 via-transparent to-emerald-accent/20 pointer-events-none" />
              <CardContent className="p-4 flex items-center gap-3 relative">
                <div className="w-9 h-9 rounded-xl bg-gold/10 flex items-center justify-center">
                  <Zap className="w-4.5 h-4.5 text-gold" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.todayRate}%</p>
                  <p className="text-[10px] text-muted-foreground">إنجاز اليوم</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
          >
            <Card className="rounded-2xl border-0 shadow-sm glass relative overflow-hidden">
              <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-forest/20 via-transparent to-gold/20 pointer-events-none" />
              <CardContent className="p-4 flex items-center gap-3 relative">
                <div className="w-9 h-9 rounded-xl bg-forest/10 flex items-center justify-center">
                  <Flame className="w-4.5 h-4.5 text-forest" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.currentStreak}</p>
                  <p className="text-[10px] text-muted-foreground">سلسلة حالية</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
          >
            <Card className="rounded-2xl border-0 shadow-sm glass relative overflow-hidden">
              <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-gold/20 via-transparent to-forest/20 pointer-events-none" />
              <CardContent className="p-4 flex items-center gap-3 relative">
                <div className="w-9 h-9 rounded-xl bg-gold-light/20 flex items-center justify-center">
                  <Crown className="w-4.5 h-4.5 text-gold" />
                </div>
                <div>
                  <p className="text-sm font-bold truncate max-w-[80px]">
                    {stats.bestHabit ? `${stats.bestHabit.icon} ${stats.bestHabit.name}` : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">أفضل عادة</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Today's Habits ── */}
        {habits.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-emerald-accent" />
              <h2 className="text-sm font-semibold">عادات اليوم</h2>
              <Badge
                variant="secondary"
                className="text-[10px] px-2 py-0 rounded-full bg-emerald-accent/10 text-emerald-accent border-0"
              >
                {logs.filter((l) => l.date === todayStr && l.completed).length} / {habits.length}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <AnimatePresence mode="popLayout">
                {habits.map((habit, index) => {
                  const todayLog = logs.find(
                    (l) => l.habitId === habit.id && l.date === todayStr
                  )
                  const isCompleted = todayLog?.completed ?? false
                  const streak = calcStreak(logs, habit.id)
                  const isFlashing = flashCard === habit.id

                  return (
                    <motion.div
                      key={habit.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <Card
                        className={cn(
                          'rounded-2xl border-0 shadow-sm overflow-hidden transition-all duration-300',
                          isCompleted
                            ? 'bg-card ring-1'
                            : 'glass'
                        )}
                        style={
                          isCompleted
                            ? { ['--tw-ring-color' as string]: habit.color + '40' }
                            : undefined
                        }
                      >
                        {/* Flash overlay */}
                        <AnimatePresence>
                          {isFlashing && (
                            <motion.div
                              initial={{ opacity: 0.5 }}
                              animate={{ opacity: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.4 }}
                              className="absolute inset-0 z-10 pointer-events-none rounded-2xl"
                              style={{ backgroundColor: isCompleted ? habit.color : 'transparent' }}
                            />
                          )}
                        </AnimatePresence>

                        <CardContent className="p-4 relative">
                          {/* Color accent strip */}
                          <div
                            className="absolute top-0 right-0 left-0 h-1 transition-opacity duration-300"
                            style={{
                              backgroundColor: habit.color,
                              opacity: isCompleted ? 1 : 0.3,
                            }}
                          />

                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteHabit(habit.id)
                            }}
                            className="absolute top-2 left-2 w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                            style={{ opacity: 0.4 }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
                          >
                            <span className="text-[10px]">✕</span>
                          </button>

                          {/* Reminder Bell */}
                          <div className="absolute top-2 left-9">
                            <ReminderBell habit={habit} onToggle={handleToggleReminder} />
                          </div>

                          {/* Icon and name */}
                          <div className="text-center mb-3">
                            <motion.div
                              animate={isCompleted ? { scale: [1, 1.2, 1] } : {}}
                              transition={{ type: 'tween', duration: 0.3 }}
                              className="text-3xl mb-1.5"
                            >
                              {habit.icon}
                            </motion.div>
                            <p className="text-xs font-semibold truncate">{habit.name}</p>
                          </div>

                          {/* Streak with animated flame for streak > 3 */}
                          {streak.current > 0 && (
                            <div className="flex items-center justify-center gap-1 mb-3">
                              <motion.div
                                animate={streak.current > 3 ? { scale: [1, 1.3, 1] } : {}}
                                transition={{ type: 'tween', duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                              >
                                <Flame
                                  className="w-4 h-4"
                                  style={{ color: habit.color, filter: streak.current > 5 ? 'drop-shadow(0 0 4px oklch(0.55 0.18 25 / 0.4))' : 'none' }}
                                />
                              </motion.div>
                              <span
                                className="text-xs font-bold"
                                style={{ color: habit.color }}
                              >
                                {streak.current}
                              </span>
                              <span className="text-[10px] text-muted-foreground">يوم</span>
                            </div>
                          )}

                          {/* Toggle button with pulsing ring when completed */}
                          <div className="relative">
                            {isCompleted && (
                              <motion.div
                                className="absolute inset-0 rounded-xl pointer-events-none"
                                style={{ borderColor: habit.color }}
                                animate={{
                                  boxShadow: [
                                    `0 0 0 0px ${habit.color}30`,
                                    `0 0 0 6px ${habit.color}10`,
                                    `0 0 0 10px ${habit.color}00`,
                                  ],
                                }}
                                transition={{
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: 'easeOut',
                                }}
                              />
                            )}
                            <motion.button
                              whileTap={{ scale: 0.92 }}
                              onClick={() => toggleTodayHabit(habit.id)}
                              className={cn(
                                'w-full py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 flex items-center justify-center gap-1.5 relative z-10',
                                isCompleted
                                  ? 'text-white shadow-md'
                                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                              )}
                              style={
                                isCompleted
                                  ? { backgroundColor: habit.color }
                                  : undefined
                              }
                            >
                              {isCompleted ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  تم!
                                </>
                              ) : (
                                <>
                                  <Circle className="w-3.5 h-3.5" />
                                  إتمام
                                </>
                              )}
                            </motion.button>
                          </div>

                          {/* XP badge */}
                          <div className="flex items-center justify-center gap-1 mt-2">
                            <Sparkles className="w-3 h-3 text-gold" />
                            <span className="text-[10px] text-gold font-medium">
                              +{habit.xpReward} خبرة
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── Heatmap Section ── */}
        {habits.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-accent" />
              <h2 className="text-sm font-semibold">خريطة الإنجاز</h2>
              <span className="text-[10px] text-muted-foreground">آخر ٣٠ يوم</span>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pl-1">
              {habits.map((habit, hIndex) => (
                <motion.div
                  key={habit.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: hIndex * 0.05 }}
                >
                  <Card className="rounded-2xl border-0 shadow-sm glass">
                    <CardContent className="p-4">
                      {/* Habit name */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base">{habit.icon}</span>
                        <span className="text-xs font-semibold">{habit.name}</span>
                        <div className="flex-1" />
                        <div className="flex items-center gap-1">
                          {calcStreak(logs, habit.id).current > 3 && (
                            <span className="text-xs">🔥</span>
                          )}
                          <Flame className="w-3 h-3" style={{ color: habit.color }} />
                          <span className="text-[10px] font-medium" style={{ color: habit.color }}>
                            {calcStreak(logs, habit.id).current}
                          </span>
                        </div>
                      </div>

                      {/* Heatmap grid: 7 rows (days) × 5 cols (weeks) */}
                      <div className="overflow-x-auto">
                        <div className="flex gap-0.5 min-w-fit">
                          {/* Day labels */}
                          <div className="flex flex-col gap-0.5 ml-1.5">
                            {dayLabels.map((label, di) => (
                              <div
                                key={label}
                                className="w-7 text-[9px] text-muted-foreground/50 flex items-center justify-end pr-1"
                                style={{ height: '14px' }}
                              >
                                {di % 2 === 0 ? label : ''}
                              </div>
                            ))}
                          </div>

                          {/* Week columns */}
                          {Array.from({ length: 5 }).map((_, weekIdx) => {
                            const weekDays = last30Days.filter(
                              (_, i) => Math.floor(i / 7) === weekIdx
                            )

                            return (
                              <div key={weekIdx} className="flex flex-col gap-0.5">
                                {/* Render 7 cells per week */}
                                {Array.from({ length: 7 }).map((_, daySlot) => {
                                  // Find the day that falls in this week and this day-of-week
                                  const dayInWeek = weekDays.find(
                                    (d) => getDayIndex(d) === daySlot
                                  )
                                  const isToday = dayInWeek === todayStr

                                  let heatLevel = 0
                                  if (dayInWeek) {
                                    const log = logs.find(
                                      (l) => l.habitId === habit.id && l.date === dayInWeek
                                    )
                                    if (log) {
                                      heatLevel = getHeatLevel(
                                        log.completed,
                                        log.count,
                                        habit.targetCount
                                      )
                                    }
                                  }

                                  return (
                                    <Tooltip key={`${weekIdx}-${daySlot}`}>
                                      <TooltipTrigger asChild>
                                        <motion.div
                                          whileHover={{ scale: 1.3, zIndex: 10 }}
                                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                                          className={cn(
                                            'w-[14px] h-[14px] rounded-[3px] transition-all duration-300 cursor-default',
                                            dayInWeek ? `heat-${heatLevel}` : 'bg-transparent',
                                            isToday &&
                                              'ring-2 ring-emerald-accent ring-offset-1 ring-offset-background shadow-[0_0_8px_var(--color-emerald-accent)]'
                                          )}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="text-[10px] px-2 py-1 rounded-lg"
                                      >
                                        {dayInWeek ? (
                                          <span>
                                            {getDayName(dayInWeek)}، {getShortDate(dayInWeek)}
                                            {heatLevel > 0 ? ' ✅' : ' ⬜'}
                                          </span>
                                        ) : (
                                          <span>—</span>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Heatmap legend */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="text-[10px] text-muted-foreground">أقل</span>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((level) => (
                  <div key={level} className={cn('w-3 h-3 rounded-sm transition-colors duration-300', `heat-${level}`)} />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">أكثر</span>
            </div>
          </div>
        )}

        {/* ── Empty State ── */}
        {habits.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-gold/10 flex items-center justify-center mb-6">
              <Flame className="w-10 h-10 text-gold" />
            </div>
            <h3 className="text-lg font-semibold mb-2">ابدأ ببناء عاداتك</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              النجاح ليس حدثاً عابراً، بل هو نتيجة عادات يومية متكررة. أضف عادتك الأولى وابدأ
              رحلة التغيير!
            </p>
            <Button
              onClick={() => setAddOpen(true)}
              className="mt-6 rounded-xl bg-gradient-to-l from-emerald-accent to-forest text-white shadow-lg shadow-emerald-accent/20"
            >
              <Plus className="w-4 h-4 ml-1.5" />
              أضف أول عادة
            </Button>
          </motion.div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default HabitsView