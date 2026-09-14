'use client'

// ============================================================
// home.tsx — المرحلة 17: Home & My Day (مركز القيادة)
//
// يستبدل لوحة الإحصائيات القديمة (dashboard.tsx) بمركز قيادة
// هادئ وفق docs/phase-16/UX_FOUNDATION.md §11:
//   Greeting → Focus of the Day → Today snapshot (My Day) →
//   Continue → Quick actions → Progress → (خلف الطية) Discover.
//
// حالات المستخدم الخمس مصمَّمة صراحة (§11): جديد · يوم فارغ ·
// يوم مزدحم · مساء · مستخدم تعلم-focused.
//
// البيانات: موجتان — فوق الطية (summary/tasks/habits/planner/
// morning) فورًا، وكل ما تحتها (focus/books/knowledge/projects)
// lazy بعد خمول المتصفح (§ «حصر التحميل الأولي على فوق fold»).
//
// قواعد UX Copy (§7): صفر لغة لوم («المتبقي»/«الفرصة التالية») ·
// أرقام عربية شرقية · أفعال في الأزرار · تسميات MODULE_LABELS.
// Accessibility (§8): aria-label لكل زر أيقوني · focus-visible ·
// transitions CSS فقط (يحترم prefers-reduced-motion تلقائيًا).
//
// الكتابة: QuickAdd (ملف مستقل) — toggle العادة وإتمام المهمة
// مباشرة من لقطة اليوم (تدقيق §10: عادة = ١ نقرة).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Sun, Moon, CloudSun, Target, CheckCircle2, Circle, Flame,
  BookOpen, Lightbulb, Compass, ChevronDown, ChevronUp,
  RefreshCw, Sparkles, PenLine, Timer, Plus, ArrowLeft,
} from 'lucide-react'
import { useRiseStore } from '@/store/app-store'
import { useToday } from '@/hooks/use-today'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { apiGet, apiPut } from '@/lib/api-fetch'
import { toArabicNum } from '@/lib/rise-utils'
import { MODULE_LABELS } from '@/lib/module-labels'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QuickAdd, type QuickAddType } from '@/components/rise/quick-add'
import { toast } from 'sonner'

// ── القسم: الأنواع ──────────────────────────────────────────

interface HomeTask {
  id: string; title: string; status: string; priority?: string
  dueDate?: string | null; dueTime?: string | null; completedAt?: string | null
  projectId?: string | null
}
interface HomeHabit { id: string; name: string; icon?: string; color?: string; reminderTime?: string | null; targetCount?: number; frequency?: string }
interface HomeHabitLog { habitId: string; date: string; completed: boolean; count?: number }
interface HomePlannerItem { id: string; section: string; time?: string | null; title: string; completed: boolean }
interface HomeSummary {
  user?: { name?: string; level?: number; xp?: number; xpToNextLevel?: number; streak?: number; totalFocusMin?: number; totalTasksDone?: number } | null
  today?: { tasksCompleted: number; tasksTotal: number; habitsCompleted: number; habitsTotal: number }
}
interface ContinueItem { kind: 'book' | 'knowledge' | 'project'; title: string; sub: string; moduleId: 'reading' | 'brain' | 'projects' }

type TimelineRow = {
  key: string
  time: string | null           // HH:MM أو null لـ«بدون وقت»
  kind: 'task' | 'habit' | 'planner'
  label: string
  done: boolean
  taskId?: string
  habitId?: string
  habitDone?: boolean
}

// ── القسم: مساعدات العرض ─────────────────────────────────────

/** تحية الوقت — فصحى قريبة بلا مبالغة (§7). */
function greetingFor(hour: number): { text: string; Icon: typeof Sun } {
  if (hour < 12) return { text: 'صباح الخير', Icon: Sun }
  if (hour < 17) return { text: 'نهارك سعيد', Icon: CloudSun }
  return { text: 'مساء الخير', Icon: Moon }
}

/** ١٢:٣٠ → «١٢:٣٠ م» بأرقام شرقية. */
function fmtTime(t: string): string {
  const [hRaw, m] = t.split(':')
  const h = parseInt(hRaw, 10)
  const period = h < 12 ? 'ص' : 'م'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return toArabicNum(`${h12}:${m ?? '00'}`) + ' ' + period
}

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
const PRIORITY_LABEL: Record<string, string> = { urgent: 'عاجلة', high: 'مهمة', medium: 'عادية', low: 'هادئة' }

