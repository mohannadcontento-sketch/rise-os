'use client'

/**
 * قاعدة المعارف — مكتبة معارف من الكتب. الواجهة v3: Hero بلون العلامة
 * + "فكرة اليوم" + التصنيفات في المقدمة.
 *
 * مساعد قائم على أزرار معروفة: تصنيفات → أسئلة → إجابات عملية
 * مستخرجة من قاعدة معارف محلية دقيقة مبنية على كتب حقيقية.
 * + "شارك معرفة": المستخدم يضيف معارفه المقترحة (تُحفظ محلياً وتظهر في البحث).
 * كل شيء يعمل بلا إنترنت وبلا أي API.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Repeat,
  Brain,
  Zap,
  Target,
  Sunrise,
  Moon,
  Flame,
  Hourglass,
  Clock,
  Wallet,
  BookOpen,
  HeartPulse,
  Search,
  X,
  ChevronLeft,
  ListOrdered,
  Sparkles,
  Library,
  History,
  ArrowLeft,
  Plus,
  Trash2,
  Quote,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'
import {
  COACH_TOPICS,
  entriesByTopic,
  getEntry,
  relatedTo,
  searchKnowledge,
  coachStats,
  normalizeArabic,
  type TopicId,
  type KnowledgeEntry,
} from '@/lib/coach-knowledge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

/* ─────────────── أيقونات التصنيفات ─────────────── */

const TOPIC_ICONS: Record<string, LucideIcon> = {
  Repeat, Brain, Zap, Target, Sunrise, Moon, Flame, Hourglass, Clock, Wallet, BookOpen, HeartPulse,
}

const HUE_STYLES: Record<string, string> = {
  emerald: 'bg-emerald-accent/10 text-emerald-accent',
  violet: 'bg-violet-accent/10 text-violet-accent',
  gold: 'bg-gold/10 text-gold',
  rose: 'bg-rose-accent/10 text-rose-accent',
}

const HUE_SOLID: Record<string, string> = {
  emerald: 'bg-emerald-accent text-white',
  violet: 'bg-violet-accent text-white',
  gold: 'bg-gold text-ink',
  rose: 'bg-rose-accent text-white',
}

/* ─────────────── التنقل الداخلي ─────────────── */

type View =
  | { type: 'home' }
  | { type: 'topic'; topicId: TopicId }
  | { type: 'answer'; entryId: string }

const RECENT_KEY = 'rise-coach-recent'
const CONTRIB_KEY = 'rise-kb-contributions'
const RECENT_LIMIT = 6

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]).slice(0, RECENT_LIMIT) : []
  } catch { return [] }
}

/* ─────────────── معارف المستخدم المقترحة ─────────────── */

function loadContributions(): KnowledgeEntry[] {
  try {
    const raw = localStorage.getItem(CONTRIB_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, 50) : []
  } catch { return [] }
}

function saveContributions(list: KnowledgeEntry[]) {
  try { localStorage.setItem(CONTRIB_KEY, JSON.stringify(list.slice(0, 50))) } catch { /* ignore */ }
}

/* ─────────────── الواجهة ─────────────── */

