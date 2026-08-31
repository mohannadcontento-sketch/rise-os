'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flame,
  Plus,
  Zap,
  TrendingUp,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Crown,
  CalendarDays,
  Star,
  Target,
  PencilLine,
  Repeat,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { toastSaved, toastDeleted, toastError, toastCreated } from '@/lib/toast-helpers'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { NeoField } from '@/components/rise/neo'
import { apiDelete, apiFetch, apiPost, apiPut } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { HabitIcon, HabitGlyph, HABIT_ICON_PRESETS } from '@/components/rise/icons'
// useDataRefresh removed — causes toggle reverts (multiple data-changed events)
import { notifyHabitComplete } from '@/lib/notifications'
import { HabitReminders, ReminderBell } from './habit-reminders'
import { RiseIcon } from '@/components/rise/icons'

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
  return d.toLocaleDateString('ar-EG', { weekday: 'long' })
}

function getShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
}

function calcStreak(logs: HabitLog[], habitId: string): { current: number; longest: number } {
  const habitLogs = logs
    .filter((l) => l.habitId === habitId && l.completed)
    .map((l) => l.date)
    .sort()

  if (habitLogs.length === 0) return { current: 0, longest: 0 }

  const today = getTodayStr()

  // GRACE FIX (نفس قاعدة السلسلة الحية في الداشبورد): قبل كده لو المستخدم
  // عمل العادة إمبارح ولسه ضغطهاش النهاردة، السلسلة الحالية كانت بتظهر صفر
  // — رغم إن اليوم لسه ما خلصش. دلوقتي بنمشي من إمبارح لحد ما اليوم يخلص.
  const [ty, tm, td] = today.split('-').map(Number)
  const yDate = new Date(ty, (tm || 1) - 1, td || 1, 12, 0, 0, 0) // noon → DST-safe
  yDate.setDate(yDate.getDate() - 1)
  const yesterday = `${yDate.getFullYear()}-${String(yDate.getMonth() + 1).padStart(2, '0')}-${String(yDate.getDate()).padStart(2, '0')}`

  // Calculate longest streak
  let longest = 0
  let longestRun = 1
  for (let i = 1; i < habitLogs.length; i++) {
    const prev = new Date(habitLogs[i - 1])
    const curr = new Date(habitLogs[i])
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (diffDays === 0) continue // duplicate same-day entries — keep the run
    if (diffDays === 1) {
      longestRun++
    } else {
      longest = Math.max(longest, longestRun)
      longestRun = 1
    }
  }
  longest = Math.max(longest, longestRun)

  // Calculate current streak — anchored on today, or yesterday while the day
  // is still young (grace). Walks backwards day-by-day through the sorted logs.
  let current = 0
  const anchor = habitLogs.includes(today) ? today : habitLogs.includes(yesterday) ? yesterday : null
  if (anchor) {
    current = 1
    let prevDay = anchor
    for (let i = habitLogs.length - 1; i >= 0; i--) {
      const day = habitLogs[i]
      if (day >= prevDay) continue // anchor itself / future duplicates
      const diff = Math.round(
        (new Date(prevDay).getTime() - new Date(day).getTime()) / (1000 * 60 * 60 * 24),
      )
      if (diff === 1) {
        current++
        prevDay = day
      } else if (diff > 1) {
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

  // FIX: rapid double-clicks used to fire /earn-xp twice for one completion.
  // Keyed per habit+day to mirror the server's per-day dedupe policy.
  const xpAwardedRef = useRef<Set<string>>(new Set())
  const awardXpOnce = (key: string, amount: number, reason: string) => {
    if (xpAwardedRef.current.has(key)) return
    xpAwardedRef.current.add(key)
    apiPost('/api/rise/earn-xp', { amount, reason }).catch(() => {})
  }

  // Form state
  const [formName, setFormName] = useState('')
  const [formIcon, setFormIcon] = useState('water')
  const [formColor, setFormColor] = useState('#06b6d4')
  const [formFrequency, setFormFrequency] = useState<Habit['frequency']>('daily')
  const [formTarget, setFormTarget] = useState('1')

  const todayStr = getTodayStr()

  const { refreshKey } = useDataRefresh()
  const fetchHabits = useCallback(async () => {

    try {
      const res = await apiFetch(`/api/rise/habits`)
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
  }, [])

  /* ---- Fetch on mount + when data changes (debounced) ---- */
  useEffect(() => {
    fetchHabits()
  }, [fetchHabits, refreshKey])

  /* ---- Re-fetch on day rollover so habits show fresh "today" state ---- */
  useEffect(() => {
    const handler = () => fetchHabits()
    window.addEventListener('rise:day-changed', handler)
    return () => window.removeEventListener('rise:day-changed', handler)
  }, [fetchHabits])

  /* ---- Toggle today's habit ---- */
  const toggleTodayHabit = useCallback(
    async (habitId: string) => {
      const existingLog = logs.find((l) => l.habitId === habitId && String(l.date).slice(0, 10) === todayStr)
      const newCompleted = existingLog ? !existingLog.completed : true

      // Flash animation
      setFlashCard(habitId)
      setTimeout(() => setFlashCard(null), 400)

      // OPTIMISTIC: update the log locally first — the checkbox flips in the
      // same frame; rollback if the server rejects the change.
      const revertLogs = () => {
        setLogs((prev) => {
          if (existingLog) {
            return prev.map((l) =>
              l.habitId === habitId && String(l.date).slice(0, 10) === todayStr
                ? { ...l, completed: existingLog.completed, count: existingLog.count }
                : l
            )
          }
          return prev.filter((l) => !(l.habitId === habitId && String(l.date).slice(0, 10) === todayStr))
        })
      }
      setLogs((prev) => {
        if (existingLog) {
          return prev.map((l) =>
            l.habitId === habitId && String(l.date).slice(0, 10) === todayStr
              ? { ...l, completed: newCompleted }
              : l
          )
        }
        return [...prev, { habitId, date: todayStr, completed: true, count: 1 }]
      })
      // Instant dashboard KPI bump (same frame as the checkbox)
      window.dispatchEvent(new CustomEvent('rise:instant-update', {
        detail: { type: 'habit', deltaCompleted: newCompleted ? 1 : -1 },
      }))

      try {
        const res = await apiPut('/api/rise/habits', {
          habitId,
          date: todayStr,
          completed: newCompleted,
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          revertLogs()
          window.dispatchEvent(new CustomEvent('rise:instant-update', {
            detail: { type: 'habit', deltaCompleted: newCompleted ? -1 : 1 },
          }))
          toastError('تحديث العادة', errData.error || errData.details || 'حاول مرة أخرى')
          fetchHabits()
          return
        }
        // rise:data-changed (fired by apiPut) triggers the global refetch
        if (newCompleted) {
          playSound('habit-check')
          const habit = habits.find((h) => h.id === habitId)
          if (habit) {
            const streak = calcStreak(
              [...logs, { habitId, date: todayStr, completed: true, count: 1 }],
              habitId
            )
            notifyHabitComplete(habit.name, streak.current)
          }
          if (!existingLog) {
            awardXpOnce(`habit-done:${habitId}:${todayStr}`, habit?.xpReward || 15, `habit:${habitId}`)
          }
        }
      } catch {
        revertLogs()
        window.dispatchEvent(new CustomEvent('rise:instant-update', {
          detail: { type: 'habit', deltaCompleted: newCompleted ? -1 : 1 },
        }))
      }
    },
    [logs, todayStr, habits]
  )

  /* ---- Add habit ---- */
  async function handleAddHabit() {
    if (!formName.trim()) return
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    setSaving(true)
    try {
      const res = await apiPost('/api/rise/habits', {
          name: formName,
          icon: formIcon,
          color: formColor,
          frequency: formFrequency,
          targetCount: parseInt(formTarget) || 1,
        })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toastError('إضافة العادة', errData.error || errData.details || 'حاول مرة أخرى')
        return
      }

      // Check if response is an offline queued response
      const isOfflineQueued = res.headers.get('X-Offline-Queued') === 'true'
      if (isOfflineQueued) {
        setAddOpen(false)
        resetForm()
        playSound('save')
        toast.success('تمت إضافة العادة (سيتم المزامنة لاحقاً)')
        return
      }

      setAddOpen(false)
      resetForm()
      playSound('save')
      fetchHabits()
    } catch {
      toastError('إضافة العادة')
    } finally {
      setSaving(false)
    }
  }

  /* ---- Delete habit ---- */
  async function deleteHabit(id: string) {
    playSound('delete')
    try {
      const res = await apiDelete(`/api/rise/habits?id=${id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success('تم حذف العادة بنجاح')
    } catch (err) {
      // Will be handled by fetchHabits()
      toast.error('فشل حذف العادة', {
        description: err instanceof Error ? err.message : 'حاول مرة أخرى',
      })
    }
  }

  function resetForm() {
    setFormName('')
    setFormIcon('water')
    setFormColor('#06b6d4')
    setFormFrequency('daily')
    setFormTarget('1')
  }

  /* ---- Toggle reminder time ---- */
  const handleToggleReminder = useCallback(async (habitId: string, time: string | null) => {
    try {
      const res = await apiPut('/api/rise/habits', { id: habitId, reminderTime: time })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error('فشل تحديث التذكير', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        return
      }
      setHabits((prev) =>
        prev.map((h) => (h.id === habitId ? { ...h, reminderTime: time } : h))
      )
      if (time) {
        toast.success('تم تعيين التذكير', { description: `الساعة ${time}` })
      } else {
        toast('تم إزالة التذكير')
      }
    } catch {
      toast.error('فشل الاتصال بالخادم')
    }
  }, [])

  /* ---- Stats ---- */
  const stats = useMemo((): { total: number; todayRate: number; longestStreak: number; currentStreak: number; bestHabit: Habit | null; bestRate: number } => {
    const total = habits.length
    const todayLogs = logs.filter((l) => String(l.date).slice(0, 10) === todayStr)
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
      <div className="space-y-6">
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
      <div className="space-y-5">
        {/* ── Toolbar (the shell header already shows the module title) ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="pill pill-lime shrink-0">
              <Sparkles className="w-3 h-3" />
              <span className="num" dir="ltr">{habits.length}</span> عادة نشطة
            </span>
            {stats.currentStreak > 0 && (
              <span className="pill bg-destructive/10 text-destructive shrink-0">
                <Flame className="w-3 h-3" />
                <span className="num" dir="ltr">{stats.currentStreak}</span> يوم متتالي
              </span>
            )}
          </div>

          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm() }}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-xl bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 shadow-lg shadow-forest/20 dark:shadow-lime/20 shrink-0"
              >
                <Plus className="w-4 h-4 me-1.5" />
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
                <NeoField label="اسم العادة" icon={PencilLine} required>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: قراءة 30 دقيقة"
                    className="neo-input text-right h-11"
                  />
                </NeoField>
                <NeoField label="الأيقونة" hint="اختر رمزاً احترافياً — يلوّن العادة تلقائياً">
                  <div className="grid grid-cols-8 sm:grid-cols-11 gap-1.5 p-1.5 rounded-2xl bg-muted/40 max-h-36 overflow-y-auto">
                    {HABIT_ICON_PRESETS.map((p) => {
                      const active = formIcon === p.key
                      return (
                        <button
                          key={p.key}
                          type="button"
                          title={p.label}
                          aria-label={p.label}
                          onClick={() => { setFormIcon(p.key); setFormColor(p.color) }}
                          className={cn(
                            'flex items-center justify-center rounded-xl transition-all duration-150',
                            active ? 'scale-110 shadow-md' : 'hover:scale-105'
                          )}
                          style={{
                            width: 34,
                            height: 34,
                            backgroundColor: active ? p.color : `${p.color}1A`,
                            color: active ? '#fff' : p.color,
                            ...(active ? { boxShadow: `0 0 0 2px ${p.color}66` } : {}),
                          }}
                        >
                          <HabitGlyph icon={p.key} size={19} />
                        </button>
                      )
                    })}
                  </div>
                </NeoField>
                <NeoField label="اللون">
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
                </NeoField>
                <div className="grid grid-cols-2 gap-3">
                  <NeoField label="التكرار" icon={Repeat}>
                    <Select
                      value={formFrequency}
                      onValueChange={(v) => setFormFrequency(v as Habit['frequency'])}
                    >
                      <SelectTrigger className="neo-input text-right h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">يومياً</SelectItem>
                        <SelectItem value="weekdays">أيام الأسبوع</SelectItem>
                        <SelectItem value="weekends">نهاية الأسبوع</SelectItem>
                        <SelectItem value="custom">مخصص</SelectItem>
                      </SelectContent>
                    </Select>
                  </NeoField>
                  <NeoField label="الهدف اليومي" icon={Target} hint="كم مرة في اليوم؟">
                    <Input
                      type="number"
                      min="1"
                      value={formTarget}
                      onChange={(e) => setFormTarget(e.target.value)}
                      className="neo-input text-right h-11"
                    />
                  </NeoField>
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
                  className="rounded-xl bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin me-1.5" />
                  ) : (
                    <Plus className="w-4 h-4 me-1.5" />
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
                  <span className="text-2xl font-black text-gradient-forest num" dir="ltr">{stats.todayRate}</span>
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
                    <span className="num" dir="ltr">{logs.filter((l) => String(l.date).slice(0, 10) === todayStr && l.completed).length}</span> من{' '}
                    <span className="num" dir="ltr">{habits.length}</span> عادة مكتملة
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  {stats.todayRate >= 80 ? '🌟 أداء ممتاز! استمر على هذا النحو' : stats.todayRate >= 50 ? '💪 جيد! واصل التحسن' : stats.todayRate >= 25 ? '🌱 لا بأس، كل خطوة مهمة' : '✨ ابدأ بإتمام عادة واحدة'}
                </p>
                {/* Best streak chip — merged into the hero (was a separate card) */}
                {stats.longestStreak > 0 && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/25">
                    <motion.span
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ type: 'tween', duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                      className="inline-flex"
                    >
                      <RiseIcon glyph="trophy" hue="amber" size="sm" className="!rounded-lg" />
                    </motion.span>
                    <span className="text-xs font-bold text-gradient-gold">
                      أفضل سلسلة: <span className="num" dir="ltr">{stats.longestStreak}</span> يوم
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Statistics ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            {
              icon: Target, well: 'bg-emerald-accent/10', iconColor: 'text-emerald-accent',
              value: <span className="num" dir="ltr">{stats.total}</span>, label: 'إجمالي العادات', delay: 0,
            },
            {
              icon: Zap, well: 'bg-gold/10', iconColor: 'text-gold',
              value: <span className="num" dir="ltr">{stats.todayRate}%</span>, label: 'إنجاز اليوم', delay: 0.06,
            },
            {
              icon: Flame, well: 'bg-forest/10', iconColor: 'text-forest dark:text-emerald-accent',
              value: <span className="num" dir="ltr">{stats.currentStreak}</span>, label: 'سلسلة حالية', delay: 0.12,
            },
            {
              icon: Crown, well: 'bg-gold-light/20', iconColor: 'text-gold',
              value: stats.bestHabit ? (
                <span className="truncate max-w-[110px] inline-flex items-center gap-1.5 align-middle">
                  <HabitIcon icon={stats.bestHabit.icon} color={stats.bestHabit.color} size={20} />
                  <span className="truncate">{stats.bestHabit.name}</span>
                </span>
              ) : '—',
              label: 'أفضل عادة', delay: 0.18,
            },
          ] as const).map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: s.delay }}
            >
              <Card className="rounded-2xl border-0 shadow-sm glass h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.well)}>
                    <s.icon className={cn('w-4 h-4', s.iconColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-tight">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ── Today's Habits ── */}
        {habits.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-emerald-accent" />
              <h2 className="text-sm font-semibold">عادات اليوم</h2>
              <span className="pill pill-success">
                <span className="num" dir="ltr">
                  {logs.filter((l) => String(l.date).slice(0, 10) === todayStr && l.completed).length} / {habits.length}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <AnimatePresence mode="popLayout">
                {habits.map((habit, index) => {
                  const todayLog = logs.find(
                    (l) => l.habitId === habit.id && String(l.date).slice(0, 10) === todayStr
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
                          'group rounded-3xl border-0 overflow-hidden transition-all duration-300 bg-card',
                          isCompleted
                            ? 'shadow-md ring-1'
                            : 'shadow-[0_8px_20px_-6px_rgba(23,42,33,0.12),0_2px_6px_-2px_rgba(23,42,33,0.06)]'
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
                              className="absolute inset-0 z-10 pointer-events-none rounded-3xl"
                              style={{ backgroundColor: isCompleted ? habit.color : 'transparent' }}
                            />
                          )}
                        </AnimatePresence>

                        {/* ── Gradient header (card style: image zone + icon tile) ── */}
                        <div
                          className="relative h-[74px] shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${habit.color}33, ${habit.color}12 55%, transparent)`,
                          }}
                        >
                          <div
                            className="absolute -bottom-7 -start-5 w-20 h-20 rounded-full pointer-events-none"
                            style={{ backgroundColor: `${habit.color}14` }}
                          />
                          <div className="relative h-full px-3.5 pt-3 flex items-start justify-between">
                            <motion.span
                              whileHover={{ rotate: isCompleted ? 0 : 8, scale: 1.06 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                              className="inline-block"
                            >
                              <HabitIcon
                                icon={habit.icon}
                                color={habit.color}
                                size={46}
                                completed={isCompleted}
                              />
                            </motion.span>
                            <div className="flex items-center gap-0.5">
                              <ReminderBell habit={habit} onToggle={handleToggleReminder} />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      deleteHabit(habit.id)
                                    }}
                                    aria-label={`حذف ${habit.name}`}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[10px] px-2 py-1 rounded-lg">
                                  حذف العادة
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </div>

                        <CardContent className="p-3.5 pt-2.5 relative">
                          {/* Name + frequency subtitle */}
                          <p className="text-sm font-bold truncate">{habit.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {FREQUENCY_LABELS[habit.frequency]} · الهدف <span className="num" dir="ltr">{habit.targetCount}</span> يومياً
                          </p>

                          {/* Streak chip — tinted icon-box style */}
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <span
                              className="inline-flex items-center gap-1 px-2.5 h-7 rounded-xl transition-colors"
                              style={{ backgroundColor: `${habit.color}14`, color: habit.color }}
                            >
                              <motion.span
                                animate={streak.current > 3 ? { scale: [1, 1.25, 1] } : {}}
                                transition={{ type: 'tween', duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                                className="inline-flex"
                              >
                                <Flame className="w-3.5 h-3.5" />
                              </motion.span>
                              {streak.current > 0 ? (
                                <span className="text-[11px] font-bold">
                                  <span className="num" dir="ltr">{streak.current}</span> يوم
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold opacity-80">ابدأ سلسلتك</span>
                              )}
                            </span>
                            <span className="flex items-center gap-0.5 text-[10px] text-gold font-medium">
                              <Sparkles className="w-3 h-3" />
                              <span className="num" dir="ltr">+{habit.xpReward}</span>
                            </span>
                          </div>

                          {/* Toggle button with pulsing ring when completed */}
                          <div className="relative mt-2.5">
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

            <div className="space-y-4 max-h-96 overflow-y-auto ps-1">
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
                        <HabitIcon icon={habit.icon} color={habit.color} size={26} />
                        <span className="text-xs font-semibold">{habit.name}</span>
                        <div className="flex-1" />
                        <div className="flex items-center gap-1">
                          {calcStreak(logs, habit.id).current > 3 && (
                            <span className="text-xs">🔥</span>
                          )}
                          <Flame className="w-3 h-3" style={{ color: habit.color }} />
                          <span className="text-[10px] font-medium num" dir="ltr" style={{ color: habit.color }}>
                            {calcStreak(logs, habit.id).current}
                          </span>
                        </div>
                      </div>

                      {/* Heatmap grid: 7 rows (days) × 5 cols (weeks) */}
                      <div className="overflow-x-auto">
                        <div className="flex gap-0.5 min-w-fit">
                          {/* Day labels */}
                          <div className="flex flex-col gap-0.5 me-1.5">
                            {dayLabels.map((label, di) => (
                              <div
                                key={label}
                                className="w-7 text-[9px] text-muted-foreground/50 flex items-center justify-end pe-1"
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
                                      (l) => l.habitId === habit.id && String(l.date).slice(0, 10) === dayInWeek
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
            <RiseIcon glyph="habits" hue="lime" size="lg" lift className="mb-6" />
            <h3 className="text-lg font-semibold mb-2">ابدأ ببناء عاداتك</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              النجاح ليس حدثاً عابراً، بل هو نتيجة عادات يومية متكررة. أضف عادتك الأولى وابدأ
              رحلة التغيير!
            </p>
            <Button
              onClick={() => setAddOpen(true)}
              className="mt-6 rounded-xl bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 shadow-lg shadow-forest/20 dark:shadow-lime/20"
            >
              <Plus className="w-4 h-4 me-1.5" />
              أضف أول عادة
            </Button>
          </motion.div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default HabitsView// Force recompile: 1785702715
