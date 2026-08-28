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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { RiseIcon } from './icons'
import { apiFetch } from '@/lib/api-fetch'
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

/* Icon map — used to re-attach icons after localStorage deserialization */
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  health: Heart,
  finance: Wallet,
  learning: GraduationCap,
  relationships: Users,
  career: Briefcase,
}

const defaultCategories: CategoryReview[] = [
  { id: 'health', name: 'الصحة', icon: Heart, color: 'text-rose-accent', score: 5, notes: '' },
  { id: 'finance', name: 'المالية', icon: Wallet, color: 'text-gold', score: 5, notes: '' },
  { id: 'learning', name: 'التعلم', icon: GraduationCap, color: 'text-forest dark:text-[#6EE7B7]', score: 5, notes: '' },
  { id: 'relationships', name: 'العلاقات', icon: Users, color: 'text-violet-accent', score: 5, notes: '' },
  { id: 'career', name: 'المهنة', icon: Briefcase, color: 'text-emerald-accent', score: 5, notes: '' },
]

/** Restore icon functions lost during JSON serialization */
function hydrateCategories(categories: CategoryReview[]): CategoryReview[] {
  return categories.map((c) => ({
    ...c,
    icon: CATEGORY_ICONS[c.id] || Heart,
    score: typeof c.score === 'number' && !isNaN(c.score) ? c.score : 5,
    notes: typeof c.notes === 'string' ? c.notes : '',
    name: typeof c.name === 'string' ? c.name : c.id,
  }))
}

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
  if (score >= 9) return { text: 'أداء استثنائي! أنت في أفضل حالاتك 🌟', icon: Trophy, color: 'text-gold' }
  if (score >= 7) return { text: 'شهر رائع! استمر بهذا النهج المتميز 💪', icon: TrendingUp, color: 'text-emerald-accent' }
  if (score >= 5) return { text: 'تقدم جيد! هناك مساحة للتحسن والنمو 🌱', icon: Sparkles, color: 'text-glass' }
  if (score >= 3) return { text: 'لا بأس، كل بداية صعبة. الشهر القادم سيكون أفضل 🚀', icon: Target, color: 'text-rose-accent' }
  return { text: 'ابدأ من جديد! كل يوم فرصة لتغيير حياتك ✨', icon: Flame, color: 'text-destructive' }
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
      if (stored) {
        const parsed: MonthlyReview[] = JSON.parse(stored)
        return parsed.map((r) => ({ ...r, categories: hydrateCategories(r.categories || []) }))
      }
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
        if (thisMonth) return { ...thisMonth, categories: hydrateCategories(thisMonth.categories || []) }
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
        apiFetch(`/api/rise/tasks`),
        apiFetch(`/api/rise/focus`),
        apiFetch(`/api/rise/habits`),
        apiFetch(`/api/rise/journal`),
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
    category: typeof c.name === 'string' ? c.name : c.id,
    score: typeof c.score === 'number' && !isNaN(c.score) ? c.score : 5,
    fullMark: 10,
  }))

  const safeScore = typeof review.score === 'number' && !isNaN(review.score) ? review.score : 5
  const avgScore = review.categories.length > 0
    ? Math.round(review.categories.reduce((s, c) => s + (typeof c.score === 'number' ? c.score : 5), 0) / review.categories.length)
    : 5
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
        <div className="absolute inset-0 bg-gradient-to-bl from-[#06B6D4]/15 via-glass/10 to-gold/15 dark:from-[#22D3EE]/20 dark:via-glass/10 dark:to-gold/10" />
        <div className="absolute inset-0 noise-bg opacity-20" />
        <div className="relative glass p-6 border-0 text-center sm:text-start">
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="text-3xl sm:text-4xl font-black text-gradient-forest mb-2 leading-tight"
          >
            {monthName}
          </motion.h2>
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <RiseIcon glyph="review" hue="cyan" size="md" lift />
            <p className="text-sm text-muted-foreground">المراجعة الشهرية — {motivation.text}</p>
          </div>
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
              className="gap-1.5 text-xs border-[#06B6D4]/30 text-[#0E7490] dark:text-[#67E8F9] hover:bg-[#06B6D4]/10"
            >
              {autoFilling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              ملء تلقائي
            </Button>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button size="sm" onClick={save} className="gap-1.5 text-xs bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 min-w-[100px] relative overflow-hidden">
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
          <span className="pill bg-emerald-accent/10 text-emerald-accent">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="num" dir="ltr">{autoFillData.completedTasks}</span> مهمة مكتملة
          </span>
          <span className="pill bg-glass/10 text-glass">
            <Timer className="w-3.5 h-3.5" />
            <span className="num" dir="ltr">{Math.round(autoFillData.focusMinutes / 60)}</span> ساعة تركيز
          </span>
          <span className="pill bg-rose-accent/10 text-rose-accent">
            <Flame className="w-3.5 h-3.5" />
            <span className="num" dir="ltr">{autoFillData.habitRate}%</span> عادات
          </span>
          <span className="pill bg-violet-accent/10 text-violet-accent">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="num" dir="ltr">{autoFillData.journalCount}</span> يوميات
          </span>
          {autoFillData.avgMood > 0 && (
            <span className="pill bg-gold/10 text-gold">
              <Star className="w-3.5 h-3.5" />
              متوسط المزاج: <span className="num" dir="ltr">{autoFillData.avgMood}</span>
            </span>
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
          { label: 'المهام المكتملة', value: autoFillData?.completedTasks || 0, icon: CheckCircle2, well: 'iw-blue' },
          { label: 'ساعات التركيز', value: autoFillData ? Math.round(autoFillData.focusMinutes / 60) : 0, icon: Timer, well: 'iw-violet' },
          { label: 'نسبة العادات', value: autoFillData?.habitRate || 0, icon: Flame, well: 'iw-lime', suffix: '٪' },
          { label: 'اليوميات', value: autoFillData?.journalCount || 0, icon: BookOpen, well: 'iw-cyan' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.06 }}
            className="neo-card card-lift p-4"
          >
            <div className="flex items-center gap-3">
              <span className={cn('icon-well h-9 w-9', stat.well)}>
                <stat.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-2xl font-bold font-mono">
                  <span className="num" dir="ltr"><AnimatedCounter value={stat.value} /></span>
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
        className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-[#06B6D4]/5 via-transparent to-gold/5 border border-border/30"
      >
        <div className={cn('p-2.5 rounded-xl bg-background shadow-sm', motivation.color)}>
          <motivation.icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">المتوسط الحالي: <span className="num" dir="ltr">{avgScore}/10</span></p>
          <p className="text-xs text-muted-foreground mt-0.5">{motivation.text}</p>
        </div>
      </motion.div>

      {/* Score + Radar */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Score Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="neo-card card-lift overflow-hidden h-full border-s-4 border-s-[#06B6D4]">
            <div className="bg-gradient-to-l from-[#06B6D4]/5 to-transparent p-5 h-full flex flex-col justify-center">
              <p className="text-sm text-muted-foreground mb-1">درجة الشهر</p>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-5xl font-bold text-[#0E7490] dark:text-[#67E8F9] num" dir="ltr">{safeScore}</span>
                <span className="text-xl text-muted-foreground">/ 10</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => setReview((prev) => ({ ...prev, score: s }))}
                    className={cn(
                      'flex-1 h-2 rounded-full transition-all',
                      s <= safeScore ? 'bg-[#06B6D4] dark:bg-[#22D3EE]' : 'bg-muted/50'
                    )}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gold" />
                <span className="text-xs text-muted-foreground">متوسط الفئات: <span className="num" dir="ltr">{avgScore}/10</span></span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Radar Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="neo-card card-lift h-full border-s-4 border-s-gold">
            <div className="p-5 pb-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span className="icon-well h-7 w-7 iw-cyan">
                  <Target className="h-4 w-4" />
                </span>
                خريطة الفئات
              </h3>
            </div>
            <div className="px-5 pb-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="rgba(148,163,184,0.25)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fontSize: 11, fill: '#94A3B8' }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 10]}
                      tick={{ fontSize: 9, fill: '#94A3B8' }}
                      tickCount={6}
                    />
                    <Radar
                      name="الدرجة"
                      dataKey="score"
                      stroke="#06B6D4"
                      fill="#06B6D4"
                      fillOpacity={0.25}
                      strokeWidth={2.5}
                      dot={false}
                      label={{
                        position: 'top',
                        fill: '#94A3B8',
                        fontSize: 10,
                        formatter: (value: number) => `${typeof value === 'number' ? value : ''}`,
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Monthly Highlights */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <div className="neo-card card-lift">
          <div className="p-5 pb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span className="icon-well h-7 w-7 iw-violet">
                <Sparkles className="h-4 w-4" />
              </span>
              أبرز لحظات الشهر
            </h3>
          </div>
          <div className="px-5 pb-5">
            <div className="grid sm:grid-cols-3 gap-4">
              {/* Best Achievement — gold */}
              <div className="space-y-2 p-4 rounded-xl bg-gradient-to-br from-gold/10 via-gold/5 to-transparent border-2 border-gold/30 relative overflow-hidden">
                <div className="absolute top-0 start-0 w-20 h-20 bg-gradient-to-br from-gold/20 to-transparent rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="relative flex items-center gap-2 mb-1">
                  <span className="icon-well h-7 w-7 iw-amber">
                    <Trophy className="h-3.5 w-3.5" />
                  </span>
                  <Label className="text-xs font-semibold text-gold">أفضل إنجاز</Label>
                </div>
                <Input
                  placeholder="ما هو أفضل إنجاز؟"
                  value={review.bestAchievement || ''}
                  onChange={(e) => setReview((prev) => ({ ...prev, bestAchievement: e.target.value }))}
                  className="text-sm h-9 border-gold/20 focus-visible:ring-gold/30"
                />
              </div>
              {/* Biggest Challenge */}
              <div className="space-y-2 p-4 rounded-xl bg-rose-accent/5 border border-rose-accent/10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="icon-well h-7 w-7 iw-rose">
                    <Target className="h-3.5 w-3.5" />
                  </span>
                  <Label className="text-xs font-semibold text-rose-accent">أكبر تحدّي</Label>
                </div>
                <Input
                  placeholder="ما هو أكبر تحدٍّ؟"
                  value={review.biggestChallenge || ''}
                  onChange={(e) => setReview((prev) => ({ ...prev, biggestChallenge: e.target.value }))}
                  className="text-sm h-9 border-rose-accent/20 focus-visible:ring-rose-accent/30"
                />
              </div>
              {/* Key Lesson */}
              <div className="space-y-2 p-4 rounded-xl bg-[#06B6D4]/5 border border-[#06B6D4]/10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="icon-well h-7 w-7 iw-cyan">
                    <GraduationCap className="h-3.5 w-3.5" />
                  </span>
                  <Label className="text-xs font-semibold text-[#0E7490] dark:text-[#67E8F9]">أهم درس</Label>
                </div>
                <Input
                  placeholder="ماذا تعلّمت؟"
                  value={review.keyLesson || ''}
                  onChange={(e) => setReview((prev) => ({ ...prev, keyLesson: e.target.value }))}
                  className="text-sm h-9 border-[#06B6D4]/20 focus-visible:ring-[#06B6D4]/30"
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Wins */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="neo-card card-lift border-s-4 border-s-gold">
          <div className="p-5 pb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span className="icon-well h-7 w-7 iw-amber">
                <Trophy className="h-4 w-4" />
              </span>
              إنجازات وبطولات الشهر
            </h3>
          </div>
          <div className="px-5 pb-5">
            <Textarea
              placeholder="اكتب أهم إنجازاتك هذا الشهر..."
              value={review.wins}
              onChange={(e) => setReview((prev) => ({ ...prev, wins: e.target.value }))}
              rows={4}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </motion.div>

      {/* Categories */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="neo-card card-lift border-s-4 border-s-[#06B6D4]">
          <div className="p-5 pb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span className="icon-well h-7 w-7 iw-cyan">
                <Star className="h-4 w-4" />
              </span>
              مراجعة الفئات
            </h3>
          </div>
          <div className="px-5 pb-5 space-y-6">
            {review.categories.map((cat) => {
              const Icon = cat.icon
              return (
                <div key={cat.id} className="space-y-3 p-4 rounded-xl bg-muted/20 border-s-[3px] border-s-border/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('p-2 rounded-lg bg-background', cat.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-2xl font-bold num', cat.color)} dir="ltr">{cat.score}</span>
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
          </div>
        </div>
      </motion.div>

      {/* Goal Progress */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <div className="neo-card card-lift border-s-4 border-s-[#06B6D4]">
          <div className="p-5 pb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span className="icon-well h-7 w-7 iw-cyan">
                <Award className="h-4 w-4" />
              </span>
              تقدم الأهداف الشهرية
            </h3>
          </div>
          <div className="px-5 pb-5">
            <Textarea
              placeholder="كيف تقدمت في أهدافك الشهرية؟ ما الذي أنجزته؟"
              value={review.goalProgress}
              onChange={(e) => setReview((prev) => ({ ...prev, goalProgress: e.target.value }))}
              rows={4}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </motion.div>

      {/* Next Month Planning */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <div className="neo-card card-lift border-s-4 border-s-[#06B6D4]">
          <div className="p-5 pb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span className="icon-well h-7 w-7 iw-cyan">
                <ArrowLeft className="h-4 w-4" />
              </span>
              تخطيط الشهر القادم
            </h3>
          </div>
          <div className="px-5 pb-5 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#0E7490] dark:text-[#67E8F9]" />
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
          </div>
        </div>
      </motion.div>

      {/* Previous Reviews */}
      {allReviews.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="neo-card card-lift">
            <div className="p-5 pb-3">
              <h3 className="text-sm font-bold text-muted-foreground">المراجعات السابقة</h3>
            </div>
            <div className="px-5 pb-5">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allReviews
                  .filter((r) => r.id !== review.id)
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setReview({ ...r, categories: hydrateCategories(r.categories || []) })}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#06B6D4]/10 flex items-center justify-center">
                          <span className="text-lg font-bold text-[#0E7490] dark:text-[#67E8F9] num" dir="ltr">{typeof r.score === 'number' ? r.score : 5}</span>
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
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}