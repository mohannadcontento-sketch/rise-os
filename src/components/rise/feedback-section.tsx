'use client'

// ============================================================
// FeedbackSection — «ملاحظاتك على أوج» (المرحلة 15 — Beta)
//
// بند خطة البيتا: «جمع Feedback داخل التطبيق». قناة مباشرة من
// المستخدم للفريق داخل الإعدادات — بدون مغادرة التطبيق ولا
// بريد ولا أدوات خارجية:
//   • أربعة أنواع: مشكلة (bug) / اقتراح (suggestion) / سؤال
//     (question) / أخرى (other) — chips سريعة بلمسة واحدة.
//   • النص (5..2000 حرفًا) + الصفحة الحالية تُرفق تلقائيًا كسياق.
//   • «ملاحظاتك السابقة» بحالتها الحية: جديدة / قُرئت / عولجت —
//     المستخدم يشوف إن كلامه وصل واتعمل عليه.
//   • التدهور الرشيق: قبل تطبيق هجرة 037 أو أثناء الانقطاع —
//     رسالة ودّية بدل الانهيار، والإرسال idempotent (آمن شبكيًا).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  MessageSquareHeart,
  Loader2,
  Send,
  Bug,
  Lightbulb,
  HelpCircle,
  ChatBubble,
  CheckCircle2,
  Eye,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { SectionCard } from './settings-section-card'

type FBType = 'bug' | 'suggestion' | 'question' | 'other'
type FBStatus = 'new' | 'read' | 'handled'

interface FeedbackItem {
  id: string
  type: FBType
  message: string
  page: string | null
  status: FBStatus
  createdAt: string
  handledAt: string | null
}

const TYPES: { key: FBType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'bug', label: 'مشكلة', icon: Bug },
  { key: 'suggestion', label: 'اقتراح', icon: Lightbulb },
  { key: 'question', label: 'سؤال', icon: HelpCircle },
  { key: 'other', label: 'أخرى', icon: ChatBubble },
]

const STATUS_META: Record<FBStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  new: { label: 'جديدة', cls: 'pill-info', icon: Clock },
  read: { label: 'قُرئت', cls: 'pill-warning', icon: Eye },
  handled: { label: 'عولجت', cls: 'pill-success', icon: CheckCircle2 },
}

const MAX_LEN = 2000

export function FeedbackSection() {
  const [type, setType] = useState<FBType>('suggestion')
  const [message, setMessage] = useState('')
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [notReady, setNotReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rise/feedback')
      if (res.ok) {
        const body = await res.json()
        setItems(body.feedback ?? [])
        setNotReady(!!body.notReady)
      }
    } catch {
      // صامت — البطاقة تعرض حالة فارغة
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = useCallback(async () => {
    const trimmed = message.trim()
    if (trimmed.length < 5) {
      toast.error('اكتب ملاحظتك أولًا (5 أحرف على الأقل)')
      return
    }
    setSending(true)
    try {
      // الصفحة الحالية كسياق تلقائي — يساعد الفريق يعرف المكان بالظبط
      const page = typeof window !== 'undefined'
        ? window.location.pathname + (window.location.hash || '')
        : undefined
      const res = await apiPost('/api/rise/feedback', { type, message: trimmed, page })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body?.ok) {
        toast.success('وصلت ملاحظتك — شكرًا ليك 💚', {
          description: 'بتشوفها في «ملاحظاتك السابقة» تحت، وهنتابع حالتها أول بأول.',
        })
        setMessage('')
        if (body.feedback) setItems((prev) => [body.feedback, ...prev])
      } else if (res.status === 503 || body?.code === 'FEEDBACK_NOT_READY') {
        toast.error('قناة الملاحظات بتتحضر — جرّب بعد شوية')
      } else {
        toast.error(body?.error || 'تعذر إرسال الملاحظة')
      }
    } catch {
      toast.error('تعذر الاتصال — راجع الإنترنت وجرّب تاني')
    } finally {
      setSending(false)
    }
  }, [message, type])

  const trimmedLen = message.trim().length
  const canSend = trimmedLen >= 5 && trimmedLen <= MAX_LEN && !sending

  return (
    <SectionCard
      icon={MessageSquareHeart}
      well="iw-rose"
      title="ملاحظاتك على أوج"
      desc="مشكلة واجهتك ولا اقتراح؟ — يوصل للفريق مباشرة من هنا"
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          إحنا في مرحلة البيتا — رأيك هو اللي بيشكّل المنتج. كل ملاحظة بتُقرأ
          وتُتابع حالتها: <span className="pill-info px-2 py-0.5 text-[10px] font-semibold">جديدة</span>{' '}
          → <span className="pill-warning px-2 py-0.5 text-[10px] font-semibold">قُرئت</span>{' '}
          → <span className="pill-success px-2 py-0.5 text-[10px] font-semibold">عولجت</span>
        </p>

        {/* اختيار النوع */}
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              disabled={sending}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
                type === key
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-muted/30 text-muted-foreground hover:border-border',
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', type === key && 'text-primary')} />
              {label}
            </button>
          ))}
        </div>

        {/* النص */}
        <div className="space-y-2">
          <Textarea
            dir="auto"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
            disabled={sending || notReady}
            placeholder={
              type === 'bug'
                ? 'إيه اللي حصل؟ اكتب الخطوات بالترتيب (مثال: فتحت كذا، ضغطت كذا، ظهر كذا)...'
                : type === 'suggestion'
                  ? 'اقتراحك بإيه؟ وليه هيساعدك؟'
                  : type === 'question'
                    ? 'اسأل براحتك — بخصوص أي موديول أو ميزة...'
                    : 'اكتب ملاحظتك...'
            }
            className="min-h-[96px] text-sm leading-relaxed resize-y"
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{trimmedLen > 0 && trimmedLen < 5 ? 'محتاجين 5 أحرف على الأقل' : ''}</span>
            <span dir="ltr" className={cn(trimmedLen > MAX_LEN - 200 && 'text-warning')}>
              {trimmedLen}/{MAX_LEN}
            </span>
          </div>
        </div>

        {/* إرسال */}
        <Button onClick={submit} disabled={!canSend} className="w-full gap-2">
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري الإرسال...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              أرسل ملاحظتك
            </>
          )}
        </Button>

        {/* غير مفعّل بعد (هجرة 037) */}
        {notReady && (
          <div className="rounded-xl border border-dashed border-white/15 dark:border-white/10 p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground leading-relaxed">
              قناة الملاحظات بتُجهَّز حاليًا — هتشتغل تلقائيًا بعد لحظات.
            </p>
          </div>
        )}

        {/* ملاحظاتك السابقة */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[10px] font-semibold text-muted-foreground">ملاحظاتك السابقة</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              {notReady ? 'لسه مفيش ملاحظات' : 'أول ملاحظة ليك هتظهر هنا — شاركنا رأيك 🌱'}
            </p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {items.map((f) => {
                const meta = STATUS_META[f.status] ?? STATUS_META.new
                const typeMeta = TYPES.find((t) => t.key === f.type)
                return (
                  <div key={f.id} className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="pill-muted px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                        {typeMeta && <typeMeta.icon className="w-3 h-3" />}
                        {typeMeta?.label ?? 'ملاحظة'}
                      </span>
                      <span className={cn('px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1', meta.cls)}>
                        <meta.icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground mr-auto" dir="auto">
                        {new Date(f.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/90 line-clamp-3" dir="auto">
                      {f.message}
                    </p>
                    {f.page && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 truncate" dir="ltr">
                        📍 {f.page}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
