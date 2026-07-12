'use client'

import { useState, useEffect, useMemo } from 'react'
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

/* ────────────── Component ────────────── */

export function GoalsView() {
  const [goals, setGoals] = useState<Goal[]>([])
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
  useEffect(() => {
    async function fetchGoals() {
      try {
        const res = await fetch('/api/rise/goals')
        if (res.ok) {
          const data: GoalsResponse = await res.json()
          setGoals(data.goals)
        }
      } catch {
        // Use empty state
      } finally {
        setLoading(false)
      }
    }
    fetchGoals()
  }, [])

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
      total > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / total) : 0
    return { total, completed, avgProgress }
  }, [goals])

  /* ---- Toggle milestone ---- */
  async function toggleMilestone(goalId: string, milestoneId: string) {
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
        return { ...g, milestones: updatedMilestones, progress }
      })
    )

    try {
      const goal = goals.find((g) => g.id === goalId)
      if (!goal) return
      const ms = goal.milestones.find((m) => m.id === milestoneId)
      if (!ms) return
      await fetch('/api/rise/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: goalId,
          milestoneId,
          completed: !ms.completed,
        }),
      })
    } catch {
      // Revert on error
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalId) return g
          const reverted = g.milestones.map((m) =>
            m.id === milestoneId ? { ...m, completed: m.completed } : m
          )
          const completedCount = reverted.filter((m) => m.completed).length
          const progress =
            reverted.length > 0 ? Math.round((completedCount / reverted.length) * 100) : 0
          return { ...g, milestones: reverted, progress }
        })
      )
    }
  }

  /* ---- Add goal ---- */
  async function handleAddGoal() {
    if (!formTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/rise/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          vision: formVision,
          why: formWhy,
          type: formType,
          deadline: formDeadline,
        }),
      })
      if (res.ok) {
        const data: GoalsResponse = await res.json()
        setGoals((prev) => [...prev, ...data.goals])
        setAddOpen(false)
        resetForm()
      }
    } catch {
      // Silently fail
    } finally {
      setSaving(false)
    }
  }

  /* ---- Delete goal ---- */
  async function deleteGoal(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id))
    try {
      await fetch('/api/rise/goals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {
      // Silently fail
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
            <DialogContent className="sm:max-w-md rounded-2xl">
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

        {/* ── Filter Tabs ── */}
        <Tabs
          value={activeType}
          onValueChange={setActiveType}
          className="w-full"
        >
          <TabsList className="rounded-xl bg-muted/60 p-1 h-auto flex-wrap">
            <TabsTrigger
              value="all"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2 text-sm"
            >
              الكل
            </TabsTrigger>
            <TabsTrigger
              value="annual"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2 text-sm"
            >
              سنوي
            </TabsTrigger>
            <TabsTrigger
              value="quarterly"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2 text-sm"
            >
              ربع سنوي
            </TabsTrigger>
            <TabsTrigger
              value="monthly"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2 text-sm"
            >
              شهري
            </TabsTrigger>
            <TabsTrigger
              value="weekly"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2 text-sm"
            >
              أسبوعي
            </TabsTrigger>
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
  onDelete,
  formatDate,
  getDeadlineInfo,
}: GoalCardProps) {
  const deadlineInfo = getDeadlineInfo(goal.deadline)
  const completedMilestones = goal.milestones.filter((m) => m.completed).length
  const totalMilestones = goal.milestones.length

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Card className="rounded-2xl border-0 shadow-sm glass overflow-hidden">
        {/* ── Card Header ── */}
        <button
          onClick={onToggleExpand}
          className="w-full text-right p-4 md:p-5 flex items-start gap-3 cursor-pointer"
        >
          {/* Progress circle */}
          <div className="relative w-12 h-12 shrink-0 mt-0.5">
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
              <motion.circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="url(#emeraldGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                animate={{
                  strokeDashoffset:
                    2 * Math.PI * 20 - (goal.progress / 100) * (2 * Math.PI * 20),
                }}
                transition={{ duration: 1, ease: 'easeOut', delay: index * 0.08 }}
              />
              <defs>
                <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="oklch(0.55 0.14 163)" />
                  <stop offset="100%" stopColor="oklch(0.35 0.10 160)" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
              {goal.progress}%
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
                {TYPE_LABELS[goal.type]}
              </Badge>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden mb-2 max-w-xs">
              <motion.div
                className="h-full rounded-full bg-gradient-to-l from-emerald-accent to-forest"
                initial={{ width: 0 }}
                animate={{ width: `${goal.progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.08 }}
              />
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {goal.deadline && (
                <span className={cn('flex items-center gap-1', deadlineInfo?.urgent && 'text-gold')}>
                  <Calendar className="w-3 h-3" />
                  {formatDate(goal.deadline)}
                  {deadlineInfo && (
                    <span className="text-[10px] mr-1">({deadlineInfo.text})</span>
                  )}
                </span>
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

                {/* Milestones */}
                {goal.milestones.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        المعالم ({completedMilestones}/{totalMilestones})
                      </p>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pl-1">
                      {goal.milestones
                        .sort((a, b) => a.order - b.order)
                        .map((milestone) => (
                          <motion.div
                            key={milestone.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors group"
                          >
                            <Checkbox
                              checked={milestone.completed}
                              onCheckedChange={() => onToggleMilestone(milestone.id)}
                              className={cn(
                                'data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent'
                              )}
                            />
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