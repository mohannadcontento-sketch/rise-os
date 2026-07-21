'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  CheckCircle2,
  Target,
  Clock,
  BookOpen,
  Flame,
  ArrowLeft,
  Save,
  RotateCcw,
  Calendar,
  Star,
  Award,
  Zap,
  Sparkles,
  Trophy,
  Rocket,
  Heart,
  MessageCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'

/* ────────────── Types ────────────── */

interface WeeklyReview {
  id: string
  weekStart: string
  review: {
    wentWell: string
    improved: string
    lessons: string
  }
  numbers: {
    tasksCompleted: number
    focusHours: number
    pagesRead: number
    habitsRate: number
  }
  goals: {
    items: { text: string; achieved: boolean }[]
    score: number
  }
  nextWeek: {
    priorities: [string, string, string]
    goals: string
  }
}

const STORAGE_KEY = 'rise-weekly-review'

const emptyReview = (): WeeklyReview => ({
  id: crypto.randomUUID(),
  weekStart: new Date().toISOString().split('T')[0],
  review: { wentWell: '', improved: '', lessons: '' },
  numbers: { tasksCompleted: 0, focusHours: 0, pagesRead: 0, habitsRate: 50 },
  goals: { items: [{ text: '', achieved: false }, { text: '', achieved: false }, { text: '', achieved: false }], score: 5 },
  nextWeek: { priorities: ['', '', ''], goals: '' },
})

/* ────────────── Motivational Messages ────────────── */

