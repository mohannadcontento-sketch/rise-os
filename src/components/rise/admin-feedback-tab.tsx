'use client'

// ============================================================
// admin-feedback-tab.tsx — تاب «ملاحظات البيتا» (المرحلة 15)
//
// قناة Feedback داخل التطبيق كما يراها المالك: إحصاءات حية
// (جديدة/قُرئت/عولجت/آخر ٢٤ ساعة) + قائمة الملاحظات بأسماء
// أصحابها وأنواعها وصفحتها + فلترة بالحالة + إجراء واحد:
// تحديث الحالة (علّم كمقروء / عولجت) — كل تعديل يُسجَّل في
// audit_logs من المسار الخادمي.
//
// تحديث تلقائي كل 60 ثانية — الملاحظة الجديدة تظهر لحظتها
// أثناء جلسة البيتا (نفس فلسفة تاب الصحة والأخطاء).
// ============================================================

import { useState, useEffect, useCallback } from 'react'

import {
  MessageSquareHeart,
  RefreshCw,
  Loader2,
  Bug,
  Lightbulb,
  HelpCircle,
  ChatBubble,
  Check,
  Eye,
  Clock,
  Inbox,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatsSkeleton, TableSkeleton } from './admin-shared'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { toArabicNum, timeAgo } from './admin-panel-utils'

/* ═══════════════ Feedback Tab (Phase 15 — Beta) ═══════════════ */

type FBType = 'bug' | 'suggestion' | 'question' | 'other'
type FBStatus = 'new' | 'read' | 'handled'

interface AdminFeedbackItem {
  id: string
  userId: string
  userName: string | null
  type: FBType
  message: string
  page: string | null
  status: FBStatus
  createdAt: string
  handledAt: string | null
}

interface Counts {
  new: number
  read: number
  handled: number
  last24h: number
  byType: Record<string, number>
}

const TYPE_META: Record<FBType, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  bug: { label: 'مشكلة', icon: Bug, cls: 'bg-destructive/15 text-destructive' },
  suggestion: { label: 'اقتراح', icon: Lightbulb, cls: 'bg-gold/15 text-gold' },
  question: { label: 'سؤال', icon: HelpCircle, cls: 'bg-cyan-500/15 text-cyan-600' },
  other: { label: 'أخرى', icon: ChatBubble, cls: 'bg-muted text-muted-foreground' },
}

const STATUS_FILTERS: { key: 'all' | FBStatus; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'new', label: 'جديدة' },
  { key: 'read', label: 'قُرئت' },
  { key: 'handled', label: 'عولجت' },
]

