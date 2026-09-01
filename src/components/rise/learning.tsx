'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiFetch, apiPost, apiPut, apiDelete } from '@/lib/api-fetch'
import {
  GraduationCap,
  Plus,
  Target,
  Award,
  BookOpen,
  Trash2,
  Lightbulb,
  Brain,
  Sparkles,
  CalendarDays,
  Edit3,
  Check,
  X,
  TrendingUp,
  Flame,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RiseIcon } from '@/components/rise/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { toastSaved, toastError } from '@/lib/toast-helpers'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import { getToday } from '@/lib/rise-utils'

/* ────────────── Types ────────────── */

interface LearningGoal {
  id: string
  title: string
  description: string
  progress: number
  status: 'active' | 'completed' | 'paused'
  createdAt: string
}

interface Course {
  id: string
  name: string
  platform: string
  progress: number
  status: 'in_progress' | 'completed' | 'not_started'
  certificate: boolean
}

interface Skill {
  id: string
  name: string
  level: number // 1-5
  color: string
  colorIdx: number // store index so reloads keep colors consistent
}

interface LearningLog {
  id: string
  date: string
  content: string
  minutesSpent: number
}

interface LearningData {
  goals: LearningGoal[]
  courses: Course[]
  skills: Skill[]
  logs: LearningLog[]
}

// No more localStorage — everything is server-backed via knowledge_items table.

/** Safely parse the `tags` JSON field from a knowledge item. Returns {} on any error. */
function safeParseTags(raw: any): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

const defaultData: LearningData = {
  goals: [],
  courses: [],
  skills: [],
  logs: [],
}

const skillGradientColors = [
  'from-glass/20 to-glass/5 text-glass border-glass/20',
  'from-violet-accent/20 to-violet-accent/5 text-violet-accent border-violet-accent/20',
  'from-gold/20 to-gold/5 text-gold border-gold/20',
  'from-emerald-accent/20 to-emerald-accent/5 text-emerald-accent border-emerald-accent/20',
  'from-rose-accent/20 to-rose-accent/5 text-rose-accent border-rose-accent/20',
  'from-forest/20 to-forest/5 text-forest border-forest/20',
  'from-lime/25 to-lime/5 text-lime-deep border-lime/25',
  'from-glass/30 to-glass/10 text-glass border-glass/30',
]

/* Hex palette (identity-first: glass blue) for SVG/recharts/inline fills —
   chart props can't take Tailwind classes; hexes mirror the token system. */
const skillDotColors = [
  '#007AFF',
  '#A78BFA',
  '#C99A3E',
  '#34C759',
  '#FF5A76',
  '#06B6D4',
  '#A8CC22',
  '#F59E0B',
]

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-center">
      <span className="icon-well w-16 h-16 bg-secondary text-muted-foreground/50 mb-4">
        <Icon className="w-8 h-8" />
      </span>
      <p className="text-lg font-semibold text-muted-foreground">{title}</p>
      <p className="text-sm text-muted-foreground/70 mt-1 max-w-xs">{desc}</p>
    </motion.div>
  )
}

/* ────────────── Progress Ring ────────────── */

function ProgressRing({ level, color, size = 48, strokeWidth = 3 }: { level: number; color: string; size?: number; strokeWidth?: number }) {
  const safeLevel = typeof level === 'number' && !isNaN(level) ? level : 0
  const radius = Math.max(1, (size - strokeWidth) / 2)
  const circumference = 2 * Math.PI * radius
  const progress = (safeLevel / 5) * circumference
  const gradId = `rg-${color.replace(/[^a-z0-9]/g, '')}-${size}`
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id={gradId}>
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={`url(#${gradId})`} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeLinecap="round"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - progress }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-xs font-bold" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{safeLevel}</text>
    </svg>
  )
}

/* ────────────── Component ────────────── */

