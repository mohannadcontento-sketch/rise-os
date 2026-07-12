'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Search,
  Save,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Flame,
  Smile,
  Calendar,
  Edit3,
  X,
  Lightbulb,
  Trophy,
  AlertTriangle,
  Heart,
  Battery,
  Tag,
  CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ────────────── Types ────────────── */

interface JournalEntry {
  id: string
  date: string
  content: string
  gratitude: string
  wins: string
  challenges: string
  mood: number
  energy: number
  ideas: string
  tomorrowPlan: string
  tags: string
}

interface JournalData {
  journal: JournalEntry | null
  recentJournals: JournalEntry[]
}

/* ────────────── Constants ────────────── */

const MOOD_EMOJIS: { value: number; emoji: string; label: string; color: string }[] = [
  { value: 1, emoji: '😞', label: 'سيء جداً', color: 'bg-red-500/15 ring-red-500/30' },
  { value: 2, emoji: '😐', label: 'سيء', color: 'bg-gray-400/15 ring-gray-400/30' },
  { value: 3, emoji: '🙂', label: 'عادي', color: 'bg-gold/15 ring-gold/30' },
  { value: 4, emoji: '😊', label: 'جيد', color: 'bg-emerald-accent/15 ring-emerald-accent/30' },
  { value: 5, emoji: '😄', label: 'ممتاز', color: 'bg-emerald-accent/20 ring-emerald-accent/40' },
]

const ENERGY_LABELS = ['منهك', 'متعب', 'عادي', 'نشيط', 'ممتليء طاقة']

const MOOD_STRIP_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-gray-400',
  3: 'bg-gold',
  4: 'bg-emerald-accent',
  5: 'bg-emerald-accent',
}

const TEXTAREA_ACCENT_COLORS: Record<string, string> = {
  content: 'border-r-[3px] border-r-emerald-accent/50',
  gratitude: 'border-r-[3px] border-r-rose-400/50',
  wins: 'border-r-[3px] border-r-gold/50',
  challenges: 'border-r-[3px] border-r-orange-400/50',
  ideas: 'border-r-[3px] border-r-yellow-400/50',
  tomorrowPlan: 'border-r-[3px] border-r-forest-light/50',
}

const EMPTY_FORM: Omit<JournalEntry, 'id' | 'date' | 'tags'> = {
  content: '',
  gratitude: '',
  wins: '',
  challenges: '',
  mood: 3,
  energy: 3,
  ideas: '',
  tomorrowPlan: '',
}

/* ────────────── Animations ────────────── */

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

/* ────────────── Component ────────────── */