export function AdminFeedbackTab() {
  const [items, setItems] = useState<AdminFeedbackItem[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | FBStatus>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rise/admin/feedback')
      if (res.ok) {
        const data = await res.json()
        setItems(data.feedback ?? [])
        setCounts(data.counts ?? null)
        setTableMissing(!!data.tableMissing)
      }
    } catch {
      // صامت — البطاقات تعرض آخر حالة
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // تحديث تلقائي كل 60 ثانية — ملاحظات البيتا تظهر لحظتها
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const setStatus = useCallback(async (id: string, status: FBStatus) => {
    setUpdatingId(id)
    try {
      const res = await apiPost('/api/rise/admin/feedback', { action: 'set-status', id, status })
      if (res.ok) {
        setItems((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status, handledAt: status === 'handled' ? new Date().toISOString() : f.handledAt }
              : f,
          ),
        )
        setCounts((c) => (c ? { ...c, ...recount(items.map((f) => (f.id === id ? { ...f, status } : f))) } : c))
        toast.success(status === 'handled' ? 'تمّت المعالجة' : 'تمّت القراءة')
      } else {
        const body = await res.json().catch(() => ({}))
        toast.error(body?.error || 'فشل تحديث الحالة')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setUpdatingId(null)
    }
  }, [items])

  const filtered = statusFilter === 'all' ? items : items.filter((f) => f.status === statusFilter)

  return (
    <div className="space-y-4">
      {/* ── بطاقات الإحصاءات ── */}
      {loading && !counts ? (
        <StatsSkeleton />
      ) : counts ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="neo-card p-4">
            <Clock className={cn('w-5 h-5 mb-2', counts.new > 0 ? 'text-cyan-500' : 'text-muted-foreground')} />
            <p className="text-lg font-bold">{toArabicNum(counts.new)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">ملاحظات جديدة بانتظارك</p>
          </div>
          <div className="neo-card p-4">
            <Eye className="w-5 h-5 mb-2 text-gold" />
            <p className="text-lg font-bold">{toArabicNum(counts.read)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">قُرئت — تحت المتابعة</p>
          </div>
          <div className="neo-card p-4">
            <Check className="w-5 h-5 mb-2 text-emerald-accent" />
            <p className="text-lg font-bold">{toArabicNum(counts.handled)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">عولجت ✅</p>
          </div>
          <div className="neo-card p-4">
            <MessageSquareHeart className="w-5 h-5 mb-2 text-rose-accent" />
            <p className="text-lg font-bold">{toArabicNum(counts.last24h)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">وصلت آخر ٢٤ ساعة</p>
          </div>
        </div>
      ) : null}

      {tableMissing && (
        <div className="neo-card p-4 border-dashed">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">جدول الملاحظات غير موجود</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                طبّق هجرة <span dir="ltr">037_phase15_feedback.sql</span> من SQL Editor لتشغيل قناة الملاحظات.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── الفلترة + التحديث ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                statusFilter === f.key
                  ? 'bg-primary/15 text-foreground border border-primary/40'
                  : 'bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted/70',
              )}
            >
              {f.label}
              {f.key === 'new' && counts?.new ? (
                <span className="ms-1.5 inline-flex items-center justify-center bg-cyan-500/20 text-cyan-600 rounded-full w-4.5 h-4.5 min-w-[18px] px-1 text-[10px]" dir="ltr">
                  {toArabicNum(counts.new)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="mr-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            تحديث
          </Button>
        </div>
      </div>

      {/* ── القائمة ── */}
      {loading && items.length === 0 ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="neo-card p-8 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-semibold">مفيش ملاحظات {statusFilter !== 'all' ? 'في الفلتر ده' : 'لسه'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            أول ملاحظة من مستخدمي البيتا هتظهر هنا تلقائيًا
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((f) => {
            const tMeta = TYPE_META[f.type] ?? TYPE_META.other
            const TIcon = tMeta.icon
            return (
              <div key={f.id} className="neo-card p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={cn('pill text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5', tMeta.cls)}>
                    <TIcon className="w-3 h-3" />
                    {tMeta.label}
                  </span>
                  <span className="text-xs font-semibold" dir="auto">{f.userName ?? 'مستخدم'}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(f.createdAt)}</span>
                  {f.page && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[160px]" dir="ltr" title={f.page}>
                      📍 {f.page}
                    </span>
                  )}
                  <div className="mr-auto flex items-center gap-1.5">
                    {f.status !== 'read' && f.status !== 'handled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={updatingId === f.id}
                        onClick={() => setStatus(f.id, 'read')}
                        className="h-7 px-2.5 text-[11px] gap-1"
                      >
                        {updatingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        قُرئت
                      </Button>
                    )}
                    {f.status !== 'handled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={updatingId === f.id}
                        onClick={() => setStatus(f.id, 'handled')}
                        className="h-7 px-2.5 text-[11px] gap-1 text-emerald-accent"
                      >
                        {updatingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        عولجت
                      </Button>
                    )}
                    {f.status === 'handled' && (
                      <span className="pill pill-success text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        عولجت{f.handledAt ? ` · ${timeAgo(f.handledAt)}` : ''}
                      </span>
                    )}
                    {f.status === 'read' && (
                      <span className="pill pill-warning text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        قُرئت
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm leading-relaxed" dir="auto">{f.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** إعادة حساب الإحصاءات من القائمة بعد تعديل محلي (بدون رحلة جديدة) */
function recount(list: AdminFeedbackItem[]): Partial<Counts> {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const c: Partial<Counts> = { new: 0, read: 0, handled: 0, last24h: 0 }
  for (const f of list) {
    ;(c as any)[f.status] = ((c as any)[f.status] ?? 0) + 1
    if (f.createdAt >= since24h) c.last24h = (c.last24h ?? 0) + 1
  }
  return c
}
