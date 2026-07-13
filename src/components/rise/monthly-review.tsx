'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  Sparkles,
  Check,
  CheckCircle2,
  Timer,
  Flame,
  BookOpen,
  Wand2,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
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
  bestAchievement: string
  biggestChallenge: string
  keyLesson: string
}

interface AutoFillData {
  completedTasks: number
  focusMinutes: number
  habitRate: number
  journalCount: number
  avgMood: number
}

const STORAGE_KEY = 'rise-monthly-review'

const defaultCategories: CategoryReview[] = [
  { id: 'health', name: 'الصحة', icon: Heart, color: 'text-rose-500', score: 5, notes: '' },
  { id: 'finance', name: 'المالية', icon: Wallet, color: 'text-amber-500', score: 5, notes: '' },
  { id: 'learning', name: 'التعلم', icon: GraduationCap, color: 'text-emerald-700 dark:text-emerald-400', score: 5, notes: '' },
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
  bestAchievement: '',
  biggestChallenge: '',
  keyLesson: '',
})

const getMotivationalMessage = (score: number): { text: string; icon: React.ElementType; color: string } => {
  if (score >= 9) return { text: 'أداء استثنائي! أنت في أفضل حالاتك 🌟', icon: Trophy, color: 'text-amber-500' }
  if (score >= 7) return { text: 'شهر رائع! استمر بهذا النهج المتميز 💪', icon: TrendingUp, color: 'text-emerald-accent' }
  if (score >= 5) return { text: 'تقدم جيد! هناك مساحة للتحسن والنمو 🌱', icon: Sparkles, color: 'text-blue-500' }
  if (score >= 3) return { text: 'لا بأس، كل بداية صعبة. الشهر القادم سيكون أفضل 🚀', icon: Target, color: 'text-orange-500' }
  return { text: 'ابدأ من جديد! كل يوم فرصة لتغيير حياتك ✨', icon: Flame, color: 'text-rose-500' }
}

/* ────────────── Animated Counter ────────────── */

