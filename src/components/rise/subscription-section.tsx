'use client'

// ============================================================
// SubscriptionSection — «الخطة والاشتراك» (المرحلة 04)
//
// • بطاقة الخطة الحالية (الاسم/السعر/الانتهاء) + الفعّالة عند
//   انتهاء الصلاحية (effectivePlan من السيرفر).
// • عدادات الاستخدام: يومي/شهري لكل ميزة + موعد التجدد —
//   الحدود تأتي من السيرفر (المصدر = plan_entitlements).
// • زر «ترقية الخطة» → Dialog: مقارنة الخطط + خطوات الدفع
//   اليدوي (env) + نموذج المرجع → POST subscription/requests.
// • سجل الطلبات (pending/approved/rejected + سبب الرفض).
// • upgrade prompt عند بلوغ الحد: أي معالج في التطبيق ينادي
//   window.dispatchEvent(new CustomEvent('awj:open-upgrade'))
//   فيفتح الديالوج من هنا (مثال: زر التصدير عند 402).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Crown,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  Wallet,
  Send,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SectionCard } from './settings-section-card'
import { PLANS_UI, FEATURE_LABELS, PAYMENT_METHOD_LABELS, type PlanCode } from '@/lib/billing/plans'

// ── أنواع استجابة السيرفر ──

interface UsageFeature {
  featureKey: string
  enabled: boolean
  limitDaily: number | null
  limitMonthly: number | null
  usedDaily: number
  usedMonthly: number
}

interface SubscriptionResponse {
  subscription: { plan: string; status: string; expiresAt: string | null }
  effectivePlan?: PlanCode
  usage: {
    plan: PlanCode
    resetDailyAt?: string | null
    resetMonthlyAt?: string | null
    features: UsageFeature[]
  } | null
  payment?: { steps: string[]; configured: boolean }
}

interface RequestRow {
  id: string
  requestedPlan: string
  status: 'pending' | 'approved' | 'rejected'
  paymentMethod: string
  reference: string
  note: string | null
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string | null
}

