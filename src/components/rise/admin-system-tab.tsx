'use client'

// ============================================================
// admin-system-tab.tsx — «النظام» (المرحلة 11 — استكمال وحدة System)
//
// • وضع الصيانة: تشغيل/إيقاف + رسالة — عند التشغيل يرفض الـ
//   middleware طفرات /api/rise/* غير الإدارية (503 عربية) بينما
//   تظل القراءة ومسارات الأدمن تعمل (الأدمن يستطيع الإيقاف دائمًا).
// • أعلام الميزات: قائمة منطقية في app_config (feature_flags)
//   للاستخدام التدريجي — عامة وغير سرية.
// • حالة النشر: commit + بيئة التشغيل.
// كل إجراء عبر /api/rise/admin/system (requireAdmin + logAudit).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  Wrench,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Save,
  Plus,
  Trash2,
  GitCommitHorizontal,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useRiseStore } from '@/store/app-store'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'

interface SystemInfo {
  maintenance: { enabled: boolean; message: string; envOverride: boolean }
  flags: Record<string, boolean>
  knownFlags: Array<{ key: string; labelAr: string }>
  deployment: { commit: string | null; env: string | null }
}

export function AdminSystemTab() {
  const { auth } = useRiseStore()
  const [loading, setLoading] = useState(true)
  const [savingMaintenance, setSavingMaintenance] = useState(false)
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [maintenanceOn, setMaintenanceOn] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [newFlagKey, setNewFlagKey] = useState('')
  const [newFlagValue, setNewFlagValue] = useState(true)
  const [savingFlags, setSavingFlags] = useState(false)

  const load = useCallback(async () => {
    if (!auth?.isAuthenticated) return
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/system')
      if (res.ok) {
        const data: SystemInfo = await res.json()
        setInfo(data)
        setMaintenanceOn(data.maintenance.enabled)
        setMaintenanceMessage(data.maintenance.message ?? '')
        setFlags(data.flags ?? {})
      } else {
        toast.error('فشل تحميل حالة النظام')
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

  const saveMaintenance = async (enabled: boolean, message: string) => {
    setSavingMaintenance(true)
    try {
      const res = await apiPost('/api/rise/admin/system', { action: 'maintenance', enabled, message })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'فشل حفظ وضع الصيانة')
        return
      }
      toast.success(body.message || 'تم الحفظ')
      setMaintenanceOn(enabled)
      load()
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setSavingMaintenance(false)
    }
  }

  const saveFlags = async () => {
    setSavingFlags(true)
    try {
      const res = await apiPost('/api/rise/admin/system', { action: 'flags', flags })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'فشل حفظ الأعلام')
        return
      }
      toast.success(body.message || 'تم الحفظ')
      load()
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setSavingFlags(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pt-4">
      {/* ── ترويسة ── */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Wrench className="w-4 h-4 text-rose" />
          النظام والصيانة
        </h3>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </Button>
      </div>

      {/* ── وضع الصيانة ── */}
      <div
        className={`rounded-xl border p-4 space-y-3 ${
          maintenanceOn ? 'border-warning/40 bg-warning/5' : 'border-border/70'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className={`w-4 h-4 ${maintenanceOn ? 'text-warning' : 'text-muted-foreground'}`} />
              وضع الصيانة
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              عند التفعيل تُرفض كتابات المستخدمين (503 برسالة واضحة) وتبقى القراءة ومسارات الإدارة تعمل —
              تستطيع الإيقاف من هنا دائمًا.
            </p>
          </div>
          <Switch
            checked={maintenanceOn}
            disabled={savingMaintenance}
            onCheckedChange={(checked) => saveMaintenance(checked, maintenanceMessage)}
          />
        </div>

        {maintenanceOn && (
          <div className="space-y-1.5">
            <Label htmlFor="maintenance-message" className="text-xs">رسالة الصيانة للمستخدمين</Label>
            <div className="flex items-center gap-2">
              <Input
                id="maintenance-message"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                maxLength={160}
                className="h-8 text-xs"
                placeholder="أوج تحت الصيانة حاليًا — نرجو المحاولة بعد قليل."
              />
              <Button
                size="sm"
                variant="outline"
                disabled={savingMaintenance}
                onClick={() => saveMaintenance(true, maintenanceMessage)}
                className="gap-1 h-8 shrink-0"
              >
                {savingMaintenance ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                حفظ
              </Button>
            </div>
          </div>
        )}

        {info?.maintenance.envOverride && (
          <p className="text-[11px] text-warning flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            متغير البيئة SYSTEM_MAINTENANCE_MODE مضبوط في Vercel وله الأسبقية الآن.
          </p>
        )}
      </div>

      {/* ── أعلام الميزات ── */}
      <div className="rounded-xl border border-border/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">أعلام الميزات (Feature Flags)</p>
          <Button
            size="sm"
            variant="outline"
            disabled={savingFlags}
            onClick={saveFlags}
            className="gap-1 h-7 text-xs"
          >
            {savingFlags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            حفظ الأعلام
          </Button>
        </div>

        <div className="space-y-2">
          {Object.keys(flags).length === 0 && (
            <p className="text-[11px] text-muted-foreground">لا أعلام محفوظة — أضف علمًا لأول مرة.</p>
          )}
          {Object.entries(flags).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[11px] truncate">{key}</span>
                {info?.knownFlags.find((f) => f.key === key) && (
                  <span className="text-[10px] text-muted-foreground">
                    {info.knownFlags.find((f) => f.key === key)?.labelAr}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold ${value ? 'text-lime' : 'text-muted-foreground'}`}>
                  {value ? 'مفعّل' : 'معطّل'}
                </span>
                <Switch
                  checked={value}
                  onCheckedChange={(checked) => setFlags((prev) => ({ ...prev, [key]: checked }))}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() =>
                    setFlags((prev) => {
                      const next = { ...prev }
                      delete next[key]
                      return next
                    })
                  }
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-border/40 pt-3">
          <Input
            value={newFlagKey}
            onChange={(e) => setNewFlagKey(e.target.value)}
            placeholder="اسم العلم (مثال: signup_enabled)"
            className="h-8 text-xs font-mono"
            maxLength={64}
          />
          <Switch checked={newFlagValue} onCheckedChange={setNewFlagValue} />
          <span className="text-[10px] text-muted-foreground shrink-0">{newFlagValue ? 'مفعّل' : 'معطّل'}</span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-8 shrink-0"
            onClick={() => {
              const key = newFlagKey.trim()
              if (!/^[a-z][a-z0-9_]{2,63}$/.test(key)) {
                toast.error('اسم العلم: أحرف صغيرة إنجليزية وأرقام وشرطة سفلية (3-64)')
                return
              }
              setFlags((prev) => ({ ...prev, [key]: newFlagValue }))
              setNewFlagKey('')
            }}
          >
            <Plus className="w-3 h-3" />
            إضافة
          </Button>
        </div>
      </div>

      {/* ── حالة النشر ── */}
      {info?.deployment && (
        <div className="rounded-xl border border-border/70 p-4 space-y-2">
          <p className="text-sm font-semibold">حالة النشر الحالي</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <GitCommitHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono truncate">
              {info.deployment.commit ? info.deployment.commit.slice(0, 10) : 'غير متاح'}
            </span>
            {info.deployment.env && (
              <span className="pill bg-secondary px-2 py-0.5 text-[10px]">{info.deployment.env}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            نقطة الحالة العامة:{' '}
            <span className="font-mono" dir="ltr">/api/rise/system/status</span> — للمراقبة الخارجية دون مصادقة.
          </p>
        </div>
      )}
    </div>
  )
}
