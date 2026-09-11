'use client'

// ============================================================
// admin-community-tab.tsx — تاب «المجتمع» في لوحة الإدارة (07)
//
// ثلاث مناطق:
//   1) طابور البلاغات المفتوحة (معاينة المحتوى + المُبلِّغ +
//      الأسباب) + إجراءات: إخفاء / إزالة / استبعاد البلاغ
//   2) قائمة المحظورين + حظر/فك حظر (بمدة اختيارية)
//   3) سجل إجراءات الإشراف (آخر 100)
// كل الإجراءات عبر /api/rise/admin/community/moderate (سجل
// تلقائي + إشعار للمتأثر).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Flag, Gavel, Ban, Loader2, RefreshCw, EyeOff, Trash2, CircleSlash, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiGet, apiPost } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'

interface ReportItem {
  id: string
  reason: string
  reasonAr: string
  details: string | null
  status: string
  statusAr: string
  createdAt: string
  reporter: { name: string; handle: string } | null
  target: {
    type: 'post' | 'comment'
    id: string
    status: string
    snippet: string
    title: string | null
    postId: string
    owner: { name: string; handle: string; userId: string } | null
  } | null
}

interface BanItem {
  id: string
  name: string
  handle: string
  email: string
  reason: string | null
  expiresAt: string | null
  active: boolean
  createdAt: string
}

interface LogItem {
  id: string
  action: string
  actionAr: string
  targetType: string
  targetId: string
  reason: string | null
  moderator: string
  createdAt: string
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `قبل ${h} ساعة`
  return new Date(iso).toLocaleDateString('ar-EG')
}

async function moderate(body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await apiPost('/api/rise/admin/community/moderate', body)
    if (!r.ok) {
      const j = await r.json().catch(() => null)
      throw new Error(j?.error || 'تعذّر تنفيذ الإجراء')
    }
    return true
  } catch (e) {
    toast.error((e as Error)?.message || 'تعذّر تنفيذ الإجراء')
    return false
  }
}

