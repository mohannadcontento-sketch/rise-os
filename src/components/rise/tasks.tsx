'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  List,
  LayoutGrid,
  CalendarDays,
  Clock,
  Zap,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreHorizontal,
  CalendarClock,
  CheckCircle2,
  Circle,
  Loader2,
  Inbox,
  Sparkles,
  Lock,
  Link2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { priorityColors, priorityLabels, statusLabels, formatDateShort, getToday } from '@/lib/rise-utils'
import { notifyTaskComplete } from '@/lib/notifications'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, startOfWeek, addDays } from 'date-fns'
import { ar } from 'date-fns/locale'

/* ────────────── Types ────────────── */

interface SubTask {
  id: string
  title: string
  completed: boolean
}

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  label?: string | null
  projectId?: string | null
  project?: { name: string; color: string } | null
  dueDate?: string | null
  xpReward: number
  completedAt?: string | null
  subtasks: SubTask[]
  order: number
  dependsOn?: string | null
}

interface Project {
  id: string
  name: string
  color: string
}

type ViewType = 'list' | 'board' | 'calendar'

const STATUSES = ['todo', 'in_progress', 'done'] as const

/* ────────────── Animation Variants ────────────── */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const } },
  exit: { opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.2 } },
}

const cardHover = { scale: 1.01, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } }

/* Priority left border colors */
const priorityBorderColors: Record<string, string> = {
  urgent: 'border-r-red-500',
  high: 'border-r-orange-500',
  medium: 'border-r-gold',
  low: 'border-r-blue-500',
}

/* Animated Counter Component */
function AnimatedCounter({ target, className }: { target: number; className?: string }) {
  const [count, setCount] = useState(0)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    startTimeRef.current = Date.now()
    if (target === 0) {
      const id = requestAnimationFrame(() => setCount(0))
      return () => cancelAnimationFrame(id)
    }
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current
      const progress = Math.min(elapsed / 800, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target])

  return (
    <motion.span
      key={count}
      initial={{ y: -4, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={className}
    >
      {count}
    </motion.span>
  )
}

/* ────────────── Priority Dot ────────────── */

const priorityDotColors: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-gold',
  low: 'bg-blue-500',
}

