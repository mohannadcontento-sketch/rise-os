'use client'

// ============================================================
// admin-plans-tab.tsx — «الخطط» (المرحلة 11 — استكمال وحدة Plans)
//
// «تعديل الحدود والمزايا دون hard-code متكرر»:
// المصدر الوحيد للـenforcement = جدول plan_entitlements (هجرة
// 025 — consume_usage يقرأه داخل قاعدة البيانات) فأي تعديل من
// هنا يسري فورًا على القرار الخادمي بلا نشر جديد.
// صف لكل (خطة × ميزة): تفعيل + حد يومي + حد شهري (فارغ = بلا
// سقف في ذلك البُعد) + إضافة ميزة جديدة لأي خطة.
// كل إجراء عبر /api/rise/admin/plans (requireAdmin + logAudit
// بالقيم قبل/بعد).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  SlidersHorizontal,
  RefreshCw,
  Loader2,
  Save,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRiseStore } from '@/store/app-store'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'

interface PlanRow {
  code: string
  name_ar: string
  price_egp: string | number
  active: boolean
}

interface EntitlementRow {
  plan_code: string
  feature_key: string
  enabled: boolean
  daily_limit: number | null
  monthly_limit: number | null
}

const PLAN_NAME: Record<string, string> = { free: 'المجانية', plus: 'بلس', max: 'ماكس' }
const PLAN_TONE: Record<string, string> = {
  free: 'text-muted-foreground',
  plus: 'text-lime',
  max: 'text-rose',
}

/** واجهة تحرير لكل صف */
interface EditRow {
  enabled: boolean
  daily: string
  monthly: string
}

function toEditRow(e: EntitlementRow): EditRow {
  return {
    enabled: e.enabled,
    daily: e.daily_limit === null ? '' : String(e.daily_limit),
    monthly: e.monthly_limit === null ? '' : String(e.monthly_limit),
  }
}

function parseLimit(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (!/^\d{1,6}$/.test(trimmed)) return 'invalid'
  const n = Number(trimmed)
  if (n > 100000) return 'invalid'
  return n
}