/** فهرس الأهمية: مهمة عاجلة > مهمة > بدون وقت > عادية/هادئة. */
function taskRank(t: HomeTask): number {
  const w = PRIORITY_WEIGHT[t.priority || 'medium'] || 2
  const hasTime = t.dueTime ? 1 : 0
  return w * 10 + hasTime
}

// ── القسم: بناء الخط الزمني «يومي» ──────────────────────────

/**
 * دمج مصادر اليوم في خط زمني واحد حسب الوقت (§ مهمة المرحلة):
 * عناصر المخطط (بوقتها) + مهام اليوم (بوقتها ثم بلا وقت) +
 * العادات (بوقت التذكير إن وُجد). مرتبة بالوقت ثم بلا وقت أخيرًا.
 */
function buildTimeline(
  tasks: HomeTask[], habits: HomeHabit[], logs: HomeHabitLog[],
  planner: HomePlannerItem[], today: string,
): TimelineRow[] {
  const rows: TimelineRow[] = []

  for (const p of planner) {
    rows.push({
      key: 'p-' + p.id, time: p.time || null, kind: 'planner',
      label: p.title, done: p.completed,
    })
  }

  const todayTasks = tasks.filter((t) => t.dueDate === today && t.status !== 'cancelled')
  for (const t of todayTasks) {
    rows.push({
      key: 't-' + t.id, time: t.dueTime || null, kind: 'task',
      label: t.title, done: t.status === 'done', taskId: t.id,
    })
  }

  const doneHabitIds = new Set(logs.filter((l) => l.date === today && l.completed).map((l) => l.habitId))
  for (const h of habits) {
    rows.push({
      key: 'h-' + h.id, time: h.reminderTime || null, kind: 'habit',
      label: h.name, done: doneHabitIds.has(h.id), habitId: h.id,
      habitDone: doneHabitIds.has(h.id),
    })
  }

  rows.sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time)
    if (a.time) return -1
    if (b.time) return 1
    return 0
  })
  return rows
}

// ── القسم: بطاقة تركيز اليوم ─────────────────────────────────

function FocusOfDayCard({ row, onStart }: { row: TimelineRow | null; onStart: () => void }) {
  return (
    <section
      className="glass rounded-2xl p-4 sm:p-5 mb-4 border border-primary/15"
      aria-label="تركيز اليوم"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">تركيز اليوم</p>
            {row ? (
              <p className="font-semibold truncate">{row.label}</p>
            ) : (
              <p className="font-semibold text-muted-foreground">حدّد أهم شيء واحد لهذا اليوم</p>
            )}
          </div>
        </div>
        {row && !row.done && (
          <Button size="sm" onClick={onStart} className="shrink-0">
            ابدأ الآن
          </Button>
        )}
        {row?.done && (
          <span className="flex items-center gap-1 text-sm text-emerald-500 shrink-0">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> أُنجز
          </span>
        )}
      </div>
    </section>
  )
}

// ── القسم: لقطة اليوم (الخط الزمني — ٦ صفوف ثم «اليوم كامل») ──