/* ────────────── Component ────────────── */

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewType>('list')
  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterProject, setFilterProject] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Add task form
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formPriority, setFormPriority] = useState('medium')
  const [formProject, setFormProject] = useState<string>('none')
  const [formDueDate, setFormDueDate] = useState('')
  const [formDependsOn, setFormDependsOn] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/rise/tasks')
      const data = await res.json()
      setTasks(data.tasks || [])
      setProjects(data.projects || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Filtering ── */
  const isTaskBlocked = useCallback((task: Task): boolean => {
    if (!task.dependsOn) return false
    const deps = task.dependsOn.split(',').filter(Boolean)
    return deps.some((depId) => {
      const depTask = tasks.find((t) => t.id === depId)
      return depTask && depTask.status !== 'done'
    })
  }, [tasks])

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      if (filterProject !== 'all' && t.projectId !== filterProject) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterStatus === 'blocked' && !isTaskBlocked(t)) return false
      if (searchQuery && !t.title.includes(searchQuery) && !t.description?.includes(searchQuery)) return false
      return true
    })
  }, [tasks, filterPriority, filterProject, filterStatus, filterStatus, searchQuery, isTaskBlocked])

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = { todo: [], in_progress: [], done: [] }
    for (const t of filteredTasks) {
      if (groups[t.status]) groups[t.status].push(t)
    }
    return groups
  }, [filteredTasks])

  /* ── Mutations ── */
  const toggleTask = async (task: Task) => {
    const isDone = task.status === 'done'
    const newStatus = isDone ? 'todo' : 'done'
    const optimistic = { ...task, status: newStatus, completedAt: !isDone ? new Date().toISOString() : null }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? optimistic : t)))
    try {
      await fetch('/api/rise/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus, completedAt: optimistic.completedAt }),
      })
      if (!isDone) {
        notifyTaskComplete(task.title, task.xpReward)
        fetch('/api/rise/earn-xp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: task.xpReward || 10, reason: `task:${task.id}` }) }).catch(() => {})
        // Check if completing this task unblocks dependent tasks
        checkUnblockedTasks(task.id)
      }
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
  }

  const moveTask = async (task: Task, newStatus: string) => {
    const optimistic = { ...task, status: newStatus, completedAt: newStatus === 'done' ? new Date().toISOString() : null }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? optimistic : t)))
    try {
      await fetch('/api/rise/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus, completedAt: optimistic.completedAt }),
      })
      if (newStatus === 'done') {
        fetch('/api/rise/earn-xp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: task.xpReward || 10, reason: `task:${task.id}` }) }).catch(() => {})
        // Check if completing this task unblocks dependent tasks
        checkUnblockedTasks(task.id)
      }
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
  }

  const deleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    try {
      await fetch(`/api/rise/tasks?id=${taskId}`, { method: 'DELETE' })
    } catch {
      fetchData()
    }
  }

  const toggleSubtask = async (task: Task, subtaskId: string, completed: boolean) => {
    const optimistic = {
      ...task,
      subtasks: task.subtasks.map((s) => (s.id === subtaskId ? { ...s, completed: !completed } : s)),
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? optimistic : t)))
    try {
      await fetch('/api/rise/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          subtasks: optimistic.subtasks.map((s) => ({ id: s.id, title: s.title, completed: s.completed })),
        }),
      })
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
  }

  const createTask = async () => {
    if (!formTitle.trim()) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: formTitle.trim(),
        description: formDesc.trim() || null,
        priority: formPriority,
        dueDate: formDueDate || null,
      }
      if (formProject !== 'none') body.projectId = formProject
      if (formDependsOn.length > 0) body.dependsOn = formDependsOn.join(',')
      await fetch('/api/rise/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setFormTitle('')
      setFormDesc('')
      setFormPriority('medium')
      setFormProject('none')
      setFormDueDate('')
      setFormDependsOn([])
      setAddOpen(false)
      fetchData()
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Check unblocked tasks ── */
  const checkUnblockedTasks = (completedTaskId: string) => {
    const unblocked = tasks.filter((t) => {
      if (!t.dependsOn || t.status === 'done') return false
      const deps = t.dependsOn.split(',').filter(Boolean)
      // This task was blocked by the completed task
      if (!deps.includes(completedTaskId)) return false
      // Now check if ALL dependencies are done
      const allDepsDone = deps.every((depId) => {
        const dep = tasks.find((tt) => tt.id === depId)
        return dep && dep.status === 'done'
      })
      return allDepsDone
    })
    if (unblocked.length > 0) {
      toast.success('🔓 تم فتح مهام محظورة', {
        description: unblocked.map((t) => t.title).join('، '),
        duration: 4000,
      })
    }
  }

  /* ── Calendar helpers ── */
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const start = startOfWeek(monthStart, { weekStartsOn: 6 })
    const end = startOfWeek(monthEnd, { weekStartsOn: 6 })
    // Go to end of that week
    const finalEnd = addDays(end, 6)
    return eachDayOfInterval({ start, end })
  }, [calendarMonth])

  const getTasksForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return filteredTasks.filter((t) => t.dueDate === dateStr && t.status !== 'done')
  }

  const weekDays = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

  /* ── Status column config ── */
  const statusColumns = [
    { key: 'todo', label: 'للتنفيذ', icon: Circle, color: 'text-blue-500', bg: 'bg-blue-500/5' },
    { key: 'in_progress', label: 'قيد التنفيذ', icon: Clock, color: 'text-gold', bg: 'bg-gold/5' },
    { key: 'done', label: 'مكتمل', icon: CheckCircle2, color: 'text-emerald-accent', bg: 'bg-emerald-accent/5' },
  ]

  /* ────────────── Render: Task Item (List) ────────────── */
  const renderTaskItem = (task: Task, index: number) => {
    const isExpanded = expandedId === task.id
    const isDone = task.status === 'done'
    const completedSubs = task.subtasks.filter((s) => s.completed).length
    const blocked = isTaskBlocked(task)
    const depNames = task.dependsOn
      ? task.dependsOn.split(',').filter(Boolean).map((id) => tasks.find((t) => t.id === id)?.title).filter(Boolean)
      : []

    return (
      <motion.div
        key={task.id}
        variants={itemVariants}
        layout
        className="group"
      >
        <motion.div
          className={cn(
            'glass rounded-2xl p-4 border-r-4 transition-shadow duration-300',
            'hover:shadow-lg hover:shadow-emerald-accent/8',
            priorityBorderColors[task.priority] || 'border-r-border',
            isDone && 'opacity-60',
            blocked && !isDone && 'opacity-60'
          )}
          whileHover={{ scale: 1.01, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <div className="pt-0.5">
              <motion.div
                whileTap={{ scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                {blocked && !isDone ? (
                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
                    <Lock className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                ) : (
                  <Checkbox
                    checked={isDone}
                    onCheckedChange={() => toggleTask(task)}
                    disabled={blocked && !isDone}
                    className={cn(
                      'w-5 h-5 rounded-full border-2 data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent'
                    )}
                  />
                )}
              </motion.div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}
                  className={cn(
                    'text-sm font-semibold text-right transition-colors',
                    isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                  )}
                >
                  {task.title}
                </button>

                {/* Priority badge */}
                <Badge
                  variant="secondary"
                  className={cn('text-[10px] px-1.5 py-0 h-5 font-medium rounded-full', priorityColors[task.priority])}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full ml-1', priorityDotColors[task.priority])} />
                  {priorityLabels[task.priority]}
                </Badge>

                {/* Project dot */}
                {task.project && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                    {task.project.name}
                  </span>
                )}

                {/* XP */}
                {task.xpReward > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-gold font-medium">
                    <Zap className="w-3 h-3" />
                    {task.xpReward}
                  </span>
                )}

                {/* Blocked badge */}
                {blocked && !isDone && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-medium rounded-full bg-muted text-muted-foreground">
                    <Lock className="w-3 h-3 ml-1" />
                    محظورة
                  </Badge>
                )}

                {/* Dependency chain badge */}
                {depNames.length > 0 && !blocked && !isDone && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-medium rounded-full bg-gold/10 text-gold">
                    <Link2 className="w-3 h-3 ml-1" />
                    {depNames.length} تبعية
                  </Badge>
                )}
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                {task.dueDate && (
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    {formatDateShort(task.dueDate)}
                  </span>
                )}
                {task.subtasks.length > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {completedSubs}/{task.subtasks.length}
                  </span>
                )}
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {task.description && (
                      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{task.description}</p>
                    )}
                    {/* Dependency info */}
                    {depNames.length > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Link2 className="w-3 h-3" />
                        <span>يعتمد على: {depNames.join('، ')}</span>
                      </div>
                    )}
                    {task.subtasks.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {task.subtasks.map((sub) => (
                          <label key={sub.id} className="flex items-center gap-2 cursor-pointer group/sub">
                            <Checkbox
                              checked={sub.completed}
                              onCheckedChange={() => toggleSubtask(task, sub.id, sub.completed)}
                              className="w-4 h-4 rounded-md data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent"
                            />
                            <span
                              className={cn(
                                'text-xs transition-colors',
                                sub.completed ? 'line-through text-muted-foreground' : 'text-foreground/80'
                              )}
                            >
                              {sub.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setExpandedId(isExpanded ? null : task.id)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      const nextIdx = (STATUSES.indexOf(task.status as typeof STATUSES[number]) + 1) % STATUSES.length
                      moveTask(task, STATUSES[nextIdx])
                    }}
                  >
                    نقل إلى: {statusLabels[STATUSES[(STATUSES.indexOf(task.status as typeof STATUSES[number]) + 1) % STATUSES.length]]}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => deleteTask(task.id)}
                    className="text-red-500 focus:text-red-500"
                  >
                    <Trash2 className="w-4 h-4 ml-2" />
                    حذف
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  /* ────────────── Render: Board Card ────────────── */
  const boardColBorderColors: Record<string, string> = {
    todo: 'border-t-blue-500',
    in_progress: 'border-t-gold',
    done: 'border-t-emerald-accent',
  }
  const renderBoardCard = (task: Task) => {
    const isDone = task.status === 'done'
    const completedSubs = task.subtasks.filter((s) => s.completed).length

    return (
      <motion.div
        key={task.id}
        variants={itemVariants}
        layout
        whileHover={cardHover}
      >
        <motion.div
          className={cn(
            'glass rounded-2xl p-4 border-r-4 transition-shadow duration-300 cursor-pointer',
            'hover:shadow-lg hover:shadow-emerald-accent/8',
            priorityBorderColors[task.priority] || 'border-r-border',
            isDone && 'opacity-60'
          )}
          whileHover={{ scale: 1.02, y: -2, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <Badge
              variant="secondary"
              className={cn('text-[10px] px-1.5 py-0 h-5 font-medium rounded-full', priorityColors[task.priority])}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full ml-1', priorityDotColors[task.priority])} />
              {priorityLabels[task.priority]}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 rounded-lg hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {statusColumns
                  .filter((c) => c.key !== task.status)
                  .map((col) => (
                    <DropdownMenuItem key={col.key} onClick={() => moveTask(task, col.key)}>
                      نقل إلى: {col.label}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deleteTask(task.id)}
                  className="text-red-500 focus:text-red-500"
                >
                  <Trash2 className="w-4 h-4 ml-2" />
                  حذف
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className={cn('text-sm font-semibold text-right', isDone && 'line-through text-muted-foreground')}>
            {task.title}
          </p>

          {task.description && (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {task.project && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                {task.project.name}
              </span>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarClock className="w-3 h-3" />
                {formatDateShort(task.dueDate)}
              </span>
            )}
          </div>

          {/* Subtask progress bar */}
          {task.subtasks.length > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>المهام الفرعية</span>
                <span>{completedSubs}/{task.subtasks.length}</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-emerald-accent"
                  initial={false}
                  animate={{ width: `${task.subtasks.length > 0 ? (completedSubs / task.subtasks.length) * 100 : 0}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* XP */}
          <div className="flex items-center justify-between mt-3">
            <span className="flex items-center gap-0.5 text-[11px] text-gold font-medium">
              <Zap className="w-3 h-3" />
              {task.xpReward} خبرة
            </span>
            <Checkbox
              checked={isDone}
              onCheckedChange={() => {
                toggleTask(task)
              }}
              className="w-5 h-5 rounded-full border-2 data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent"
            />
          </div>
        </motion.div>
      </motion.div>
    )
  }

  /* ────────────── Render: Loading ────────────── */
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  /* ────────────── Render: Main ────────────── */
  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ابحث في المهام..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 h-10 rounded-xl glass border-0 bg-transparent text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl gap-1.5 text-xs font-medium">
                <Filter className="w-3.5 h-3.5" />
                تصفية
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="p-2 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">الأولوية</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="urgent">عاجل</SelectItem>
                      <SelectItem value="high">مرتفع</SelectItem>
                      <SelectItem value="medium">متوسط</SelectItem>
                      <SelectItem value="low">منخفض</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">المشروع</Label>
                  <Select value={filterProject} onValueChange={setFilterProject}>
                    <SelectTrigger className="h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">الحالة</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="todo">للتنفيذ</SelectItem>
                      <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                      <SelectItem value="done">مكتمل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View tabs */}
          <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
            <TabsList className="h-10 rounded-xl p-1">
              <TabsTrigger value="list" className="rounded-lg px-3 text-xs gap-1.5 data-[state=active]:bg-emerald-accent data-[state=active]:text-white">
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">قائمة</span>
              </TabsTrigger>
              <TabsTrigger value="board" className="rounded-lg px-3 text-xs gap-1.5 data-[state=active]:bg-emerald-accent data-[state=active]:text-white">
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">لوحة</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" className="rounded-lg px-3 text-xs gap-1.5 data-[state=active]:bg-emerald-accent data-[state=active]:text-white">
                <CalendarDays className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تقويم</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Add task */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-10 rounded-xl gap-1.5 bg-emerald-accent hover:bg-emerald-accent/90 text-white text-xs font-semibold shadow-lg shadow-emerald-accent/20">
                <Plus className="w-4 h-4" />
                مهمة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md backdrop-blur-xl" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-gold" />
                  مهمة جديدة
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">العنوان</Label>
                  <Input
                    placeholder="ماذا تريد إنجازه؟"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="rounded-xl h-10 focus:ring-2 focus:ring-emerald-accent/40 focus:border-emerald-accent"
                    onKeyDown={(e) => e.key === 'Enter' && createTask()}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">الوصف (اختياري)</Label>
                  <Textarea
                    placeholder="أضف تفاصيل..."
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="rounded-xl min-h-[80px] text-sm focus:ring-2 focus:ring-emerald-accent/40 focus:border-emerald-accent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium mb-1.5 block">الأولوية</Label>
                    <Select value={formPriority} onValueChange={setFormPriority}>
                      <SelectTrigger className="rounded-xl h-10 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="urgent">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            عاجل
                          </span>
                        </SelectItem>
                        <SelectItem value="high">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-500" />
                            مرتفع
                          </span>
                        </SelectItem>
                        <SelectItem value="medium">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-gold" />
                            متوسط
                          </span>
                        </SelectItem>
                        <SelectItem value="low">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            منخفض
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1.5 block">المشروع</Label>
                    <Select value={formProject} onValueChange={setFormProject}>
                      <SelectTrigger className="rounded-xl h-10 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون مشروع</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                              {p.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">تاريخ الاستحقاق (اختياري)</Label>
                  <Input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="rounded-xl h-10 text-sm focus:ring-2 focus:ring-emerald-accent/40 focus:border-emerald-accent"
                  />
                </div>
                {/* Dependencies */}
                {tasks.length > 0 && (
                  <div>
                    <Label className="text-xs font-medium mb-1.5 block flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" />
                      يعتمد على (اختياري)
                    </Label>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto rounded-xl border border-border/60 p-2">
                      {tasks
                        .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
                        .map((t) => (
                          <label key={t.id} className="flex items-center gap-2 cursor-pointer group/dep hover:bg-muted/40 rounded-lg px-2 py-1.5 transition-colors">
                            <Checkbox
                              checked={formDependsOn.includes(t.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFormDependsOn((prev) => [...prev, t.id])
                                } else {
                                  setFormDependsOn((prev) => prev.filter((id) => id !== t.id))
                                }
                              }}
                              className="w-4 h-4 rounded-md data-[state=checked]:bg-gold data-[state=checked]:border-gold"
                            />
                            <span className="text-xs text-foreground truncate">{t.title}</span>
                            <span className="text-[10px] text-muted-foreground mr-auto">
                              {statusLabels[t.status] || t.status}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 mt-4">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-xl text-sm">
                    إلغاء
                  </Button>
                </DialogClose>
                <Button
                  onClick={createTask}
                  disabled={!formTitle.trim() || submitting}
                  className="rounded-xl bg-emerald-accent hover:bg-emerald-accent/90 text-white text-sm font-semibold shadow-lg shadow-emerald-accent/20"
                >
                  {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                  إنشاء المهمة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter bar - glass card with rounded-full buttons */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-2.5 flex flex-wrap items-center gap-1.5"
      >
        {['all', 'todo', 'in_progress', 'done', 'blocked'].map((status) => {
          const isActive = filterStatus === status
          const label = status === 'all' ? 'الكل' : status === 'todo' ? 'للتنفيذ' : status === 'in_progress' ? 'قيد التنفيذ' : status === 'blocked' ? 'محظورة' : 'مكتمل'
          return (
            <motion.button
              key={status}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterStatus(status)}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                isActive && status !== 'blocked'
                  ? 'bg-emerald-accent text-white shadow-md shadow-emerald-accent/25'
                  : isActive && status === 'blocked'
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {status === 'blocked' && <Lock className="w-3 h-3 ml-1 inline" />}
              {label}
            </motion.button>
          )
        })}
        <div className="w-px h-5 bg-border/60 mx-1" />
        {['all', 'urgent', 'high', 'medium', 'low'].map((priority) => {
          const isActive = filterPriority === priority
          const label = priority === 'all' ? 'كل الأولويات' : priorityLabels[priority]
          return (
            <motion.button
              key={priority}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterPriority(priority)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                isActive
                  ? 'bg-emerald-accent text-white shadow-md shadow-emerald-accent/25'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {priority !== 'all' && (
                <span className={cn('w-1.5 h-1.5 rounded-full inline-block ml-1', priorityDotColors[priority])} />
              )}
              {label}
            </motion.button>
          )
        })}
      </motion.div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'الكل', count: tasks.length, color: 'text-foreground' },
          { label: 'للتنفيذ', count: tasks.filter((t) => t.status === 'todo').length, color: 'text-blue-500' },
          { label: 'قيد التنفيذ', count: tasks.filter((t) => t.status === 'in_progress').length, color: 'text-gold' },
          { label: 'مكتمل', count: tasks.filter((t) => t.status === 'done').length, color: 'text-emerald-accent' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 24 }}
            className="glass rounded-2xl p-3.5 text-center"
          >
            <p className={cn('text-xl font-bold tabular-nums', s.color)}>
              <AnimatedCounter target={s.count} className={cn('text-xl font-bold tabular-nums', s.color)} />
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── List View ── */}
      {view === 'list' && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-2"
        >
          {STATUSES.map((status) => {
            const col = statusColumns.find((c) => c.key === status)!
            const statusTasks = groupedTasks[status]
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <col.icon className={cn('w-4 h-4', col.color)} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-full">
                    {statusTasks.length}
                  </Badge>
                </div>
                <AnimatePresence mode="popLayout">
                  {statusTasks.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground"
                    >
                      لا توجد مهام
                    </motion.div>
                  ) : (
                    <div className="space-y-2">
                      {statusTasks.map((task, idx) => renderTaskItem(task, idx))}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </motion.div>
      )}

      {/* ── Board View ── */}
      {view === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statusColumns.map((col) => {
            const colTasks = groupedTasks[col.key]
            return (
              <motion.div
                key={col.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: statusColumns.indexOf(col) * 0.1 }}
                className={cn('flex flex-col min-h-[200px] glass rounded-2xl p-3 border-t-4', boardColBorderColors[col.key])}
              >
                <div className={cn('flex items-center gap-2 mb-3 px-1', col.color)}>
                  <col.icon className="w-4 h-4" />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-5 min-w-[22px] px-1.5 rounded-full justify-center font-bold">
                    {colTasks.length}
                  </Badge>
                </div>
                <div className="flex-1 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  <AnimatePresence mode="popLayout">
                    {colTasks.length === 0 ? (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass rounded-2xl p-8 text-center"
                      >
                        <Inbox className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">لا توجد مهام</p>
                      </motion.div>
                    ) : (
                      colTasks.map((task) => renderBoardCard(task))
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── Calendar View ── */}
      {view === 'calendar' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="glass overflow-hidden rounded-2xl border-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">
                  {format(calendarMonth, 'MMMM yyyy', { locale: ar })}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs rounded-lg"
                    onClick={() => setCalendarMonth(new Date())}
                  >
                    اليوم
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Week day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {weekDays.map((d) => (
                  <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2">
                    {d}
                  </div>
                ))}
              </div>
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const dayTasks = getTasksForDate(day)
                  const isCurrentMonth = isSameMonth(day, calendarMonth)
                  const isToday = isSameDay(day, new Date())
                  const hasTasks = dayTasks.length > 0

                  return (
                    <motion.div
                      key={idx}
                      initial={false}
                      className={cn(
                        'min-h-[72px] sm:min-h-[88px] rounded-xl p-1.5 transition-colors',
                        isCurrentMonth ? 'bg-background' : 'bg-muted/30',
                        isToday && 'ring-2 ring-emerald-accent ring-offset-1 ring-offset-background',
                        hasTasks && 'bg-emerald-accent/5'
                      )}
                    >
                      <span
                        className={cn(
                          'text-[11px] font-medium block text-center',
                          isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
                          isToday && 'text-emerald-accent font-bold'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      <div className="mt-0.5 space-y-0.5 max-h-[56px] sm:max-h-[64px] overflow-y-auto">
                        {dayTasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            className={cn(
                              'text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium',
                              t.priority === 'urgent' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                              t.priority === 'high' && 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
                              t.priority === 'medium' && 'bg-gold/10 text-yellow-700 dark:text-gold',
                              t.priority === 'low' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            )}
                          >
                            {t.title}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <p className="text-[9px] text-muted-foreground text-center">+{dayTasks.length - 3}</p>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Expanded task panel (mobile friendly overlay) */}
      <AnimatePresence>
        {expandedId && view === 'board' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setExpandedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default Tasks