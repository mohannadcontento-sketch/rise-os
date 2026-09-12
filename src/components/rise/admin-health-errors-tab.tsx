'use client'

// ============================================================
// admin-health-errors-tab.tsx — تاب «الصحة والأخطاء» (Task 20)
//
// فحص حيّ للموقع (/health): حالة DB/الإعدادات/زمن الاستجابة +
// سجل أخطاء 24 ساعة من error_monitoring مع حذف فردي/جماعي.
// ============================================================

import { useState, useEffect, useCallback } from 'react'

import {
  Activity,
  Shield,
  RefreshCw,
  Trash2,
  Check,
  Key,
  AlertTriangle,
  Loader2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatsSkeleton, TableSkeleton } from './admin-shared'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { toArabicNum, timeAgo } from './admin-panel-utils'

/* ═══════════════ Health & Errors Tab (Task 20) ═══════════════ */

interface SiteHealth {
  ok: boolean
  db: { ok: boolean; latencyMs: number | null; error: string | null }
  config: { supabase: boolean; serviceKey: boolean; adminEmail: boolean; sentry: boolean }
  errors24h: number
  errorLogsMissing: boolean
  totalUsers: number | null
  serverTime: string
  commit: string | null
  checkedInMs: number
}

interface AdminError {
  id: string
  userId: string | null
  message: string
  url: string | null
  createdAt: string
}

export function HealthErrorsTab() {
  const [health, setHealth] = useState<SiteHealth | null>(null)
  const [errors, setErrors] = useState<AdminError[]>([])
  const [topMessages, setTopMessages] = useState<{ message: string; count: number }[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [hRes, eRes] = await Promise.all([
        apiFetch('/api/rise/admin/health'),
        apiFetch('/api/rise/admin/errors'),
      ])
      if (hRes.ok) setHealth(await hRes.json())
      if (eRes.ok) {
        const data = await eRes.json()
        setErrors(data.errors || [])
        setTopMessages(data.topMessages || [])
        setTableMissing(!!data.tableMissing)
      }
    } catch {
      // silent — cards show stale/empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // تحديث تلقائي كل 60 ثانية — صاحب الموقع يشوف الأخطاء لحظة وقوعها
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const handleClear = async () => {
    setClearing(true)
    try {
      const res = await apiFetch('/api/rise/admin/errors', { method: 'DELETE' })
      if (res.ok) {
        setErrors([])
        setTopMessages([])
        toast.success('تم مسح سجل الأخطاء')
      } else {
        toast.error('فشل مسح السجل')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setClearing(false)
    }
  }

  const configItems = health ? [
    { label: 'Supabase', ok: health.config.supabase },
    { label: 'مفتاح الخدمة', ok: health.config.serviceKey },
    { label: 'بريد الأدمن', ok: health.config.adminEmail },
    { label: 'Sentry', ok: health.config.sentry },
  ] : []

  return (
    <div className="space-y-4">
      {/* ── بطاقات الصحة ── */}
      {loading && !health ? (
        <StatsSkeleton />
      ) : health ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="neo-card p-4">
            <Activity className={cn('w-5 h-5 mb-2', health.db.ok ? 'text-emerald-accent' : 'text-destructive')} />
            <p className="text-lg font-bold">{health.db.ok ? 'قاعدة البيانات تعمل' : 'مشكلة بالاتصال'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {health.db.ok ? `زمن الاستجابة ${toArabicNum(health.db.latencyMs ?? 0)} م.ث` : (health.db.error || '—').slice(0, 60)}
            </p>
          </div>
          <div className="neo-card p-4">
            <AlertTriangle className={cn('w-5 h-5 mb-2', health.errors24h > 0 ? 'text-gold' : 'text-emerald-accent')} />
            <p className="text-lg font-bold">{toArabicNum(health.errors24h)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">خطأ في آخر ٢٤ ساعة</p>
          </div>
          <div className="neo-card p-4">
            <Users className="w-5 h-5 mb-2 text-forest" />
            <p className="text-lg font-bold">{toArabicNum(health.totalUsers ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">إجمالي المستخدمين</p>
          </div>
          <div className="neo-card p-4">
            <Shield className="w-5 h-5 mb-2 text-muted-foreground" />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {configItems.map((c) => (
                <span key={c.label} className={cn('pill text-[10px]', c.ok ? 'bg-emerald-accent/15 text-emerald-accent' : 'bg-destructive/15 text-destructive')}>
                  {c.ok ? '✓' : '✗'} {c.label}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">حالة التهيئة {health.commit ? `· ${health.commit}` : ''}</p>
          </div>
        </div>
      ) : (
        <div className="neo-card p-6 text-center text-sm text-muted-foreground">فشل تحميل حالة الصحة</div>
      )}

      {/* ── الأكثر تكراراً ── */}
      {topMessages.length > 0 && (
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-gold" />الأكثر تكراراً</p>
          <div className="space-y-1.5">
            {topMessages.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground" dir="auto">{t.message}</span>
                <span className="pill pill-muted text-[10px] shrink-0" dir="ltr">{toArabicNum(t.count)}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── جدول الأخطاء ── */}
      <div className="neo-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-accent" />
            آخر الأخطاء
            {errors.length > 0 && <span className="pill pill-muted text-[10px]" dir="ltr">{toArabicNum(errors.length)}</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={load} disabled={loading}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              تحديث
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs hover:text-destructive" onClick={handleClear} disabled={clearing || errors.length === 0}>
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              مسح السجل
            </Button>
          </div>
        </div>

        {tableMissing && (
          <div className="mb-3 p-3 rounded-xl border border-gold/30 bg-gold/10 text-xs text-foreground">
            جدول error_logs غير مُنشأ بعد — شغّل ملف <code dir="ltr" className="font-mono">supabase/migrations/011_error_logs.sql</code> في SQL Editor بـ Supabase لتشغيل تتبع الأخطاء.
          </div>
        )}

        {loading && errors.length === 0 ? (
          <TableSkeleton />
        ) : errors.length === 0 ? (
          <div className="text-center py-10">
            <Check className="w-8 h-8 mx-auto mb-2 text-emerald-accent" />
            <p className="text-sm text-muted-foreground">لا أخطاء مسجلة — كل شيء سليم</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-start ps-3 w-[110px]">الوقت</TableHead>
                  <TableHead className="text-start">الخطأ</TableHead>
                  <TableHead className="text-start hidden md:table-cell w-[180px]">الصفحة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="ps-3 text-[11px] text-muted-foreground whitespace-nowrap">
                      {timeAgo(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium break-all" dir="auto">{e.message}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[11px] text-muted-foreground truncate max-w-[180px]" dir="ltr">
                      {e.url ? e.url.replace(/^https?:\/\/[^/]+/, '') || '/' : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