function MyDayCard({
  rows, expanded, onToggleExpand, onToggleHabit, onCompleteTask, busyId, error,
}: {
  rows: TimelineRow[]
  expanded: boolean
  onToggleExpand: () => void
  onToggleHabit: (habitId: string, done: boolean) => void
  onCompleteTask: (taskId: string) => void
  busyId: string | null
  error: string | null
}) {
  const visible = expanded ? rows : rows.slice(0, 6)
  const doneCount = rows.filter((r) => r.done).length
  const remaining = rows.length - doneCount

  return (
    <section className="glass rounded-2xl p-4 sm:p-5 mb-4" aria-label="لقطة اليوم">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold flex items-center gap-2">
          <CloudSun className="w-5 h-5 text-amber-400" aria-hidden="true" />
          يومي
        </h3>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {remaining > 0
            ? `المتبقي ${toArabicNum(remaining)} من ${toArabicNum(rows.length)}`
            : rows.length > 0
              ? `اكتمل اليوم — ${toArabicNum(doneCount)} إنجازًا`
              : ''}
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-destructive/10 border border-destructive/20 p-3 flex items-center justify-between gap-2" role="alert">
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> أعد المحاولة
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-8">
          <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" aria-hidden="true" />
          <p className="font-medium">يومك فاضي — ابدأ بشيء واحد</p>
          <p className="text-sm text-muted-foreground mt-1">
            أضف مهمة واحدة أو علّم عادة، والباقي يترتب وحده
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((r) => (
              <li
                key={r.key}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                  r.done ? 'bg-muted/40' : 'hover:bg-muted/30',
                  busyId === (r.habitId || r.taskId) && 'opacity-60',
                )}
              >
                <span className="text-xs tabular-nums text-muted-foreground w-14 shrink-0" dir="ltr">
                  {r.time ? fmtTime(r.time) : '—'}
                </span>

                {r.kind === 'habit' ? (
                  <button
                    type="button"
                    onClick={() => onToggleHabit(r.habitId!, !r.habitDone)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-right group"
                    aria-label={r.habitDone ? `إلغاء تسجيل العادة: ${r.label}` : `تسجيل العادة: ${r.label}`}
                  >
                    {r.habitDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" aria-hidden="true" />
                    )}
                    <span className={cn('text-sm font-medium truncate', r.habitDone && 'line-through text-muted-foreground')}>
                      {r.label}
                    </span>
                  </button>
                ) : r.kind === 'task' ? (
                  <button
                    type="button"
                    onClick={() => !r.done && onCompleteTask(r.taskId!)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-right group"
                    aria-label={r.done ? `المهمة مكتملة: ${r.label}` : `إتمام المهمة: ${r.label}`}
                  >
                    {r.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" aria-hidden="true" />
                    )}
                    <span className={cn('text-sm font-medium truncate', r.done && 'line-through text-muted-foreground')}>
                      {r.label}
                    </span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    {r.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
                    )}
                    <span className={cn('text-sm font-medium truncate', r.done && 'line-through text-muted-foreground')}>
                      {r.label}
                    </span>
                  </span>
                )}

                {r.kind === 'task' && !r.done && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary shrink-0">
                    {PRIORITY_LABEL[(r as any).priority || 'medium']}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {rows.length > 6 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="mt-2 w-full flex items-center justify-center gap-1 text-sm text-primary hover:underline py-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-expanded={expanded}
              aria-label={expanded ? 'طي بقية اليوم' : 'عرض اليوم كامل'}
            >
              {expanded ? (
                <>طَوِ <ChevronUp className="w-4 h-4" aria-hidden="true" /></>
              ) : (
                <>عرض اليوم كامل ({toArabicNum(rows.length)}) <ChevronDown className="w-4 h-4" aria-hidden="true" /></>
              )}
            </button>
          )}
        </>
      )}
    </section>
  )
}

// ── القسم: أكمل من حيث توقفت ─────────────────────────────────

