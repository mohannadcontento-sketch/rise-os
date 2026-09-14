'use client'

// ============================================================
// quick-add.tsx — المرحلة 17: الإضافة السريعة (٦ أنواع — §5)
//
// مهمة · عادة · يومية · جلسة تركيز · هدف · ملاحظة/مرجع تعلم.
// الجوال: bottom sheet ينزلق من أسفل (CSS فقط — بلا مكتبة Vaul
// وفق سياسة المكتبات «الافتراضي لا»). سطح المكتب: بطاقة مركّزة.
//
// منع الطلبات المكررة (عقد الاختبار):
//   ١) حارس in-flight يعطّل الزر حتى تكتمل الطفرة.
//   ٢) apiPost يولّد Idempotency-Key لكل طفرة (٤٢٨ بدونه) —
//      إعادة الإرسال الشبكية لن تنشئ كيانًا ثانيًا.
//   ٣) النجاح: toast ≤ ٢.٥ ثانية + إغلاق تلقائي + rise:data-changed
//      (يبثه apiPost) يُعيد جلب Home وكل الوحدات.
//
// جلسة التركيز استثناء مقصود: نيّة ملاحاة إلى وحدة العمل العميق
// (الجلسة تُنشأ هناك عند اكتمالها فعليًا — لا كيان وهمي هنا).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus, Flame, PenLine, Timer, Target, Lightbulb, X, Check,
} from 'lucide-react'
import { useRiseStore } from '@/store/app-store'
import { useToday } from '@/hooks/use-today'
import { apiPost } from '@/lib/api-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export type QuickAddType = 'task' | 'habit' | 'journal' | 'focus' | 'goal' | 'note'

const TYPES: { id: QuickAddType; label: string; icon: typeof Plus; hint: string }[] = [
  { id: 'task', label: 'مهمة', icon: Plus, hint: 'شيء واحد تريد إنجازه' },
  { id: 'habit', label: 'عادة', icon: Flame, hint: 'تتكرر يوميًا' },
  { id: 'journal', label: 'يومية', icon: PenLine, hint: 'سطر عن يومك' },
  { id: 'focus', label: 'جلسة تركيز', icon: Timer, hint: 'عمل عميق بلا مقاطعات' },
  { id: 'goal', label: 'هدف', icon: Target, hint: 'وجهة أكبر من مهمة' },
  { id: 'note', label: 'ملاحظة', icon: Lightbulb, hint: 'فكرة أو مرجع تعلم' },
]

const MOODS = ['😔', '😐', '🙂', '😊', '🤩']
const FOCUS_DURATIONS = [25, 45, 60, 90]
const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'low', label: 'هادئة' },
  { value: 'medium', label: 'عادية' },
  { value: 'high', label: 'مهمة' },
  { value: 'urgent', label: 'عاجلة' },
]

