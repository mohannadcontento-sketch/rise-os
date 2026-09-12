'use client'

// ============================================================
// admin-overview-tab.tsx — تاب «النظرة العامة» (ADMIN PRO)
//
// KPIs مجمّعة من /api/rise/admin/overview: نمو المستخدمين،
// الاستخدام، أخطاء الأسبوع، أحدث التسجيلات وآخر إجراءات الإدارة.
// بطاقة KpiCard المحلية توحّد شكل الأرقام (tone: جيد/تحذير/سيئ).
// ============================================================

import { useState, useEffect, useCallback } from 'react'

import {
  Users,
  UserPlus,
  TrendingUp,
  Activity,
  BarChart3,
  Megaphone,
  Shield,
  RefreshCw,
  AlertTriangle,
  Database,
  ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatsSkeleton } from './admin-shared'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { toArabicNum, timeAgo } from './admin-panel-utils'

/* ═══════════════ Overview Tab (ADMIN PRO) ═══════════════ */

interface OverviewData {
  kpis: {
    usersTotal: number
    usersActiveToday: number
    usersActive7d: number
    usersNew7d: number
    usersSuspended: number
    usersAdmins: number
    errors24h: number
    tasksTotal: number
    habitsTotal: number
    journalsTotal: number
    focusTotal: number
  }
  errors7d: { date: string; count: number }[]
  recentSignups: { id: string; name: string; email: string; createdAt: string; role: string; suspended: boolean }[]
  recentAudit: { id: string; adminId: string; action: string; detail: string; createdAt: string }[]
  // المرحلة 07 — حالة الطبقتين الفضائيتين (fail-open من المسار)
  services: {
    turso: { configured: boolean; host: string | null; readMode: boolean }
    cloudinary: { configured: boolean; cloudName: string | null }
  }
  dbLatencyMs: number
}

