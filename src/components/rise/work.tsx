'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase,
  Play,
  Square,
  Coffee,
  Clock,
  Zap,
  CheckCircle2,
  Circle,
  StickyNote,
  Trophy,
  TrendingUp,
  Loader2,
  Gauge,
  ListChecks,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost, apiPut } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { notifyWorkComplete } from '@/lib/notifications'
import { RiseIcon } from '@/components/rise/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

/* ────────────── Types ────────────── */

interface WorkSession {
  id: string
  title: string | null
  plannedMin: number
  activeMin: number
  breakMin: number
  breaksCount: number
  tasksCompleted: number
  qualityScore: number | null
  notes: string | null
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  startedAt: string
  completedAt: string | null
}

interface TaskOption {
  id: string
  title: string
  status: string
  priority: string
  xpReward: number
}

interface BreakLogEntry {
  start: string
  end: string
  min: number
}

type Phase = 'idle' | 'working' | 'break' | 'completed'

const STORAGE_KEY = 'rise-work-session-state'

/* ────────────── Helpers ────────────── */

function formatHM(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}س ${m}د`
  return `${m}د`
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function qualityLabel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'ممتاز', color: 'text-emerald-accent' }
  if (score >= 65) return { label: 'جيد جداً', color: 'text-forest' }
  if (score >= 45) return { label: 'مقبول', color: 'text-gold' }
  return { label: 'يحتاج تحسين', color: 'text-rose-accent' }
}

/* ────────────── Component ────────────── */

export default function WorkSessions() {
  const [history, setHistory] = useState<WorkSession[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)

  // Setup form
  const [titleInput, setTitleInput] = useState('')
  const [hoursInput, setHoursInput] = useState('2')
  const [minutesInput, setMinutesInput] = useState('0')

  // Live session state
  const [phase, setPhase] = useState<Phase>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [plannedMin, setPlannedMin] = useState(0)
  const [sessionTitle, setSessionTitle] = useState('')
  const [activeMs, setActiveMs] = useState(0)
  const [breakMs, setBreakMs] = useState(0)
  const [breaksLog, setBreaksLog] = useState<BreakLogEntry[]>([])
  const [phaseStart, setPhaseStart] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const [notes, setNotes] = useState('')

  // Tasks linked/completed during the session
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null)

  // Summary dialog
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summary, setSummary] = useState<{
    activeMin: number
    breakMin: number
    breaksCount: number
    tasksCompleted: number
    qualityScore: number
    xp: number
  } | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ─── Fetch history ─── */
  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rise/work')
      if (res.ok) {
        const json = await res.json()
        setHistory(json.sessions || [])
      }
    } catch {
      toast.error('فشل في تحميل سجل جلسات الشغل')
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  /* ─── Restore in-progress session on mount/refresh ─── */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return
      const s = JSON.parse(stored)
      setSessionId(s.sessionId)
      setPlannedMin(s.plannedMin)
      setSessionTitle(s.sessionTitle || '')
      setActiveMs(s.activeMs || 0)
      setBreakMs(s.breakMs || 0)
      setBreaksLog(s.breaksLog || [])
      setPhaseStart(s.phaseStart)
      setPhase(s.phase)
      setNotes(s.notes || '')
      setCompletedTaskIds(new Set(s.completedTaskIds || []))
    } catch { /* ignore */ }
  }, [])

  /* ─── Persist live session to localStorage ─── */
  useEffect(() => {
    if (phase === 'idle' || phase === 'completed') {
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId, plannedMin, sessionTitle, activeMs, breakMs,
        breaksLog, phaseStart, phase, notes,
        completedTaskIds: Array.from(completedTaskIds),
      }))
    } catch { /* ignore */ }
  }, [sessionId, plannedMin, sessionTitle, activeMs, breakMs, breaksLog, phaseStart, phase, notes, completedTaskIds])

  /* ─── Ticking clock while a phase is running ─── */
  useEffect(() => {
    if (phase === 'working' || phase === 'break') {
      intervalRef.current = setInterval(() => setNowTick(Date.now()), 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [phase])

  const liveActiveMs = phase === 'working' && phaseStart ? activeMs + (nowTick - phaseStart) : activeMs
  const liveBreakMs = phase === 'break' && phaseStart ? breakMs + (nowTick - phaseStart) : breakMs
  const liveActiveMin = Math.floor(liveActiveMs / 60000)
  const progressPct = plannedMin > 0 ? Math.min(100, Math.round((liveActiveMin / plannedMin) * 100)) : 0

  /* ─── Fetch eligible tasks for the checklist ─── */
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true)
    try {
      const res = await apiFetch('/api/rise/tasks')
      if (res.ok) {
        const data = await res.json()
        const eligible = (data.tasks || []).filter(
          (t: { status: string }) => t.status === 'in_progress' || t.status === 'todo'
        )
        setTaskOptions(eligible)
      }
    } catch {
      // ignore — checklist is optional
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  useEffect(() => {
    if (phase === 'working' || phase === 'break') fetchTasks()
  }, [phase, fetchTasks])

  /* ─── Start a new work session ─── */
  const handleStart = async () => {
    const h = Math.max(0, parseInt(hoursInput) || 0)
    const m = Math.max(0, parseInt(minutesInput) || 0)
    const total = h * 60 + m
    if (total < 1) {
      toast.error('حدد مدة الشغل المخطط لها')
      return
    }
    setSaving(true)
    try {
      const startedAt = new Date().toISOString()
      const res = await apiPost('/api/rise/work', {
        title: titleInput.trim() || null,
        plannedMin: total,
        startedAt,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error('فشل في بدء جلسة الشغل', { description: err.error })
        return
      }
      const session = await res.json()
      // FIX: apiFetch queues writes while offline and returns a fake
      // `{ success: true, offline: true }` response — such a "session" has
      // no real id, finalize would silently no-op, and the whole session
      // (plus its XP) was lost. Fail closed with a clear message instead.
      if (!session?.id || session?.offline) {
        toast.error('بدء جلسة العمل يتطلب اتصالاً بالإنترنت', {
          description: 'أعد المحاولة عند استعادة الاتصال',
        })
        return
      }
      setSessionId(session.id)
      setPlannedMin(total)
      setSessionTitle(titleInput.trim())
      setActiveMs(0)
      setBreakMs(0)
      setBreaksLog([])
      setNotes('')
      setCompletedTaskIds(new Set())
      setPhaseStart(Date.now())
      setNowTick(Date.now())
      setPhase('working')
      playSound('click')
      toast.success('بدأت جلسة الشغل 💼', { description: `الهدف: ${formatHM(total)}` })
    } catch {
      toast.error('فشل في بدء جلسة الشغل')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Toggle between working and break ─── */
  const handleToggleBreak = () => {
    const now = Date.now()
    if (phase === 'working') {
      setActiveMs((prev) => prev + (phaseStart ? now - phaseStart : 0))
      setPhaseStart(now)
      setPhase('break')
      playSound('toggle')
    } else if (phase === 'break') {
      const dur = phaseStart ? now - phaseStart : 0
      setBreakMs((prev) => prev + dur)
      setBreaksLog((prev) => [
        ...prev,
        { start: new Date(now - dur).toISOString(), end: new Date(now).toISOString(), min: Math.round(dur / 60000) },
      ])
      setPhaseStart(now)
      setPhase('working')
      playSound('toggle')
    }
  }

  /* ─── Mark a task done from within the session ─── */
  const handleToggleTask = async (task: TaskOption) => {
    if (completedTaskIds.has(task.id)) return
    setTogglingTaskId(task.id)
    try {
      const res = await apiPut('/api/rise/tasks', {
        id: task.id,
        status: 'done',
        completedAt: new Date().toISOString(),
      })
      if (!res.ok) {
        toast.error('فشل في تحديث المهمة')
        return
      }
      setCompletedTaskIds((prev) => new Set(prev).add(task.id))
      apiPost('/api/rise/earn-xp', { amount: task.xpReward || 10, reason: `task:${task.id}` }).catch(() => {})
      playSound('task-complete')
      toast.success('تم إنجاز المهمة ✅', { description: task.title })
    } catch {
      toast.error('فشل في تحديث المهمة')
    } finally {
      setTogglingTaskId(null)
    }
  }

  /* ─── End the session (completed or cancelled) ─── */
  const finalizeSession = async (finalStatus: 'completed' | 'cancelled') => {
    if (!sessionId) return
    const now = Date.now()
    let finalActiveMs = activeMs
    let finalBreakMs = breakMs
    let finalBreaksLog = breaksLog
    if (phase === 'working' && phaseStart) {
      finalActiveMs += now - phaseStart
    } else if (phase === 'break' && phaseStart) {
      const dur = now - phaseStart
      finalBreakMs += dur
      finalBreaksLog = [...breaksLog, { start: new Date(now - dur).toISOString(), end: new Date(now).toISOString(), min: Math.round(dur / 60000) }]
    }

    const finalActiveMin = Math.round(finalActiveMs / 60000)
    const finalBreakMin = Math.round(finalBreakMs / 60000)
    const taskIds = Array.from(completedTaskIds)

    setSaving(true)
    try {
      const res = await apiPut('/api/rise/work', {
        id: sessionId,
        status: finalStatus,
        activeMin: finalActiveMin,
        breakMin: finalBreakMin,
        breaksCount: finalBreaksLog.length,
        breaksLog: finalBreaksLog,
        taskIds,
        notes,
        completedAt: new Date().toISOString(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error('فشل في حفظ جلسة الشغل', { description: err.error })
        return
      }
      const saved = await res.json()

      if (finalStatus === 'completed') {
        const xp = Math.min(300, Math.round(finalActiveMin * 1.5) + taskIds.length * 5)
        const quality = saved.qualityScore ?? 0
        notifyWorkComplete(finalActiveMin, quality, xp)
        apiPost('/api/rise/earn-xp', { amount: xp, reason: `work:${plannedMin}min` }).catch(() => {})
        playSound('achievement')
        setSummary({
          activeMin: finalActiveMin,
          breakMin: finalBreakMin,
          breaksCount: finalBreaksLog.length,
          tasksCompleted: taskIds.length,
          qualityScore: quality,
          xp,
        })
        setSummaryOpen(true)
      } else {
        toast('تم إلغاء جلسة الشغل')
      }

      // Reset live state
      setPhase('idle')
      setSessionId(null)
      setPhaseStart(null)
      setActiveMs(0)
      setBreakMs(0)
      setBreaksLog([])
      setNotes('')
      setCompletedTaskIds(new Set())
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      fetchHistory()
    } catch {
      toast.error('فشل في حفظ جلسة الشغل')
    } finally {
      setSaving(false)
    }
  }

  const totalCompletedTasks = completedTaskIds.size

  /* ────────────── Render ────────────── */

  if (phase === 'idle') {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <RiseIcon glyph="work" hue="forest" size="md" lift />
          <div>
            <h1 className="text-2xl font-bold">الشغل</h1>
            <p className="text-sm text-muted-foreground">افتح جلسة شغل طويلة، تابع وقتك واستراحاتك، وشوف جودة شغلك في الآخر</p>
          </div>
        </div>

        <div className="neo-card card-lift p-5">
          <h3 className="text-lg font-bold mb-4">ابدأ جلسة شغل جديدة</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">عنوان الجلسة (اختياري)</label>
              <Input
                placeholder="مثال: تصميم واجهة تطبيق وصال"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">ساعات</label>
                <Input type="number" dir="ltr" min={0} max={23} value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">دقائق</label>
                <Input type="number" dir="ltr" min={0} max={59} value={minutesInput} onChange={(e) => setMinutesInput(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 5, 8].map((h) => (
                <Button
                  key={h}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border bg-card hover:bg-secondary"
                  onClick={() => { setHoursInput(String(h)); setMinutesInput('0') }}
                >
                  {h} {h === 1 ? 'ساعة' : 'ساعات'}
                </Button>
              ))}
            </div>
            <Button className="w-full gap-2 bg-forest text-paper-soft dark:bg-lime dark:text-ink" size="lg" onClick={handleStart} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              ابدأ الشغل
            </Button>
          </div>
        </div>

        <WorkHistory history={history} loading={loadingHistory} />
      </div>
    )
  }

  /* ─── Running / break screen ─── */
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className={cn('neo-card card-lift border-2 transition-colors', phase === 'break' ? 'border-gold/40 bg-gold/5' : 'border-forest/30 bg-forest/5')}>
        <div className="p-6 space-y-6">
          <div className="text-center space-y-2">
            <span className={cn('pill', phase === 'break' ? 'bg-gold/15 text-gold' : 'bg-forest/15 text-forest dark:text-lime')}>
              {phase === 'break' ? <Coffee className="w-3.5 h-3.5" /> : <Briefcase className="w-3.5 h-3.5" />}
              {phase === 'break' ? 'في استراحة' : 'شغل جاري'}
            </span>
            {sessionTitle && <p className="text-sm text-muted-foreground">{sessionTitle}</p>}
          </div>

          <div className="text-center">
            <div className="num text-5xl font-bold tracking-tight" dir="ltr">
              {formatClock(liveActiveMs)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              من أصل {formatHM(plannedMin)} مخططة
            </p>
          </div>

          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-l from-forest/80 to-forest dark:from-lime/80 dark:to-lime" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-card/60 py-2.5">
              <div className="text-lg font-semibold">{formatHM(Math.floor(liveBreakMs / 60000))}</div>
              <div className="text-[11px] text-muted-foreground">استراحة</div>
            </div>
            <div className="rounded-xl bg-card/60 py-2.5">
              <div className="num text-lg font-semibold" dir="ltr">{breaksLog.length}</div>
              <div className="text-[11px] text-muted-foreground">عدد الاستراحات</div>
            </div>
            <div className="rounded-xl bg-card/60 py-2.5">
              <div className="num text-lg font-semibold" dir="ltr">{totalCompletedTasks}</div>
              <div className="text-[11px] text-muted-foreground">مهام أُنجزت</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant={phase === 'break' ? 'default' : 'outline'}
              className={cn('flex-1 gap-2', phase === 'break' ? 'bg-forest text-paper-soft dark:bg-lime dark:text-ink' : 'border-border bg-card hover:bg-secondary')}
              onClick={handleToggleBreak}
            >
              {phase === 'break' ? <Play className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
              {phase === 'break' ? 'متابعة الشغل' : 'خد استراحة'}
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => finalizeSession('completed')}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              إنهاء الجلسة
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => finalizeSession('cancelled')} disabled={saving}>
            إلغاء الجلسة بدون حفظ التقييم
          </Button>
        </div>
      </div>

      {/* Task checklist */}
      <div className="neo-card card-lift p-5">
        <h3 className="text-base font-bold flex items-center gap-2.5 mb-4">
          <span className="icon-well h-7 w-7 iw-forest"><ListChecks className="h-4 w-4" /></span>
          مهام أنجزتها في الجلسة دي
        </h3>
        <div>
          {loadingTasks ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : taskOptions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="icon-well h-12 w-12 bg-secondary text-muted-foreground/50"><ListChecks className="h-5 w-5" /></span>
              <p className="text-sm text-muted-foreground">مفيش مهام مفتوحة دلوقتي — أضف مهام من وحدة المهام وهتظهر هنا</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {taskOptions.map((task) => {
                const done = completedTaskIds.has(task.id)
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleToggleTask(task)}
                    disabled={done || togglingTaskId === task.id}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-start transition-colors',
                      done ? 'bg-forest/10 text-forest dark:bg-lime/10 dark:text-lime' : 'hover:bg-muted/60'
                    )}
                  >
                    {togglingTaskId === task.id ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : done ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn('flex-1', done && 'line-through opacity-70')}>{task.title}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="neo-card card-lift p-5">
        <h3 className="text-base font-bold flex items-center gap-2.5 mb-4">
          <span className="icon-well h-7 w-7 iw-amber"><StickyNote className="h-4 w-4" /></span>
          ملاحظات عن الشغل
        </h3>
        <div>
          <Textarea
            placeholder="إيه اللي اتعمل في الجلسة دي؟ عوائق؟ حاجات لازم تكمل بعدين؟"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>

      <WorkHistory history={history} loading={loadingHistory} />

      {/* Summary dialog */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-gold" />
              ملخص جلسة الشغل
            </DialogTitle>
            <DialogDescription>كده خلصت — شوف تقييم الجلسة</DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <div className={cn('num text-4xl font-bold', qualityLabel(summary.qualityScore).color)} dir="ltr">
                  {summary.qualityScore}٪
                </div>
                <div className={cn('text-sm font-medium', qualityLabel(summary.qualityScore).color)}>
                  {qualityLabel(summary.qualityScore).label}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center text-sm">
                <div className="rounded-lg bg-muted/50 py-2.5">
                  <div className="font-semibold">{formatHM(summary.activeMin)}</div>
                  <div className="text-[11px] text-muted-foreground">شغل فعلي</div>
                </div>
                <div className="rounded-lg bg-muted/50 py-2.5">
                  <div className="font-semibold">{formatHM(summary.breakMin)}</div>
                  <div className="text-[11px] text-muted-foreground">استراحات ({summary.breaksCount})</div>
                </div>
                <div className="rounded-lg bg-muted/50 py-2.5">
                  <div className="num font-semibold" dir="ltr">{summary.tasksCompleted}</div>
                  <div className="text-[11px] text-muted-foreground">مهام مُنجزة</div>
                </div>
                <div className="rounded-lg bg-muted/50 py-2.5 flex items-center justify-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-gold" />
                  <span className="num font-semibold" dir="ltr">+{summary.xp}</span>
                </div>
              </div>
              <Button className="w-full bg-forest text-paper-soft dark:bg-lime dark:text-ink" onClick={() => setSummaryOpen(false)}>تمام</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ────────────── History list ────────────── */

function WorkHistory({ history, loading }: { history: WorkSession[]; loading: boolean }) {
  const completed = useMemo(() => history.filter((s) => s.status === 'completed'), [history])

  if (loading) {
    return (
      <div className="neo-card p-5 space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (completed.length === 0) return null

  const avgQuality = Math.round(
    completed.reduce((sum, s) => sum + (s.qualityScore ?? 0), 0) / completed.length
  )
  const totalActiveMin = completed.reduce((sum, s) => sum + s.activeMin, 0)

  return (
    <div className="neo-card card-lift p-5">
      <h3 className="text-base font-bold flex items-center gap-2.5 mb-4">
        <span className="icon-well h-7 w-7 bg-secondary text-muted-foreground"><History className="h-4 w-4" /></span>
        سجل جلسات الشغل
      </h3>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center text-sm pb-2 border-b border-border/50">
          <div>
            <div className="font-semibold flex items-center justify-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-forest" /><span className="num" dir="ltr">{completed.length}</span></div>
            <div className="text-[11px] text-muted-foreground">جلسات</div>
          </div>
          <div>
            <div className="font-semibold">{formatHM(totalActiveMin)}</div>
            <div className="text-[11px] text-muted-foreground">إجمالي الشغل</div>
          </div>
          <div>
            <div className="font-semibold flex items-center justify-center gap-1"><Gauge className="w-3.5 h-3.5 text-gold" /><span className="num" dir="ltr">{avgQuality}٪</span></div>
            <div className="text-[11px] text-muted-foreground">متوسط الجودة</div>
          </div>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          <AnimatePresence initial={false}>
            {completed.slice(0, 15).map((s) => {
              const q = qualityLabel(s.qualityScore ?? 0)
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm transition-shadow hover:shadow-lift"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.title || 'جلسة شغل'}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {formatHM(s.activeMin)} شغل · {s.breaksCount} استراحة · {s.tasksCompleted} مهمة
                    </div>
                  </div>
                  <span className={cn('pill shrink-0', q.color)}>
                    <span className="num" dir="ltr">{s.qualityScore}٪</span>
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
