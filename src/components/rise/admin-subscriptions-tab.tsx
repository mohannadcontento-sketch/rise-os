'use client'

// ============================================================
// AdminSubscriptionsTab — «الاشتراكات» (المرحلة 04 — لوحة الأدمن)
//
// • طلبات الترقية المعلّقة: مراجعة المرجع ووسيلة الدفع ثم
//   اعتماد (تفعيل لمدة N شهرًا) أو رفض بسبب يظهر للمستخدم.
// • المشتركون الحاليون (غير المجانيين) مع المرجع والمُفعّل.
// • تعيين خطة يدوي مباشر (دعم/تجربة/تجهيز).
// كل إجراء يمر عبر /api/rise/admin/subscriptions (requireAdmin +
// logAudit على السيرفر — يُسجَّل من فعّل ومتى والمرجع).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  Crown,
  Check,
  X,
  Loader2,
  RefreshCw,
  Clock,
  Wallet,
  BadgeCheck,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useRiseStore } from '@/store/app-store'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface RequestRow {
  id: string
  userId: string
  userName: string | null
  userEmail: string | null
  requestedPlan: string
  status: 'pending' | 'approved' | 'rejected'
  paymentMethod: string
  reference: string
  note: string | null
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string | null
}

interface SubscriptionRow {
  userId: string
  userName: string | null
  userEmail: string | null
  plan: string
  status: string
  startedAt: string | null
  expiresAt: string | null
  paymentMethod: string | null
  reference: string | null
}

