'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap,
  Plus,
  Target,
  Award,
  BookOpen,
  Trash2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Brain,
  Sparkles,
  CalendarDays,
  Edit3,
  Check,
  X,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

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

const STORAGE_KEY = 'rise-learning'

const defaultData: LearningData = {
  goals: [],
  courses: [],
  skills: [],
  logs: [],
}

const skillGradientColors = [
  'from-emerald-accent/20 to-emerald-accent/5 text-emerald-accent border-emerald-accent/20',
  'from-forest/20 to-forest/5 text-forest border-forest/20',
  'from-gold/20 to-gold/5 text-gold border-gold/20',
  'from-purple-500/20 to-purple-500/5 text-purple-500 border-purple-500/20',
  'from-orange-500/20 to-orange-500/5 text-orange-500 border-orange-500/20',
  'from-rose-500/20 to-rose-500/5 text-rose-500 border-rose-500/20',
  'from-cyan-500/20 to-cyan-500/5 text-cyan-500 border-cyan-500/20',
  'from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/20',
]

const skillDotColors = [
  'oklch(0.55 0.14 163)',
  'oklch(0.45 0.08 160)',
  'oklch(0.78 0.12 85)',
  'oklch(0.65 0.15 300)',
  'oklch(0.65 0.20 30)',
  'oklch(0.60 0.18 15)',
  'oklch(0.65 0.12 210)',
  'oklch(0.72 0.15 75)',
]

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <p className="text-lg font-semibold text-muted-foreground">{title}</p>
      <p className="text-sm text-muted-foreground/70 mt-1 max-w-xs">{desc}</p>
    </motion.div>
  )
}

/* ────────────── Component ────────────── */