export default function Learning() {
  const [data, setData] = useState<LearningData>(defaultData)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'goals' | 'courses' | 'skills' | 'logs'>('goals')

  // Add goal dialog
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalDesc, setNewGoalDesc] = useState('')

  // Add course dialog
  const [courseDialogOpen, setCourseDialogOpen] = useState(false)
  const [newCourseName, setNewCourseName] = useState('')
  const [newCoursePlatform, setNewCoursePlatform] = useState('')

  // Add skill dialog
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillLevel, setNewSkillLevel] = useState(1)

  // Log dialog
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [newLogContent, setNewLogContent] = useState('')
  const [newLogMinutes, setNewLogMinutes] = useState('')

  // Editing
  const [editingLog, setEditingLog] = useState<string | null>(null)
  const [editLogContent, setEditLogContent] = useState('')
  const [editLogMinutes, setEditLogMinutes] = useState('')

  // Edit skill
  const [editingSkill, setEditingSkill] = useState<string | null>(null)
  const [editSkillName, setEditSkillName] = useState('')

  // FIX: Load from server API ONCE on mount (no more infinite refresh loops).
  // Each action (add/update/delete) makes a targeted API call and updates local state.
  useEffect(() => {
    let cancelled = false
    async function loadFromServer() {
      try {
        const res = await apiFetch('/api/rise/knowledge?type=learning')
        if (res.ok) {
          const result = await res.json()
          const items = result.items || []
          const goals = items
            .filter((i: any) => i.type === 'learning-goal')
            .map((i: any) => {
              const meta = safeParseTags(i.tags)
              return {
                id: i.id,
                title: i.title,
                description: i.content || '',
                progress: typeof meta.progress === 'number' ? meta.progress : 0,
                status: (meta.status === 'completed' || meta.status === 'paused' ? meta.status : 'active') as 'active' | 'completed' | 'paused',
                createdAt: i.createdAt,
              }
            })
          const courses = items
            .filter((i: any) => i.type === 'learning-course')
            .map((i: any) => {
              const meta = safeParseTags(i.tags)
              const progress = typeof meta.progress === 'number' ? meta.progress : 0
              return {
                id: i.id,
                name: i.title,
                platform: meta.platform || '',
                progress,
                status: (meta.status === 'completed' || meta.status === 'not_started' ? meta.status : (progress > 0 ? 'in_progress' : 'not_started')) as 'in_progress' | 'completed' | 'not_started',
                certificate: !!meta.certificate,
              }
            })
          const skills = items
            .filter((i: any) => i.type === 'learning-skill')
            .map((i: any, idx: number) => {
              const meta = safeParseTags(i.tags)
              const colorIdx = typeof meta.colorIdx === 'number' ? meta.colorIdx : idx
              return {
                id: i.id,
                name: i.title,
                level: typeof meta.level === 'number' ? meta.level : 1,
                color: skillGradientColors[colorIdx % skillGradientColors.length],
                colorIdx,
              }
            })
          const logs = items
            .filter((i: any) => i.type === 'learning-log')
            .map((i: any) => {
              const meta = safeParseTags(i.tags)
              return {
                id: i.id,
                content: i.content || '',
                minutesSpent: typeof meta.minutes === 'number' ? meta.minutes : 0,
                date: meta.date || i.createdAt,
              }
            })
          if (!cancelled) {
            setData({ goals, courses, skills, logs })
          }
        }
      } catch { /* silent */ }
      finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadFromServer()
    return () => { cancelled = true }
  }, [])

  // Each action below makes ONE targeted API call (create / update / delete)
  // and updates local state optimistically with the server-returned id.

  const addGoal = async () => {
    if (!newGoalTitle.trim()) return
    const title = newGoalTitle.trim()
    const description = newGoalDesc.trim()
    // Optimistic local insert with a temp id
    const tempId = `temp-${Date.now()}`
    const optimistic: LearningGoal = {
      id: tempId,
      title,
      description,
      progress: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    setData((prev) => ({ ...prev, goals: [optimistic, ...prev.goals] }))
    setNewGoalTitle('')
    setNewGoalDesc('')
    setGoalDialogOpen(false)
    try {
      const res = await apiPost('/api/rise/knowledge', {
        type: 'learning-goal',
        title,
        content: description,
        tags: JSON.stringify({ progress: 0, status: 'active' }),
      })
      if (res.ok) {
        const created = await res.json()
        // Replace temp id with server id
        setData((prev) => ({
          ...prev,
          goals: prev.goals.map((g) => (g.id === tempId ? { ...g, id: created.id } : g)),
        }))
        toastSaved('الهدف')
      } else {
        // Rollback on failure
        setData((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== tempId) }))
        toast.error('فشل في حفظ الهدف')
      }
    } catch {
      setData((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== tempId) }))
      toast.error('فشل في حفظ الهدف')
    }
  }

  const updateGoalProgress = (id: string, progress: number) => {
    const clamped = Math.min(100, Math.max(0, progress))
    const status: LearningGoal['status'] = clamped >= 100 ? 'completed' : 'active'
    setData((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === id ? { ...g, progress: clamped, status } : g)),
    }))
    // Persist to server (fire-and-forget; id is server id after addGoal succeeds)
    if (!id.startsWith('temp-')) {
      apiPut('/api/rise/knowledge', {
        id,
        tags: JSON.stringify({ progress: clamped, status }),
      }).catch(() => { /* silent — local state is already updated */ })
    }
  }

  const deleteGoal = (id: string) => {
    setData((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }))
    toastSaved('الهدف')
    if (!id.startsWith('temp-')) {
      apiDelete(`/api/rise/knowledge?id=${id}`).catch(() => { /* silent */ })
    }
  }

  const addCourse = async () => {
    if (!newCourseName.trim()) return
    const name = newCourseName.trim()
    const platform = newCoursePlatform.trim()
    const tempId = `temp-${Date.now()}`
    const optimistic: Course = {
      id: tempId,
      name,
      platform,
      progress: 0,
      status: 'not_started',
      certificate: false,
    }
    setData((prev) => ({ ...prev, courses: [optimistic, ...prev.courses] }))
    setNewCourseName('')
    setNewCoursePlatform('')
    setCourseDialogOpen(false)
    try {
      const res = await apiPost('/api/rise/knowledge', {
        type: 'learning-course',
        title: name,
        content: '',
        tags: JSON.stringify({ platform, progress: 0, status: 'not_started', certificate: false }),
      })
      if (res.ok) {
        const created = await res.json()
        setData((prev) => ({
          ...prev,
          courses: prev.courses.map((c) => (c.id === tempId ? { ...c, id: created.id } : c)),
        }))
        toastSaved('الدورة')
      } else {
        setData((prev) => ({ ...prev, courses: prev.courses.filter((c) => c.id !== tempId) }))
        toast.error('فشل في حفظ الدورة')
      }
    } catch {
      setData((prev) => ({ ...prev, courses: prev.courses.filter((c) => c.id !== tempId) }))
      toast.error('فشل في حفظ الدورة')
    }
  }

  const updateCourseProgress = (id: string, progress: number) => {
    const clamped = Math.min(100, Math.max(0, progress))
    const status: Course['status'] = clamped >= 100 ? 'completed' : clamped > 0 ? 'in_progress' : 'not_started'
    setData((prev) => ({
      ...prev,
      courses: prev.courses.map((c) =>
        c.id === id ? { ...c, progress: clamped, status } : c
      ),
    }))
    if (!id.startsWith('temp-')) {
      // Fetch current certificate state to preserve it in tags
      setData((prev) => {
        const c = prev.courses.find((x) => x.id === id)
        if (c) {
          apiPut('/api/rise/knowledge', {
            id,
            tags: JSON.stringify({
              platform: c.platform,
              progress: clamped,
              status,
              certificate: c.certificate,
            }),
          }).catch(() => {})
        }
        return prev
      })
    }
  }

  const toggleCertificate = (id: string) => {
    setData((prev) => {
      const next = prev.courses.map((c) =>
        c.id === id ? { ...c, certificate: !c.certificate } : c
      )
      const updated = next.find((c) => c.id === id)
      if (updated && !id.startsWith('temp-')) {
        apiPut('/api/rise/knowledge', {
          id,
          tags: JSON.stringify({
            platform: updated.platform,
            progress: updated.progress,
            status: updated.status,
            certificate: updated.certificate,
          }),
        }).catch(() => {})
      }
      return { ...prev, courses: next }
    })
  }

  const deleteCourse = (id: string) => {
    setData((prev) => ({ ...prev, courses: prev.courses.filter((c) => c.id !== id) }))
    toastSaved('الدورة')
    if (!id.startsWith('temp-')) {
      apiDelete(`/api/rise/knowledge?id=${id}`).catch(() => { /* silent */ })
    }
  }

  const addSkill = async () => {
    if (!newSkillName.trim()) return
    const name = newSkillName.trim()
    const level = newSkillLevel
    const colorIdx = data.skills.length
    const color = skillGradientColors[colorIdx % skillGradientColors.length]
    const tempId = `temp-${Date.now()}`
    const optimistic: Skill = { id: tempId, name, level, color, colorIdx }
    setData((prev) => ({ ...prev, skills: [...prev.skills, optimistic] }))
    setNewSkillName('')
    setNewSkillLevel(1)
    setSkillDialogOpen(false)
    try {
      const res = await apiPost('/api/rise/knowledge', {
        type: 'learning-skill',
        title: name,
        content: '',
        tags: JSON.stringify({ level, colorIdx }),
      })
      if (res.ok) {
        const created = await res.json()
        setData((prev) => ({
          ...prev,
          skills: prev.skills.map((s) => (s.id === tempId ? { ...s, id: created.id } : s)),
        }))
        toastSaved('المهارة')
      } else {
        setData((prev) => ({ ...prev, skills: prev.skills.filter((s) => s.id !== tempId) }))
        toast.error('فشل في حفظ المهارة')
      }
    } catch {
      setData((prev) => ({ ...prev, skills: prev.skills.filter((s) => s.id !== tempId) }))
      toast.error('فشل في حفظ المهارة')
    }
  }

  const updateSkillLevel = (id: string, level: number) => {
    const clamped = Math.min(5, Math.max(1, level))
    setData((prev) => ({
      ...prev,
      skills: prev.skills.map((s) => (s.id === id ? { ...s, level: clamped } : s)),
    }))
    if (!id.startsWith('temp-')) {
      setData((prev) => {
        const s = prev.skills.find((x) => x.id === id)
        if (s) {
          apiPut('/api/rise/knowledge', {
            id,
            tags: JSON.stringify({ level: clamped, colorIdx: s.colorIdx }),
          }).catch(() => {})
        }
        return prev
      })
    }
  }

  const saveSkillEdit = () => {
    if (!editingSkill || !editSkillName.trim()) return
    const newName = editSkillName.trim()
    setData((prev) => ({
      ...prev,
      skills: prev.skills.map((s) => (s.id === editingSkill ? { ...s, name: newName } : s)),
    }))
    if (!editingSkill.startsWith('temp-')) {
      apiPut('/api/rise/knowledge', { id: editingSkill, title: newName }).catch(() => {})
    }
    setEditingSkill(null)
    setEditSkillName('')
    toastSaved('المهارة')
  }

  const deleteSkill = (id: string) => {
    setData((prev) => ({ ...prev, skills: prev.skills.filter((s) => s.id !== id) }))
    toastSaved('المهارة')
    if (!id.startsWith('temp-')) {
      apiDelete(`/api/rise/knowledge?id=${id}`).catch(() => { /* silent */ })
    }
  }

  const addLog = async () => {
    if (!newLogContent.trim()) return
    const content = newLogContent.trim()
    const minutes = parseInt(newLogMinutes) || 0
    const date = getToday()
    const tempId = `temp-${Date.now()}`
    const optimistic: LearningLog = { id: tempId, date, content, minutesSpent: minutes }
    setData((prev) => ({ ...prev, logs: [optimistic, ...prev.logs] }))
    setNewLogContent('')
    setNewLogMinutes('')
    setLogDialogOpen(false)
    try {
      const res = await apiPost('/api/rise/knowledge', {
        type: 'learning-log',
        title: 'سجل تعلم',
        content,
        tags: JSON.stringify({ minutes, date }),
      })
      if (res.ok) {
        const created = await res.json()
        setData((prev) => ({
          ...prev,
          logs: prev.logs.map((l) => (l.id === tempId ? { ...l, id: created.id } : l)),
        }))
        toastSaved('السجل')
      } else {
        setData((prev) => ({ ...prev, logs: prev.logs.filter((l) => l.id !== tempId) }))
        toast.error('فشل في حفظ السجل')
      }
    } catch {
      setData((prev) => ({ ...prev, logs: prev.logs.filter((l) => l.id !== tempId) }))
      toast.error('فشل في حفظ السجل')
    }
  }

  const saveLogEdit = (id: string) => {
    const minutes = parseInt(editLogMinutes, 10)
    setData((prev) => ({
      ...prev,
      logs: prev.logs.map((l) => (
        l.id === id
          ? { ...l, content: editLogContent, minutesSpent: isNaN(minutes) ? l.minutesSpent : minutes }
          : l
      )),
    }))
    if (!id.startsWith('temp-')) {
      // TASK 25: persist BOTH content and minutes (was content-only — edits
      // to the log's time were impossible "وكذلك في سجل التعلم")
      const log = data.logs.find((l) => l.id === id)
      const nextMinutes = isNaN(minutes) ? (log?.minutesSpent ?? 0) : minutes
      apiPut('/api/rise/knowledge', {
        id,
        content: editLogContent,
        tags: JSON.stringify({ minutes: nextMinutes, date: log?.date || getToday() }),
      }).catch(() => {})
    }
    setEditingLog(null)
    toastSaved('السجل')
  }

  const deleteLog = (id: string) => {
    setData((prev) => ({ ...prev, logs: prev.logs.filter((l) => l.id !== id) }))
    toastSaved('السجل')
    if (!id.startsWith('temp-')) {
      apiDelete(`/api/rise/knowledge?id=${id}`).catch(() => { /* silent */ })
    }
  }

  const totalMinutes = data.logs.reduce((sum, l) => sum + l.minutesSpent, 0)
  const totalHours = Math.round(totalMinutes / 60)
  const activeGoals = data.goals.filter((g) => g.status === 'active').length
  const completedCourses = data.courses.filter((c) => c.status === 'completed').length

  // Learning streak
  const learningStreak = (() => {
    if (data.logs.length === 0) return 0
    const dates = [...new Set(data.logs.map(l => l.date))].sort((a, b) => b.localeCompare(a))
    let streak = 1
    for (let i = 1; i < dates.length; i++) {
      const diff = Math.round((new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / (1000 * 60 * 60 * 24))
      if (diff <= 1) streak++
      else break
    }
    return streak
  })()

  // Skill radar data
  const radarData = data.skills.map((s, i) => ({
    skill: s.name,
    level: s.level,
    fullMark: 5,
    fill: skillDotColors[i % skillDotColors.length],
  }))

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RiseIcon glyph="brain" hue="blue" size="md" lift />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">التعلم</h2>
            <p className="text-sm text-muted-foreground mt-1">تتبع أهدافك التعليمية ومهاراتك ودوراتك</p>
          </div>
        </div>
        {learningStreak > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/15 border border-gold/20"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ type: 'tween', duration: 1.5, repeat: Infinity, repeatType: 'reverse' }}
            >
              <Flame className="w-4 h-4 text-gold" />
            </motion.div>
            <span className="num text-sm font-bold text-gold" dir="ltr">{learningStreak}</span>
            <span className="text-xs text-gold/80">يوم تعلّم</span>
          </motion.div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'أهداف نشطة', value: activeGoals, icon: Target, well: 'iw-blue' },
          { label: 'دورات مكتملة', value: completedCourses, icon: Award, well: 'iw-amber' },
          { label: 'مهارات', value: data.skills.length, icon: Brain, well: 'iw-violet' },
          { label: 'ساعات تعلم', value: totalHours, icon: TrendingUp, well: 'iw-lime' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <div className="neo-card card-lift p-4">
              <div className="flex items-center gap-3">
                <span className={cn('icon-well w-9 h-9', stat.well)}>
                  <stat.icon className="w-4 h-4" />
                </span>
                <div>
                  <p className="num text-2xl font-bold text-foreground" dir="ltr">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'goals' as const, label: 'الأهداف', icon: Target },
          { id: 'courses' as const, label: 'الدورات', icon: GraduationCap },
          { id: 'skills' as const, label: 'المهارات', icon: Brain },
          { id: 'logs' as const, label: 'سجل التعلم', icon: CalendarDays },
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeSection === tab.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSection(tab.id)}
            className={cn(
              'gap-2 rounded-xl',
              activeSection === tab.id
                ? 'bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:bg-forest/90 dark:hover:bg-lime/90'
                : 'border-border bg-card hover:bg-secondary'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* GOALS SECTION */}
      <AnimatePresence mode="wait">
        {activeSection === 'goals' && (
          <motion.div key="goals" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2 bg-forest text-paper-soft dark:bg-lime dark:text-ink">
                    <Plus className="w-4 h-4" />
                    هدف جديد
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" dir="rtl">
                  <DialogHeader><DialogTitle>إضافة هدف تعليمي</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">عنوان الهدف</label>
                      <Input placeholder="مثال: تعلم TypeScript" value={newGoalTitle} onChange={(e) => setNewGoalTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">الوصف</label>
                      <Textarea placeholder="ماذا تريد أن تتعلم؟ ولماذا؟" value={newGoalDesc} onChange={(e) => setNewGoalDesc(e.target.value)} rows={3} />
                    </div>
                    <Button onClick={addGoal} className="w-full bg-forest text-paper-soft dark:bg-lime dark:text-ink" disabled={!newGoalTitle.trim()}>
                      إضافة الهدف
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {data.goals.length === 0 ? (
              <EmptyState icon={Target} title="لا توجد أهداف" desc="أضف أهدافك التعليمية وتابع تقدمك" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.goals.map((goal, i) => (
                  <motion.div key={goal.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <div className={cn(
                      'bg-card border border-border rounded-2xl',
                      goal.status === 'completed' && 'border-s-[3px] border-s-emerald-accent/50',
                      goal.status === 'active' && 'border-s-[3px] border-s-gold/50',
                      goal.status === 'paused' && 'border-s-[3px] border-s-muted-foreground/30',
                    )}>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">{goal.title}</h3>
                            {goal.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={cn('text-[10px] pill', goal.status === 'completed' ? 'pill-success' : goal.status === 'paused' ? 'pill-muted' : 'bg-gold/15 text-gold')}>
                              {goal.status === 'completed' ? 'مكتمل' : goal.status === 'paused' ? 'متوقف' : 'نشط'}
                            </span>
                            <button onClick={() => deleteGoal(goal.id)} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>التقدم</span>
                            <span className="num font-semibold text-foreground" dir="ltr">{goal.progress}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-l from-glass/80 to-glass"
                              initial={{ width: 0 }}
                              animate={{ width: `${goal.progress}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                          </div>
                          <div className="flex gap-1">
                            {[0, 25, 50, 75, 100].map((val) => (
                              <button
                                key={val}
                                onClick={() => updateGoalProgress(goal.id, val)}
                                className={cn(
                                  'flex-1 h-6 rounded text-[10px] font-medium transition-colors',
                                  goal.progress >= val ? 'bg-glass/15 text-glass' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                )}
                              >
                                <span className="num" dir="ltr">{val}%</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* COURSES SECTION */}
        {activeSection === 'courses' && (
          <motion.div key="courses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2 bg-forest text-paper-soft dark:bg-lime dark:text-ink">
                    <Plus className="w-4 h-4" />
                    دورة جديدة
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" dir="rtl">
                  <DialogHeader><DialogTitle>إضافة دورة</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">اسم الدورة</label>
                      <Input placeholder="مثال: React Advanced" value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">المنصة</label>
                      <Input placeholder="مثال: Udemy, Coursera..." value={newCoursePlatform} onChange={(e) => setNewCoursePlatform(e.target.value)} />
                    </div>
                    <Button onClick={addCourse} className="w-full bg-forest text-paper-soft dark:bg-lime dark:text-ink" disabled={!newCourseName.trim()}>
                      إضافة الدورة
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {data.courses.length === 0 ? (
              <EmptyState icon={GraduationCap} title="لا توجد دورات" desc="أضف دوراتك التعليمية وتابع تقدمك" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.courses.map((course, i) => (
                  <motion.div key={course.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <div className="neo-card card-lift">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">{course.name}</h3>
                            {course.platform && <p className="text-xs text-muted-foreground mt-0.5">{course.platform}</p>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {course.certificate && (
                              <div className="p-1 rounded-lg bg-gold/10">
                                <Award className="w-3.5 h-3.5 text-gold" />
                              </div>
                            )}
                            <button onClick={() => toggleCertificate(course.id)} className={cn('p-1 rounded-lg transition-colors', course.certificate ? 'bg-gold/10 text-gold' : 'hover:bg-muted text-muted-foreground')}>
                              <Award className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteCourse(course.id)} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>{course.status === 'completed' ? 'مكتملة' : course.status === 'in_progress' ? 'قيد التعلم' : 'لم تبدأ'}</span>
                            <span className="num font-semibold text-foreground" dir="ltr">{course.progress}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-l from-glass/80 to-glass"
                              initial={{ width: 0 }}
                              animate={{ width: `${course.progress}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                          </div>
                          <Input
                            type="range"
                            min={0}
                            max={100}
                            value={course.progress}
                            onChange={(e) => updateCourseProgress(course.id, parseInt(e.target.value))}
                            className="h-2 cursor-pointer accent-glass"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* SKILLS SECTION */}
        {activeSection === 'skills' && (
          <motion.div key="skills" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="flex justify-end gap-2">
              <Dialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2 bg-forest text-paper-soft dark:bg-lime dark:text-ink">
                    <Plus className="w-4 h-4" />
                    مهارة جديدة
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" dir="rtl">
                  <DialogHeader><DialogTitle>إضافة مهارة</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">اسم المهارة</label>
                      <Input placeholder="مثال: البرمجة، التصميم..." value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">المستوى المبدئي</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setNewSkillLevel(level)}
                            className={cn(
                              'flex-1 h-10 rounded-xl text-sm font-bold transition-all',
                              newSkillLevel >= level
                                ? 'bg-forest text-paper-soft dark:bg-lime dark:text-ink'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button onClick={addSkill} className="w-full bg-forest text-paper-soft dark:bg-lime dark:text-ink" disabled={!newSkillName.trim()}>
                      إضافة المهارة
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {data.skills.length === 0 ? (
              <EmptyState icon={Brain} title="لا توجد مهارات" desc="أضف المهارات التي تطورها" />
            ) : (
              <>
                {/* Skill Radar Chart */}
                {data.skills.length >= 3 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <div className="neo-card card-lift">
                      <div className="pb-3">
                        <h3 className="text-sm flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-gold" />
                          رادار المهارات
                        </h3>
                      </div>
                      <div>
                        <div className="h-64 sm:h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                              <PolarGrid stroke="oklch(0.85 0.005 160)" />
                              <PolarAngleAxis
                                dataKey="skill"
                                tick={{ fontSize: 11, fill: 'oklch(0.4 0.01 160)' }}
                              />
                              <PolarRadiusAxis
                                angle={90}
                                domain={[0, 5]}
                                tick={{ fontSize: 9, fill: 'oklch(0.5 0.01 160)' }}
                              />
                              <Radar
                                name="المستوى"
                                dataKey="level"
                                stroke="#007AFF"
                                fill="#007AFF"
                                fillOpacity={0.2}
                                strokeWidth={2}
                                dot={false}
                              />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Skill Tree Visual */}
                {data.skills.length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <div className="neo-card card-lift">
                      <div className="pb-3">
                        <h3 className="text-sm flex items-center gap-2">
                          <Brain className="w-4 h-4 text-glass" />
                          شجرة المهارات
                        </h3>
                      </div>
                      <div>
                        <div className="overflow-x-auto pb-2">
                          <svg viewBox="0 0 600 120" className="w-full min-w-[400px] h-28">
                            <defs>
                              <linearGradient id="tree-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#007AFF" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#C99A3E" stopOpacity="0.3" />
                              </linearGradient>
                            </defs>
                            {/* Connecting lines */}
                            {data.skills.map((skill, i) => {
                              if (i === 0) return null
                              const prevX = 60 + (i - 1) * (480 / Math.max(data.skills.length - 1, 1))
                              const currX = 60 + i * (480 / Math.max(data.skills.length - 1, 1))
                              return (
                                <motion.line
                                  key={`line-${i}`}
                                  x1={prevX} y1={60} x2={currX} y2={60}
                                  stroke="url(#tree-line-grad)" strokeWidth="2" strokeDasharray="6 4"
                                  initial={{ pathLength: 0, opacity: 0 }}
                                  animate={{ pathLength: 1, opacity: 1 }}
                                  transition={{ delay: 0.2 + i * 0.1, duration: 0.6 }}
                                />
                              )
                            })}
                            {/* Skill nodes */}
                            {data.skills.map((skill, i) => {
                              const x = 60 + i * (480 / Math.max(data.skills.length - 1, 1))
                              const nodeColor = skillDotColors[i % skillDotColors.length]
                              const radius = Math.max(1, 12 + (skill.level || 0) * 3)
                              return (
                                <motion.g
                                  key={skill.id}
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ delay: 0.3 + i * 0.1, type: 'spring', damping: 12 }}
                                >
                                  <circle cx={x} cy={60} r={radius + 4} fill={nodeColor} opacity="0.1" />
                                  <circle cx={x} cy={60} r={radius} fill={nodeColor} opacity="0.8" />
                                  <circle cx={x} cy={60} r={radius - 3} fill={nodeColor} />
                                  <text x={x} y={60} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="bold">{typeof skill.level === 'number' ? skill.level : 0}</text>
                                  <text x={x} y={95} textAnchor="middle" fill="oklch(0.45 0.01 160)" fontSize="10" fontWeight="500">{skill.name.length > 10 ? skill.name.slice(0, 10) + '…' : skill.name}</text>
                                </motion.g>
                              )
                            })}
                          </svg>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Skill Tags with Gradient Backgrounds */}
                <div className="flex flex-wrap gap-3">
                  {data.skills.map((skill, i) => (
                    <motion.div
                      key={skill.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="group relative"
                    >
                      {editingSkill === skill.id ? (
                        <div className={cn('flex items-center gap-2 p-2 rounded-xl border border-border bg-card bg-gradient-to-l shadow-sm', skill.color)}>
                          <Input
                            value={editSkillName}
                            onChange={(e) => setEditSkillName(e.target.value)}
                            className="h-7 text-sm w-28"
                            onKeyDown={(e) => e.key === 'Enter' && saveSkillEdit()}
                            autoFocus
                          />
                          {/* TASK 25: level editor right inside edit mode */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateSkillLevel(skill.id, skill.level - 1)}
                              className="w-6 h-6 rounded-md bg-muted text-muted-foreground hover:bg-muted/70 text-sm font-bold leading-none"
                              title="تقليل المستوى"
                            >
                              −
                            </button>
                            <span className="num text-xs font-semibold w-6 text-center" dir="ltr">{skill.level}/5</span>
                            <button
                              onClick={() => updateSkillLevel(skill.id, skill.level + 1)}
                              className="w-6 h-6 rounded-md bg-muted text-muted-foreground hover:bg-muted/70 text-sm font-bold leading-none"
                              title="رفع المستوى"
                            >
                              +
                            </button>
                          </div>
                          <button onClick={saveSkillEdit} className="p-1 rounded-md bg-glass/10 text-glass hover:bg-glass/20">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingSkill(null)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className={cn('bg-card border border-border rounded-2xl bg-gradient-to-l', skill.color)}>
                          <div className="p-3">
                            <div className="flex items-center gap-2.5">
                              <ProgressRing level={skill.level} color={skillDotColors[i % skillDotColors.length]} size={36} strokeWidth={2.5} />
                              <span className="text-sm font-medium">{skill.name}</span>
                              <span className="text-[10px] text-muted-foreground/60 num" dir="ltr">({skill.level}/٥)</span>
                              {/* TASK 25 — "أقدر أعدل مستوى المهارة بعدين": inline
                                  level stepper. The old edit/delete buttons were
                                  hover-only (opacity-0 group-hover) = INVISIBLE
                                  on touch screens — now always visible. */}
                              <div className="flex items-center gap-1 ms-auto">
                                <button
                                  onClick={() => updateSkillLevel(skill.id, skill.level - 1)}
                                  disabled={skill.level <= 1}
                                  className="w-6 h-6 rounded-md bg-background/60 border border-border text-muted-foreground hover:text-foreground hover:bg-background text-sm font-bold leading-none disabled:opacity-30"
                                  title="تقليل المستوى"
                                >
                                  −
                                </button>
                                <button
                                  onClick={() => updateSkillLevel(skill.id, skill.level + 1)}
                                  disabled={skill.level >= 5}
                                  className="w-6 h-6 rounded-md bg-background/60 border border-border text-muted-foreground hover:text-foreground hover:bg-background text-sm font-bold leading-none disabled:opacity-30"
                                  title="رفع المستوى"
                                >
                                  +
                                </button>
                              </div>
                              <button
                                onClick={() => { setEditingSkill(skill.id); setEditSkillName(skill.name) }}
                                className="p-1 rounded-md hover:bg-background/60 text-muted-foreground hover:text-foreground transition-all"
                                title="تعديل الاسم"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteSkill(skill.id)}
                                className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                title="حذف"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Skill Bars Visual */}
                {data.skills.length > 0 && (
                  <div className="neo-card card-lift">
                    <div className="pb-3">
                      <h3 className="text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-glass" />
                        خريطة المهارات
                      </h3>
                    </div>
                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {data.skills.map((skill, i) => (
                          <div key={skill.id} className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-medium">{skill.name}</span>
                                <span className="num text-muted-foreground" dir="ltr">{skill.level}/5</span>
                              </div>
                              <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: skillDotColors[i % skillDotColors.length] }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(skill.level / 5) * 100}%` }}
                                  transition={{ duration: 0.8, ease: 'easeOut' }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* LOGS SECTION */}
        {activeSection === 'logs' && (
          <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2 bg-forest text-paper-soft dark:bg-lime dark:text-ink">
                    <Plus className="w-4 h-4" />
                    سجل جديد
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" dir="rtl">
                  <DialogHeader><DialogTitle>إضافة سجل تعلم</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">ماذا تعلمت اليوم؟</label>
                      <Textarea placeholder="اكتب ما تعلمته..." value={newLogContent} onChange={(e) => setNewLogContent(e.target.value)} rows={4} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">الوقت (دقائق)</label>
                      <Input type="number" placeholder="30" value={newLogMinutes} onChange={(e) => setNewLogMinutes(e.target.value)} dir="ltr" className="num" />
                    </div>
                    <Button onClick={addLog} className="w-full bg-forest text-paper-soft dark:bg-lime dark:text-ink" disabled={!newLogContent.trim()}>
                      إضافة السجل
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {data.logs.length === 0 ? (
              <EmptyState icon={Lightbulb} title="لا توجد سجلات" desc="سجّل ما تعلمته كل يوم لتتبع تقدمك" />
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {data.logs.map((log, i) => (
                  <motion.div key={log.id} initial={{ opacity: 0, x: 20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: i * 0.05, type: 'spring', damping: 18 }}>
                    <div className="neo-card card-lift">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <BookOpen className="w-3.5 h-3.5 text-glass" />
                              <span className="text-[11px] text-muted-foreground">{new Date(log.date).toLocaleDateString('ar', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                              {log.minutesSpent > 0 && (
                                <span className="pill pill-info text-[10px]">
                                  <span className="num" dir="ltr">{log.minutesSpent}</span> دقيقة
                                </span>
                              )}
                            </div>
                            {editingLog === log.id ? (
                              <div className="space-y-2">
                                <Textarea value={editLogContent} onChange={(e) => setEditLogContent(e.target.value)} rows={2} className="text-sm" />
                                {/* TASK 25: minutes editable too */}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={editLogMinutes}
                                    onChange={(e) => setEditLogMinutes(e.target.value)}
                                    className="h-8 text-sm num w-24"
                                    dir="ltr"
                                    placeholder="دقائق"
                                  />
                                  <span className="text-xs text-muted-foreground">دقيقة</span>
                                  <div className="flex gap-1 ms-auto">
                                    <button onClick={() => saveLogEdit(log.id)} className="p-1.5 rounded-lg bg-glass/10 text-glass hover:bg-glass/20">
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setEditingLog(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm leading-relaxed">{log.content}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingLog(log.id); setEditLogContent(log.content); setEditLogMinutes(String(log.minutesSpent || '')) }}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteLog(log.id)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}