export function QuickAdd({
  open, onClose, initialType,
}: {
  open: boolean
  onClose: () => void
  initialType: QuickAddType | null
}) {
  const setActiveModule = useRiseStore((s) => s.setActiveModule)
  const today = useToday()
  // النوع الابتدائي يأتي من key إعادة التركيب في الأب — بلا setState داخل effect
  const [type, setType] = useState<QuickAddType>(initialType || 'task')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState('medium')
  const [mood, setMood] = useState<number | null>(null)
  const [duration, setDuration] = useState(25)
  const [submitting, setSubmitting] = useState(false)
  const inFlightRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // التركيز على أول حقل عند الفتح + Escape للإغلاق
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      inputRef.current?.focus()
    }, 120)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  const reset = useCallback(() => {
    setTitle(''); setContent(''); setPriority('medium')
    setMood(null); setDuration(25)
  }, [])

  const pickType = (t: QuickAddType) => {
    setType(t)
    reset()
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  const submit = useCallback(async () => {
    // حارس الازدواج: طفرة واحدة معلّقة كحد أقصى (عقد الاختبار)
    if (inFlightRef.current || submitting) return
    inFlightRef.current = true
    setSubmitting(true)
    try {
      if (type === 'focus') {
        // نيّة ملاحاة — الجلسة تُسجَّل في وحدة العمل العميق عند اكتمالها
        onClose()
        reset()
        setActiveModule('deepwork')
        return
      }

      const trimmed = (type === 'journal' ? content : title).trim()
      if (!trimmed) {
        toast.error(type === 'journal' ? 'اكتب سطرًا أولًا' : 'اكتب عنوانًا أولًا')
        return
      }

      let res: Response
      switch (type) {
        case 'task':
          res = await apiPost('/api/rise/tasks', {
            title: trimmed.slice(0, 200),
            priority,
            dueDate: today,
          })
          break
        case 'habit':
          res = await apiPost('/api/rise/habits', {
            name: trimmed.slice(0, 200),
            frequency: 'daily',
          })
          break
        case 'journal':
          res = await apiPost('/api/rise/journal', {
            content: trimmed.slice(0, 20000),
            ...(mood ? { mood } : {}),
            date: today,
          })
          break
        case 'goal':
          res = await apiPost('/api/rise/goals', { title: trimmed.slice(0, 200) })
          break
        case 'note':
          res = await apiPost('/api/rise/knowledge', { title: trimmed.slice(0, 200) })
          break
        default:
          return
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body?.error || 'تعذّر الحفظ — جرّب تاني')
        return
      }

      // نجاح هادئ (§6): toast قصير + إغلاق — البيانات تتحدث عبر rise:data-changed
      const doneLabel = {
        task: 'أُضيفت المهمة ليومك',
        habit: 'بدأت العادة اليوم',
        journal: 'حُفظت يوميتك',
        goal: 'انطلق هدفك',
        note: 'دُوِّنت في دماغك الثاني',
      }[type]
      toast.success(doneLabel)
      onClose()
      reset()
    } catch {
      toast.error('تعذّر الحفظ — جرّب تاني')
    } finally {
      inFlightRef.current = false
      setSubmitting(false)
    }
  }, [type, title, content, priority, mood, today, onClose, reset, setActiveModule, submitting])

  if (!open) return null

  const active = TYPES.find((t) => t.id === type)!
  const canSubmit = type === 'focus' || (type === 'journal' ? content.trim().length > 0 : title.trim().length > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="إضافة سريعة"
    >
      {/* الخلفية */}
      <button
        type="button"
        aria-label="إغلاق الإضافة السريعة"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out] cursor-default"
        tabIndex={-1}
      />

      {/* البطاقة: sheet سفلي على الجوال · مركّزة على سطح المكتب */}
      <div
        className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl border border-border/60
                   max-h-[88dvh] overflow-y-auto
                   animate-[sheetUp_0.22s_ease-out] sm:animate-[scaleIn_0.18s_ease-out]"
      >
        {/* مقبض السحب (جوال) */}
        <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">أضف سريعًا</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-muted/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* اختيار النوع — ٦ بالضبط (§5) */}
          <div
            className="grid grid-cols-3 gap-1.5 mb-4"
            role="tablist"
            aria-label="نوع الإضافة"
          >
            {TYPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={type === id}
                onClick={() => pickType(id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium transition-colors border',
                  type === id
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-transparent hover:bg-muted/50 text-muted-foreground',
                )}
              >
                <Icon className="w-4.5 h-4.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mb-3">{active.hint}</p>

          {/* الحقول حسب النوع */}
          {type === 'journal' ? (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="سطر واحد عن يومك يكفي…"
              rows={4}
              maxLength={20000}
              className="resize-none mb-3"
              aria-label="نص اليومية"
            />
          ) : type !== 'focus' ? (
            <Input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === 'task' ? 'ماذا تريد أن تنجز؟'
                  : type === 'habit' ? 'اسم العادة…'
                    : type === 'goal' ? 'ما الوجهة؟'
                      : 'الفكرة أو المرجع…'
              }
              maxLength={200}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit() }}
              className="mb-3"
              aria-label="العنوان"
            />
          ) : null}

          {type === 'task' && (
            <div className="flex gap-1.5 mb-3 flex-wrap" role="radiogroup" aria-label="أهمية المهمة">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={priority === p.value}
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                    priority === p.value
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {type === 'journal' && (
            <div className="flex gap-2 mb-3 items-center" role="radiogroup" aria-label="مزاج اليوم">
              <span className="text-xs text-muted-foreground">مزاجك:</span>
              {MOODS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mood === i + 1}
                  aria-label={`مزاج ${i + 1}`}
                  onClick={() => setMood(mood === i + 1 ? null : i + 1)}
                  className={cn(
                    'text-xl rounded-lg p-1 transition-all',
                    mood === i + 1 ? 'bg-primary/15 scale-110' : 'hover:bg-muted/50 opacity-70',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {type === 'focus' && (
            <div className="grid grid-cols-4 gap-1.5 mb-3" role="radiogroup" aria-label="مدة جلسة التركيز">
              {FOCUS_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={duration === d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    'rounded-xl border py-2.5 text-sm font-semibold transition-colors',
                    duration === d
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {d === 25 ? 'بومودورو' : `${d} د`}
                </button>
              ))}
            </div>
          )}

          <Button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="w-full h-11"
            aria-busy={submitting}
          >
            {submitting ? (
              'جارٍ الحفظ…'
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {type === 'focus' ? 'اذهب للتركيز' : 'احفظ الآن'}
              </>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center mt-2.5">
            {type === 'task' ? 'ستُضاف إلى مهام اليوم مباشرة'
              : type === 'focus' ? 'ستنتقل لوحدة العمل العميق لبدء الجلسة'
                : 'يظهر في وحدته فور الحفظ'}
          </p>
        </div>
      </div>

    </div>
  )
}
