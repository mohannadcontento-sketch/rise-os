'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePersistedData } from '@/hooks/use-persisted-data'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  Plus,
  ChevronDown,
  ChevronUp,
  Trophy,
  TrendingUp,
  Calendar,
  Flame,
  Eye,
  Sparkles,
  Trash2,
  CheckCircle2,
  Circle,
  Loader2,
  Rocket,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
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
import { cn } from '@/lib/utils'
import { apiFetch, apiDelete, apiPost, apiPut } from '@/lib/api-fetch'
import { playSound } from '@/lib/sounds'
import { toast } from 'sonner'

/* ────────────── Types ────────────── */

interface Milestone {
  id: string
  title: string
  completed: boolean
  order: number
}

interface Goal {
  id: string
  title: string
  vision: string
  why: string
  type: 'annual' | 'quarterly' | 'monthly' | 'weekly'
  progress: number
  status: string
  deadline: string
  milestones: Milestone[]
}

interface GoalsResponse {
  goals: Goal[]
}

const TYPE_LABELS: Record<Goal['type'], string> = {
  annual: 'سنوي',
  quarterly: 'ربع سنوي',
  monthly: 'شهري',
  weekly: 'أسبوعي',
}

const TYPE_COLORS: Record<Goal['type'], string> = {
  annual: 'bg-gold/15 text-gold border-gold/25',
  quarterly: 'bg-emerald-accent/15 text-emerald-accent border-emerald-accent/25',
  monthly: 'bg-forest/15 text-forest border-forest/25',
  weekly: 'bg-forest-light/15 text-forest-light border-forest-light/25',
}

const TYPE_GRADIENT_OVERLAYS: Record<Goal['type'], string> = {
  annual: 'from-gold/8 via-gold/3 to-transparent',
  quarterly: 'from-emerald-accent/8 via-emerald-accent/3 to-transparent',
  monthly: 'from-forest/8 via-forest/3 to-transparent',
  weekly: 'from-chart-4/8 via-chart-4/3 to-transparent',
}

const TYPE_ICONS: Record<Goal['type'], string> = {
  annual: '🏆',
  quarterly: '📅',
  monthly: '🎯',
  weekly: '⚡',
}

const TYPE_GRADIENT_STOPS: Record<Goal['type'], { from: string; to: string }> = {
  annual: { from: 'oklch(0.78 0.12 85)', to: 'oklch(0.65 0.08 85)' },
  quarterly: { from: 'oklch(0.55 0.14 163)', to: 'oklch(0.35 0.10 160)' },
  monthly: { from: 'oklch(0.45 0.10 200)', to: 'oklch(0.35 0.08 200)' },
  weekly: { from: 'oklch(0.65 0.20 310)', to: 'oklch(0.55 0.15 310)' },
}

/* ────────────── Component ────────────── */

