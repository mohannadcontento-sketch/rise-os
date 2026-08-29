'use client'

/**
 * المدرب الذكي — بلا ذكاء اصطناعي (طلب المستخدم).
 *
 * مساعد قائم على أزرار معروفة: تصنيفات → أسئلة → إجابات عملية
 * مستخرجة من قاعدة معارف محلية دقيقة مبنية على كتب حقيقية.
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
  type TopicId,
  type KnowledgeEntry,
} from '@/lib/coach-knowledge'

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
const RECENT_LIMIT = 6

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]).slice(0, RECENT_LIMIT) : []
  } catch { return [] }
}

/* ─────────────── الواجهة ─────────────── */

export default function AICoach() {
  const [view, setView] = useState<View>({ type: 'home' })
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const stats = useMemo(() => coachStats(), [])

  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  const openEntry = useCallback((entry: KnowledgeEntry) => {
    playSound('click')
    setRecent((prev) => {
      const next = [entry.id, ...prev.filter((id) => id !== entry.id)].slice(0, RECENT_LIMIT)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
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

  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return []
    return searchKnowledge(query, 6)
  }, [query])

  const navigateToModule = useCallback((moduleId: string) => {
    playSound('navigate')
    window.dispatchEvent(new CustomEvent('rise:navigate', { detail: moduleId }))
  }, [])

  const activeTopic = view.type === 'topic' ? COACH_TOPICS.find((t) => t.id === view.topicId) : undefined
  const activeEntry = view.type === 'answer' ? getEntry(view.entryId) : undefined

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)] relative rounded-3xl">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-start justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-accent via-[#7C3AED] to-gold shadow-lg shadow-violet-accent/20">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="absolute -bottom-1 -end-1 w-4 h-4 rounded-full bg-lime border-2 border-background flex items-center justify-center">
              <Sparkles className="w-2 h-2 text-ink" />
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gradient-forest">المدرب الذكي</h2>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>اضغط زراً… وخذ خطوات عملية من الكتب</span>
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-flex pill bg-violet-accent/10 text-violet-accent text-[11px] gap-1.5 shrink-0" title="حجم قاعدة المعارف">
          <Library className="w-3.5 h-3.5" />
          <span className="num" dir="ltr">{stats.entries}</span> مقالة من <span className="num" dir="ltr">{stats.books}</span> كتاب
        </span>
      </div>

      {/* ── Search ── */}
      <div className="shrink-0 pb-4">
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المعارف… مثال: كسرت سلسلتي، تأجيل، قهوة"
            className="w-full h-12 ps-10 pe-10 rounded-2xl glass bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-2 ring-violet-accent/30 transition-shadow"
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
              {searchResults.map(({ entry, score }) => (
                <QuestionButton
                  key={entry.id}
                  entry={entry}
                  showTopic
                  hot={score >= 12}
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
              {/* Hero micro */}
              <div className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-lime/90 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-ink" />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <span className="font-bold text-foreground">بدون ذكاء اصطناعي</span> — مدرب مجرّب:
                  اختر موضوعاً، اضغط سؤالاً، وخذ خطوات مجرّبة من <span className="font-semibold text-foreground">{stats.books}</span> كتاب في التنمية والإنتاجية.
                </p>
              </div>

              {/* آخر ما فتحته */}
              {recent.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    آخر ما قرأته
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
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

              {/* التصنيفات */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2.5">اختر موضوعاً</p>
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
                            <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
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
              <AnswerCard entry={activeEntry} onAction={navigateToModule} onRelated={openEntry} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ── Footer note ── */}
      <div className="shrink-0 pt-3 text-center">
        <p className="text-[10px] text-muted-foreground/50">
          كل الإجابات محلية من الكتب — تعمل بلا إنترنت، ولا يُرسل أي سؤال لأي خادم
        </p>
      </div>
    </div>
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
}: {
  entry: KnowledgeEntry
  onClick: () => void
  showTopic?: boolean
  hot?: boolean
}) {
  const topic = COACH_TOPICS.find((t) => t.id === entry.topic)
  return (
    <button
      onClick={onClick}
      className="w-full text-start p-4 rounded-2xl glass hover:bg-muted/30 transition-all group relative overflow-hidden"
    >
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-violet-accent/10 text-violet-accent flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
          <ListOrdered className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug flex items-center gap-2 flex-wrap">
            {entry.title}
            {hot && (
              <span className="text-[9px] font-bold bg-lime text-ink rounded-full px-1.5 py-0.5">تطابق قوي</span>
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
        <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1 group-hover:text-violet-accent group-hover:-translate-x-0.5 transition-all rtl:rotate-180 ltr:rotate-180" />
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
        <div className="bg-gradient-to-l from-violet-accent/15 via-transparent to-gold/10 p-5 pb-4">
          <h3 className="text-lg font-bold leading-snug">{entry.title}</h3>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-violet-accent/15 text-violet-accent rounded-full px-2.5 py-1">
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