function getMotivationalMessage(score: number): { icon: React.ElementType; text: string; color: string; bg: string } {
  if (score >= 9) return { icon: Trophy, text: 'أسبوع أسطوري! أنت في القمة، استمر على هذا المستوى المذهل 🏆', color: 'text-gold', bg: 'bg-gold/10 border-gold/20' }
  if (score >= 8) return { icon: Rocket, text: 'أداء ممتاز! أنت على المسار الصحيح نحو أهدافك 🚀', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10 border-emerald-accent/20' }
  if (score >= 7) return { icon: Star, text: 'أسبوع رائع! استمر في التحسن والتميّز ⭐', color: 'text-emerald-accent', bg: 'bg-emerald-accent/10 border-emerald-accent/20' }
  if (score >= 5) return { icon: TrendingUp, text: 'بداية جيدة، هناك مساحة للتحسين. استمر بالمحاولة! 💪', color: 'text-gold', bg: 'bg-gold/10 border-gold/20' }
  if (score >= 3) return { icon: Heart, text: 'لا تقلق، كل بداية صعبة. الأهم أنك هنا وتحاول ❤️', color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20' }
  return { icon: Sparkles, text: 'الأسبوع القادم فرصة جديدة. ابدأ صغيراً وحقق تقدماً! ✨', color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/20' }
}

/* ────────────── Component ────────────── */

export default function WeeklyReview() {
  const [review, setReview] = useState<WeeklyReview>(() => {
    if (typeof window === 'undefined') return emptyReview()
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: WeeklyReview[] = JSON.parse(stored)
        const thisWeek = parsed.find((r) => {
          const diff = Math.abs(new Date(r.weekStart).getTime() - new Date().getTime())
          return diff < 7 * 24 * 60 * 60 * 1000
        })
        if (thisWeek) return thisWeek
      }
    } catch { /* ignore */ }
    return emptyReview()
  })
  const [allReviews, setAllReviews] = useState<WeeklyReview[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored) as WeeklyReview[]
    } catch { /* ignore */ }
    return []
  })
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Week date range
  const weekRange = (() => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const start = new Date(now)
    start.setDate(now.getDate() - dayOfWeek)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      start: start.toLocaleDateString('ar', { day: 'numeric', month: 'long' }),
      end: end.toLocaleDateString('ar', { day: 'numeric', month: 'long' }),
    }
  })()

  const save = () => {
    const updated = allReviews.some((r) => r.id === review.id)
      ? allReviews.map((r) => (r.id === review.id ? review : r))
      : [review, ...allReviews]
    setAllReviews(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setShowConfetti(true)
    setTimeout(() => setShowConfetti(false), 2500)
    toast.success('تم حفظ المراجعة الأسبوعية')
  }

  const reset = () => {
    setReview(emptyReview())
    toast.success('تم إعادة تعيين المراجعة')
  }

  const updateReview = (field: string, value: string) => {
    setReview((prev) => ({
      ...prev,
      review: { ...prev.review, [field]: value },
    }))
  }

  const updateNumber = (field: string, value: number) => {
    setReview((prev) => ({
      ...prev,
      numbers: { ...prev.numbers, [field]: value },
    }))
  }

  const updateGoalItem = (index: number, text: string) => {
    setReview((prev) => {
      const items = [...prev.goals.items]
      items[index] = { ...items[index], text }
      return { ...prev, goals: { ...prev.goals, items } }
    })
  }

  const toggleGoalAchieved = (index: number) => {
    setReview((prev) => {
      const items = [...prev.goals.items]
      items[index] = { ...items[index], achieved: !items[index].achieved }
      return { ...prev, goals: { ...prev.goals, items } }
    })
  }

  const updatePriority = (index: number, value: string) => {
    setReview((prev) => {
      const priorities: [string, string, string] = [...prev.nextWeek.priorities]
      priorities[index] = value
      return { ...prev, nextWeek: { ...prev.nextWeek, priorities } }
    })
  }

  // Auto-Fill Data
  const handleAutoFill = async () => {
    setIsAutoFilling(true)
    try {
      const [tasksRes, focusRes] = await Promise.all([
        apiFetch('/api/rise/tasks'),
        apiFetch('/api/rise/focus'),
      ])
      const tasksData = await tasksRes.json()
      const focusData = await focusRes.json()

      // Count completed tasks this week
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      const completedTasks = (tasksData.tasks || []).filter(
        (t: { status: string; completedAt: string | null }) =>
          t.status === 'done' && t.completedAt && new Date(t.completedAt) >= oneWeekAgo
      ).length

      // Sum completed focus session minutes this week
      const completedFocusMin = (focusData.sessions || [])
        .filter((s: { completed: boolean; startedAt: string }) =>
          s.completed && new Date(s.startedAt) >= oneWeekAgo
        )
        .reduce((sum: number, s: { actualMin: number }) => sum + (s.actualMin || 0), 0)

      const focusHours = Math.round((completedFocusMin / 60) * 10) / 10

      setReview((prev) => ({
        ...prev,
        numbers: {
          ...prev.numbers,
          tasksCompleted: completedTasks,
          focusHours,
        },
      }))

      toast.success(`تم تعبئة البيانات: ${completedTasks} مهمة مكتملة، ${focusHours} ساعة تركيز`)
    } catch {
      toast.error('فشل في جلب البيانات')
    } finally {
      setIsAutoFilling(false)
    }
  }

  const achievedCount = review.goals.items.filter((g) => g.achieved).length
  const overallProgress = Math.round(
    (achievedCount / review.goals.items.length) * 100
  )

  const motivational = getMotivationalMessage(review.goals.score)
  const MotivationalIcon = motivational.icon

  // Score labels
  const getScoreLabel = (score: number) => {
    if (score <= 2) return 'ضعيف'
    if (score <= 4) return 'مقبول'
    if (score <= 6) return 'جيد'
    if (score <= 8) return 'ممتاز'
    return 'استثنائي'
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto relative">
      {/* Confetti Animation */}
      <AnimatePresence>
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {Array.from({ length: 30 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: '50%', y: '-10%', opacity: 1, scale: 1 }}
                animate={{
                  x: `${Math.random() * 100}%`,
                  y: `${60 + Math.random() * 40}%`,
                  opacity: 0,
                  scale: 0.3,
                  rotate: Math.random() * 720,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5 + Math.random(), ease: 'easeOut' }}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  backgroundColor: ['oklch(0.55 0.14 163)', 'oklch(0.78 0.12 85)', 'oklch(0.65 0.20 30)', 'oklch(0.65 0.15 300)', 'oklch(0.60 0.18 15)'][i % 5],
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Header with week date range */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl overflow-hidden relative"
      >
        <div className="absolute inset-0 bg-gradient-to-bl from-emerald-accent/10 via-forest/5 to-gold/10 dark:from-emerald-accent/15 dark:via-forest/10 dark:to-gold/10" />
        <div className="absolute inset-0 noise-bg opacity-15" />
        <div className="relative glass p-5 border-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-5 h-5 text-emerald-accent" />
                <h2 className="text-xl font-bold text-foreground">المراجعة الأسبوعية</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {weekRange.start} — {weekRange.end}
              </p>
              <p className="text-xs text-emerald-accent/70 mt-1">{motivational.text}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-xs">
                <RotateCcw className="w-3.5 h-3.5" />
                إعادة
              </Button>
              <Button size="sm" onClick={save} className="gap-1.5 text-xs bg-emerald-accent hover:bg-emerald-accent/90 text-white">
                <Save className="w-3.5 h-3.5" />
                حفظ
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Score Card with Visual Slider */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass overflow-hidden">
          <div className="bg-gradient-to-l from-emerald-accent/8 via-emerald-accent/3 to-transparent p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">درجة الأسبوع</p>
                  <div className="flex items-center gap-3 mt-1">
                    <motion.span
                      key={review.goals.score}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="text-4xl font-bold text-emerald-accent"
                    >
                      {review.goals.score}
                    </motion.span>
                    <div className="flex flex-col">
                      <span className="text-lg text-muted-foreground">/ 10</span>
                      <span className={cn('text-xs font-semibold', motivational.color)}>
                        {getScoreLabel(review.goals.score)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                    <motion.div
                      key={s}
                      whileHover={{ scale: 1.3, y: -2 }}
                    >
                      <button
                        onClick={() => setReview((prev) => ({ ...prev, goals: { ...prev.goals, score: s } }))}
                        className={cn(
                          'w-3.5 h-6 rounded-full transition-all duration-200',
                          s <= review.goals.score
                            ? 'bg-emerald-accent shadow-sm shadow-emerald-accent/30'
                            : 'bg-muted/40 hover:bg-muted/60'
                        )}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
              {/* Score Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>ضعيف</span>
                  <span>استثنائي</span>
                </div>
                <Slider
                  value={[review.goals.score]}
                  onValueChange={([v]) => setReview((prev) => ({ ...prev, goals: { ...prev.goals, score: v } }))}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Section 1: Review - with emerald accent border */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="glass premium-card border-r-emerald-accent/50 border-r-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2.5 pr-3 border-r-3 border-r-emerald-accent">
              <CheckCircle2 className="w-4 h-4 text-emerald-accent" />
              المراجعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-gold" />
                ما الذي سار بشكل جيد؟
              </Label>
              <Textarea
                placeholder="اكتب إنجازاتك وإيجابيات الأسبوع..."
                value={review.review.wentWell}
                onChange={(e) => updateReview('wentWell', e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
                ما الذي يمكن تحسينه؟
              </Label>
              <Textarea
                placeholder="ما الذي لم يسرِ كما توقعت؟"
                value={review.review.improved}
                onChange={(e) => updateReview('improved', e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-forest" />
                الدروس المستفادة
              </Label>
              <Textarea
                placeholder="أهم الدروس والخبرات من هذا الأسبوع..."
                value={review.review.lessons}
                onChange={(e) => updateReview('lessons', e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 2: Numbers - with animated bars */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="glass premium-card border-r-gold/50 border-r-3">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2.5 pr-3 border-r-3 border-r-gold">
                <Target className="w-4 h-4 text-gold" />
                الأرقام
              </CardTitle>
              <motion.div whileHover={{ scale: 1.02 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  disabled={isAutoFilling}
                  className="gap-1.5 text-xs border-emerald-accent/30 text-emerald-accent hover:bg-emerald-accent/10"
                >
                  {isAutoFilling ? (
                    <div className="w-3.5 h-3.5 border-2 border-emerald-accent/30 border-t-emerald-accent rounded-full animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  تعبئة تلقائية
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'المهام المكتملة', value: review.numbers.tasksCompleted, max: 20, icon: CheckCircle2, color: 'text-emerald-accent', barColor: 'from-emerald-accent to-forest' },
                { label: 'ساعات التركيز', value: review.numbers.focusHours, max: 10, icon: Clock, color: 'text-blue-500', barColor: 'from-blue-500 to-indigo-500' },
                { label: 'الصفحات المقروءة', value: review.numbers.pagesRead, max: 200, icon: BookOpen, color: 'text-gold', barColor: 'from-gold to-amber-500' },
                { label: 'نسبة إكمال العادات', value: review.numbers.habitsRate, max: 100, icon: Flame, color: 'text-orange-500', barColor: 'from-orange-500 to-rose-500', isPercent: true },
              ].map((metric, i) => {
                const percent = Math.min(100, Math.round((metric.value / metric.max) * 100))
                return (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.05 }}
                    className="space-y-2.5 p-3 rounded-xl bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <metric.icon className={cn('w-3.5 h-3.5', metric.color)} />
                        <span className="text-xs text-muted-foreground">{metric.label}</span>
                      </div>
                      <span className={cn('text-sm font-bold', metric.color)}>
                        {metric.value}{metric.isPercent ? '%' : ''}
                      </span>
                    </div>
                    {/* Animated Progress Bar */}
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full bg-gradient-to-l', metric.barColor)}
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 + i * 0.05 }}
                      />
                    </div>
                    {/* Keep input for editing */}
                    <Input
                      type="number"
                      value={metric.value}
                      onChange={(e) => updateNumber(
                        metric.isPercent ? 'habitsRate' : metric.label === 'المهام المكتملة' ? 'tasksCompleted' : metric.label === 'ساعات التركيز' ? 'focusHours' : 'pagesRead',
                        parseInt(e.target.value) || 0
                      )}
                      className="text-center text-sm font-semibold h-8 bg-transparent border-dashed"
                    />
                  </motion.div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 3: Goals - with emerald accent border */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass premium-card border-r-emerald-accent/50 border-r-3">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2.5 pr-3 border-r-3 border-r-emerald-accent">
                <Target className="w-4 h-4 text-emerald-accent" />
                الأهداف الأسبوعية
              </CardTitle>
              <Badge variant="secondary" className="text-[10px] bg-emerald-accent/10 text-emerald-accent">
                {achievedCount}/{review.goals.items.length} مكتمل
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {review.goals.items.map((goal, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => toggleGoalAchieved(i)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    goal.achieved
                      ? 'bg-emerald-accent border-emerald-accent text-white'
                      : 'border-muted-foreground/30 hover:border-emerald-accent'
                  )}
                >
                  {goal.achieved && <CheckCircle2 className="w-4 h-4" />}
                </motion.button>
                <Input
                  placeholder={`الهدف ${i + 1}`}
                  value={goal.text}
                  onChange={(e) => updateGoalItem(i, e.target.value)}
                  className="border-0 bg-transparent focus-visible:ring-0 p-0 h-auto text-sm"
                />
              </div>
            ))}
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>التقدم</span>
                <span>{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 4: Next Week - with emerald accent border */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="glass premium-card border-r-forest/50 border-r-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2.5 pr-3 border-r-3 border-r-forest">
              <ArrowLeft className="w-4 h-4 text-forest" />
              الأسبوع القادم
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-accent" />
                أولويات الأسبوع القادم
              </p>
              {review.nextWeek.priorities.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-accent/10 flex items-center justify-center text-xs font-bold text-emerald-accent shrink-0">
                    {i + 1}
                  </div>
                  <Input
                    placeholder={`الأولوية ${i + 1}`}
                    value={p}
                    onChange={(e) => updatePriority(i, e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-gold" />
                أهداف الأسبوع القادم
              </Label>
              <Textarea
                placeholder="ماذا تريد أن تحقق الأسبوع القادم؟"
                value={review.nextWeek.goals}
                onChange={(e) => setReview((prev) => ({ ...prev, nextWeek: { ...prev.nextWeek, goals: e.target.value } }))}
                rows={4}
                className="text-sm resize-none"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Weekly Highlights - SVG Radar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
        <Card className="glass premium-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2.5 pr-3 border-r-3 border-r-purple-500">
              <Sparkles className="w-4 h-4 text-purple-500" />
              أبرز لحظات الأسبوع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Simple SVG Radar */}
              <div className="shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 200 200" className="w-40 h-40 sm:w-48 sm:h-48">
                  <defs>
                    <linearGradient id="wradar-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="oklch(0.55 0.14 163)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="oklch(0.78 0.12 85)" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                  {/* Grid pentagons */}
                  {[20, 40, 60, 80, 100].map((r, i) => {
                    const points = [0, 1, 2, 3, 4].map(j => {
                      const angle = (j * 2 * Math.PI / 5) - Math.PI / 2
                      return `${100 + r * 0.8 * Math.cos(angle)},${100 + r * 0.8 * Math.sin(angle)}`
                    }).join(' ')
                    return <polygon key={i} points={points} fill="none" stroke="oklch(0.7 0.01 160)" strokeWidth="0.5" opacity="0.3" />
                  })}
                  {/* Data polygon */}
                  <motion.polygon
                    points={[
                      { val: review.numbers.tasksCompleted, max: 20 },
                      { val: review.numbers.focusHours, max: 10 },
                      { val: review.numbers.pagesRead, max: 200 },
                      { val: review.numbers.habitsRate, max: 100 },
                      { val: review.goals.score, max: 10 },
                    ].map((d, j) => {
                      const r = Math.min(1, d.val / d.max) * 80
                      const angle = (j * 2 * Math.PI / 5) - Math.PI / 2
                      return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`
                    }).join(' ')}
                    fill="url(#wradar-fill)"
                    stroke="oklch(0.55 0.14 163)"
                    strokeWidth="2"
                    initial={{ opacity: 0, scale: 0.5, transformOrigin: '100px 100px' }}
                    animate={{ opacity: 1, scale: 1, transformOrigin: '100px 100px' }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                  />
                  {/* Labels */}
                  {['مهام', 'تركيز', 'قراءة', 'عادات', 'أهداف'].map((label, j) => {
                    const r = 95
                    const angle = (j * 2 * Math.PI / 5) - Math.PI / 2
                    return (
                      <text key={label} x={100 + r * Math.cos(angle)} y={100 + r * Math.sin(angle)} textAnchor="middle" dominantBaseline="central" fill="oklch(0.45 0.01 160)" fontSize="9" fontWeight="500">{label}</text>
                    )
                  })}
                </svg>
              </div>
              {/* Highlights list */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-gold" />
                  <span className="text-xs font-semibold text-muted-foreground">أضف أبرز لحظات أسبوعك</span>
                </div>
                <Textarea
                  placeholder="✨ ما هي أبرز إنجازاتك ومفاجآتك هذا الأسبوع؟"
                  value={review.review.lessons}
                  onChange={(e) => updateReview('lessons', e.target.value)}
                  rows={4}
                  className="text-sm resize-none border-purple-200/30 dark:border-purple-800/20 focus-visible:ring-purple-500/30"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Motivational Message */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className={cn('glass border', motivational.bg)}>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <motion.div
                className="p-2.5 rounded-xl shrink-0"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <MotivationalIcon className={cn('w-5 h-5', motivational.color)} />
              </motion.div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <MessageCircle className={cn('w-3.5 h-3.5', motivational.color)} />
                  <span className="text-xs font-semibold text-muted-foreground">رسالة تحفيزية</span>
                </div>
                <p className={cn('text-sm leading-relaxed font-medium', motivational.color)}>
                  {motivational.text}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Previous Reviews */}
      {allReviews.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2.5 pr-3 border-r-3 border-r-muted-foreground/30 text-muted-foreground">
                المراجعات السابقة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allReviews
                  .filter((r) => r.id !== review.id)
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setReview(r)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-accent/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-emerald-accent">{r.goals.score}</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium">مراجعة الأسبوع</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(r.weekStart).toLocaleDateString('ar')}</p>
                        </div>
                      </div>
                      <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
