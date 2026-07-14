'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  ArrowRight,
  Trash2,
  Pencil,
  CheckCircle2,
  Circle,
  Clock,
  Zap,
  MoreHorizontal,
  FolderKanban,
  Sparkles,
  Loader2,
  X,
  TrendingUp,
  ListChecks,
  Star,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
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
import { cn } from '@/lib/utils'
import { apiFetch, apiPost, apiPut, apiDelete } from '@/lib/api-fetch'
import { priorityColors, priorityLabels, statusLabels, formatDateShort } from '@/lib/rise-utils'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

/* ────────────── Types ────────────── */

interface Project {
  id: string
  name: string
  description?: string | null
  color: string
  progress: number
  status: string
  createdAt: string
}

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  projectId?: string | null
  dueDate?: string | null
  xpReward: number
  completedAt?: string | null
  subtasks: { id: string; title: string; completed: boolean }[]
}

/* ────────────── Constants ────────────── */

const PRESET_COLORS = [
  '#059669', '#10B981', '#14B8A6',
  '#3B82F6', '#6366F1', '#8B5CF6',
  '#F59E0B', '#D4A853', '#F97316',
  '#EF4444', '#EC4899', '#64748B',
]

const STATUSES = ['todo', 'in_progress', 'done'] as const

/* ────────────── Animation Variants ────────────── */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
}

/* ────────────── Progress Ring Component ────────────── */

function ProgressRing({ progress, size = 64, strokeWidth = 5, color }: { progress: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference
  const isHighProgress = progress > 75
  const gradientId = `progGrad-${size}-${color.replace('#', '')}`

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity={0.6} />
        </linearGradient>
        {isHighProgress && (
          <filter id={`glow-${size}-${color.replace('#', '')}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/50"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut' }}
        filter={isHighProgress ? `url(#glow-${size}-${color.replace('#', '')})` : undefined}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
        className="fill-foreground text-[11px] font-bold"
      >
        {Math.round(progress)}%
      </text>
    </svg>
  )
}

  /* ────────────── Team Avatars Component ────────────── */

function TeamAvatars() {
  const names = ['أحمد', 'سارة', 'محمد', 'نورة', 'خالد']
  const colors = ['#059669', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6']
  return (
    <div className="flex items-center">
      {names.slice(0, 4).map((name, i) => (
        <div
          key={name}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-background -mr-2 last:mr-0"
          style={{ backgroundColor: colors[i], zIndex: 4 - i }}
          title={name}
        >
          {name.charAt(0)}
        </div>
      ))}
      {names.length > 4 && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-medium text-muted-foreground bg-muted border-2 border-background -mr-2">
          +{names.length - 4}
        </div>
      )}
    </div>
  )
}

/* ────────────── Featured Project Hero ────────────── */

function FeaturedProject({ project, onClick }: { project: Project; onClick: () => void }) {
  const taskCount = 0
  const doneCount = 0
  const progress = project.progress

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="cursor-pointer"
      onClick={onClick}
    >
      <div className="premium-card rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 bg-gradient-to-bl pointer-events-none"
          style={{ background: `linear-gradient(135deg, ${project.color}12, ${project.color}04, transparent)` }}
        />
        <div className="relative p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="relative">
            <ProgressRing progress={progress} size={100} strokeWidth={6} color={project.color} />
            <motion.div
              className="absolute -top-1 -right-1"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-md">
                <Star className="w-3 h-3 text-forest-dark" />
              </div>
            </motion.div>
          </div>
          <div className="flex-1 text-center sm:text-right">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
              <FolderKanban className="w-5 h-5" style={{ color: project.color }} />
              <h3 className="text-lg font-bold">{project.name}</h3>
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] px-2 py-0 rounded-full font-medium',
                  project.status === 'active' && 'bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/20',
                  project.status === 'completed' && 'bg-gold/10 text-gold border border-gold/20',
                  project.status === 'archived' && 'bg-muted text-muted-foreground border border-muted/30'
                )}
              >
                {project.status === 'active' ? 'نشط' : project.status === 'completed' ? 'مكتمل' : 'متوقف'}
              </Badge>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">{project.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 justify-center sm:justify-start">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ListChecks className="w-3.5 h-3.5" />
                {progress}% مكتمل
              </span>
              <TeamAvatars />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ────────────── Empty State ────────────── */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-accent/20 to-forest/20 flex items-center justify-center">
          <FolderKanban className="w-10 h-10 text-emerald-accent/60" />
        </div>
        <motion.div
          className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="w-3 h-3 text-gold" />
        </motion.div>
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">لا توجد مشاريع بعد</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        ابدأ بإنشاء مشروعك الأول وorganize مهامك بشكل أفضل. المشاريع تساعدك على التركيز وتتبع التقدم.
      </p>
    </motion.div>
  )
}