export function GoalsView() {
  const [goals, setGoals, , getGoalsVersion] = usePersistedData<Goal[]>('goals', [])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formVision, setFormVision] = useState('')
  const [formWhy, setFormWhy] = useState('')
  const [formType, setFormType] = useState<Goal['type']>('monthly')
  const [formDeadline, setFormDeadline] = useState('')


  /* ---- Fetch ---- */
  const fetchGoals = useCallback(async () => {
    const versionAtStart = getGoalsVersion()
    try {
      const res = await apiFetch('/api/rise/goals')
      if (res.ok) {
        const data: GoalsResponse = await res.json()
        // A local mutation (add goal, toggle milestone) while this was in
        // flight means the response is stale — don't clobber the newer state.
        if (getGoalsVersion() !== versionAtStart) return
        // Ensure goals is always an array, and each goal has a milestones array
        const safeGoals = (Array.isArray(data.goals) ? data.goals : []).map((g: Goal) => ({
          ...g,
          milestones: Array.isArray(g.milestones) ? g.milestones : [],
        }))
        setGoals(safeGoals)
      }
    } catch {
      // Use empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  /* ---- Filtered goals ---- */
  const filteredGoals = useMemo(() => {
    if (activeType === 'all') return goals
    return goals.filter((g) => g.type === activeType)
  }, [goals, activeType])

  /* ---- Stats ---- */
  const stats = useMemo(() => {
    const total = goals.length
    const completed = goals.filter((g) => g.status === 'completed').length
    const avgProgress =
      total > 0 ? Math.round(goals.reduce((s, g) => s + (typeof g.progress === 'number' ? g.progress : 0), 0) / total) : 0
    return { total, completed, avgProgress }
  }, [goals])

  /* ---- Toggle milestone ---- */
  async function toggleMilestone(goalId: string, milestoneId: string) {
    // Check if this toggle will complete the goal
    const goal = goals.find((g) => g.id === goalId)
    let willComplete = false
    if (goal) {
      const milestones = goal.milestones || []
      const ms = milestones.find((m) => m.id === milestoneId)
      if (ms && !ms.completed) {
        const completedCount = milestones.filter((m) => m.completed).length + 1
        willComplete = milestones.length > 0 && completedCount === milestones.length
      }
    }
    if (willComplete) playSound('complete')

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g
        const updatedMilestones = g.milestones.map((m) =>
          m.id === milestoneId ? { ...m, completed: !m.completed } : m
        )
        const completedCount = updatedMilestones.filter((m) => m.completed).length
        const progress =
          updatedMilestones.length > 0
            ? Math.round((completedCount / updatedMilestones.length) * 100)
            : 0
        // Mirror the backend: all milestones done → goal auto-completes;
        // unchecking one after that reopens it.
        let status = g.status
        if (updatedMilestones.length > 0 && completedCount === updatedMilestones.length) {
          status = 'completed'
        } else if (g.status === 'completed') {
          status = 'active'
        }
        return { ...g, milestones: updatedMilestones, progress, status }
      })
    )

    try {
      const goal = goals.find((g) => g.id === goalId)
      if (!goal) return
      const ms = (goal.milestones || []).find((m) => m.id === milestoneId)
      if (!ms) return
      const res = await apiPut('/api/rise/goals', {
          id: goalId,
          milestoneId,
          completed: !ms.completed,
        })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        // Revert on error
        setGoals((prev) =>
          prev.map((g) => {
            if (g.id !== goalId) return g
            const reverted = g.milestones.map((m) =>
              m.id === milestoneId ? { ...m, completed: !m.completed } : m
            )
            const completedCount = reverted.filter((m) => m.completed).length
            const progress =
              reverted.length > 0 ? Math.round((completedCount / reverted.length) * 100) : 0
            return { ...g, milestones: reverted, progress }
          })
        )
        toast.error('فشل تحديث الهدف', { description: errData.error || errData.details || 'حاول مرة أخرى' })
      }
    } catch {
      // Revert on error
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalId) return g
          const reverted = g.milestones.map((m) =>
            m.id === milestoneId ? { ...m, completed: !m.completed } : m
          )
          const completedCount = reverted.filter((m) => m.completed).length
          const progress =
            reverted.length > 0 ? Math.round((completedCount / reverted.length) * 100) : 0
          return { ...g, milestones: reverted, progress }
        })
      )
    }
  }

  /* ---- Add milestone ----
   * There was previously no way at all to add a milestone (no input, no API
   * call) — progress is entirely driven by milestone completion, so goals
   * could never move past 0% or be marked complete except by editing the
   * database directly. */
  async function addMilestone(goalId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    const tempId = `temp-${Date.now()}`
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, milestones: [...(g.milestones || []), { id: tempId, title: trimmed, completed: false, order: (g.milestones || []).length }] }
          : g
      )
    )
    try {
      const res = await apiPut('/api/rise/goals', { id: goalId, newMilestoneTitle: trimmed })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: (g.milestones || []).filter((m) => m.id !== tempId) } : g)))
        toast.error('فشل في إضافة المعلم', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        return
      }
      const updatedGoal = await res.json().catch(() => null)
      if (updatedGoal && updatedGoal.id) {
        setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, ...updatedGoal, milestones: updatedGoal.milestones || [] } : g)))
      }
    } catch {
      setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: (g.milestones || []).filter((m) => m.id !== tempId) } : g)))
      toast.error('فشل في إضافة المعلم')
    }
  }

  /* ---- Manually mark a goal complete / reopen it ----
   * Goals without milestones had no way to ever reach "completed" status —
   * there was no button or control for it anywhere in the UI. */
  async function toggleGoalComplete(goalId: string) {
    const goal = goals.find((g) => g.id === goalId)
    if (!goal) return
    const willComplete = goal.status !== 'completed'
    if (willComplete) playSound('complete')
    const prevStatus = goal.status
    const prevProgress = goal.progress
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, status: willComplete ? 'completed' : 'active', progress: willComplete ? 100 : g.progress }
          : g
      )
    )
    try {
      const res = await apiPut('/api/rise/goals', {
        id: goalId,
        status: willComplete ? 'completed' : 'active',
        progress: willComplete ? 100 : prevProgress,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, status: prevStatus, progress: prevProgress } : g)))
        toast.error('فشل تحديث الهدف', { description: errData.error || errData.details || 'حاول مرة أخرى' })
      }
    } catch {
      setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, status: prevStatus, progress: prevProgress } : g)))
      toast.error('فشل تحديث الهدف')
    }
  }

  /* ---- Add goal ---- */
  async function handleAddGoal() {
    if (!formTitle.trim()) return
    setSaving(true)
    try {
      const res = await apiPost('/api/rise/goals', {
          title: formTitle,
          vision: formVision,
          why: formWhy,
          type: formType,
          deadline: formDeadline,
        })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error('فشل في إضافة الهدف', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        return
      }

      // Optimistic: immediately add the new goal from server response
      const newGoal = await res.json().catch(() => null)
      if (newGoal) {
        setGoals(prev => [newGoal, ...prev])
      }
      setAddOpen(false)
      resetForm()
      playSound('save')
      toast.success('تم إضافة الهدف بنجاح')
    } catch {
      toast.error('فشل في إضافة الهدف')
    } finally {
      setSaving(false)
    }
  }

  /* ---- Delete goal ---- */
  async function deleteGoal(id: string) {
    playSound('delete')
    const prev = [...goals]
    setGoals((p) => p.filter((g) => g.id !== id))
    try {
      const res = await apiDelete(`/api/rise/goals?id=${id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success('تم حذف الهدف بنجاح')
    } catch (err) {
      setGoals(prev)
      toast.error('فشل حذف الهدف', {
        description: err instanceof Error ? err.message : 'حاول مرة أخرى',
      })
    }
  }

  function resetForm() {
    setFormTitle('')
    setFormVision('')
    setFormWhy('')
    setFormType('monthly')
    setFormDeadline('')
  }

  /* ---- Helpers ---- */
  function formatDate(dateStr: string) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function getDeadlineInfo(deadline: string) {
    if (!deadline) return null
    const now = new Date()
    const end = new Date(deadline)
    const diffMs = end.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { text: 'منتهي', urgent: true }
    if (diffDays === 0) return { text: 'اليوم!', urgent: true }
    if (diffDays <= 7) return { text: `${diffDays} أيام متبقية`, urgent: true }
    return { text: `${diffDays} يوم متبقي`, urgent: false }
  }

  /* ──────────── Render ──────────── */

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6 p-4 md:p-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-lg">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">الأهداف</h1>
              <p className="text-xs text-muted-foreground">حدد أهدافك وتابع تقدمك نحو القمة</p>
            </div>
          </div>

          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm() }}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-xl bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg shadow-emerald-accent/20"
              >
                <Plus className="w-4 h-4 ml-1.5" />
                هدف جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl backdrop-blur-xl" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-right">إضافة هدف جديد</DialogTitle>
                <DialogDescription className="text-right">
                  حدد هدفك ورؤيتك لتحقيق النجاح
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-right text-sm font-medium">عنوان الهدف</Label>
                  <Input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="مثال: إتمام دورة البرمجة"
                    className="rounded-xl text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-right text-sm font-medium">الرؤية</Label>
                  <Textarea
                    value={formVision}
                    onChange={(e) => setFormVision(e.target.value)}
                    placeholder="كيف ستبدو حياتك عند تحقيق هذا الهدف؟"
                    className="rounded-xl text-right min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-right text-sm font-medium">لماذا؟</Label>
                  <Textarea
                    value={formWhy}
                    onChange={(e) => setFormWhy(e.target.value)}
                    placeholder="ما الدافع الحقيقي وراء هذا الهدف؟"
                    className="rounded-xl text-right min-h-[80px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-right text-sm font-medium">النوع</Label>
                    <Select
                      value={formType}
                      onValueChange={(v) => setFormType(v as Goal['type'])}
                    >
                      <SelectTrigger className="rounded-xl text-right">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">سنوي</SelectItem>
                        <SelectItem value="quarterly">ربع سنوي</SelectItem>
                        <SelectItem value="monthly">شهري</SelectItem>
                        <SelectItem value="weekly">أسبوعي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-right text-sm font-medium">الموعد النهائي</Label>
                    <Input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
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
                  onClick={handleAddGoal}
                  disabled={!formTitle.trim() || saving}
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

        {/* ── Statistics ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="rounded-2xl border-0 shadow-sm glass">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-accent/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-emerald-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">إجمالي الأهداف</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <Card className="rounded-2xl border-0 shadow-sm glass">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground">مكتمل</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16 }}
          >
            <Card className="rounded-2xl border-0 shadow-sm glass">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-forest/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-forest" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.avgProgress}%</p>
                  <p className="text-xs text-muted-foreground">متوسط التقدم</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Vision Board ── */}
        {filteredGoals.filter(g => g.vision).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-accent" />
              <h2 className="text-sm font-semibold">لوحة الرؤية</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredGoals.filter(g => g.vision).slice(0, 3).map((goal, i) => (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className={cn('premium-card rounded-2xl p-4 relative overflow-hidden')}
                >
                  <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', TYPE_GRADIENT_OVERLAYS[goal.type])} />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{TYPE_ICONS[goal.type]}</span>
                      <h3 className="text-sm font-bold truncate">{goal.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{goal.vision}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full shimmer bg-gradient-to-l from-emerald-accent to-forest"
                          initial={{ width: 0 }}
                          animate={{ width: `${goal.progress}%` }}
                          transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-accent">{goal.progress}%</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Filter Tabs with emerald underline ── */}
        <Tabs
          value={activeType}
          onValueChange={setActiveType}
          className="w-full"
        >
          <TabsList className="rounded-xl bg-muted/60 p-1 h-auto flex-wrap relative">
            {['all', 'annual', 'quarterly', 'monthly', 'weekly'].map((tab) => {
              const labels: Record<string, string> = { all: 'الكل', annual: 'سنوي', quarterly: 'ربع سنوي', monthly: 'شهري', weekly: 'أسبوعي' }
              const isActive = activeType === tab
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm relative z-10',
                  )}
                >
                  <motion.span
                    className="block w-full"
                  >
                    {labels[tab]}
                  </motion.span>
                  {isActive && (
                    <motion.div
                      layoutId="activeGoalTab"
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-3/4 bg-emerald-accent rounded-full z-20"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* All tabs share the same content */}
          {['all', 'annual', 'quarterly', 'monthly', 'weekly'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {/* ── Goals List ── */}
              {filteredGoals.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="w-20 h-20 rounded-full bg-emerald-accent/10 flex items-center justify-center mb-6">
                    <Rocket className="w-10 h-10 text-emerald-accent" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">ابدأ رحلتك نحو النجاح</h3>
                  <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                    {activeType !== 'all'
                      ? `لا توجد أهداف ${TYPE_LABELS[activeType as Goal['type']] || ''} بعد. أضف أول هدفك الآن وابدأ بالتحرك!`
                      : 'كل رحلة عظيمة تبدأ بهدف واحد. حدد ما تريد تحقيقه وابدأ بخطوات ثابتة نحو حلمك.'}
                  </p>
                  <Button
                    onClick={() => setAddOpen(true)}
                    className="mt-6 rounded-xl bg-gradient-to-l from-emerald-accent to-forest text-white shadow-lg shadow-emerald-accent/20"
                  >
                    <Plus className="w-4 h-4 ml-1.5" />
                    أضف أول هدف
                  </Button>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {filteredGoals.map((goal, index) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        index={index}
                        expanded={expandedId === goal.id}
                        onToggleExpand={() =>
                          setExpandedId(expandedId === goal.id ? null : goal.id)
                        }
                        onToggleMilestone={(milestoneId) =>
                          toggleMilestone(goal.id, milestoneId)
                        }
                        onAddMilestone={(title) => addMilestone(goal.id, title)}
                        onToggleComplete={() => toggleGoalComplete(goal.id)}
                        onDelete={() => deleteGoal(goal.id)}
                        formatDate={formatDate}
                        getDeadlineInfo={getDeadlineInfo}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

/* ────────────── Goal Card ────────────── */

interface GoalCardProps {
  goal: Goal
  index: number
  expanded: boolean
  onToggleExpand: () => void
  onToggleMilestone: (milestoneId: string) => void
  onAddMilestone: (title: string) => void
  onToggleComplete: () => void
  onDelete: () => void
  formatDate: (d: string) => string
  getDeadlineInfo: (d: string) => { text: string; urgent: boolean } | null
}

function GoalCard({
  goal,
  index,
  expanded,
  onToggleExpand,
  onToggleMilestone,
  onAddMilestone,
  onToggleComplete,
  onDelete,
  formatDate,
  getDeadlineInfo,
}: GoalCardProps) {
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const deadlineInfo = getDeadlineInfo(goal.deadline)
  const milestones = goal.milestones || []
  const completedMilestones = milestones.filter((m) => m.completed).length
  const totalMilestones = milestones.length

  const gradientStops = TYPE_GRADIENT_STOPS[goal.type]
  const gradId = `goalGrad-${goal.id}`
  const isHighProgress = goal.progress > 50

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Card className="rounded-2xl border-0 shadow-sm glass overflow-hidden relative">
        {/* Gradient overlay based on goal type */}
        <div className={cn('absolute inset-0 bg-gradient-to-bl pointer-events-none rounded-2xl', TYPE_GRADIENT_OVERLAYS[goal.type])} />

        {/* ── Card Header ── */}
        <button
          onClick={onToggleExpand}
          className="w-full text-right p-4 md:p-5 flex items-start gap-3 cursor-pointer relative z-10"
        >
          {/* Progress circle with gradient stroke and glow */}
          <div className={cn('relative w-12 h-12 shrink-0 mt-0.5', isHighProgress && 'drop-shadow-[0_0_6px_oklch(0.55_0.14_163/0.4)]')}>
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-muted/50"
              />
              {/* Glow filter for high progress */}
              {isHighProgress && (
                <defs>
                  <filter id={`goalGlow-${goal.id}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
              )}
              <motion.circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                animate={{
                  strokeDashoffset:
                    2 * Math.PI * 20 - (goal.progress / 100) * (2 * Math.PI * 20),
                }}
                transition={{ duration: 1, ease: 'easeOut', delay: index * 0.08 }}
                filter={isHighProgress ? `url(#goalGlow-${goal.id})` : undefined}
              />
              <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={gradientStops.from} />
                  <stop offset="100%" stopColor={gradientStops.to} />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.08 + 0.5 }}
              >
                {goal.progress}%
              </motion.span>
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 className="font-semibold text-sm md:text-base truncate">{goal.title}</h3>
              <Badge
                variant="outline"
                className={cn('text-[10px] px-2 py-0 rounded-full font-medium', TYPE_COLORS[goal.type])}
              >
                <span className="ml-1">{TYPE_ICONS[goal.type]}</span>
                {TYPE_LABELS[goal.type]}
              </Badge>
            </div>

            {/* Progress bar with shimmer */}
            <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden mb-2 max-w-xs">
              <motion.div
                className="h-full rounded-full bg-gradient-to-l from-emerald-accent to-forest shimmer"
                initial={{ width: 0 }}
                animate={{ width: `${goal.progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.08 }}
              />
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {goal.deadline && (
                <motion.span
                  className={cn('flex items-center gap-1', deadlineInfo?.urgent && 'text-gold')}
                  animate={deadlineInfo?.urgent ? { opacity: [1, 0.5, 1] } : {}}
                  transition={deadlineInfo?.urgent ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                >
                  <Calendar className="w-3 h-3" />
                  {formatDate(goal.deadline)}
                  {deadlineInfo && (
                    <span className="text-[10px] mr-1">({deadlineInfo.text})</span>
                  )}
                </motion.span>
              )}
              {totalMilestones > 0 && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {completedMilestones} / {totalMilestones}
                </span>
              )}
            </div>
          </div>

          {/* Expand icon */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 mt-1 text-muted-foreground"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </button>

        {/* ── Expanded Content ── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 md:px-5 pb-4 md:pb-5 pt-0 space-y-4 border-t border-border/40 mt-0 pt-4">
                {/* Vision */}
                {goal.vision && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-accent">
                      <Eye className="w-3.5 h-3.5" />
                      الرؤية
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pr-5">
                      {goal.vision}
                    </p>
                  </div>
                )}

                {/* Why */}
                {goal.why && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gold">
                      <Sparkles className="w-3.5 h-3.5" />
                      لماذا؟
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pr-5">
                      {goal.why}
                    </p>
                  </div>
                )}

                {/* Milestones with timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      المعالم ({completedMilestones}/{totalMilestones})
                    </p>
                  </div>
                  {goal.milestones.length > 0 && (
                  <div className="relative max-h-48 overflow-y-auto pl-1">
                    {/* Timeline connecting line */}
                    <div className="absolute top-3 bottom-3 right-[17px] w-px bg-border/50" />
                      <div className="space-y-1.5">
                        {goal.milestones
                          .sort((a, b) => a.order - b.order)
                          .map((milestone, msIdx) => (
                            <motion.div
                              key={milestone.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2, delay: msIdx * 0.05 }}
                              className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors group relative cursor-pointer"
                              onClick={() => onToggleMilestone(milestone.id)}
                            >
                              {/* Timeline dot */}
                              <div className="relative z-10 shrink-0">
                                {milestone.completed ? (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                                    className="relative"
                                  >
                                    <div className="w-[18px] h-[18px] rounded-full bg-emerald-accent flex items-center justify-center shadow-sm shadow-emerald-accent/30">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    {/* Confetti-like sparkles */}
                                    {[0, 1, 2].map((i) => (
                                      <motion.span
                                        key={i}
                                        className="absolute w-1 h-1 rounded-full bg-gold"
                                        initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                                        animate={{
                                          opacity: 0,
                                          x: [0, (i - 1) * 12, (i - 1) * 16],
                                          y: [0, -8 - i * 4, -14 - i * 3],
                                          scale: [1, 0.8, 0],
                                        }}
                                        transition={{ type: 'tween', duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
                                        style={{ top: '50%', left: '50%' }}
                                      />
                                    ))}
                                  </motion.div>
                                ) : (
                                  <div className="w-[18px] h-[18px] rounded-full border-2 border-border bg-background" />
                                )}
                              </div>
                              <span
                                className={cn(
                                  'text-sm flex-1 transition-all',
                                  milestone.completed
                                    ? 'line-through text-muted-foreground/60'
                                    : 'text-foreground'
                                )}
                              >
                                {milestone.title}
                              </span>
                              {milestone.completed && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </motion.div>
                          ))}
                      </div>
                  </div>
                  )}
                  {/* Add milestone — there was previously no way to add one at all */}
                  <div
                    className="flex items-center gap-2 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newMilestoneTitle.trim()) {
                          onAddMilestone(newMilestoneTitle)
                          setNewMilestoneTitle('')
                        }
                      }}
                      placeholder="أضف معلماً جديداً..."
                      className="h-8 text-xs rounded-lg"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 rounded-lg shrink-0"
                      disabled={!newMilestoneTitle.trim()}
                      onClick={() => {
                        if (newMilestoneTitle.trim()) {
                          onAddMilestone(newMilestoneTitle)
                          setNewMilestoneTitle('')
                        }
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Mark complete / reopen — there was previously no way to
                    manually mark a goal as done (relevant especially for
                    goals with no milestones, where progress can never move) */}
                <div className="flex justify-start pt-1">
                  <Button
                    variant={goal.status === 'completed' ? 'secondary' : 'default'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleComplete()
                    }}
                    className="rounded-xl text-xs h-8 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                    {goal.status === 'completed' ? 'إعادة فتح الهدف' : 'وضع علامة كمكتمل'}
                  </Button>
                </div>

                {/* Delete */}
                <div className="flex justify-start pt-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete()
                        }}
                        className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-xl text-xs h-8"
                      >
                        <Trash2 className="w-3.5 h-3.5 ml-1" />
                        حذف الهدف
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>حذف هذا الهدف نهائياً</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

export default GoalsView