function KpiCard({ label, value, hint, tone = 'default', icon: Icon }: { label: string; value: number; hint?: string; tone?: 'default' | 'good' | 'warn' | 'bad'; icon: any }) {
  const toneCls = tone === 'good' ? 'text-emerald-accent' : tone === 'warn' ? 'text-gold' : tone === 'bad' ? 'text-destructive' : 'text-foreground'
  return (
    <div className="neo-card p-4">
      <Icon className={cn('w-4.5 h-4.5 mb-2', tone === 'good' ? 'text-emerald-accent' : tone === 'warn' ? 'text-gold' : tone === 'bad' ? 'text-destructive' : 'text-muted-foreground')} />
      <p className={cn('text-2xl font-black tabular-nums', toneCls)}>{toArabicNum(value)}</p>
      <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

export function OverviewTab({ onBroadcast }: { onBroadcast: () => void }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/overview')
      if (res.ok) {
        const body = await res.json()
        // توافق خلفي: نشرات أقدم من قسم services ترى «غير مهيأ»
        // بدل الانهيار — الحقل اختياري على مستوى الشبكة.
        body.services ??= {
          turso: { configured: false, host: null, readMode: false },
          cloudinary: { configured: false, cloudName: null },
        }
        setData(body)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 90_000)
    return () => clearInterval(t)
  }, [load])

  if (loading && !data) return <StatsSkeleton />
  if (!data) {
    return <div className="neo-card p-6 text-center text-sm text-muted-foreground">فشل تحميل النظرة العامة</div>
  }

  const k = data.kpis
  const maxErr = Math.max(1, ...data.errors7d.map(e => e.count))
  const engagement7d = k.usersTotal > 0 ? Math.round((k.usersActive7d / k.usersTotal) * 100) : 0

  return (
    <div className="space-y-4">
      {/* ── Quick actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 gap-1.5 text-xs bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink" onClick={onBroadcast}>
          <Megaphone className="w-3.5 h-3.5" />
          إعلان لكل المستخدمين
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          تحديث
        </Button>
        <span className="text-[10px] text-muted-foreground ms-auto">
          قاعدة البيانات {toArabicNum(data.dbLatencyMs)} م.ث · تحديث تلقائي كل ٩٠ ث
        </span>
      </div>

      {/* ── المرحلة 07: حالة الخدمات (Turso + Cloudinary) ── */}
      {/* fail-open: «غير مهيأ» لا يعني عطلاً — يعني غير مُعد فقط */}
      <div className="grid grid-cols-2 gap-3">
        <div className="neo-card p-3 flex items-center gap-3">
          <Database className={cn('w-4 h-4 shrink-0', data.services.turso.configured ? 'text-forest' : 'text-muted-foreground')} />
          <div className="min-w-0">
            <p className="text-xs font-semibold">مرآة Turso</p>
            <p className="text-[10px] text-muted-foreground truncate" dir="ltr">
              {data.services.turso.configured
                ? `${data.services.turso.host ?? '—'}${data.services.turso.readMode ? ' · قراءة مفعّلة' : ' · مزامنة فقط'}`
                : 'غير مهيأة — المزامنة معطلة بأمان'}
            </p>
          </div>
          <span className={cn('pill text-[10px] ms-auto shrink-0', data.services.turso.configured ? 'bg-forest/10 text-forest' : 'bg-muted text-muted-foreground')}>
            {data.services.turso.configured ? 'نشطة' : 'بلا مرآة'}
          </span>
        </div>
        <div className="neo-card p-3 flex items-center gap-3">
          <ImageIcon className={cn('w-4 h-4 shrink-0', data.services.cloudinary.configured ? 'text-forest' : 'text-muted-foreground')} />
          <div className="min-w-0">
            <p className="text-xs font-semibold">وسائط Cloudinary</p>
            <p className="text-[10px] text-muted-foreground truncate" dir="ltr">
              {data.services.cloudinary.configured
                ? data.services.cloudinary.cloudName ?? '—'
                : 'غير مهيأة — رفع المجتمع معطّل'}
            </p>
          </div>
          <span className={cn('pill text-[10px] ms-auto shrink-0', data.services.cloudinary.configured ? 'bg-forest/10 text-forest' : 'bg-muted text-muted-foreground')}>
            {data.services.cloudinary.configured ? 'نشطة' : 'بلا رفع'}
          </span>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="إجمالي المستخدمين" value={k.usersTotal} hint={`${toArabicNum(k.usersAdmins)} أدمن · ${toArabicNum(k.usersSuspended)} موقوف`} />
        <KpiCard icon={Activity} label="نشِط اليوم" value={k.usersActiveToday} tone={k.usersActiveToday > 0 ? 'good' : 'default'} hint={`${toArabicNum(k.usersActive7d)} خلال ٧ أيام`} />
        <KpiCard icon={TrendingUp} label="تفاعل أسبوعي" value={engagement7d} hint="٪ من المستخدمين نشِطوا هذا الأسبوع" tone={engagement7d >= 40 ? 'good' : engagement7d >= 15 ? 'warn' : 'bad'} />
        <KpiCard icon={UserPlus} label="جديد هذا الأسبوع" value={k.usersNew7d} tone={k.usersNew7d > 0 ? 'good' : 'default'} />
      </div>

      {/* ── Content volume + errors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-forest" />حجم المحتوى</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'مهام', v: k.tasksTotal }, { label: 'عادات', v: k.habitsTotal },
              { label: 'يوميات', v: k.journalsTotal }, { label: 'جلسات تركيز', v: k.focusTotal },
            ].map(x => (
              <div key={x.label}>
                <p className="text-lg font-bold tabular-nums">{toArabicNum(x.v)}</p>
                <p className="text-[10px] text-muted-foreground">{x.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className={cn('w-4 h-4', k.errors24h > 0 ? 'text-gold' : 'text-emerald-accent')} />
            أخطاء آخر ٧ أيام
            <span className="pill pill-muted text-[10px] ms-auto" dir="ltr">{toArabicNum(k.errors24h)} / اليوم</span>
          </p>
          <div className="flex items-end gap-1.5 h-16" dir="ltr">
            {data.errors7d.map(e => (
              <div key={e.date} className="flex-1 flex flex-col items-center gap-1" title={`${e.date}: ${e.count}`}>
                <div
                  className={cn('w-full rounded-t-md transition-all', e.count > 0 ? 'bg-gold/70' : 'bg-primary/10')}
                  style={{ height: `${Math.max(6, (e.count / maxErr) * 100)}%` }}
                />
                <span className="text-[8px] text-muted-foreground">{e.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent signups + audit ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><UserPlus className="w-4 h-4 text-forest" />أحدث الانضمامات</p>
          {data.recentSignups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">لا انضمامات جديدة هذا الأسبوع</p>
          ) : (
            <div className="space-y-1.5">
              {data.recentSignups.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="text-muted-foreground truncate max-w-[140px]" dir="ltr">{s.email}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(s.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-rose-accent" />آخر عمليات الإدارة</p>
          {data.recentAudit.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">لا عمليات مسجلة بعد</p>
          ) : (
            <div className="space-y-1.5">
              {data.recentAudit.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{a.action.replace('Admin: ', '')}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[160px]" dir="ltr">{a.detail}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