/* ────────────── Main Component ────────────── */

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Add/Edit project dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formColor, setFormColor] = useState(PRESET_COLORS[0])
  const [submitting, setSubmitting] = useState(false)

  // Add task to project dialog
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('medium')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [taskSubmitting, setTaskSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [projRes, taskRes] = await Promise.all([
        apiFetch('/api/rise/projects'),
        apiFetch('/api/rise/tasks'),
      ])
      const projData = await projRes.json()
      const taskData = await taskRes.json()
      setProjects(projData.projects || [])
      setTasks(taskData.tasks || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Computed ── */
  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects
    return projects.filter((p) => p.name.includes(searchQuery) || p.description?.includes(searchQuery))
  }, [projects, searchQuery])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === selectedProjectId),
    [tasks, selectedProjectId]
  )

  const projectTasksByStatus = useMemo(() => {
    const groups: Record<string, Task[]> = { todo: [], in_progress: [], done: [] }
    for (const t of projectTasks) {
      if (groups[t.status]) groups[t.status].push(t)
    }
    return groups
  }, [projectTasks])

  /* ── Mutations ── */
  const openAddDialog = () => {
    setEditingProject(null)
    setFormName('')
    setFormDesc('')
    setFormColor(PRESET_COLORS[0])
    setDialogOpen(true)
  }

  const openEditDialog = (project: Project) => {
    setEditingProject(project)
    setFormName(project.name)
    setFormDesc(project.description || '')
    setFormColor(project.color)
    setDialogOpen(true)
  }

  const saveProject = async () => {
    if (!formName.trim()) return
    setSubmitting(true)
    try {
      if (editingProject) {
        await apiPut('/api/rise/projects', { id: editingProject.id, name: formName.trim(), description: formDesc.trim() || null, color: formColor })
      } else {
        await apiPost('/api/rise/projects', { name: formName.trim(), description: formDesc.trim() || null, color: formColor })
      }
      setDialogOpen(false)
      fetchData()
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  const deleteProject = async (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (selectedProjectId === id) setSelectedProjectId(null)
    try {
      await apiDelete(`/api/rise/projects?id=${id}`)
    } catch {
      fetchData()
    }
  }

  const addTaskToProject = async () => {
    if (!newTaskTitle.trim() || !selectedProjectId) return
    setTaskSubmitting(true)
    try {
      await apiPost('/api/rise/tasks', {
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        projectId: selectedProjectId,
        dueDate: newTaskDueDate || null,
      })
      setNewTaskTitle('')
      setNewTaskPriority('medium')
      setNewTaskDueDate('')
      setAddTaskOpen(false)
      fetchData()
    } catch {
      /* ignore */
    } finally {
      setTaskSubmitting(false)
    }
  }

  const toggleTask = async (task: Task) => {
    const isDone = task.status === 'done'
    const newStatus = isDone ? 'todo' : 'done'
    const optimistic = { ...task, status: newStatus, completedAt: !isDone ? new Date().toISOString() : null }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? optimistic : t)))
    try {
      await apiPut('/api/rise/tasks', { id: task.id, status: newStatus, completedAt: optimistic.completedAt })
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
  }

  const deleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    try {
      await apiDelete(`/api/rise/tasks?id=${taskId}`)
    } catch {
      fetchData()
    }
  }

  const moveTask = async (task: Task, newStatus: string) => {
    const optimistic = { ...task, status: newStatus, completedAt: newStatus === 'done' ? new Date().toISOString() : null }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? optimistic : t)))
    try {
      await apiPut('/api/rise/tasks', { id: task.id, status: newStatus, completedAt: optimistic.completedAt })
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
  }

  const getTaskCountForProject = (projectId: string) => {
    return tasks.filter((t) => t.projectId === projectId).length
  }

  const getDoneCountForProject = (projectId: string) => {
    return tasks.filter((t) => t.projectId === projectId && t.status === 'done').length
  }

  /* ────────────── Render: Loading ────────────── */
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  /* ────────────── Render: Project Detail View ────────────── */
  if (selectedProject) {
    const totalTasks = projectTasks.length
    const doneTasks = projectTasks.filter((t) => t.status === 'done').length
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

    return (
      <motion.div
        key="detail"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        {/* Back button + header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedProjectId(null)}
            className="rounded-xl gap-1.5 text-sm"
          >
            <ArrowRight className="w-4 h-4" />
            المشاريع
          </Button>
        </div>

        {/* Project info card with subtle gradient header */}
        <div
          className="glass rounded-2xl overflow-hidden mb-6"
        >
          {/* Subtle gradient header */}
          <div
            className="h-20 w-full"
            style={{
              background: `linear-gradient(135deg, ${selectedProject.color}15, ${selectedProject.color}05, transparent)`
            }}
          />
          <div className="p-5 -mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
                style={{ backgroundColor: selectedProject.color + '18' }}
              >
                <FolderKanban className="w-6 h-6" style={{ color: selectedProject.color }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold truncate">{selectedProject.name}</h3>
                {selectedProject.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{selectedProject.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ProgressRing progress={progress} size={56} strokeWidth={4} color={selectedProject.color} />
              <div className="flex gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(selectedProject)}>
                      <Pencil className="w-4 h-4 ml-2" />
                      تعديل
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        deleteProject(selectedProject.id)
                      }}
                      className="text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="w-4 h-4 ml-2" />
                      حذف
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  onClick={() => setAddTaskOpen(true)}
                  className="h-9 rounded-xl gap-1.5 bg-emerald-accent hover:bg-emerald-accent/90 text-white text-xs font-semibold shadow-lg shadow-emerald-accent/20"
                >
                  <Plus className="w-4 h-4" />
                  مهمة
                </Button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: 'إجمالي المهام', value: totalTasks, icon: ListChecks, color: 'text-foreground' },
              { label: 'مكتمل', value: doneTasks, icon: CheckCircle2, color: 'text-emerald-accent' },
              { label: 'قيد التنفيذ', value: projectTasks.filter((t) => t.status === 'in_progress').length, icon: Clock, color: 'text-gold' },
            ].map((s) => (
              <div key={s.label} className="bg-muted/50 rounded-xl p-3 text-center">
                <s.icon className={cn('w-4 h-4 mx-auto mb-1', s.color)} />
                <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Overall progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>التقدم الكلي</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: selectedProject.color }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
          </div>
        </div>

        {/* Tasks grouped by status */}
        <div className="space-y-4">
          {[
            { key: 'todo', label: 'للتنفيذ', icon: Circle, color: 'text-blue-500' },
            { key: 'in_progress', label: 'قيد التنفيذ', icon: Clock, color: 'text-gold' },
            { key: 'done', label: 'مكتمل', icon: CheckCircle2, color: 'text-emerald-accent' },
          ].map((group) => {
            const groupTasks = projectTasksByStatus[group.key]
            return (
              <div key={group.key}>
                <div className={cn('flex items-center gap-2 mb-2 px-1', group.color)}>
                  <group.icon className="w-4 h-4" />
                  <span className="text-sm font-semibold">{group.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-full">
                    {groupTasks.length}
                  </Badge>
                </div>
                <AnimatePresence mode="popLayout">
                  {groupTasks.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="glass rounded-2xl p-5 text-center text-sm text-muted-foreground"
                    >
                      لا توجد مهام
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list"
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="space-y-2"
                    >
                      {groupTasks.map((task) => (
                        <motion.div
                          key={task.id}
                          variants={itemVariants}
                          layout
                          className="group"
                        >
                          <div className="glass rounded-xl p-3.5 flex items-start gap-3 transition-all duration-200 hover:shadow-md hover:shadow-emerald-accent/5 hover:-translate-y-0.5">
                            <div className="pt-0.5">
                              <Checkbox
                                checked={task.status === 'done'}
                                onCheckedChange={() => toggleTask(task)}
                                className="w-5 h-5 rounded-full border-2 data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={cn(
                                    'text-sm font-semibold',
                                    task.status === 'done' && 'line-through text-muted-foreground'
                                  )}
                                >
                                  {task.title}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={cn('text-[10px] px-1.5 py-0 h-5 font-medium rounded-full', priorityColors[task.priority])}
                                >
                                  {priorityLabels[task.priority]}
                                </Badge>
                                {task.xpReward > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-gold font-medium">
                                    <Zap className="w-3 h-3" />
                                    {task.xpReward}
                                  </span>
                                )}
                              </div>
                              {task.dueDate && (
                                <span className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDateShort(task.dueDate)}
                                </span>
                              )}
                              {task.subtasks.length > 0 && (
                                <span className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length} مهام فرعية
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {STATUSES.filter((s) => s !== task.status).map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => moveTask(task, s)}>
                                      نقل إلى: {statusLabels[s]}
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
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {/* Add Task Dialog (for project) */}
        <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
          <DialogContent className="sm:max-w-md backdrop-blur-xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-gold" />
                إضافة مهمة
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">العنوان</Label>
                <Input
                  placeholder="ماذا تريد إنجازه؟"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="rounded-xl h-10 focus:ring-2 focus:ring-emerald-accent/40 focus:border-emerald-accent"
                  onKeyDown={(e) => e.key === 'Enter' && addTaskToProject()}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">الأولوية</Label>
                  <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                    <SelectTrigger className="rounded-xl h-10 text-sm focus:ring-2 focus:ring-emerald-accent/40 focus:border-emerald-accent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">عاجل</SelectItem>
                      <SelectItem value="high">مرتفع</SelectItem>
                      <SelectItem value="medium">متوسط</SelectItem>
                      <SelectItem value="low">منخفض</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">تاريخ الاستحقاق</Label>
                  <Input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="rounded-xl h-10 text-sm focus:ring-2 focus:ring-emerald-accent/40 focus:border-emerald-accent"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 mt-4">
              <DialogClose asChild>
                <Button variant="outline" className="rounded-xl text-sm">إلغاء</Button>
              </DialogClose>
              <Button
                onClick={addTaskToProject}
                disabled={!newTaskTitle.trim() || taskSubmitting}
                className="rounded-xl bg-emerald-accent hover:bg-emerald-accent/90 text-white text-sm font-semibold shadow-lg shadow-emerald-accent/20"
              >
                {taskSubmitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                إضافة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    )
  }

  /* ────────────── Render: Projects Grid ────────────── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ابحث في المشاريع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 h-10 rounded-xl glass border-0 bg-transparent text-sm"
          />
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={openAddDialog}
              className="h-10 rounded-xl gap-1.5 bg-emerald-accent hover:bg-emerald-accent/90 text-white text-xs font-semibold shadow-lg shadow-emerald-accent/20"
            >
              <Plus className="w-4 h-4" />
              مشروع جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md backdrop-blur-xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-gold" />
                {editingProject ? 'تعديل المشروع' : 'مشروع جديد'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">اسم المشروع</Label>
                <Input
                  placeholder="مثال: تطوير التطبيق"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="rounded-xl h-10"
                  onKeyDown={(e) => e.key === 'Enter' && saveProject()}
                />
              </div>
              <div>
                <Label className="text-xs font-medium mb-1.5 block">الوصف (اختياري)</Label>
                <Textarea
                  placeholder="وصف مختصر للمشروع..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="rounded-xl min-h-[80px] text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium mb-2 block">اللون</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setFormColor(c)}
                      className={cn(
                        'w-8 h-8 rounded-xl transition-all duration-200',
                        formColor === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-110'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 mt-4">
              <DialogClose asChild>
                <Button variant="outline" className="rounded-xl text-sm">إلغاء</Button>
              </DialogClose>
              <Button
                onClick={saveProject}
                disabled={!formName.trim() || submitting}
                className="rounded-xl bg-emerald-accent hover:bg-emerald-accent/90 text-white text-sm font-semibold shadow-lg shadow-emerald-accent/20"
              >
                {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                {editingProject ? 'حفظ التعديلات' : 'إنشاء المشروع'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Featured Project */}
      {filteredProjects.length > 0 && (() => {
        const featured = filteredProjects.reduce((a, b) => a.progress > b.progress ? a : b, filteredProjects[0])
        return (
          <motion.div variants={itemVariants}>
            <FeaturedProject project={featured} onClick={() => setSelectedProjectId(featured.id)} />
          </motion.div>
        )
      })()}

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filteredProjects.map((project) => {
              const taskCount = getTaskCountForProject(project.id)
              const doneCount = getDoneCountForProject(project.id)
              const calculatedProgress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : project.progress

              return (
                <motion.div
                  key={project.id}
                  variants={itemVariants}
                  layout
                  whileHover={{ scale: 1.02, y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                  className="group cursor-pointer"
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="glass rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-emerald-accent/5 h-full flex flex-col">
                    {/* Color accent bar with gradient overlay */}
                    <div className="h-1.5 w-full relative overflow-hidden">
                      <div className="absolute inset-0" style={{ background: `linear-gradient(to left, transparent, ${project.color}, ${project.color}80)` }} />
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                      {/* Top: Icon + Actions */}
                      <div className="flex items-start justify-between mb-4">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: project.color + '15' }}
                        >
                          <FolderKanban className="w-5 h-5" style={{ color: project.color }} />
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Progress ring */}
                          <ProgressRing progress={calculatedProgress} size={44} strokeWidth={3} color={project.color} />
                          {/* Actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(project) }}>
                                <Pencil className="w-4 h-4 ml-2" />
                                تعديل
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); deleteProject(project.id) }}
                                className="text-red-500 focus:text-red-500"
                              >
                                <Trash2 className="w-4 h-4 ml-2" />
                                حذف
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Name & Description */}
                      <h3 className="text-base font-bold mb-1 truncate">{project.name}</h3>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3 flex-1">
                          {project.description}
                        </p>
                      )}
                      {!project.description && <div className="flex-1" />}

                      {/* Team Avatars */}
                      <TeamAvatars />

                      {/* Bottom: Task count + status */}
                      <div className="flex items-center justify-between pt-3 border-t border-border/50">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <ListChecks className="w-3.5 h-3.5" />
                            {doneCount}/{taskCount} مهمة
                          </span>
                          {doneCount > 0 && (
                            <span className="text-[11px] text-emerald-accent flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {doneCount} مكتمل
                            </span>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] h-5 px-2 rounded-full font-medium border',
                            project.status === 'active' && 'bg-emerald-accent/10 text-emerald-accent border-emerald-accent/20',
                            project.status === 'completed' && 'bg-gold/10 text-gold border-gold/20',
                            project.status === 'archived' && 'bg-muted text-muted-foreground border-muted/30'
                          )}
                        >
                          {project.status === 'active' ? 'نشط' : project.status === 'completed' ? 'مكتمل' : 'متوقف'}
                        </Badge>
                      </div>

                      {/* Progress bar with micro text */}
                      <div className="mt-3">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: project.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${calculatedProgress}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 mt-1 text-left">{doneCount} من {taskCount} مهام مكتملة</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Summary stats at bottom */}
      {projects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-5"
        >
          <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-accent" />
            ملخص المشاريع
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'إجمالي المشاريع', value: projects.length, color: 'text-foreground' },
              { label: 'نشطة', value: projects.filter((p) => p.status === 'active').length, color: 'text-emerald-accent' },
              { label: 'إجمالي المهام', value: tasks.filter((t) => t.projectId).length, color: 'text-gold' },
              { label: 'مهام مكتملة', value: tasks.filter((t) => t.projectId && t.status === 'done').length, color: 'text-forest' },
            ].map((s) => (
              <div key={s.label} className="bg-muted/50 rounded-xl p-3 text-center">
                <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default Projects