export function AdminPlansTab() {
  const { auth } = useRiseStore()
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([])
  const [edits, setEdits] = useState<Record<string, EditRow>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  // إضافة ميزة جديدة
  const [newPlan, setNewPlan] = useState('free')
  const [newFeatureKey, setNewFeatureKey] = useState('')
  const [newDaily, setNewDaily] = useState('')
  const [newMonthly, setNewMonthly] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!auth?.isAuthenticated) return
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/plans')
      if (res.ok) {
        const data = await res.json()
        setPlans(data.plans ?? [])
        const ents: EntitlementRow[] = data.entitlements ?? []
        setEntitlements(ents)
        const next: Record<string, EditRow> = {}
        for (const e of ents) next[`${e.plan_code}:${e.feature_key}`] = toEditRow(e)
        setEdits(next)
      } else {
        toast.error('فشل تحميل الخطط')
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

  const saveRow = async (plan: string, featureKey: string) => {
    const key = `${plan}:${featureKey}`
    const edit = edits[key]
    if (!edit) return

    const daily = parseLimit(edit.daily)
    if (daily === 'invalid') {
      toast.error('الحد اليومي: رقم صحيح 0..100000 أو فراغ (= بلا سقف)')
      return
    }
    const monthly = parseLimit(edit.monthly)
    if (monthly === 'invalid') {
      toast.error('الحد الشهري: رقم صحيح 0..100000 أو فراغ (= بلا سقف)')
      return
    }

    setSavingKey(key)
    try {
      const res = await apiPost('/api/rise/admin/plans', {
        action: 'set-entitlement',
        plan,
        featureKey,
        enabled: edit.enabled,
        dailyLimit: daily,
        monthlyLimit: monthly,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'فشل حفظ الحد')
        return
      }
      toast.success(body.message || 'تم الحفظ')
      load()
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setSavingKey(null)
    }
  }

  const addFeature = async () => {
    const key = newFeatureKey.trim()
    if (!/^[a-z][a-z0-9._-]{2,63}$/.test(key)) {
      toast.error('مفتاح الميزة: أحرف صغيرة إنجليزية/أرقام/نقطة/شرطة (3-64) — مثل ai.action')
      return
    }
    if (entitlements.some((e) => e.plan_code === newPlan && e.feature_key === key)) {
      toast.error('هذه الميزة موجودة بالفعل لهذه الخطة')
      return
    }
    const daily = parseLimit(newDaily)
    if (daily === 'invalid') {
      toast.error('الحد اليومي: رقم صحيح أو فراغ')
      return
    }
    const monthly = parseLimit(newMonthly)
    if (monthly === 'invalid') {
      toast.error('الحد الشهري: رقم صحيح أو فراغ')
      return
    }

    setAdding(true)
    try {
      const res = await apiPost('/api/rise/admin/plans', {
        action: 'set-entitlement',
        plan: newPlan,
        featureKey: key,
        enabled: true,
        dailyLimit: daily,
        monthlyLimit: monthly,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'فشل إضافة الميزة')
        return
      }
      toast.success(body.message || 'تمت الإضافة')
      setNewFeatureKey('')
      setNewDaily('')
      setNewMonthly('')
      load()
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // تجميع الصفوف حسب الخطة
  const byPlan: Record<string, EntitlementRow[]> = {}
  for (const e of entitlements) {
    if (!byPlan[e.plan_code]) byPlan[e.plan_code] = []
    byPlan[e.plan_code].push(e)
  }

  return (
    <div className="space-y-5 pt-4">
      {/* ── ترويسة ── */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-lime" />
          حدود الخطط والمزايا
        </h3>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed rounded-xl border border-border/70 px-3 py-2.5">
        الحدود هنا هي المصدر الوحيد الذي يقرأه القرار الخادمي (consume_usage داخل قاعدة البيانات) — أي
        تعديل يسري فورًا على كل الطلبات الجديدة بلا نشر. فراغ = بلا سقف في ذلك البُعد، و0 = الميزة مقفولة عمليًا.
      </p>

      {/* ── بطاقات الخطط ── */}
      {['free', 'plus', 'max'].map((plan) => (
        <div key={plan} className="rounded-xl border border-border/70 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-bold ${PLAN_TONE[plan] ?? ''}`}>
              {PLAN_NAME[plan] ?? plan}
              <span className="text-[11px] font-normal text-muted-foreground">
                {(() => {
                  const p = plans.find((x) => x.code === plan)
                  return p ? ` · ${p.price_egp} ج.م/شهر` : ''
                })()}
              </span>
            </p>
            <span className="text-[10px] text-muted-foreground">
              {(byPlan[plan] ?? []).length} ميزة
            </span>
          </div>

          <div className="space-y-2">
            {(byPlan[plan] ?? []).length === 0 && (
              <div className="rounded-xl border border-dashed border-border/70 px-4 py-4 text-center text-xs text-muted-foreground">
                لا حدود معرّفة — أضف ميزة من الأسفل.
              </div>
            )}
            {(byPlan[plan] ?? []).map((e) => {
              const key = `${plan}:${e.feature_key}`
              const edit = edits[key] ?? toEditRow(e)
              const dirty =
                edit.enabled !== e.enabled ||
                edit.daily !== (e.daily_limit === null ? '' : String(e.daily_limit)) ||
                edit.monthly !== (e.monthly_limit === null ? '' : String(e.monthly_limit))
              return (
                <div key={key} className="rounded-lg border border-border/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px]" dir="ltr">{e.feature_key}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={edit.enabled}
                        onChange={(ev) =>
                          setEdits((prev) => ({ ...prev, [key]: { ...edit, enabled: ev.target.checked } }))
                        }
                        className="h-3.5 w-3.5 accent-lime"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {edit.enabled ? 'مفعّلة' : 'معطّلة'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">حد يومي</Label>
                      <Input
                        value={edit.daily}
                        onChange={(ev) =>
                          setEdits((prev) => ({ ...prev, [key]: { ...edit, daily: ev.target.value } }))
                        }
                        placeholder="بلا سقف"
                        className="h-7 text-xs font-mono"
                        dir="ltr"
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">حد شهري</Label>
                      <Input
                        value={edit.monthly}
                        onChange={(ev) =>
                          setEdits((prev) => ({ ...prev, [key]: { ...edit, monthly: ev.target.value } }))
                        }
                        placeholder="بلا سقف"
                        className="h-7 text-xs font-mono"
                        dir="ltr"
                        inputMode="numeric"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant={dirty ? 'default' : 'outline'}
                      disabled={savingKey === key}
                      onClick={() => saveRow(plan, e.feature_key)}
                      className="gap-1 h-7 text-xs"
                    >
                      {savingKey === key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      حفظ
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* ── إضافة ميزة جديدة ── */}
      <div className="rounded-xl border border-dashed border-border/70 p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4 text-lime" />
          إضافة حد ميزة جديد
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">الخطة</Label>
            <Select value={newPlan} onValueChange={setNewPlan}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['free', 'plus', 'max'].map((p) => (
                  <SelectItem key={p} value={p}>{PLAN_NAME[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">مفتاح الميزة</Label>
            <Input
              value={newFeatureKey}
              onChange={(e) => setNewFeatureKey(e.target.value)}
              placeholder="export.data"
              className="h-8 text-xs font-mono"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">حد يومي</Label>
            <Input
              value={newDaily}
              onChange={(e) => setNewDaily(e.target.value)}
              placeholder="بلا سقف"
              className="h-8 text-xs font-mono"
              dir="ltr"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">حد شهري</Label>
            <Input
              value={newMonthly}
              onChange={(e) => setNewMonthly(e.target.value)}
              placeholder="بلا سقف"
              className="h-8 text-xs font-mono"
              dir="ltr"
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={adding} onClick={addFeature} className="gap-1.5 h-8">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            إضافة الحد
          </Button>
        </div>
      </div>
    </div>
  )
}