export default function Learning() {
  const [data, setData] = useState<LearningData>(() => {
    if (typeof window === 'undefined') return defaultData
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    return defaultData
  })
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

  // Edit skill
  const [editingSkill, setEditingSkill] = useState<string | null>(null)
  const [editSkillName, setEditSkillName] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const addGoal = () => {
    if (!newGoalTitle.trim()) return
    const goal: LearningGoal = {
      id: crypto.randomUUID(),
      title: newGoalTitle,
      description: newGoalDesc,
      progress: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    setData((prev) => ({ ...prev, goals: [goal, ...prev.goals] }))
    setNewGoalTitle('')
    setNewGoalDesc('')
    setGoalDialogOpen(false)
    toast.success('تمت إضافة الهدف')
  }

  const updateGoalProgress = (id: string, progress: number) => {
    setData((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => {
        if (g.id !== id) return g
        const status = progress >= 100 ? 'completed' : progress > 0 ? 'active' : 'active'
        return { ...g, progress: Math.min(100, progress), status }
      }),
    }))
  }

  const deleteGoal = (id: string) => {
    setData((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }))
    toast.success('تم حذف الهدف')
  }

  const addCourse = () => {
    if (!newCourseName.trim()) return
    const course: Course = {
      id: crypto.randomUUID(),
      name: newCourseName,
      platform: newCoursePlatform,
      progress: 0,
      status: 'not_started',
      certificate: false,
    }
    setData((prev) => ({ ...prev, courses: [course, ...prev.courses] }))
    setNewCourseName('')
    setNewCoursePlatform('')
    setCourseDialogOpen(false)
    toast.success('تمت إضافة الدورة')
  }

  const updateCourseProgress = (id: string, progress: number) => {
    setData((prev) => ({
      ...prev,
      courses: prev.courses.map((c) => {
        if (c.id !== id) return c
        return {
          ...c,
          progress: Math.min(100, progress),
          status: progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started',
        }
      }),
    }))
  }

  const toggleCertificate = (id: string) => {
    setData((prev) => ({
      ...prev,
      courses: prev.courses.map((c) => (c.id === id ? { ...c, certificate: !c.certificate } : c)),
    }))
  }

  const deleteCourse = (id: string) => {
    setData((prev) => ({ ...prev, courses: prev.courses.filter((c) => c.id !== id) }))
    toast.success('تم حذف الدورة')
  }

  const addSkill = () => {
    if (!newSkillName.trim()) return
    const skill: Skill = {
      id: crypto.randomUUID(),
      name: newSkillName,
      level: newSkillLevel,
      color: skillGradientColors[data.skills.length % skillGradientColors.length],
    }
    setData((prev) => ({ ...prev, skills: [...prev.skills, skill] }))
    setNewSkillName('')
    setNewSkillLevel(1)
    setSkillDialogOpen(false)
    toast.success('تمت إضافة المهارة')
  }

  const updateSkillLevel = (id: string, level: number) => {
    setData((prev) => ({
      ...prev,
      skills: prev.skills.map((s) => (s.id === id ? { ...s, level: Math.min(5, Math.max(1, level)) } : s)),
    }))
  }

  const saveSkillEdit = () => {
    if (!editingSkill || !editSkillName.trim()) return
    setData((prev) => ({
      ...prev,
      skills: prev.skills.map((s) => s.id === editingSkill ? { ...s, name: editSkillName.trim() } : s),
    }))
    setEditingSkill(null)
    setEditSkillName('')
    toast.success('تم تحديث المهارة')
  }

  const deleteSkill = (id: string) => {
    setData((prev) => ({ ...prev, skills: prev.skills.filter((s) => s.id !== id) }))
    toast.success('تم حذف المهارة')
  }

  const addLog = () => {
    if (!newLogContent.trim()) return
    const log: LearningLog = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      content: newLogContent,
      minutesSpent: parseInt(newLogMinutes) || 0,
    }
    setData((prev) => ({ ...prev, logs: [log, ...prev.logs] }))
    setNewLogContent('')
    setNewLogMinutes('')
    setLogDialogOpen(false)
    toast.success('تمت إضافة السجل')
  }

  const saveLogEdit = (id: string) => {
    setData((prev) => ({
      ...prev,
      logs: prev.logs.map((l) => (l.id === id ? { ...l, content: editLogContent } : l)),
    }))
    setEditingLog(null)
    toast.success('تم تحديث السجل')
  }

  const deleteLog = (id: string) => {
    setData((prev) => ({ ...prev, logs: prev.logs.filter((l) => l.id !== id) }))
    toast.success('تم حذف السجل')
  }

  const totalMinutes = data.logs.reduce((sum, l) => sum + l.minutesSpent, 0)
  const totalHours = Math.round(totalMinutes / 60)
  const activeGoals = data.goals.filter((g) => g.status === 'active').length
  const completedCourses = data.courses.filter((c) => c.status === 'completed').length

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
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-emerald-accent" />
            التعلم
          </h2>
          <p className="text-sm text-muted-foreground mt-1">تتبع أهدافك التعليمية ومهاراتك ودوراتك</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'أهداف نشطة', value: activeGoals, icon: Target, color: 'text-emerald-accent' },
          { label: 'دورات مكتملة', value: completedCourses, icon: Award, color: 'text-gold' },
          { label: 'مهارات', value: data.skills.length, icon: Brain, color: 'text-forest' },
          { label: 'ساعات تعلم', value: totalHours, icon: TrendingUp, color: 'text-emerald-accent' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn('p-2 rounded-xl bg-background/80', stat.color)}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
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
              activeSection === tab.id && 'bg-emerald-accent hover:bg-emerald-accent/90 text-white'
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
                  <Button size="sm" className="gap-2 bg-emerald-accent hover:bg-emerald-accent/90 text-white">
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
                    <Button onClick={addGoal} className="w-full bg-emerald-accent hover:bg-emerald-accent/90 text-white" disabled={!newGoalTitle.trim()}>
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
                    <Card className="glass">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">{goal.title}</h3>
                            {goal.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className={cn('text-[10px]', goal.status === 'completed' ? 'bg-emerald-accent/10 text-emerald-accent' : 'bg-gold/10 text-gold')}>
                              {goal.status === 'completed' ? 'مكتمل' : goal.status === 'paused' ? 'متوقف' : 'نشط'}
                            </Badge>
                            <button onClick={() => deleteGoal(goal.id)} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>التقدم</span>
                            <span className="font-semibold text-foreground">{goal.progress}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-l from-emerald-accent to-forest"
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
                                  goal.progress >= val ? 'bg-emerald-accent/15 text-emerald-accent' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                )}
                              >
                                {val}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
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
                  <Button size="sm" className="gap-2 bg-emerald-accent hover:bg-emerald-accent/90 text-white">
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
                    <Button onClick={addCourse} className="w-full bg-emerald-accent hover:bg-emerald-accent/90 text-white" disabled={!newCourseName.trim()}>
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
                    <Card className="glass">
                      <CardContent className="p-5">
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
                            <span className="font-semibold text-foreground">{course.progress}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-l from-emerald-accent to-gold"
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
                            className="h-2 cursor-pointer accent-emerald-accent"
                          />
                        </div>
                      </CardContent>
                    </Card>
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
                  <Button size="sm" className="gap-2 bg-emerald-accent hover:bg-emerald-accent/90 text-white">
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
                                ? 'bg-emerald-accent text-white'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button onClick={addSkill} className="w-full bg-emerald-accent hover:bg-emerald-accent/90 text-white" disabled={!newSkillName.trim()}>
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
                    <Card className="glass">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-gold" />
                          رادار المهارات
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
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
                                stroke="oklch(0.55 0.14 163)"
                                fill="oklch(0.55 0.14 163)"
                                fillOpacity={0.2}
                                strokeWidth={2}
                                dot={{ r: 4, fill: 'oklch(0.55 0.14 163)' }}
                              />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
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
                        <div className={cn('flex items-center gap-2 p-2 rounded-xl border bg-gradient-to-l border shadow-sm', skill.color)}>
                          <Input
                            value={editSkillName}
                            onChange={(e) => setEditSkillName(e.target.value)}
                            className="h-7 text-sm w-28"
                            onKeyDown={(e) => e.key === 'Enter' && saveSkillEdit()}
                            autoFocus
                          />
                          <button onClick={saveSkillEdit} className="p-1 rounded-md bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingSkill(null)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <Card className={cn('glass overflow-hidden border', skill.color, 'bg-gradient-to-l')}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((level) => (
                                  <motion.button
                                    key={level}
                                    whileTap={{ scale: 0.8 }}
                                    onClick={() => updateSkillLevel(skill.id, level)}
                                    className="w-3 h-3 rounded-full border-2 transition-all"
                                    style={{
                                      backgroundColor: level <= skill.level ? 'currentColor' : 'transparent',
                                      borderColor: 'currentColor',
                                      opacity: level <= skill.level ? 1 : 0.2,
                                    }}
                                  />
                                ))}
                              </div>
                              <span className="text-sm font-medium">{skill.name}</span>
                              <span className="text-[10px] text-muted-foreground/60">({skill.level}/5)</span>
                              <button
                                onClick={() => { setEditingSkill(skill.id); setEditSkillName(skill.name) }}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteSkill(skill.id)}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Skill Bars Visual */}
                {data.skills.length > 0 && (
                  <Card className="glass">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-accent" />
                        خريطة المهارات
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {data.skills.map((skill, i) => (
                          <div key={skill.id} className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-medium">{skill.name}</span>
                                <span className="text-muted-foreground">{skill.level}/5</span>
                              </div>
                              <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
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
                    </CardContent>
                  </Card>
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
                  <Button size="sm" className="gap-2 bg-emerald-accent hover:bg-emerald-accent/90 text-white">
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
                      <Input type="number" placeholder="30" value={newLogMinutes} onChange={(e) => setNewLogMinutes(e.target.value)} />
                    </div>
                    <Button onClick={addLog} className="w-full bg-emerald-accent hover:bg-emerald-accent/90 text-white" disabled={!newLogContent.trim()}>
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
                  <motion.div key={log.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="glass">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <BookOpen className="w-3.5 h-3.5 text-emerald-accent" />
                              <span className="text-[11px] text-muted-foreground">{new Date(log.date).toLocaleDateString('ar', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                              {log.minutesSpent > 0 && (
                                <Badge variant="secondary" className="text-[10px] bg-emerald-accent/10 text-emerald-accent">
                                  {log.minutesSpent} دقيقة
                                </Badge>
                              )}
                            </div>
                            {editingLog === log.id ? (
                              <div className="flex gap-2">
                                <Textarea value={editLogContent} onChange={(e) => setEditLogContent(e.target.value)} rows={2} className="text-sm" />
                                <div className="flex flex-col gap-1">
                                  <button onClick={() => saveLogEdit(log.id)} className="p-1.5 rounded-lg bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditingLog(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm leading-relaxed">{log.content}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingLog(log.id); setEditLogContent(log.content) }}
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
                      </CardContent>
                    </Card>
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