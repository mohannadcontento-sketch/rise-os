'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
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
    return emptyReview
  })
  const [allReviews, setAllReviews] = useState<WeeklyReview[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored) as WeeklyReview[]
    } catch { /* ignore */ }
    return []
  })

  const save = () => {
    const updated = allReviews.some((r) => r.id === review.id)
      ? allReviews.map((r) => (r.id === review.id ? review : r))
      : [review, ...allReviews]
    setAllReviews(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
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

  const achievedCount = review.goals.items.filter((g) => g.achieved).length
  const overallProgress = Math.round(
    (achievedCount / review.goals.items.length) * 100
  )

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-accent" />
            المراجعة الأسبوعية
          </h2>
          <p className="text-sm text-muted-foreground mt-1">تأمّل أسبوعك وخطط للأفضل</p>
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

      {/* Score */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass overflow-hidden">
          <div className="bg-gradient-to-l from-emerald-accent/5 to-transparent p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">درجة الأسبوع</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-4xl font-bold text-emerald-accent">{review.goals.score}</span>
                  <span className="text-lg text-muted-foreground">/ 10</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => setReview((prev) => ({ ...prev, goals: { ...prev.goals, score: s } }))}
                    className={cn(
                      'w-3 h-6 rounded-sm transition-all',
                      s <= review.goals.score ? 'bg-emerald-accent' : 'bg-muted/50'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Section 1: Review */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
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

      {/* Section 2: Numbers */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-gold" />
              الأرقام
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  المهام المكتملة
                </Label>
                <Input
                  type="number"
                  value={review.numbers.tasksCompleted}
                  onChange={(e) => updateNumber('tasksCompleted', parseInt(e.target.value) || 0)}
                  className="text-center text-lg font-bold h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  ساعات التركيز
                </Label>
                <Input
                  type="number"
                  value={review.numbers.focusHours}
                  onChange={(e) => updateNumber('focusHours', parseInt(e.target.value) || 0)}
                  className="text-center text-lg font-bold h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" />
                  الصفحات المقروءة
                </Label>
                <Input
                  type="number"
                  value={review.numbers.pagesRead}
                  onChange={(e) => updateNumber('pagesRead', parseInt(e.target.value) || 0)}
                  className="text-center text-lg font-bold h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Flame className="w-3 h-3" />
                  نسبة إكمال العادات
                </Label>
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-2">
                    <span>النسبة</span>
                    <span className="font-semibold text-foreground">{review.numbers.habitsRate}%</span>
                  </div>
                  <Slider
                    value={[review.numbers.habitsRate]}
                    onValueChange={([v]) => updateNumber('habitsRate', v)}
                    max={100}
                    step={5}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 3: Goals */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
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
                <button
                  onClick={() => toggleGoalAchieved(i)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    goal.achieved
                      ? 'bg-emerald-accent border-emerald-accent text-white'
                      : 'border-muted-foreground/30 hover:border-emerald-accent'
                  )}
                >
                  {goal.achieved && <CheckCircle2 className="w-4 h-4" />}
                </button>
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

      {/* Section 4: Next Week */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
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

      {/* Previous Reviews */}
      {allReviews.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">المراجعات السابقة</CardTitle>
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