export default function AICoach() {
  const [view, setView] = useState<View>({ type: 'home' })
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [contributions, setContributions] = useState<KnowledgeEntry[]>([])
  const [contributeOpen, setContributeOpen] = useState(false)
  const stats = useMemo(() => coachStats(), [])

  useEffect(() => {
    setRecent(loadRecent())
    setContributions(loadContributions())
  }, [])

  const openEntry = useCallback((entry: KnowledgeEntry) => {
    playSound('click')
    if (!entry.id.startsWith('user-')) {
      setRecent((prev) => {
        const next = [entry.id, ...prev.filter((id) => id !== entry.id)].slice(0, RECENT_LIMIT)
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
    }
    setView({ type: 'answer', entryId: entry.id })
  }, [])

  const openTopic = useCallback((topicId: TopicId) => {
    playSound('click')
    setQuery('')
    setView({ type: 'topic', topicId })
  }, [])

  const goHome = useCallback(() => {
    playSound('click')
    setQuery('')
    setView({ type: 'home' })
  }, [])

  const deleteContribution = useCallback((id: string) => {
    playSound('delete')
    setContributions((prev) => {
      const next = prev.filter((c) => c.id !== id)
      saveContributions(next)
      return next
    })
    if (view.type === 'answer' && view.entryId === id) setView({ type: 'home' })
  }, [view])

  const addContribution = useCallback((entry: KnowledgeEntry) => {
    setContributions((prev) => {
      const next = [entry, ...prev]
      saveContributions(next)
      return next
    })
  }, [])

  /* البحث يشمل معارف المستخدم */
  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return []
    const libResults = searchKnowledge(query, 6)
    const q = normalizeArabic(query)
    const qTokens = q.split(' ').filter((t) => t.length > 1)
    const userMatches: KnowledgeEntry[] = []
    for (const c of contributions) {
      const hay = normalizeArabic([c.title, c.summary, c.book, ...c.tags, ...c.steps].join(' '))
      if (qTokens.every((t) => hay.includes(t)) || hay.includes(q)) {
        userMatches.push(c)
      }
    }
    return [...userMatches.map((entry) => ({ entry, score: 20, user: true as const })), ...libResults.map((r) => ({ ...r, user: false as const }))].slice(0, 8)
  }, [query, contributions])

  const navigateToModule = useCallback((moduleId: string) => {
    playSound('navigate')
    window.dispatchEvent(new CustomEvent('rise:navigate', { detail: moduleId }))
  }, [])

  const activeTopic = view.type === 'topic' ? COACH_TOPICS.find((t) => t.id === view.topicId) : undefined
  const activeEntry = view.type === 'answer' ? (getEntry(view.entryId) || contributions.find((c) => c.id === view.entryId)) : undefined

  /* الكتب المتوفرة (فريدة بالعدّاد) */
  const booksList = useMemo(() => {
    const map = new Map<string, { book: string; author: string; count: number }>()
    for (const e of COACH_TOPICS.flatMap((t) => entriesByTopic(t.id))) {
      const key = `${e.book}|${e.author}`
      const cur = map.get(key)
      if (cur) cur.count++
      else map.set(key, { book: e.book, author: e.author, count: 1 })
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [])

  /* فكرة اليوم — مقالة ثابتة طوال اليوم تتغير يومياً */
  const dailyEntry = useMemo(() => {
    const all = COACH_TOPICS.flatMap((t) => entriesByTopic(t.id))
    if (!all.length) return undefined
    const day = Math.floor(Date.now() / 86_400_000)
    return all[day % all.length]
  }, [])

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)] relative rounded-3xl">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-start justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-forest via-emerald-accent to-lime shadow-lg shadow-emerald-accent/20">
              <Library className="w-6 h-6 text-white" />
            </div>
            <span className="absolute -bottom-1 -end-1 w-4 h-4 rounded-full bg-lime border-2 border-background flex items-center justify-center">
              <BookOpen className="w-2.5 h-2.5 text-ink" />
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gradient-forest">قاعدة المعارف</h2>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>خلاصات عملية من أشهر الكتب — اختر موضوعاً وابدأ</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="hidden sm:inline-flex pill bg-emerald-accent/10 text-emerald-accent text-[11px] gap-1.5" title="حجم قاعدة المعارف">
            <Library className="w-3.5 h-3.5" />
            <span className="num" dir="ltr">{stats.entries}</span> مقالة من <span className="num" dir="ltr">{stats.books}</span> كتاب
          </span>
          <button
            onClick={() => { playSound('click'); setContributeOpen(true) }}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-forest dark:text-lime hover:opacity-80 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            شارك معرفة
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="shrink-0 pb-4">
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث… مثال: كسرت سلسلتي، تأجيل، قهوة"
            className="w-full h-12 ps-10 pe-10 rounded-2xl glass bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-2 ring-emerald-accent/30 transition-shadow"
            dir="rtl"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
              aria-label="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0 neo-scroll pb-2">
        <AnimatePresence mode="wait">
          {/* بحث نشط */}
          {searchResults.length > 0 ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-2"
            >
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                نتائج البحث (<span className="num" dir="ltr">{searchResults.length}</span>)
              </p>
              {searchResults.map(({ entry, score, user }) => (
                <QuestionButton
                  key={entry.id}
                  entry={entry}
                  showTopic
                  hot={!user && score >= 12}
                  userMade={user}
                  onClick={() => openEntry(entry)}
                />
              ))}
            </motion.div>
          ) : query.trim().length >= 2 ? (
            <motion.div
              key="no-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-10 px-4"
            >
              <span className="icon-well mb-3 h-14 w-14 bg-secondary text-muted-foreground/50">
                <Search className="w-6 h-6" />
              </span>
              <p className="text-sm text-muted-foreground">لا نتائج مطابقة — جرّب كلمة أبسط</p>
              <p className="text-xs text-muted-foreground/60 mt-1">أو اختر تصنيفاً من الأزرار بالأسفل</p>
            </motion.div>
          ) : view.type === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
              {/* Hero — لحظة العلامة */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-forest via-emerald-accent to-lime p-5 shadow-lg shadow-emerald-accent/20">
                <div className="absolute -top-10 -start-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
                <div className="absolute -bottom-12 -end-6 w-32 h-32 rounded-full bg-ink/10 blur-xl" aria-hidden />
                <div className="relative flex items-center gap-3">
                  <span className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/25 shrink-0">
                    <Library className="w-6 h-6 text-white" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-extrabold text-white leading-snug">معارف تُطبَّق، لا تُقرأ فقط</h3>
                    <p className="text-xs text-white/85 mt-0.5">خلاصات عملية من أشهر كتب الإنتاجية والتنمية البشرية</p>
                  </div>
                </div>
                <div className="relative flex flex-wrap gap-1.5 mt-4">
                  <span className="pill bg-white/15 text-white border-0 text-[10px] gap-1">
                    <BookOpen className="w-3 h-3" />
                    <span className="num" dir="ltr">{stats.entries}</span> مقالة
                  </span>
                  <span className="pill bg-white/15 text-white border-0 text-[10px] gap-1">
                    <Library className="w-3 h-3" />
                    <span className="num" dir="ltr">{stats.books}</span> كتاب
                  </span>
                  <span className="pill bg-white/15 text-white border-0 text-[10px] gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span className="num" dir="ltr">{COACH_TOPICS.length}</span> موضوع
                  </span>
                </div>
              </div>

              {/* فكرة اليوم — تتغير كل يوم */}
              {dailyEntry && (
                <button onClick={() => openEntry(dailyEntry)} className="w-full text-start group" aria-label="اقرأ فكرة اليوم">
                  <div className="glass rounded-2xl p-4 card-lift relative overflow-hidden">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
                        <Quote className="w-5 h-5 text-gold" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          فكرة اليوم
                        </p>
                        <p className="text-sm font-bold truncate mt-0.5">{dailyEntry.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{dailyEntry.book} — {dailyEntry.author}</p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:-translate-x-0.5 transition-all shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-3 line-clamp-2">{dailyEntry.summary}</p>
                  </div>
                </button>
              )}

              {/* التصنيفات — أول ما تشوفه */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  اختر موضوعاً وابدأ
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {COACH_TOPICS.map((topic, i) => {
                    const Icon = TOPIC_ICONS[topic.icon] || BookOpen
                    const count = entriesByTopic(topic.id).length
                    return (
                      <motion.button
                        key={topic.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => openTopic(topic.id)}
                        className="group relative p-4 rounded-2xl glass text-start hover:shadow-md transition-all overflow-hidden"
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center', HUE_STYLES[topic.hue])}>
                            <Icon className="w-[18px] h-[18px]" />
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground/60 bg-muted/50 rounded-full px-2 py-0.5 num" dir="ltr">
                            {count}
                          </span>
                        </div>
                        <p className="font-bold text-sm">{topic.label}</p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">{topic.desc}</p>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {/* آخر ما فتحته */}
              {recent.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    آخر ما قرأته
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 neo-scroll">
                    {recent.map((id) => {
                      const entry = getEntry(id)
                      if (!entry) return null
                      return (
                        <button
                          key={id}
                          onClick={() => openEntry(entry)}
                          className="shrink-0 max-w-[220px] text-start px-3.5 py-2 rounded-xl glass hover:bg-muted/40 transition-colors"
                        >
                          <span className="block text-xs font-semibold truncate">{entry.title}</span>
                          <span className="block text-[10px] text-muted-foreground/70 mt-0.5 truncate">{entry.book}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* معارفك المقترحة */}
              {contributions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-gold" />
                    معارفك المقترحة (<span className="num" dir="ltr">{contributions.length}</span>)
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 neo-scroll">
                    {contributions.map((entry) => (
                      <div key={entry.id} className="relative shrink-0 max-w-[220px] group">
                        <button
                          onClick={() => openEntry(entry)}
                          className="w-full text-start px-3.5 py-2 rounded-xl bg-gold/10 border border-gold/20 hover:bg-gold/15 transition-colors"
                        >
                          <span className="block text-xs font-semibold truncate">{entry.title}</span>
                          <span className="block text-[10px] text-muted-foreground/70 mt-0.5 truncate">{entry.book || 'إضافة شخصية'}</span>
                        </button>
                        <button
                          onClick={() => deleteContribution(entry.id)}
                          className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-destructive text-white items-center justify-center hidden group-hover:flex"
                          aria-label="حذف"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* المكتبة — الكتب المتوفرة */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                  <Library className="w-3.5 h-3.5" />
                  المكتبة
                </p>
                <div className="flex flex-wrap gap-2">
                  {booksList.map(({ book, author, count }) => (
                    <span
                      key={book + author}
                      className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full glass hover:bg-muted/40 transition-colors"
                      title={author}
                    >
                      <BookOpen className="w-3 h-3 text-emerald-accent shrink-0" />
                      <span className="font-medium">{book}</span>
                      <span className="text-muted-foreground/60 num" dir="ltr">({count})</span>
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : view.type === 'topic' && activeTopic ? (
            <motion.div key={`topic-${activeTopic.id}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-3">
              <BackButton onClick={goHome} label="كل المواضيع" />
              <div className="glass rounded-2xl p-4 flex items-center gap-3">
                <span className={cn('w-11 h-11 rounded-xl flex items-center justify-center', HUE_SOLID[activeTopic.hue])}>
                  {(() => { const Icon = TOPIC_ICONS[activeTopic.icon] || BookOpen; return <Icon className="w-5 h-5" /> })()}
                </span>
                <div>
                  <p className="font-bold">{activeTopic.label}</p>
                  <p className="text-xs text-muted-foreground">{activeTopic.desc} — اختر سؤالاً:</p>
                </div>
              </div>
              {entriesByTopic(activeTopic.id).map((entry, i) => (
                <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <QuestionButton entry={entry} onClick={() => openEntry(entry)} />
                </motion.div>
              ))}
            </motion.div>
          ) : view.type === 'answer' && activeEntry ? (
            <motion.div key={`answer-${activeEntry.id}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-4">
              <BackButton
                onClick={() => setView({ type: 'topic', topicId: activeEntry.topic })}
                label={COACH_TOPICS.find((t) => t.id === activeEntry.topic)?.label || 'رجوع'}
              />
              {activeEntry.id.startsWith('user-') && (
                <button
                  onClick={() => deleteContribution(activeEntry.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive hover:opacity-80"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  حذف هذه الإضافة
                </button>
              )}
              <AnswerCard entry={activeEntry} onAction={navigateToModule} onRelated={openEntry} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ── نافذة "شارك معرفة" ── */}
      <ContributeDialog
        open={contributeOpen}
        onOpenChange={setContributeOpen}
        onSave={addContribution}
      />
    </div>
  )
}

/* ─────────────── نافذة مشاركة معرفة ─────────────── */

function ContributeDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSave: (entry: KnowledgeEntry) => void
}) {
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [summary, setSummary] = useState('')
  const [stepsText, setStepsText] = useState('')
  const [topic, setTopic] = useState<TopicId>('productivity')

  useEffect(() => {
    if (open) {
      setTitle(''); setSource(''); setSummary(''); setStepsText(''); setTopic('productivity')
    }
  }, [open])

  const canSave = title.trim().length >= 3 && summary.trim().length >= 10 && stepsText.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const entry: KnowledgeEntry = {
      id: `user-${Date.now()}`,
      topic,
      title: title.trim(),
      book: source.trim() || 'إضافة شخصية',
      author: 'مشاركة المستخدم',
      summary: summary.trim(),
      steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8),
      tags: [title.trim(), ...normalizeArabic(title).split(' ').filter((t) => t.length > 1)],
    }
    onSave(entry)
    playSound('save')
    toast.success('تمت إضافة معرفتك إلى قاعدة المعارف', { description: 'ستراها في قسم "معارفك المقترحة" وفي البحث' })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md glass border-0 max-h-[85vh] overflow-y-auto neo-scroll">
        <DialogHeader>
          <DialogTitle className="text-start flex items-center gap-2">
            <span className="icon-well iw-lime w-8 h-8">
              <Plus className="w-4 h-4" />
            </span>
            شارك معرفة
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 pt-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            أضف فائدة أو خطوات عملية من كتاب أو تجربة — تُحفظ في قاعدة معارفك وتظهر في البحث، ومع التطوير القادم ستُنشر لكل المستخدمين.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">العنوان</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="مثال: قاعدة الخمس دقائق للبدء"
              className="neo-input"
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">المصدر / الكتاب (اختياري)</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={80}
              placeholder="اسم الكتاب أو من تعلمت منها"
              className="neo-input"
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">الفكرة</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={400}
              rows={3}
              placeholder="اشرح الفكرة في 2-3 أسطر…"
              className="neo-input resize-none"
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">الخطوات (خطوة في كل سطر)</label>
            <textarea
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              maxLength={800}
              rows={4}
              placeholder={'اكتب أول خطوة\nثم الخطوة الثانية\nوهكذا…'}
              className="neo-input resize-none"
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">التصنيف</label>
            <div className="flex flex-wrap gap-1.5">
              {COACH_TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTopic(t.id)}
                  className={cn(
                    'text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors',
                    topic === t.id
                      ? 'bg-forest text-paper-soft dark:bg-lime dark:text-ink'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              'w-full h-11 rounded-xl text-sm font-bold transition-all',
              canSave
                ? 'bg-forest text-paper-soft dark:bg-lime dark:text-ink hover:opacity-90 active:scale-[0.98]'
                : 'bg-muted/40 text-muted-foreground/50 cursor-not-allowed'
            )}
          >
            إضافة إلى معارفي
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─────────────── مكونات صغيرة ─────────────── */

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
      {label}
    </button>
  )
}

function QuestionButton({
  entry,
  onClick,
  showTopic,
  hot,
  userMade,
}: {
  entry: KnowledgeEntry
  onClick: () => void
  showTopic?: boolean
  hot?: boolean
  userMade?: boolean
}) {
  const topic = COACH_TOPICS.find((t) => t.id === entry.topic)
  return (
    <button
      onClick={onClick}
      className="w-full text-start p-4 rounded-2xl glass hover:bg-muted/30 transition-all group relative overflow-hidden"
    >
      <div className="flex items-start gap-3">
        <span className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform',
          userMade ? 'bg-gold/15 text-gold' : 'bg-emerald-accent/10 text-emerald-accent'
        )}>
          {userMade ? <Sparkles className="w-4 h-4" /> : <ListOrdered className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug flex items-center gap-2 flex-wrap">
            {entry.title}
            {hot && (
              <span className="text-[9px] font-bold bg-lime text-ink rounded-full px-1.5 py-0.5">تطابق قوي</span>
            )}
            {userMade && (
              <span className="text-[9px] font-bold bg-gold/20 text-gold rounded-full px-1.5 py-0.5">من معارفي</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
              <BookOpen className="w-3 h-3" />
              {entry.book}
            </span>
            {showTopic && topic && (
              <span className="text-[10px] text-muted-foreground/70">{topic.label}</span>
            )}
          </div>
        </div>
        <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1 group-hover:text-emerald-accent group-hover:-translate-x-0.5 transition-all rtl:rotate-180 ltr:rotate-180" />
      </div>
    </button>
  )
}

function AnswerCard({
  entry,
  onAction,
  onRelated,
}: {
  entry: KnowledgeEntry
  onAction: (moduleId: string) => void
  onRelated: (entry: KnowledgeEntry) => void
}) {
  const topic = COACH_TOPICS.find((t) => t.id === entry.topic)
  const related = relatedTo(entry)
  const actions = entry.actions || (topic ? [{ label: `افتح ${topic.label}`, moduleId: defaultModuleFor(entry.topic) }] : [])

  return (
    <div className="space-y-4">
      {/* بطاقة الإجابة */}
      <div className="glass rounded-3xl overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-accent/15 via-transparent to-lime/10 p-5 pb-4">
          <h3 className="text-lg font-bold leading-snug">{entry.title}</h3>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-accent/15 text-emerald-accent rounded-full px-2.5 py-1">
              <Library className="w-3 h-3" />
              {entry.book}
            </span>
            <span className="text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2.5 py-1">
              {entry.author}
            </span>
          </div>
        </div>

        <div className="p-5 pt-4 space-y-5">
          {/* الفكرة */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wide">الفكرة</p>
            <p className="text-sm leading-relaxed text-foreground/90">{entry.summary}</p>
          </div>

          {/* الخطوات */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5" />
              خطوات عملية
            </p>
            <ol className="space-y-2.5">
              {entry.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-forest text-lime dark:bg-lime dark:text-ink flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 num" dir="ltr">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground/90 flex-1">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* أزرار التطبيق داخل التطبيق */}
          {actions.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2.5 uppercase tracking-wide">طبّقها الآن</p>
              <div className="flex gap-2 flex-wrap">
                {actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => onAction(action.moduleId)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-forest text-paper-soft dark:bg-lime dark:text-ink rounded-xl px-3.5 py-2 hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* أسئلة ذات صلة — أزرار تتبع الإجابة */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-gold" />
          أسئلة ذات صلة
        </p>
        <div className="space-y-2">
          {related.map((rel) => {
            const relTopic = COACH_TOPICS.find((t) => t.id === rel.topic)
            return (
              <button
                key={rel.id}
                onClick={() => onRelated(rel)}
                className="w-full text-start px-4 py-3 rounded-xl glass hover:bg-muted/30 transition-all text-sm font-medium flex items-center justify-between gap-3 group"
              >
                <span className="flex-1">{rel.title}</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">{relTopic?.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function defaultModuleFor(topic: TopicId): string {
  switch (topic) {
    case 'habits': return 'habits'
    case 'focus': return 'deepwork'
    case 'productivity': return 'tasks'
    case 'goals': return 'goals'
    case 'morning': return 'morning'
    case 'sleep': return 'health'
    case 'motivation': return 'dashboard'
    case 'procrastination': return 'planner'
    case 'time': return 'planner'
    case 'money': return 'finance'
    case 'learning': return 'reading'
    case 'mindset': return 'journal'
    default: return 'dashboard'
  }
}