const PLAN_BADGE: Record<string, string> = {
  free: 'pill-muted',
  plus: 'pill-info',
  max: 'pill-lime',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function SubscriptionSection() {
  const [loading, setLoading] = useState(true)
  const [sub, setSub] = useState<SubscriptionResponse | null>(null)
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  // نموذج طلب الترقية
  const [chosenPlan, setChosenPlan] = useState<PlanCode>('plus')
  const [paymentMethod, setPaymentMethod] = useState('instapay')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const load = useCallback(async () => {
    try {
      const [subRes, reqRes] = await Promise.all([
        apiFetch('/api/rise/user/subscription'),
        apiFetch('/api/rise/user/subscription/requests'),
      ])
      if (subRes.ok) {
        const body = await subRes.json()
        setSub(body)
      }
      if (reqRes.ok) {
        const body = await reqRes.json()
        setRequests(body.requests ?? [])
      }
    } catch {
      /* offline — تُعرض الحالة الفارغة */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // upgrade prompt من أي معالج آخر (مثال: زر التصدير عند 402)
  useEffect(() => {
    const open = () => setUpgradeOpen(true)
    window.addEventListener('awj:open-upgrade', open)
    return () => window.removeEventListener('awj:open-upgrade', open)
  }, [])

  const effectivePlan: PlanCode = sub?.effectivePlan ?? (sub?.usage?.plan ?? 'free')
  const pendingRequest = requests.find((r) => r.status === 'pending')
  const planInfo = PLANS_UI[effectivePlan] ?? PLANS_UI.free
  const isPaid = effectivePlan !== 'free'
  const expired =
    sub?.subscription.status === 'active' &&
    !!sub?.subscription.expiresAt &&
    new Date(sub.subscription.expiresAt) < new Date()

  const submitRequest = async () => {
    setSubmitError('')
    if (!reference.trim() || reference.trim().length < 4) {
      setSubmitError('اكتب رقم عملية الدفع (4 أحرف على الأقل)')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiPost('/api/rise/user/subscription/requests', {
        requestedPlan: chosenPlan,
        paymentMethod,
        reference: reference.trim(),
        note: note.trim() || undefined,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(body.error || 'تعذر إرسال الطلب — حاول لاحقًا')
        return
      }
      toast.success(body.message || 'تم إرسال طلبك بنجاح')
      setUpgradeOpen(false)
      setReference('')
      setNote('')
      load()
    } catch {
      setSubmitError('تعذر الاتصال بالخادم')
    } finally {
      setSubmitting(false)
    }
  }

  const usageFeatures = (sub?.usage?.features ?? []).filter(
    (f) => f.limitDaily !== null || f.limitMonthly !== null || !f.enabled,
  )
  const paymentSteps = sub?.payment?.steps ?? ['راسلنا لمعرفة تفاصيل التحويل.']
  const nextStepNo = paymentSteps.length + 1

  return (
    <>
      <SectionCard
        icon={Crown}
        well="iw-lime"
        title="الخطة والاشتراك"
        desc="خطتك وحدود الاستخدام والترقية"
      >
        <div className="space-y-4">
          {/* بطاقة الخطة الحالية */}
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border/70 bg-card/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn('pill-base text-[11px] font-bold px-2.5 py-1', PLAN_BADGE[effectivePlan] || 'pill-muted')}>
                      {planInfo.nameAr}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {isPaid ? `${planInfo.priceEgp} ج.م / شهريًا` : 'خطة البداية المجانية'}
                      </p>
                      {isPaid && sub?.subscription.expiresAt && (
                        <p className={cn('text-[11px] mt-0.5', expired ? 'text-warning' : 'text-muted-foreground')}>
                          {expired ? 'انتهت الصلاحية — تعمل حاليًا بالخطة المجانية' : `تجدد/ينتهي: ${fmtDate(sub.subscription.expiresAt)}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {!isPaid && (
                    <Button
                      size="sm"
                      onClick={() => setUpgradeOpen(true)}
                      className="gap-1.5 shrink-0"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      ترقية
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2.5">{planInfo.tagline}</p>
              </div>

              {/* طلب معلّق؟ */}
              {pendingRequest && (
                <div className="rounded-xl bg-info/10 border border-info/25 px-4 py-3 text-xs text-info flex items-start gap-2" role="status">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    طلب ترقيتك إلى {PLANS_UI[pendingRequest.requestedPlan as PlanCode]?.nameAr ?? pendingRequest.requestedPlan} قيد المراجعة —
                    عادةً خلال ساعات.
                  </span>
                </div>
              )}

              {/* عدادات الاستخدام */}
              {usageFeatures.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    استخدامك اليوم
                  </p>
                  {usageFeatures.map((f) => {
                    const label = FEATURE_LABELS[f.featureKey] ?? f.featureKey
                    if (!f.enabled) {
                      return (
                        <div key={f.featureKey} className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <span className="text-[10px] pill-muted px-2 py-0.5 font-semibold">خطة أعلى</span>
                        </div>
                      )
                    }
                    const dayPct =
                      f.limitDaily && f.limitDaily > 0
                        ? Math.min(100, Math.round((f.usedDaily / f.limitDaily) * 100))
                        : 0
                    const nearLimit = f.limitDaily != null && f.usedDaily >= f.limitDaily! * 0.8
                    const atLimit = f.limitDaily != null && f.usedDaily >= f.limitDaily!
                    return (
                      <div key={f.featureKey} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className={cn('font-semibold tabular-nums', atLimit && 'text-destructive', nearLimit && !atLimit && 'text-warning')}>
                            {f.usedDaily}
                            {f.limitDaily != null ? ` / ${f.limitDaily}` : ''} اليوم
                            {f.limitMonthly != null && (
                              <span className="text-muted-foreground font-normal">
                                {' '}· {f.usedMonthly} / {f.limitMonthly} الشهر
                              </span>
                            )}
                          </span>
                        </div>
                        {f.limitDaily != null && (
                          <Progress
                            value={dayPct}
                            className={cn('h-1.5', atLimit && '[&>div]:bg-destructive', nearLimit && !atLimit && '[&>div]:bg-warning')}
                          />
                        )}
                      </div>
                    )
                  })}
                  {sub?.usage?.resetDailyAt && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      يتجدد الحد اليومي {fmtTime(sub.usage.resetDailyAt)} (منتصف الليل بتوقيت مصر)
                    </p>
                  )}
                </div>
              )}

              {/* سجل الطلبات */}
              {requests.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">سجل طلبات الترقية</p>
                  {requests.slice(0, 3).map((r) => (
                    <div key={r.id} className="rounded-lg border border-border/60 px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground">
                        {PLANS_UI[r.requestedPlan as PlanCode]?.nameAr ?? r.requestedPlan} · {fmtDate(r.createdAt)}
                      </span>
                      {r.status === 'pending' && <span className="pill-warning px-2 py-0.5 font-semibold">قيد المراجعة</span>}
                      {r.status === 'approved' && <span className="pill-success px-2 py-0.5 font-semibold">معتمد</span>}
                      {r.status === 'rejected' && (
                        <span
                          className="pill-error px-2 py-0.5 font-semibold cursor-help"
                          title={r.rejectionReason ?? undefined}
                        >
                          مرفوض
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SectionCard>

      {/* ── ديالوج الترقية ── */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-lime" />
              ترقية خطتك
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* مقارنة الخطط */}
            <div className="grid grid-cols-2 gap-2.5">
              {(['plus', 'max'] as PlanCode[]).map((code) => {
                const p = PLANS_UI[code]
                const active = chosenPlan === code
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setChosenPlan(code)}
                    className={cn(
                      'rounded-xl border p-3 text-right transition-all',
                      active
                        ? 'border-lime/60 bg-lime/10 ring-1 ring-lime/40'
                        : 'border-border/70 hover:border-border bg-card/50',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">{p.nameAr}</span>
                      {active && <CheckCircle2 className="w-4 h-4 text-lime" />}
                    </div>
                    <p className="text-lg font-extrabold mt-1">
                      {p.priceEgp} <span className="text-[10px] font-normal text-muted-foreground">ج.م/شهر</span>
                    </p>
                    <ul className="mt-2 space-y-1">
                      {p.perks.slice(0, 3).map((perk) => (
                        <li key={perk} className="text-[10px] text-muted-foreground flex items-start gap-1">
                          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-forest dark:text-lime" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>

            {/* خطوات الدفع */}
            <div className="rounded-xl bg-secondary/60 border border-border/60 p-3.5 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                خطوات التفعيل (دفع يدوي)
              </p>
              <ol className="space-y-1.5">
                {paymentSteps.map((step, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
                <li className="text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">
                    {nextStepNo}
                  </span>
                  المبلغ: <b>{PLANS_UI[chosenPlan].priceEgp} ج.م</b> شهريًا
                </li>
              </ol>
            </div>

            {/* النموذج */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">وسيلة الدفع</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="text-sm" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">رقم عملية التحويل</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="مثال: 30458122600781"
                  className="text-sm"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">ملاحظة (اختياري)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="أي تفاصيل تساعد الإدارة"
                  className="text-sm"
                />
              </div>

              {submitError && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/25 px-3.5 py-2.5 text-xs text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {submitError}
                </div>
              )}

              {pendingRequest && (
                <div className="rounded-xl bg-warning/10 border border-warning/25 px-3.5 py-2.5 text-[11px] text-warning flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  لديك طلب معلّق لنفس الخطة — سيُرفض هذا الطلب إن تكرر.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start flex-row-reverse">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">إلغاء</Button>
            </DialogClose>
            <Button onClick={submitRequest} disabled={submitting} size="sm" className="gap-1.5">
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              إرسال طلب الترقية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