const PLAN_NAME: Record<string, string> = { free: 'المجانية', plus: 'بلس', max: 'ماكس' }
const METHOD_NAME: Record<string, string> = {
  instapay: 'InstaPay',
  vodafone_cash: 'فودافون كاش',
  etisalat_cash: 'اتصالات كاش',
  other: 'أخرى',
  manual_admin: 'تعيين أدمن',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function AdminSubscriptionsTab() {
  const { auth } = useRiseStore()
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<RequestRow[]>([])
  const [reviewed, setReviewed] = useState<RequestRow[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [showReviewed, setShowReviewed] = useState(false)

  // اعتماد
  const [approveReq, setApproveReq] = useState<RequestRow | null>(null)
  const [approveMonths, setApproveMonths] = useState('1')
  const [approveReference, setApproveReference] = useState('')
  const [acting, setActing] = useState(false)

  // رفض
  const [rejectReq, setRejectReq] = useState<RequestRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // تعيين يدوي
  const [manualUserId, setManualUserId] = useState('')
  const [manualPlan, setManualPlan] = useState('plus')
  const [manualMonths, setManualMonths] = useState('1')
  const [manualReference, setManualReference] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  const load = useCallback(async () => {
    if (!auth?.isAuthenticated) return
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/subscriptions')
      if (res.ok) {
        const data = await res.json()
        setPending(data.pending ?? [])
        setReviewed(data.reviewed ?? [])
        setSubscriptions(data.subscriptions ?? [])
      } else {
        toast.error('فشل تحميل بيانات الاشتراكات')
      }
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [auth?.isAuthenticated])

  useEffect(() => {
    load()
  }, [load])

  const act = async (payload: Record<string, unknown>, successMsg: string) => {
    const res = await apiPost('/api/rise/admin/subscriptions', payload)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error || 'فشل تنفيذ الإجراء')
      return false
    }
    toast.success(body.message || successMsg)
    load()
    return true
  }

  const doApprove = async () => {
    if (!approveReq) return
    setActing(true)
    await act(
      {
        action: 'approve',
        requestId: approveReq.id,
        months: Number(approveMonths) || 1,
        reference: approveReference.trim() || undefined,
      },
      'تم تفعيل الاشتراك',
    )
    setActing(false)
    setApproveReq(null)
    setApproveReference('')
  }

  const doReject = async () => {
    if (!rejectReq) return
    if (rejectReason.trim().length < 3) {
      toast.error('اكتب سبب الرفض (3 أحرف على الأقل)')
      return
    }
    setActing(true)
    const ok = await act({ action: 'reject', requestId: rejectReq.id, reason: rejectReason.trim() }, 'تم رفض الطلب')
    setActing(false)
    if (ok) {
      setRejectReq(null)
      setRejectReason('')
    }
  }

  const doManualSet = async () => {
    if (!manualUserId.trim()) {
      toast.error('الصق معرّف المستخدم (UUID)')
      return
    }
    setManualBusy(true)
    await act(
      {
        action: 'set-plan',
        userId: manualUserId.trim(),
        plan: manualPlan,
        months: Number(manualMonths) || 1,
        reference: manualReference.trim() || undefined,
      },
      'تم تعيين الخطة',
    )
    setManualBusy(false)
  }

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pt-4">
      {/* ── طلبات معلّقة ── */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Crown className="w-4 h-4 text-lime" />
          طلبات ترقية معلّقة
          {pending.length > 0 && (
            <span className="pill-warning text-[10px] font-bold px-2 py-0.5">{pending.length}</span>
          )}
        </h3>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </Button>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
          لا طلبات معلّقة حاليًا — كل شيء مراجَع ✨
        </div>
      ) : (
        <div className="space-y-2.5">
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl border border-warning/30 bg-warning/5 p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {r.userName || 'مستخدم'}
                    <span className="text-[11px] font-normal text-muted-foreground"> · {r.userEmail}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    يطلب <b>{PLAN_NAME[r.requestedPlan] ?? r.requestedPlan}</b> عبر{' '}
                    {METHOD_NAME[r.paymentMethod] ?? r.paymentMethod} · {fmtDate(r.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" onClick={() => setApproveReq(r)} className="gap-1 h-7 text-xs">
                    <Check className="w-3 h-3" />
                    اعتماد
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectReq(r)} className="gap-1 h-7 text-xs">
                    <X className="w-3 h-3" />
                    رفض
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded-lg bg-secondary/60 px-2.5 py-1.5 flex items-center gap-1.5">
                  <Wallet className="w-3 h-3 shrink-0" />
                  <span className="text-muted-foreground">المرجع:</span>
                  <code className="font-mono" dir="ltr">{r.reference}</code>
                </div>
                {r.note && (
                  <div className="rounded-lg bg-secondary/60 px-2.5 py-1.5">
                    <span className="text-muted-foreground">ملاحظة:</span> {r.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── المشتركون الحاليون ── */}
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2 mb-2.5">
          <BadgeCheck className="w-4 h-4 text-forest dark:text-lime" />
          المشتركون الحاليون
          <span className="text-[10px] text-muted-foreground font-normal">
            ({subscriptions.length} غير مجاني)
          </span>
        </h3>
        {subscriptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
            لا مشتركي بلس/ماكس بعد
          </div>
        ) : (
          <div className="rounded-xl border border-border/70 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-semibold">المستخدم</th>
                    <th className="px-3 py-2 font-semibold">الخطة</th>
                    <th className="px-3 py-2 font-semibold">ينتهي</th>
                    <th className="px-3 py-2 font-semibold">المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => {
                    const expired = s.expiresAt && new Date(s.expiresAt) < new Date()
                    return (
                      <tr key={s.userId} className="border-t border-border/50">
                        <td className="px-3 py-2">
                          <span className="font-medium">{s.userName || '—'}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{s.userEmail}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn('pill-base px-2 py-0.5 text-[10px] font-bold', s.plan === 'max' ? 'pill-lime' : 'pill-info')}>
                            {PLAN_NAME[s.plan] ?? s.plan}
                          </span>
                        </td>
                        <td className={cn('px-3 py-2 tabular-nums', expired ? 'text-warning' : '')}>
                          {fmtDate(s.expiresAt)}
                        </td>
                        <td className="px-3 py-2">
                          <code className="font-mono text-[10px]" dir="ltr">{s.reference || '—'}</code>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── تعيين يدوي ── */}
      <div className="rounded-xl border border-border/70 bg-card/50 p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
          تعيين خطة يدوي
        </h3>
        <p className="text-[11px] text-muted-foreground">
          للاستخدامات الداخلية (دعم/تجربة): الصق معرّف المستخدم واختر الخطة. يُسجَّل الإجراء باسمك في سجل العمليات.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">معرّف المستخدم (UUID)</Label>
            <Input
              value={manualUserId}
              onChange={(e) => setManualUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="text-xs"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">الخطة</Label>
            <Select value={manualPlan} onValueChange={setManualPlan}>
              <SelectTrigger className="text-xs" dir="rtl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">المجانية (إلغاء)</SelectItem>
                <SelectItem value="plus">بلس</SelectItem>
                <SelectItem value="max">ماكس</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">المدة (شهور)</Label>
            <Select value={manualMonths} onValueChange={setManualMonths}>
              <SelectTrigger className="text-xs" dir="rtl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['1', '2', '3', '6', '12'].map((m) => (
                  <SelectItem key={m} value={m}>{m} شهر</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">مرجع (اختياري)</Label>
            <Input
              value={manualReference}
              onChange={(e) => setManualReference(e.target.value)}
              placeholder="سبب التعيين أو مرجع العملية"
              className="text-xs"
            />
          </div>
        </div>
        <Button size="sm" onClick={doManualSet} disabled={manualBusy} className="gap-1.5">
          {manualBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          تعيين الخطة
        </Button>
      </div>

      {/* ── آخر المراجعات ── */}
      {reviewed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowReviewed((v) => !v)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-2"
          >
            <Clock className="w-3.5 h-3.5" />
            آخر الطلبات المراجَعة ({reviewed.length})
            <ChevronDown className={cn('w-3 h-3 transition-transform', showReviewed && 'rotate-180')} />
          </button>
          {showReviewed && (
            <div className="space-y-1.5">
              {reviewed.slice(0, 10).map((r) => (
                <div key={r.id} className="rounded-lg border border-border/50 px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground truncate">
                    {r.userName || r.userEmail || 'مستخدم'} → {PLAN_NAME[r.requestedPlan] ?? r.requestedPlan} · {fmtDate(r.createdAt)}
                  </span>
                  {r.status === 'approved' && <span className="pill-success px-2 py-0.5 font-semibold shrink-0">معتمد</span>}
                  {r.status === 'rejected' && (
                    <span className="pill-error px-2 py-0.5 font-semibold shrink-0 cursor-help" title={r.rejectionReason ?? ''}>
                      مرفوض
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ديالوج الاعتماد ── */}
      <Dialog open={!!approveReq} onOpenChange={(o) => !o && setApproveReq(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Crown className="w-4 h-4 text-lime" />
              اعتماد الترقية
            </DialogTitle>
          </DialogHeader>
          {approveReq && (
            <div className="space-y-3 text-sm">
              <p>
                تفعيل خطة <b>{PLAN_NAME[approveReq.requestedPlan] ?? approveReq.requestedPlan}</b> للمستخدم{' '}
                <b>{approveReq.userName || approveReq.userEmail}</b>
              </p>
              <div className="rounded-lg bg-secondary/60 px-3 py-2 text-[11px] space-y-1">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">المرجع المرسل</span>
                  <code dir="ltr">{approveReq.reference}</code>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">الوسيلة</span>
                  <span>{METHOD_NAME[approveReq.paymentMethod] ?? approveReq.paymentMethod}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">المدة (شهور)</Label>
                <Select value={approveMonths} onValueChange={setApproveMonths}>
                  <SelectTrigger className="text-sm" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['1', '2', '3', '6', '12'].map((m) => (
                      <SelectItem key={m} value={m}>{m} شهر</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">تأكيد/تعديل المرجع</Label>
                <Input
                  value={approveReference}
                  onChange={(e) => setApproveReference(e.target.value)}
                  placeholder={approveReq.reference}
                  className="text-sm"
                  dir="ltr"
                />
                <p className="text-[10px] text-muted-foreground">
                  اتركه فارغًا لاستخدام المرجع المرسل. يتسجَّل مع اسمك في سجل العمليات.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-start flex-row-reverse">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">إلغاء</Button>
            </DialogClose>
            <Button onClick={doApprove} disabled={acting} size="sm" className="gap-1.5">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              تفعيل الاشتراك
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ديالوج الرفض ── */}
      <Dialog open={!!rejectReq} onOpenChange={(o) => !o && setRejectReq(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">رفض الطلب</DialogTitle>
          </DialogHeader>
          {rejectReq && (
            <div className="space-y-3 text-sm">
              <p>
                رفض طلب <b>{PLAN_NAME[rejectReq.requestedPlan] ?? rejectReq.requestedPlan}</b> من{' '}
                <b>{rejectReq.userName || rejectReq.userEmail}</b>
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">سبب الرفض (يظهر للمستخدم)</Label>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="مثال: لم نجد عملية دفع بهذا المرجع"
                  className="text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-start flex-row-reverse">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">إلغاء</Button>
            </DialogClose>
            <Button onClick={doReject} disabled={acting} variant="destructive" size="sm" className="gap-1.5">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