function ContinueCard({ items, onOpen }: { items: ContinueItem[]; onOpen: (m: 'reading' | 'brain' | 'projects') => void }) {
  if (items.length === 0) return null
  const icons = { book: BookOpen, knowledge: Lightbulb, project: Target }
  return (
    <section className="glass rounded-2xl p-4 sm:p-5 mb-4" aria-label="أكمل من حيث توقفت">
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <ArrowLeft className="w-5 h-5 text-primary" aria-hidden="true" />
        أكمل من حيث توقفت
      </h3>
      <ul className="space-y-1.5">
        {items.slice(0, 3).map((it) => {
          const Icon = icons[it.kind]
          return (
            <li key={it.kind + it.title}>
              <button
                type="button"
                onClick={() => onOpen(it.moduleId)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/30 text-right transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={`أكمل: ${it.title}`}
              >
                <Icon className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{it.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">{it.sub}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── القسم: إجراءات سريعة (٦ — ميزانية §5) ────────────────────

const QUICK_ACTIONS: { type: QuickAddType; label: string; icon: typeof Plus }[] = [
  { type: 'task', label: 'أضف مهمة', icon: Plus },
  { type: 'focus', label: 'ابدأ تركيزًا', icon: Timer },
  { type: 'journal', label: 'اكتب يومية', icon: PenLine },
  { type: 'habit', label: 'علّم عادة', icon: Flame },
  { type: 'goal', label: 'أضف هدفًا', icon: Target },
  { type: 'note', label: 'دوّن فكرة', icon: Lightbulb },
]

function QuickActionsRow({ onAdd }: { onAdd: (t: QuickAddType) => void }) {
  return (
    <section className="mb-4" aria-label="إجراءات سريعة">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {QUICK_ACTIONS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            className="glass rounded-xl p-3 flex flex-col items-center gap-1.5 hover:border-primary/40 hover:shadow-[0_0_12px_-4px] hover:shadow-primary/25 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label={label}
          >
            <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── القسم: تقدمي (مستوى/سلسلة — بلا احتفال مبالغ) ─────────────

function ProgressCard({ summary }: { summary: HomeSummary | null }) {
  const u = summary?.user
  const t = summary?.today
  const level = u?.level || 1
  const xp = u?.xp || 0
  const xpNext = u?.xpToNextLevel || 100
  const pct = Math.min(100, Math.round((xp / Math.max(xpNext, 1)) * 100))
  const streak = u?.streak || 0

  return (
    <section className="glass rounded-2xl p-4 sm:p-5 mb-4" aria-label="تقدمي">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-400" aria-hidden="true" />
          تقدمي
        </h3>
        {streak > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
            سلسلة {toArabicNum(streak)} يوم
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold">{toArabicNum(level)}</span>
        <span className="text-sm text-muted-foreground">المستوى</span>
        <span className="text-xs text-muted-foreground mr-auto" dir="ltr">
          {toArabicNum(xp)} / {toArabicNum(xpNext)} XP
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`تقدم المستوى ${pct}%`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-l from-primary to-emerald-400 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {t && (t.tasksTotal > 0 || t.habitsTotal > 0) && (
        <p className="text-xs text-muted-foreground mt-3">
          {t.tasksTotal > 0 && `مهام اليوم: ${toArabicNum(t.tasksCompleted)}/${toArabicNum(t.tasksTotal)}`}
          {t.tasksTotal > 0 && t.habitsTotal > 0 && ' · '}
          {t.habitsTotal > 0 && `عادات اليوم: ${toArabicNum(t.habitsCompleted)}/${toArabicNum(t.habitsTotal)}`}
        </p>
      )}
    </section>
  )
}

// ── القسم: إغلاق اليوم (حالة المساء — بلا لوم) ────────────────

function EveningCloseCard({ remaining, nextLabel, onJournal, onReview }: {
  remaining: number
  nextLabel: string | null
  onJournal: () => void
  onReview: () => void
}) {
  return (
    <section className="glass rounded-2xl p-4 sm:p-5 mb-4 border border-violet-500/20" aria-label="إغلاق اليوم">
      <h3 className="font-bold mb-2 flex items-center gap-2">
        <Moon className="w-5 h-5 text-violet-400" aria-hidden="true" />
        إغلاق اليوم
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {remaining > 0
          ? `المتبقي ${toArabicNum(remaining)} — ${nextLabel ? `الفرصة التالية: ${nextLabel}` : 'وما لم يُنجز اليوم ينتقل لغدك نظيفًا'}`
          : 'أنهيت يومك — سجّل خلاصته قبل أن تنسى'}
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={onJournal}>
          <PenLine className="w-4 h-4" aria-hidden="true" /> اكتب اليومية
        </Button>
        <Button size="sm" variant="ghost" onClick={onReview}>
          مراجعة سريعة
        </Button>
      </div>
    </section>
  )
}

// ── القسم: ترحيب المستخدم الجديد (٣ قوالب بداية) ──────────────

const STARTER_TEMPLATES: { type: QuickAddType; label: string; desc: string; icon: typeof Plus }[] = [
  { type: 'task', label: 'أضف أول مهمة', desc: 'شيء واحد صغير تنجزه اليوم', icon: Plus },
  { type: 'habit', label: 'ابدأ أول عادة', desc: 'عادة واحدة تكررها يوميًا', icon: Flame },
  { type: 'journal', label: 'اكتب أول يومية', desc: 'سطر واحد عن يومك', icon: PenLine },
]

function NewUserWelcome({ onAdd }: { onAdd: (t: QuickAddType) => void }) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-6 mb-4 text-center border border-primary/15" aria-label="أهلًا بك في أوج">
      <CloudSun className="w-10 h-10 mx-auto text-primary mb-3" aria-hidden="true" />
      <h3 className="text-lg font-bold mb-1">أهلًا بك في أوج</h3>
      <p className="text-sm text-muted-foreground mb-4">
        حياتك كلها في مكان واحد — ابدأ بخطوة واحدة صغيرة الآن
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-right">
        {STARTER_TEMPLATES.map(({ type, label, desc, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            className="rounded-xl border border-border hover:border-primary/40 p-3.5 flex items-center gap-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label={label}
          >
            <Icon className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-muted-foreground truncate">{desc}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── القسم: استكشف العوالم (خلف الطية) ─────────────────────────

const WORLDS: { label: string; desc: string; modules: { id: keyof typeof MODULE_LABELS; label: string }[]; hue: string }[] = [
  {
    label: 'أنجز', desc: 'مهامك ومشاريعك وأهدافك وتركيزك',
    modules: [
      { id: 'tasks', label: MODULE_LABELS.tasks },
      { id: 'projects', label: MODULE_LABELS.projects },
      { id: 'deepwork', label: MODULE_LABELS.deepwork },
      { id: 'calendar', label: MODULE_LABELS.calendar },
    ],
    hue: 'from-lime-400/20',
  },
  {
    label: 'تطوّر', desc: 'تعلّمك وقراءتك ودماغك الثاني',
    modules: [
      { id: 'learning', label: MODULE_LABELS.learning },
      { id: 'reading', label: MODULE_LABELS.reading },
      { id: 'brain', label: MODULE_LABELS.brain },
    ],
    hue: 'from-blue-400/20',
  },
  {
    label: 'توازن', desc: 'روتينك وعاداتك ويومياتك وصحتك',
    modules: [
      { id: 'morning', label: MODULE_LABELS.morning },
      { id: 'habits', label: MODULE_LABELS.habits },
      { id: 'journal', label: MODULE_LABELS.journal },
      { id: 'health', label: MODULE_LABELS.health },
    ],
    hue: 'from-emerald-400/20',
  },
  {
    label: 'إدارة حياتي', desc: 'مخططك وماليتك وتحليلاتك ومراجعاتك',
    modules: [
      { id: 'planner', label: MODULE_LABELS.planner },
      { id: 'finance', label: MODULE_LABELS.finance },
      { id: 'analytics', label: MODULE_LABELS.analytics },
      { id: 'weekly-review', label: MODULE_LABELS['weekly-review'] },
    ],
    hue: 'from-violet-400/20',
  },
]

function DiscoverWorlds({ onOpen }: { onOpen: (m: keyof typeof MODULE_LABELS) => void }) {
  return (
    <section className="mb-4" aria-label="استكشف">
      <h3 className="font-bold mb-3 flex items-center gap-2 px-1">
        <Compass className="w-5 h-5 text-cyan-400" aria-hidden="true" />
        استكشف عوالمك الأربعة
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {WORLDS.map((w) => (
          <div key={w.label} className={cn('glass rounded-2xl p-4 bg-gradient-to-bl to-transparent', w.hue)}>
            <p className="font-semibold">{w.label}</p>
            <p className="text-xs text-muted-foreground mb-2.5">{w.desc}</p>
            <div className="flex flex-wrap gap-1.5">
              {w.modules.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpen(m.id)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-primary/15 hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={`افتح ${m.label}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── القسم: الهيكل الثابت أثناء التحميل (≤٤٠٠ مللي ثم skeleton) ──

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="جارٍ تحميل يومك">
      <div className="glass rounded-2xl p-5 mb-4 h-16 animate-pulse" />
      <div className="glass rounded-2xl p-5 mb-4 h-24 animate-pulse" />
      <div className="glass rounded-2xl p-5 mb-4 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 rounded-xl bg-muted/50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="glass rounded-xl p-3 h-16 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ── القسم: المكوّن الرئيسي ────────────────────────────────────

export default function Home() {
  const setActiveModule = useRiseStore((s) => s.setActiveModule)
  const today = useToday()
  const { refreshKey } = useDataRefresh()

  // الموجة ١ — فوق الطية
  const [summary, setSummary] = useState<HomeSummary | null>(null)
  const [tasks, setTasks] = useState<HomeTask[]>([])
  const [habits, setHabits] = useState<HomeHabit[]>([])
  const [logs, setLogs] = useState<HomeHabitLog[]>([])
  const [planner, setPlanner] = useState<HomePlannerItem[]>([])
  const [morning, setMorning] = useState<{ todayLog?: { score?: number } | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // الموجة ٢ — تحت الطية (lazy)
  const [books, setBooks] = useState<any[]>([])
  const [knowledge, setKnowledge] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])

  const [expanded, setExpanded] = useState(false)
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; type: QuickAddType | null }>({ open: false, type: null })
  const [busyId, setBusyId] = useState<string | null>(null)
  const hour = new Date().getHours()
  const isEvening = hour >= 17

  // ── الموجة ١: بيانات فوق الطية فقط ──
  useEffect(() => {
    let cancelled = false
    async function loadAboveFold() {
      try {
        const [sumRes, taskRes, habitRes, planRes, mornRes] = await Promise.all([
          apiGet(`/api/rise/dashboard/summary?date=${today}`),
          apiGet('/api/rise/tasks'),
          apiGet('/api/rise/habits'),
          apiGet(`/api/rise/planner?date=${today}`),
          apiGet(`/api/rise/morning?date=${today}`),
        ])
        if (cancelled) return
        let ok = false
        if (sumRes.ok) { try { const d = await sumRes.json(); setSummary(d); ok = true } catch {} }
        if (taskRes.ok) { try { const d = await taskRes.json(); setTasks(d.tasks || []); ok = true } catch {} }
        if (habitRes.ok) { try { const d = await habitRes.json(); setHabits(d.habits || []); setLogs(d.logs || []); ok = true } catch {} }
        if (planRes.ok) { try { const d = await planRes.json(); setPlanner(d.items || []); ok = true } catch {} }
        if (mornRes.ok) { try { const d = await mornRes.json(); setMorning(d); ok = true } catch {} }
        setError(ok ? null : 'تعذّر تحميل يومك — جرّب تاني')
      } catch {
        if (!cancelled) setError('تعذّر تحميل يومك — جرّب تاني')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadAboveFold()
    return () => { cancelled = true }
  }, [today, refreshKey])

  // ── الموجة ٢: ما تحت الطية بعد خمول المتصفح ──
  const wave2Ref = useRef(false)
  useEffect(() => {
    if (wave2Ref.current) return
    wave2Ref.current = true
    const load = async () => {
      try {
        const [bookRes, knowRes, projRes] = await Promise.all([
          apiGet('/api/rise/books'),
          apiGet('/api/rise/knowledge'),
          apiGet('/api/rise/projects'),
        ])
        if (bookRes.ok) { try { const d = await bookRes.json(); setBooks(Array.isArray(d) ? d : d.books || []) } catch {} }
        if (knowRes.ok) { try { const d = await knowRes.json(); setKnowledge(d.items || []) } catch {} }
        if (projRes.ok) { try { const d = await projRes.json(); setProjects(Array.isArray(d) ? d : d.projects || []) } catch {} }
      } catch { /* ثانوي — يبقى صامتًا */ }
    }
    const ric = (window as any).requestIdleCallback?.bind(window)
    if (ric) ric(load, { timeout: 1500 })
    else setTimeout(load, 700)
  }, [])

  // ── الحسابات ──
  const timeline = useMemo(
    () => buildTimeline(tasks, habits, logs, planner, today),
    [tasks, habits, logs, planner, today],
  )

  const focusOfDay = useMemo(() => {
    const open = timeline.filter((r) => r.kind === 'task' && !r.done)
    if (open.length === 0) return timeline.find((r) => !r.done) || null
    const best = open.reduce((a, b) => (taskRank(a as any) >= taskRank(b as any) ? a : b))
    return best
  }, [timeline])

  const continueItems = useMemo<ContinueItem[]>(() => {
    const items: ContinueItem[] = []
    const readingBook = books.find((b: any) => b.status === 'reading')
    if (readingBook) {
      items.push({
        kind: 'book', title: readingBook.title,
        sub: readingBook.author ? ` بقلم ${readingBook.author}` : 'اكمل القراءة من حيث توقفت',
        moduleId: 'reading',
      })
    }
    const lastNote = [...knowledge].sort((a: any, b: any) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))[0]
    if (lastNote) {
      items.push({
        kind: 'knowledge', title: lastNote.title,
        sub: 'آخر ما دوّنته في دماغك الثاني',
        moduleId: 'brain',
      })
    }
    const activeProject = projects.find((p: any) => p.status === 'active') || projects[0]
    if (activeProject) {
      items.push({
        kind: 'project', title: activeProject.name || activeProject.title,
        sub: `التقدم ${toArabicNum(Math.round(activeProject.progress || 0))}٪`,
        moduleId: 'projects',
      })
    }
    return items
  }, [books, knowledge, projects])

  const isBrandNew = tasks.length === 0 && habits.length === 0 && planner.length === 0
  const remaining = timeline.filter((r) => !r.done).length
  const nextOpportunity = focusOfDay?.label || null
  const learningFocused = continueItems.length > 0 && remaining === 0

  // ── الكتابة من الشاشة (١ نقرة للعادة — تدقيق §10) ──
  const toggleHabit = useCallback(async (habitId: string, done: boolean) => {
    setBusyId(habitId)
    try {
      await apiPut('/api/rise/habits', { habitId, date: today, completed: !done })
      // apiPut يبث rise:data-changed → الموجة ١ تُعاد تلقائيًا
    } catch {
      toast.error('تعذّر تسجيل العادة — جرّب تاني')
    } finally {
      setBusyId(null)
    }
  }, [today])

  const completeTask = useCallback(async (taskId: string) => {
    setBusyId(taskId)
    try {
      await apiPut('/api/rise/tasks', { id: taskId, status: 'done' })
    } catch {
      toast.error('تعذّر إتمام المهمة — جرّب تاني')
    } finally {
      setBusyId(null)
    }
  }, [])

  const openQuickAdd = useCallback((type: QuickAddType | null) => {
    setQuickAdd({ open: true, type })
  }, [])

  const { text: greetingText, Icon: GreetingIcon } = greetingFor(hour)
  const firstName = (summary?.user?.name || '').split(' ')[0]

  if (loading && !summary) return <HomeSkeleton />

  return (
    <div className="max-w-3xl mx-auto space-y-0">
      {/* ١) التحية */}
      <header className="mb-4 px-1">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2.5">
          <GreetingIcon className="w-7 h-7 text-amber-400" aria-hidden="true" />
          {greetingText}{firstName ? ` يا ${firstName}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isEvening
            ? 'خلاصة يومك أمامك — والفرصة التالية بانتظارك'
            : 'يومك كله في نظرة واحدة'}
        </p>
      </header>

      {/* ٢) حالة المستخدم الجديد */}
      {isBrandNew ? (
        <NewUserWelcome onAdd={openQuickAdd} />
      ) : (
        <FocusOfDayCard
          row={focusOfDay}
          onStart={() => setActiveModule('tasks')}
        />
      )}

      {/* ٣) لقطة اليوم (يومي) */}
      <MyDayCard
        rows={timeline}
        expanded={expanded}
        onToggleExpand={() => setExpanded((e) => !e)}
        onToggleHabit={toggleHabit}
        onCompleteTask={completeTask}
        busyId={busyId}
        error={error}
      />

      {/* ٤) مساء: إغلاق اليوم */}
      {isEvening && !isBrandNew && (
        <EveningCloseCard
          remaining={remaining}
          nextLabel={nextOpportunity}
          onJournal={() => openQuickAdd('journal')}
          onReview={() => setActiveModule('weekly-review')}
        />
      )}

      {/* ٥) أكمل من حيث توقفت — يرتفع لمستخدم التعلم (حالة ٥) */}
      {(learningFocused || !isEvening) && continueItems.length > 0 && (
        <ContinueCard items={continueItems} onOpen={setActiveModule} />
      )}

      {/* ٦) إجراءات سريعة */}
      <QuickActionsRow onAdd={openQuickAdd} />

      {/* ٧) تقدمي */}
      <ProgressCard summary={summary} />

      {/* ٨) استكشف — خلف الطية */}
      <DiscoverWorlds onOpen={setActiveModule} />

      {/* Quick Add — sheet جوال / popover سطح مكتب (key = إعادة تركيب بنوع مسبق) */}
      <QuickAdd
        key={quickAdd.type ?? 'default'}
        open={quickAdd.open}
        initialType={quickAdd.type}
        onClose={() => setQuickAdd({ open: false, type: null })}
      />
    </div>
  )
}