function AnimatedCounter({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * eased))
      if (progress >= 1) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [value, duration])
  return <>{display}</>
}

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

  const [autoFilling, setAutoFilling] = useState(false)
  const [autoFillData, setAutoFillData] = useState<AutoFillData | null>(null)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)

  const save = () => {
    const updated = allReviews.some((r) => r.id === review.id)
      ? allReviews.map((r) => (r.id === review.id ? review : r))
      : [review, ...allReviews]
    setAllReviews(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setShowSaveSuccess(true)
    setTimeout(() => setShowSaveSuccess(false), 2000)
    toast.success('تم حفظ المراجعة الشهرية')
  }

  const reset = () => {
    setReview(emptyReview())
    setAutoFillData(null)
    toast.success('تم إعادة التعيين')
  }

  const updateCategory = (id: string, field: 'score' | 'notes', value: number | string) => {
    setReview((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }))
  }

  const handleAutoFill = useCallback(async () => {
    setAutoFilling(true)
    try {
      const [tasksRes, focusRes, habitsRes, journalRes] = await Promise.all([
        fetch('/api/rise/tasks'),
        fetch('/api/rise/focus'),
        fetch('/api/rise/habits'),
        fetch('/api/rise/journal'),
      ])
      const [tasksData, focusData, habitsData, journalData] = await Promise.all([
        tasksRes.json(),
        focusRes.json(),
        habitsRes.json(),
        journalRes.json(),
      ])

      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      // Count completed tasks this month
      const allTasks = tasksData.tasks || []
      const completedTasks = allTasks.filter(
        (t: { status: string; dueDate: string | null }) => t.status === 'done' && t.dueDate?.startsWith(monthStart)
      ).length

      // Sum focus minutes this month
      const sessions = focusData.sessions || []
      const focusMinutes = sessions
        .filter((s: { startedAt: string; completed: boolean }) => s.startedAt.startsWith(monthStart) && s.completed)
        .reduce((sum: number, s: { actualMin: number }) => sum + (s.actualMin || 0), 0)

      // Calculate average habit completion rate this month
      const logs = habitsData.logs || []
      const habitCount = (habitsData.habits || []).length
      const monthLogs = logs.filter((l: { date: string }) => l.date?.startsWith(monthStart))
      const completedLogs = monthLogs.filter((l: { completed: boolean }) => l.completed).length
      const habitRate = monthLogs.length > 0 ? Math.round((completedLogs / monthLogs.length) * 100) : 0

      // Count journal entries and average mood
      const journals = journalData.recentJournals || []
      const monthJournals = journals.filter((j: { date: string }) => j.date?.startsWith(monthStart))
      const journalCount = monthJournals.length
      const moods = monthJournals.map((j: { mood: number | null }) => j.mood).filter((m: number | null): m is number => m !== null && m > 0)
      const avgMood = moods.length > 0 ? Math.round((moods.reduce((a: number, b: number) => a + b, 0) / moods.length) * 10) / 10 : 0

      const data: AutoFillData = { completedTasks, focusMinutes, habitRate, journalCount, avgMood }
      setAutoFillData(data)

      // Auto-fill the wins field
      const winsParts: string[] = []
      if (completedTasks > 0) winsParts.push(`أنجزت ${completedTasks} مهمة`)
      if (focusMinutes > 0) winsParts.push(`ركّزت ${Math.round(focusMinutes / 60)} ساعة`)
      if (journalCount > 0) winsParts.push(`كتبت ${journalCount} يوميات`)
      setReview((prev) => ({ ...prev, wins: winsParts.join(' | ') }))

      // Auto-fill goal progress
      setReview((prev) => ({
        ...prev,
        goalProgress: `أنجزت ${completedTasks} مهمة من إجمالي ${allTasks.length} (نسبة الإنجاز: ${allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0}%). تركيز إجمالي: ${Math.round(focusMinutes / 60)} ساعة. نسبة إكمال العادات: ${habitRate}%.`,
      }))

      toast.success('تم ملء البيانات تلقائياً')
    } catch {
      toast.error('فشل في جلب البيانات')
    } finally {
      setAutoFilling(false)
    }
  }, [])

  const radarData = review.categories.map((c) => ({
    category: c.name,
    score: c.score,
    fullMark: 10,
  }))

  const avgScore = Math.round(review.categories.reduce((s, c) => s + c.score, 0) / review.categories.length)
  const motivation = getMotivationalMessage(avgScore)
  const monthName = new Date().toLocaleDateString('ar', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Cinematic Month Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl overflow-hidden relative"
      >
        <div className="absolute inset-0 bg-gradient-to-bl from-forest/25 via-emerald-accent/10 to-gold/15 dark:from-forest/35 dark:via-emerald-accent/15 dark:to-gold/15" />
        <div className="absolute inset-0 noise-bg opacity-20" />
        <div className="relative glass p-6 border-0 text-center sm:text-right">
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="text-3xl sm:text-4xl font-black text-gradient-forest mb-2 leading-tight"
          >
            {monthName}
          </motion.h2>
          <p className="text-sm text-muted-foreground">المراجعة الشهرية — {motivation.text}</p>
          <div className="flex justify-center sm:justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5" />
              إعادة
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoFill}
              disabled={autoFilling}
              className="gap-1.5 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            >
              {autoFilling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              ملء تلقائي
            </Button>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button size="sm" onClick={save} className="gap-1.5 text-xs bg-emerald-accent hover:bg-emerald-accent/90 text-white min-w-[100px] relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {showSaveSuccess ? (
                    <motion.span key="success" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      تم الحفظ!
                    </motion.span>
                  ) : (
                    <motion.span key="save" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5" />
                      حفظ
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Auto-fill stats chips */}
      {autoFillData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 flex-wrap"
        >
          <div className="flex items-center gap-1.5 bg-emerald-accent/10 text-emerald-accent px-3 py-1.5 rounded-full text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {autoFillData.completedTasks} مهمة مكتملة
          </div>
          <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium">
            <Timer className="w-3.5 h-3.5" />
            {Math.round(autoFillData.focusMinutes / 60)} ساعة تركيز
          </div>
          <div className="flex items-center gap-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-full text-xs font-medium">
            <Flame className="w-3.5 h-3.5" />
            {autoFillData.habitRate}% عادات
          </div>
          <div className="flex items-center gap-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-3 py-1.5 rounded-full text-xs font-medium">
            <BookOpen className="w-3.5 h-3.5" />
            {autoFillData.journalCount} يوميات
          </div>
          {autoFillData.avgMood > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-full text-xs font-medium">
              <Star className="w-3.5 h-3.5" />
              متوسط المزاج: {autoFillData.avgMood}
            </div>
          )}
        </motion.div>
      )}

      {/* Month in Numbers — Animated Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          { label: 'المهام المكتملة', value: autoFillData?.completedTasks || 0, icon: CheckCircle2, color: 'text-emerald-accent', bg: 'bg-emerald-accent/10' },
          { label: 'ساعات التركيز', value: autoFillData ? Math.round(autoFillData.focusMinutes / 60) : 0, icon: Timer, color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'نسبة العادات', value: autoFillData?.habitRate || 0, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10', suffix: '٪' },
          { label: 'اليوميات', value: autoFillData?.journalCount || 0, icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.06 }}
            className="glass premium-card p-4"
          >
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-xl', stat.bg)}>
                <stat.icon className={cn('w-4 h-4', stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  <AnimatedCounter value={stat.value} />
                  {stat.suffix}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Motivational Message */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-emerald-accent/5 via-transparent to-amber-500/5 border border-border/30"
      >
        <div className={cn('p-2.5 rounded-xl bg-background shadow-sm', motivation.color)}>
          <motivation.icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">المتوسط الحالي: {avgScore}/10</p>
          <p className="text-xs text-muted-foreground mt-0.5">{motivation.text}</p>
        </div>
      </motion.div>

      {/* Score + Radar */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Score Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass premium-card overflow-hidden h-full border-r-emerald-accent/50 border-r-3">
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
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">متوسط الفئات: {avgScore}/10</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Radar Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass premium-card h-full border-r-amber-500/50 border-r-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-accent" />
                خريطة الفئات
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="oklch(0.7 0.01 160 / 0.2)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fontSize: 11, fill: 'oklch(0.45 0.01 160)' }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 10]}
                      tick={{ fontSize: 9, fill: 'oklch(0.55 0.01 160)' }}
                      tickCount={6}
                    />
                    <Radar
                      name="الدرجة"
                      dataKey="score"
                      stroke="oklch(0.55 0.14 163)"
                      fill="oklch(0.55 0.14 163)"
                      fillOpacity={0.25}
                      strokeWidth={2.5}
                      label={{
                        position: 'top',
                        fill: 'oklch(0.45 0.01 160)',
                        fontSize: 10,
                        formatter: (value: number) => `${value}`,
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Monthly Highlights — with gold best moment card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card className="glass premium-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              أبرز لحظات الشهر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              {/* Best Achievement — with gold gradient border */}
              <div className="space-y-2 p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-400/30 dark:border-amber-600/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-amber-400/20 to-transparent rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="relative flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-amber-500/15">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <Label className="text-xs font-semibold text-amber-600 dark:text-amber-400">أفضل إنجاز</Label>
                </div>
                <Input
                  placeholder="ما هو أفضل إنجاز؟"
                  value={review.bestAchievement || ''}
                  onChange={(e) => setReview((prev) => ({ ...prev, bestAchievement: e.target.value }))}
                  className="text-sm h-9 border-amber-500/20 focus-visible:ring-amber-500/30"
                />
              </div>
              {/* Biggest Challenge */}
              <div className="space-y-2 p-4 rounded-xl bg-rose-500/5 border border-rose-500/10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-rose-500/15">
                    <Target className="w-3.5 h-3.5 text-rose-500" />
                  </div>
                  <Label className="text-xs font-semibold text-rose-600 dark:text-rose-400">أكبر تحدّي</Label>
                </div>
                <Input
                  placeholder="ما هو أكبر تحدٍّ؟"
                  value={review.biggestChallenge || ''}
                  onChange={(e) => setReview((prev) => ({ ...prev, biggestChallenge: e.target.value }))}
                  className="text-sm h-9 border-rose-500/20 focus-visible:ring-rose-500/30"
                />
              </div>
              {/* Key Lesson */}
              <div className="space-y-2 p-4 rounded-xl bg-emerald-accent/5 border border-emerald-accent/10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-emerald-accent/15">
                    <GraduationCap className="w-3.5 h-3.5 text-emerald-accent" />
                  </div>
                  <Label className="text-xs font-semibold text-emerald-accent">أهم درس</Label>
                </div>
                <Input
                  placeholder="ماذا تعلّمت؟"
                  value={review.keyLesson || ''}
                  onChange={(e) => setReview((prev) => ({ ...prev, keyLesson: e.target.value }))}
                  className="text-sm h-9 border-emerald-accent/20 focus-visible:ring-emerald-accent/30"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Wins */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="glass border-r-4 border-r-amber-500">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
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
        <Card className="glass border-r-4 border-r-emerald-accent">
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
                <div key={cat.id} className="space-y-3 p-4 rounded-xl bg-muted/20 border-r-3 border-r-border/30">
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

      {/* Goal Progress — with emerald accent */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="glass premium-card border-r-emerald-accent/50 border-r-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-accent" />
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
        <Card className="glass premium-card border-r-emerald-accent/50 border-r-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeft className="w-4 h-4 text-emerald-accent" />
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
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
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