export function AdminCommunityTab() {
  const [reports, setReports] = useState<ReportItem[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const [reportsView, setReportsView] = useState<'open' | 'resolved'>('open')

  const [bans, setBans] = useState<BanItem[]>([])
  const [bansLoading, setBansLoading] = useState(true)

  const [log, setLog] = useState<LogItem[]>([])
  const [logLoading, setLogLoading] = useState(true)

  // إجراء مع سبب
  const [confirmAct, setConfirmAct] = useState<{ title: string; body: Record<string, unknown>; destructive?: boolean } | null>(null)
  const [actReason, setActReason] = useState('')
  const [actSubmitting, setActSubmitting] = useState(false)

  // حظر مستخدم
  const [banOpen, setBanOpen] = useState(false)
  const [banUserId, setBanUserId] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banDays, setBanDays] = useState<string>('permanent')
  const [banSubmitting, setBanSubmitting] = useState(false)

  const loadAll = useCallback(async () => {
    setReportsLoading(true)
    setBansLoading(true)
    setLogLoading(true)
    try {
      const [rp, bn, lg] = await Promise.all([
        apiGet(`/api/rise/admin/community/reports?status=${reportsView}`).then(async (r) => (r.ok ? (await r.json())?.items ?? [] : [])),
        apiGet('/api/rise/admin/community/bans').then(async (r) => (r.ok ? (await r.json())?.items ?? [] : [])),
        apiGet('/api/rise/admin/community/log').then(async (r) => (r.ok ? (await r.json())?.items ?? [] : [])),
      ])
      setReports(rp)
      setBans(bn)
      setLog(lg)
    } finally {
      setReportsLoading(false)
      setBansLoading(false)
      setLogLoading(false)
    }
  }, [reportsView])

  useEffect(() => { void loadAll() }, [loadAll])

  const runConfirm = async () => {
    if (!confirmAct || actSubmitting) return
    setActSubmitting(true)
    try {
      const ok = await moderate({ ...confirmAct.body, reason: actReason.trim() || undefined })
      if (ok) {
        toast.success('تم تنفيذ الإجراء')
        setConfirmAct(null)
        setActReason('')
        void loadAll()
      }
    } finally {
      setActSubmitting(false)
    }
  }

  const submitBan = async () => {
    if (banSubmitting) return
    if (!banUserId.trim()) { toast.error('أدخل معرّف المستخدم (UUID)'); return }
    if (banReason.trim().length < 3) { toast.error('سبب الحظر مطلوب'); return }
    setBanSubmitting(true)
    try {
      const days = banDays === 'permanent' ? undefined : parseInt(banDays, 10)
      const ok = await moderate({ action: 'ban_user', userId: banUserId.trim(), reason: banReason.trim(), days })
      if (ok) {
        toast.success('تم حظر المستخدم من المجتمع')
        setBanOpen(false)
        setBanUserId('')
        setBanReason('')
        setBanDays('permanent')
        void loadAll()
      }
    } finally {
      setBanSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── 1) طابور البلاغات ── */}
      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-600" />
            بلاغات المجتمع
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">
              {reports.filter((r) => r.status === 'open').length} مفتوح
            </span>
          </h3>
          <div className="flex items-center gap-1.5">
            <Select value={reportsView} onValueChange={(v) => setReportsView(v as 'open' | 'resolved')}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">المفتوحة</SelectItem>
                <SelectItem value="resolved">المراجَعة</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => void loadAll()} title="تحديث" className="h-8 w-8">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {reportsLoading ? (
          <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {reportsView === 'open' ? 'لا بلاغات مفتوحة — المجتمع مرتاح' : 'لا بلاغات مراجَعة بعد'}
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const tgt = r.target
              return (
              <div key={r.id} className="rounded-xl border p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">
                    {r.reasonAr}
                    <span className="text-muted-foreground font-normal"> · {timeAgo(r.createdAt)}</span>
                  </span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    r.status === 'open' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
                  )}>
                    {r.statusAr}
                  </span>
                </div>
                {r.details && <p className="text-xs text-muted-foreground bg-muted rounded-lg px-2.5 py-1.5">«{r.details}»</p>}
                {r.target ? (
                  <div className="rounded-lg bg-muted/60 p-2.5 space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      {r.target.type === 'post' ? 'منشور' : 'تعليق'}
                      {r.target.title ? ` في «${r.target.title}»` : ''}
                      {' '}لـ {r.target.owner?.name ?? '—'} (@{r.target.owner?.handle ?? '—'})
                    </p>
                    <p className="text-xs line-clamp-3">{r.target.snippet}</p>
                    {r.target.status !== 'published' && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-300">الحالة الحالية: {r.target.status === 'hidden' ? 'مخفي' : 'مزال'}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">المحتوى المستهدف حُذف سابقًا</p>
                )}
                {r.status === 'open' && tgt && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => setConfirmAct({ title: 'إخفاء المحتوى مؤقتًا', body: tgt.type === 'post' ? { action: 'hide_post', postId: tgt.id } : { action: 'hide_comment', commentId: tgt.id } })}>
                      <EyeOff className="w-3 h-3" /> إخفاء
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                      onClick={() => setConfirmAct({ title: 'إزالة المحتوى نهائيًا', body: { action: 'remove_reported', reportId: r.id }, destructive: true })}>
                      <Trash2 className="w-3 h-3" /> إزالة وحل البلاغ
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                      onClick={() => setConfirmAct({ title: 'استبعاد البلاغ', body: { action: 'dismiss_report', reportId: r.id } })}>
                      <CircleSlash className="w-3 h-3" /> استبعاد البلاغ
                    </Button>
                    {tgt.owner?.userId && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={() => { setBanOpen(true); setBanUserId(tgt.owner!.userId) }}>
                        <Ban className="w-3 h-3" /> حظر صاحبه
                      </Button>
                    )}
                  </div>
                )}
              </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 2) المحظورون ── */}
      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-600" />
            المحظورون من المجتمع
            <span className="rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[10px] font-medium">
              {bans.filter((b) => b.active).length} نشط
            </span>
          </h3>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBanOpen(true)}>
            <Ban className="w-3 h-3" /> حظر مستخدم
          </Button>
        </div>

        {bansLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : bans.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا محظورين حاليًا</p>
        ) : (
          <div className="space-y-2">
            {bans.map((b) => (
              <div key={b.id} className={cn('rounded-xl border p-3 flex items-center justify-between gap-3', !b.active && 'opacity-60')}>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium truncate">
                    {b.name} <span className="text-xs text-muted-foreground">@{b.handle}</span>
                    {!b.active && <span className="text-[10px] text-muted-foreground"> (منتهي)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{b.reason}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.expiresAt ? `ينتهي: ${new Date(b.expiresAt).toLocaleDateString('ar-EG')}` : 'حظر دائم'} · {timeAgo(b.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 gap-1"
                  onClick={() => setConfirmAct({ title: 'إلغاء حظر المستخدم', body: { action: 'unban_user', userId: b.id } })}>
                  <ShieldCheck className="w-3 h-3" /> فك الحظر
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 3) سجل الإشراف ── */}
      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Gavel className="w-4 h-4 text-violet-600" />
          سجل إجراءات الإشراف
          <span className="text-[10px] text-muted-foreground font-normal">آخر ١٠٠ إجراء</span>
        </h3>
        {logLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : log.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا إجراءات بعد</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {log.map((l) => (
              <div key={l.id} className="text-xs flex items-baseline gap-2 rounded-lg px-2.5 py-1.5 bg-muted/40">
                <span className="font-medium shrink-0">{l.actionAr}</span>
                <span className="text-muted-foreground truncate">بواسطة {l.moderator} · {timeAgo(l.createdAt)}</span>
                {l.reason && <span className="text-muted-foreground/70 truncate hidden sm:inline">— {l.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* تأكيد الإجراء + السبب */}
      <Dialog open={!!confirmAct} onOpenChange={(o) => !o && setConfirmAct(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right">{confirmAct?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea value={actReason} onChange={(e) => setActReason(e.target.value)} rows={2} maxLength={500}
              placeholder="سبب الإجراء (اختياري — يظهر للمتأثر في الإشعار)" />
            <p className="text-[11px] text-muted-foreground">
              كل إجراء يُسجَّل في سجل الإشراف ويُخطر المتأثر عبر مركز الإشعارات.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmAct(null)} disabled={actSubmitting}>إلغاء</Button>
            <Button variant={confirmAct?.destructive ? 'destructive' : 'default'} onClick={runConfirm} disabled={actSubmitting}>
              {actSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              تنفيذ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حظر مستخدم */}
      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right">حظر مستخدم من المجتمع</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={banUserId} onChange={(e) => setBanUserId(e.target.value)} placeholder="معرّف المستخدم (UUID)" dir="ltr" />
            <Textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} rows={2} maxLength={500} placeholder="سبب الحظر (مطلوب — يظهر للمستخدم)" />
            <Select value={banDays} onValueChange={setBanDays}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">حظر دائم</SelectItem>
                <SelectItem value="7">٧ أيام</SelectItem>
                <SelectItem value="30">٣٠ يومًا</SelectItem>
                <SelectItem value="90">٩٠ يومًا</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              الحظر يمنع النشر والتعليق والتفاعل (يُفرض داخل قاعدة البيانات نفسها) — بقية التطبيق لا يتأثر.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBanOpen(false)} disabled={banSubmitting}>إلغاء</Button>
            <Button variant="destructive" onClick={submitBan} disabled={banSubmitting}>
              {banSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              حظر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
