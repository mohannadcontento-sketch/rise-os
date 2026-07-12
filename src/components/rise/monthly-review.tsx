'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Save,
  RotateCcw,
  Heart,
  Wallet,
  GraduationCap,
  Users,
  Briefcase,
  Star,
  Trophy,
  TrendingUp,
  ArrowLeft,
  Target,
  Award,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'

/* ────────────── Types ────────────── */

interface CategoryReview {
  id: string
  name: string
  icon: React.ElementType
  color: string
  score: number
  notes: string
}

interface MonthlyReview {
  id: string
  month: string
  score: number
  wins: string
  categories: CategoryReview[]
  goalProgress: string
  nextPriorities: string
  nextGoals: string
}

const STORAGE_KEY = 'rise-monthly-review'

const defaultCategories: CategoryReview[] = [
  { id: 'health', name: 'الصحة', icon: Heart, color: 'text-rose-500', score: 5, notes: '' },
  { id: 'finance', name: 'المالية', icon: Wallet, color: 'text-gold', score: 5, notes: '' },
  { id: 'learning', name: 'التعلم', icon: GraduationCap, color: 'text-forest', score: 5, notes: '' },
  { id: 'relationships', name: 'العلاقات', icon: Users, color: 'text-purple-500', score: 5, notes: '' },
  { id: 'career', name: 'المهنة', icon: Briefcase, color: 'text-emerald-accent', score: 5, notes: '' },
]

const emptyReview = (): MonthlyReview => ({
  id: crypto.randomUUID(),
  month: new Date().toISOString().slice(0, 7),
  score: 5,
  wins: '',
  categories: defaultCategories.map((c) => ({ ...c })),
  goalProgress: '',
  nextPriorities: '',
  nextGoals: '',
})

/* ────────────── Component ────────────── */

export default function MonthlyReview() {
  const [allReviews, setAllReviews] = useState<MonthlyReview[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored) as MonthlyReview[]
    } catch { /* ignore */ }
    return []
  })
  const [review, setReview] = useState<MonthlyReview>(() => {
    if (typeof window === 'undefined') return emptyReview()
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: MonthlyReview[] = JSON.parse(stored)
        const thisMonth = parsed.find((r) => r.month === new Date().toISOString().slice(0, 7))
        if (thisMonth) return thisMonth
      }
    } catch { /* ignore */ }
    return emptyReview()
  })

  const save = () => {
    const updated = allReviews.some((r) => r.id === review.id)
      ? allReviews.map((r) => (r.id === review.id ? review : r))
      : [review, ...allReviews]
    setAllReviews(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    toast.success('تم حفظ المراجعة الشهرية')
  }

  const reset = () => {
    setReview(emptyReview())
    toast.success('تم إعادة التعيين')
  }

  const updateCategory = (id: string, field: 'score' | 'notes', value: number | string) => {
    setReview((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }))
  }

  const radarData = review.categories.map((c) => ({
    category: c.name,
    score: c.score,
    fullMark: 10,
  }))

  const avgScore = Math.round(review.categories.reduce((s, c) => s + c.score, 0) / review.categories.length)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-accent" />
            المراجعة الشهرية
          </h2>
          <p className="text-sm text-muted-foreground mt-1">تأمّل شهرك وخطط للتقدم</p>
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

      {/* Score + Radar */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Score Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass overflow-hidden h-full">
            <div className="bg-gradient-to-l from-emerald-accent/5 to-transparent p-5 h-full flex flex-col justify-center">
              <p className="text-sm text-muted-foreground mb-1">درجة الشهر</p>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-5xl font-bold text-emerald-accent">{review.score}</span>
                <span className="text-xl text-muted-foreground">/ 10</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => setReview((prev) => ({ ...prev, score: s }))}
                    className={cn(
                      'flex-1 h-2 rounded-full transition-all',
                      s <= review.score ? 'bg-emerald-accent' : 'bg-muted/50'
                    )}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gold" />
                <span className="text-xs text-muted-foreground">المتوسط: {avgScore}/10</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Radar Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-accent" />
                خريطة الفئات
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="oklch(0.7 0.01 160 / 0.2)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fontSize: 11, fill: 'oklch(0.5 0.01 160)' }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 10]}
                      tick={{ fontSize: 9, fill: 'oklch(0.5 0.01 160)' }}
                    />
                    <Radar
                      name="الدرجة"
                      dataKey="score"
                      stroke="oklch(0.55 0.14 163)"
                      fill="oklch(0.55 0.14 163)"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Wins */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-gold" />
              إنجازات وبطولات الشهر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="اكتب أهم إنجازاتك هذا الشهر..."
              value={review.wins}
              onChange={(e) => setReview((prev) => ({ ...prev, wins: e.target.value }))}
              rows={4}
              className="text-sm resize-none"
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Categories */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-emerald-accent" />
              مراجعة الفئات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {review.categories.map((cat) => {
              const Icon = cat.icon
              return (
                <div key={cat.id} className="space-y-3 p-4 rounded-xl bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('p-2 rounded-lg bg-background', cat.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-2xl font-bold', cat.color)}>{cat.score}</span>
                      <span className="text-sm text-muted-foreground">/ 10</span>
                    </div>
                  </div>
                  <Slider
                    value={[cat.score]}
                    onValueChange={([v]) => updateCategory(cat.id, 'score', v)}
                    max={10}
                    step={1}
                    className="mt-1"
                  />
                  <Textarea
                    placeholder={`ملاحظات عن ${cat.name}...`}
                    value={cat.notes}
                    onChange={(e) => updateCategory(cat.id, 'notes', e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* Goal Progress */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-forest" />
              تقدم الأهداف الشهرية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="كيف تقدمت في أهدافك الشهرية؟ ما الذي أنجزته؟"
              value={review.goalProgress}
              onChange={(e) => setReview((prev) => ({ ...prev, goalProgress: e.target.value }))}
              rows={4}
              className="text-sm resize-none"
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Next Month Planning */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeft className="w-4 h-4 text-forest" />
              تخطيط الشهر القادم
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-accent" />
                الأولويات القصوى
              </Label>
              <Textarea
                placeholder="ما هي أهم 3-5 أولويات للشهر القادم؟"
                value={review.nextPriorities}
                onChange={(e) => setReview((prev) => ({ ...prev, nextPriorities: e.target.value }))}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gold" />
                أهداف الشهر القادم
              </Label>
              <Textarea
                placeholder="ماذا تريد أن تحقق الشهر القادم؟"
                value={review.nextGoals}
                onChange={(e) => setReview((prev) => ({ ...prev, nextGoals: e.target.value }))}
                rows={4}
                className="text-sm resize-none"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Previous Reviews */}
      {allReviews.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
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
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-accent/10 flex items-center justify-center">
                          <span className="text-lg font-bold text-emerald-accent">{r.score}</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium">مراجعة الشهر</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(r.month + '-01').toLocaleDateString('ar', { year: 'numeric', month: 'long' })}
                          </p>
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