export default function Journal() {
  const [data, setData] = useState<JournalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [tagInput, setTagInput] = useState('')

  const today = new Date().toISOString().split('T')[0]

  /* ─── Fetch ─── */
  const fetchJournal = useCallback(async () => {
    try {
      const res = await fetch('/api/rise/journal')
      if (res.ok) {
        const json = await res.json()
        setData(json)
        if (json.journal) {
          setForm({
            content: json.journal.content || '',
            gratitude: json.journal.gratitude || '',
            wins: json.journal.wins || '',
            challenges: json.journal.challenges || '',
            mood: json.journal.mood || 3,
            energy: json.journal.energy || 3,
            ideas: json.journal.ideas || '',
            tomorrowPlan: json.journal.tomorrowPlan || '',
          })
          setTagInput(json.journal.tags || '')
        }
      }
    } catch {
      toast.error('فشل في تحميل اليوميات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJournal()
  }, [fetchJournal])

  /* ─── Save ─── */
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/rise/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tags: tagInput,
          date: today,
        }),
      })
      if (res.ok) {
        toast.success('تم حفظ اليوميات بنجاح ✨')
        setIsEditing(false)
        fetchJournal()
      } else {
        toast.error('فشل في حفظ اليوميات')
      }
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Filtered recent ─── */
  const filteredJournals = useMemo(() => {
    if (!data?.recentJournals) return []
    if (!searchQuery.trim()) return data.recentJournals
    const q = searchQuery.toLowerCase()
    return data.recentJournals.filter(
      (j) =>
        j.content?.toLowerCase().includes(q) ||
        j.gratitude?.toLowerCase().includes(q) ||
        j.wins?.toLowerCase().includes(q) ||
        j.ideas?.toLowerCase().includes(q) ||
        j.tags?.toLowerCase().includes(q)
    )
  }, [data?.recentJournals, searchQuery])

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    const journals = data?.recentJournals || []
    const total = journals.length
    const moods = journals.filter((j) => j.mood).map((j) => j.mood)
    const avgMood = moods.length
      ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)
      : '—'

    // Calculate streak
    let streak = 0
    const sortedDates = journals
      .map((j) => j.date)
      .sort()
      .reverse()
    if (sortedDates.length > 0) {
      const checkDate = new Date(today)
      for (const d of sortedDates) {
        const entryDate = new Date(d)
        const diffDays = Math.floor(
          (checkDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        if (diffDays <= 1) {
          streak++
          checkDate.setTime(entryDate.getTime())
        } else {
          break
        }
      }
    }

    return { total, streak, avgMood }
  }, [data?.recentJournals, today])

  /* ─── Helpers ─── */
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getMoodEmoji = (mood: number) => MOOD_EMOJIS.find((m) => m.value === mood)?.emoji || '🙂'

  const updateForm = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  const hasTodayEntry = !!data?.journal
  const showForm = !hasTodayEntry || isEditing

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-lg">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">اليوميات</h2>
            <p className="text-xs text-muted-foreground">سجّل أفكارك وانتصاراتك اليومية</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 md:gap-4">
        <Card className="glass border-0 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-emerald-accent/20 via-transparent to-gold/20 pointer-events-none" />
          <CardContent className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-emerald-accent/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-emerald-accent" />
            </div>
            <span className="text-2xl font-bold text-foreground count-up">{stats.total}</span>
            <span className="text-[11px] text-muted-foreground">إجمالي المدخلات</span>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-gold/20 via-transparent to-emerald-accent/20 pointer-events-none" />
          <CardContent className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
              <Flame className="w-4 h-4 text-gold" />
            </div>
            <span className="text-2xl font-bold text-foreground count-up">{stats.streak}</span>
            <span className="text-[11px] text-muted-foreground">أيام متتالية</span>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-forest/20 via-transparent to-gold/20 pointer-events-none" />
          <CardContent className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
              <Smile className="w-4 h-4 text-forest" />
            </div>
            <span className="text-2xl font-bold text-foreground count-up">{stats.avgMood}</span>
            <span className="text-[11px] text-muted-foreground">متوسط المزاج</span>
          </CardContent>
        </Card>
      </motion.div>

      {/* Today's Entry Form or View */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold" />
                {showForm ? (hasTodayEntry ? 'تعديل اليوميات' : 'يوميات اليوم') : "يومية اليوم"}
              </CardTitle>
              {hasTodayEntry && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="text-emerald-accent hover:text-emerald-accent/80 hover:bg-emerald-accent/10"
                >
                  <Edit3 className="w-4 h-4 ml-1" />
                  تعديل
                </Button>
              )}
              {isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false)
                    if (data?.journal) {
                      setForm({
                        content: data.journal.content || '',
                        gratitude: data.journal.gratitude || '',
                        wins: data.journal.wins || '',
                        challenges: data.journal.challenges || '',
                        mood: data.journal.mood || 3,
                        energy: data.journal.energy || 3,
                        ideas: data.journal.ideas || '',
                        tomorrowPlan: data.journal.tomorrowPlan || '',
                      })
                      setTagInput(data.journal.tags || '')
                    }
                  }}
                  className="text-muted-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(today)}
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            {showForm ? (
              <>
                {/* Paper texture form background */}
                <div className="rounded-2xl p-4 -mx-2 space-y-5 bg-[repeating-linear-gradient(0deg,transparent,transparent_27px,oklch(0.5_0_0/0.03)_27px,oklch(0.5_0_0/0.03)_28px)]">
                  {/* Journal Content */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-accent" />
                      اليوميات
                    </label>
                    <Textarea
                      value={form.content}
                      onChange={(e) => updateForm('content', e.target.value)}
                      placeholder="اكتب أفكارك ومشاعرك اليوم..."
                      className={cn(
                        'min-h-[120px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.content
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Gratitude */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Heart className="w-4 h-4 text-rose-400" />
                      الامتنان
                    </label>
                    <Textarea
                      value={form.gratitude}
                      onChange={(e) => updateForm('gratitude', e.target.value)}
                      placeholder="ما الذي تشكر الله عليه اليوم؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.gratitude
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Wins */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-gold" />
                      الانتصارات
                    </label>
                    <Textarea
                      value={form.wins}
                      onChange={(e) => updateForm('wins', e.target.value)}
                      placeholder="ما هي إنجازاتك اليوم؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.wins
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Challenges */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-400" />
                      التحديات
                    </label>
                    <Textarea
                      value={form.challenges}
                      onChange={(e) => updateForm('challenges', e.target.value)}
                      placeholder="ما هي التحديات التي واجهتها؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.challenges
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Mood Selector with spring animation */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Smile className="w-4 h-4 text-emerald-accent" />
                      المزاج
                    </label>
                    <div className="flex items-center gap-2 justify-center py-2">
                      {MOOD_EMOJIS.map((m) => (
                        <motion.button
                          key={m.value}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.85 }}
                          animate={form.mood === m.value ? { scale: [1, 1.35, 1.1] } : { scale: 1 }}
                          transition={form.mood === m.value
                            ? { type: 'spring', stiffness: 400, damping: 10, duration: 0.5 }
                            : { duration: 0.2 }
                          }
                          onClick={() => updateForm('mood', m.value)}
                          className={cn(
                            'text-3xl p-2 rounded-xl transition-all duration-200 ring-1',
                            form.mood === m.value
                              ? `${m.color} shadow-md`
                              : 'ring-transparent hover:bg-muted/50 opacity-60 hover:opacity-100'
                          )}
                          title={m.label}
                        >
                          {m.emoji}
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                      {MOOD_EMOJIS.find((m) => m.value === form.mood)?.label}
                    </p>
                  </div>

                  {/* Energy Slider with gradient fill */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Battery className="w-4 h-4 text-forest" />
                      الطاقة: <span className="text-emerald-accent font-bold">{ENERGY_LABELS[form.energy - 1]}</span>
                    </label>
                    <div className="flex items-center gap-3 px-1">
                      <span className="text-xs text-muted-foreground">١</span>
                      <div className="flex-1 relative">
                        <div className="absolute inset-0 h-2 rounded-full top-1/2 -translate-y-1/2 bg-muted" />
                        <div
                          className="absolute inset-y-0 right-0 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${((form.energy - 1) / 4) * 100}%`,
                            background: 'linear-gradient(to left, #ef4444, #f97316, #eab308, #22c55e, #10b981)',
                          }}
                        />
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={form.energy}
                          onChange={(e) => updateForm('energy', parseInt(e.target.value))}
                          className="relative z-10 w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-accent bg-transparent"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">٥</span>
                    </div>
                  </div>

                  {/* Ideas */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-gold" />
                      أفكار
                    </label>
                    <Textarea
                      value={form.ideas}
                      onChange={(e) => updateForm('ideas', e.target.value)}
                      placeholder="أي أفكار جديدة أو إلهامات..."
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.ideas
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Tomorrow's Plan */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-forest-light" />
                      خطة الغد
                    </label>
                    <Textarea
                      value={form.tomorrowPlan}
                      onChange={(e) => updateForm('tomorrowPlan', e.target.value)}
                      placeholder="ما الذي تخطط لفعله غداً؟"
                      className={cn(
                        'min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-all duration-200 text-sm',
                        TEXTAREA_ACCENT_COLORS.tomorrowPlan
                      )}
                      dir="rtl"
                    />
                  </div>

                  {/* Tags */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      الوسوم
                    </label>
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="أدخل وسوم مفصولة بفواصل..."
                      className="rounded-xl border-0 bg-muted/50 focus:bg-muted transition-colors text-sm"
                      dir="rtl"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg rounded-xl h-12 text-sm font-semibold"
                  >
                    {saving ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Save className="w-4 h-4 ml-2" />
                      </motion.div>
                    ) : (
                      <Save className="w-4 h-4 ml-2" />
                    )}
                    {saving ? 'جاري الحفظ...' : 'حفظ اليوميات'}
                  </Button>
                </motion.div>
              </>
            ) : (
              /* View Mode */
              data?.journal && (
                <div className="space-y-4">
                  {/* Mood & Energy */}
                  <div className="flex items-center gap-4 justify-center py-2">
                    <div className="flex items-center gap-2 glass rounded-xl px-4 py-2">
                      <Smile className="w-4 h-4 text-muted-foreground" />
                      <span className="text-2xl">{getMoodEmoji(data.journal.mood)}</span>
                    </div>
                    <div className="flex items-center gap-2 glass rounded-xl px-4 py-2">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{ENERGY_LABELS[(data.journal.energy || 3) - 1]}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {data.journal.tags && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {data.journal.tags.split(',').map(
                        (tag, i) =>
                          tag.trim() && (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="rounded-full text-xs bg-emerald-accent/10 text-emerald-accent border-0"
                            >
                              {tag.trim()}
                            </Badge>
                          )
                      )}
                    </div>
                  )}

                  {/* Sections */}
                  {[
                    { label: 'اليوميات', content: data.journal.content, icon: BookOpen, color: 'text-emerald-accent' },
                    { label: 'الامتنان', content: data.journal.gratitude, icon: Heart, color: 'text-rose-400' },
                    { label: 'الانتصارات', content: data.journal.wins, icon: Trophy, color: 'text-gold' },
                    { label: 'التحديات', content: data.journal.challenges, icon: AlertTriangle, color: 'text-orange-400' },
                    { label: 'أفكار', content: data.journal.ideas, icon: Lightbulb, color: 'text-gold' },
                    { label: 'خطة الغد', content: data.journal.tomorrowPlan, icon: Calendar, color: 'text-forest-light' },
                  ].map(
                    (section) =>
                      section.content && (
                        <div key={section.label} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <section.icon className={cn('w-4 h-4', section.color)} />
                            <span className="text-sm font-semibold text-foreground">{section.label}</span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-xl p-3">
                            {section.content}
                          </p>
                        </div>
                      )
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Entries */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">المدخلات السابقة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في اليوميات..."
                className="pr-9 rounded-xl border-0 bg-muted/50 focus:bg-muted transition-colors text-sm"
                dir="rtl"
              />
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredJournals.length === 0 ? (
                <div className="text-center py-10">
                  <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد مدخلات سابقة بعد'}
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredJournals.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, scale: 0.95 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <button
                        onClick={() =>
                          setExpandedId(expandedId === entry.id ? null : entry.id)
                        }
                        className="w-full text-right"
                      >
                        <div
                          className={cn(
                            'rounded-xl p-4 transition-all duration-200 relative overflow-hidden',
                            'hover:shadow-md hover:-translate-y-0.5 border border-transparent hover:border-border/50',
                            expandedId === entry.id && 'bg-muted/30 border-border/50'
                          )}
                        >
                          {/* Mood color strip */}
                          <div className={cn(
                            'absolute top-0 right-0 bottom-0 w-1 rounded-r-xl',
                            MOOD_STRIP_COLORS[entry.mood] || 'bg-gray-400'
                          )} />

                          <div className="flex items-center justify-between mb-2 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{getMoodEmoji(entry.mood)}</span>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CalendarDays className="w-3 h-3" />
                                <span>
                                  {new Date(entry.date).toLocaleDateString('ar-SA', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {entry.tags &&
                                entry.tags.split(',').slice(0, 2).map(
                                  (tag, i) =>
                                    tag.trim() && (
                                      <Badge
                                        key={i}
                                        variant="secondary"
                                        className="rounded-full text-[10px] bg-emerald-accent/10 text-emerald-accent border-0"
                                      >
                                        {tag.trim()}
                                      </Badge>
                                    )
                                )}
                              {expandedId === entry.id ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-foreground/80 line-clamp-2 pr-2">
                            {entry.content || 'لا يوجد محتوى'}
                          </p>

                          <AnimatePresence>
                            {expandedId === entry.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-3 mt-3 border-t border-border/50 space-y-3 pr-2">
                                  {entry.gratitude && (
                                    <div>
                                      <span className="text-xs font-semibold text-rose-400 flex items-center gap-1 mb-1">
                                        <Heart className="w-3 h-3" /> الامتنان
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.gratitude}
                                      </p>
                                    </div>
                                  )}
                                  {entry.wins && (
                                    <div>
                                      <span className="text-xs font-semibold text-gold flex items-center gap-1 mb-1">
                                        <Trophy className="w-3 h-3" /> الانتصارات
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.wins}
                                      </p>
                                    </div>
                                  )}
                                  {entry.challenges && (
                                    <div>
                                      <span className="text-xs font-semibold text-orange-400 flex items-center gap-1 mb-1">
                                        <AlertTriangle className="w-3 h-3" /> التحديات
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.challenges}
                                      </p>
                                    </div>
                                  )}
                                  {entry.ideas && (
                                    <div>
                                      <span className="text-xs font-semibold text-gold flex items-center gap-1 mb-1">
                                        <Lightbulb className="w-3 h-3" /> أفكار
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.ideas}
                                      </p>
                                    </div>
                                  )}
                                  {entry.tomorrowPlan && (
                                    <div>
                                      <span className="text-xs font-semibold text-forest-light flex items-center gap-1 mb-1">
                                        <Calendar className="w-3 h-3" /> خطة الغد
                                      </span>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {entry.tomorrowPlan}
                                      </p>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                                    <span>
                                      الطاقة: {ENERGY_LABELS[(entry.energy || 3) - 1]}
                                    </span>
                                    <span>
                                      المزاج: {getMoodEmoji(entry.mood)}{' '}
                                      {MOOD_EMOJIS.find((m) => m.value === entry.mood)?.label}
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}