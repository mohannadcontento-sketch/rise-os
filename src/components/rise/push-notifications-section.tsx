'use client'

// ============================================================
// PushNotificationsSection — «إشعارات الجهاز» (المرحلة 06)
//
// • حالة القناة: صلاحية المتصفح + الاشتراك الفعلي + تهيئة
//   الخادم (VAPID) — مع تفعيل/إيقاف من إيماءة صريحة فقط.
// • أزرار: تفعيل (enablePush) / إيقاف (disablePush — يمنع
//   القناة فقط ولا يلمس مركز الإشعارات) / تجربة (POST
//   /push/test — إشعار حقيقي يمر بالمسار الموحد نفسه).
// • فئات الإرسال (خطة الخطة): مهم/أمان/تذكيرات مفتوحة
//   افتراضيًا؛ المجتمع والتسويق مغلقان — التسويق بموافقة
//   نصية صريحة قبل السماح بالمفتاح.
// • الأجهزة المسجلة: قائمة per-device (origin فقط يُعرض) مع
//   إبطال أي جهاز + التنظيف التلقائي للقديم (cron).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  Smartphone,
  BellRing,
  BellOff,
  Send,
  ShieldCheck,
  Megaphone,
  Users,
  Clock,
  Trash2,
  Loader2,
  MonitorSmartphone,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SectionCard } from './settings-section-card'
import {
  getPushStatus,
  enablePush,
  disablePush,
  deviceLabel,
  type PushStatus,
} from '@/lib/push-notifications'

interface DeviceRow {
  id: string
  label: string
  origin: string
  createdAt: string
  lastPushAt: string | null
  revokedAt: string | null
  revokedReason: string | null
  active: boolean
}

interface PrefsResponse {
  pushEnabled: boolean
  categories: {
    important: boolean
    security: boolean
    reminders: boolean
    community: boolean
    marketing: boolean
  }
}

const CATEGORY_META: Array<{
  key: keyof PrefsResponse['categories']
  label: string
  desc: string
  icon: typeof ShieldCheck
  consent?: boolean
}> = [
  { key: 'important', label: 'تحديثات مهمة', desc: 'اشتراكك، حدود الاستخدام، عمليات الخلفية', icon: CheckCircle2 },
  { key: 'security', label: 'أمان الحساب', desc: 'تغيير كلمة المرور والجلسات (مستقبلًا)', icon: ShieldCheck },
  { key: 'reminders', label: 'التذكيرات', desc: 'تذكيرات الروتين والعادات المجدولة', icon: Clock },
  { key: 'community', label: 'نشاط المجتمع', desc: 'ردود وتفاعلات (المرحلة القادمة) — اختياري', icon: Users },
  {
    key: 'marketing',
    label: 'رسائل أوج',
    desc: 'عروض وأخبار المنتج — تحتاج موافقتك الصريحة',
    icon: Megaphone,
    consent: true,
  },
]

export function PushNotificationsSection() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [prefs, setPrefs] = useState<PrefsResponse | null>(null)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'enable' | 'disable' | 'test' | null>(null)
  const [savingCat, setSavingCat] = useState<string | null>(null)
  const [marketingConfirm, setMarketingConfirm] = useState(false)

  const load = useCallback(async () => {
    try {
      const [statusResult, prefsRes, devicesRes] = await Promise.all([
        getPushStatus(),
        apiFetch('/api/rise/user/notification-preferences').catch(() => null),
        apiFetch('/api/rise/push/subscriptions').catch(() => null),
      ])
      setStatus(statusResult)
      if (prefsRes?.ok) setPrefs(await prefsRes.json())
      if (devicesRes?.ok) {
        const body = await devicesRes.json()
        setDevices(body.subscriptions ?? [])
      }
    } catch {
      /* offline — الحالة الفارغة */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ── تفعيل/إيقاف القناة ──────────────────────────────────────
  const handleEnable = async () => {
    setBusy('enable')
    try {
      const result = await enablePush()
      if (result.ok) {
        toast.success('تم تفعيل إشعارات الجهاز لهذا المتصفح', {
          description: 'ستصلك الإشعارات المهمة حتى والموقع في الخلفية',
        })
      } else {
        toast.error(result.message || 'تعذّر تفعيل الإشعارات', {
          description: result.reason === 'permission_denied'
            ? 'من إعدادات المتصفح: اسمح للإشعارات لهذا الموقع ثم أعد المحاولة'
            : undefined,
        })
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const handleDisable = async () => {
    setBusy('disable')
    try {
      await disablePush()
      toast.success('أُوقفت إشعارات الجهاز لهذا المتصفح', {
        description: 'مركز الإشعارات داخل الموقع يعمل كالمعتاد',
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  // ── تجربة الإرسال (إشعار حقيقي بالمسار الموحد) ──────────────
  const handleTest = async () => {
    setBusy('test')
    try {
      const res = await apiPost('/api/rise/push/test')
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'تعذّر إرسال التجربة')
        return
      }
      if (body.push?.pushed) {
        toast.success('أُرسلت التجربة إلى أجهزتك 🎉', {
          description: 'لو لم تظهر فتحقق أن المتصفح في المقدمة/الخلفية وليس مفتوحًا الآن',
        })
      } else if (status?.subscribed) {
        toast.info('وصل الإشعار داخل الموقع، ولم يُرسل Push لهذه الفئة أو الجهاز', {
          description: 'راجع فئات الإرسال بالأسفل أو صلاحية المتصفح',
        })
      } else {
        toast.info('وصل الإشعار داخل مركز الإشعارات', {
          description: 'فعّل الجهاز أعلاه ليصلك Push أيضًا',
        })
      }
    } catch {
      toast.error('تعذّر الاتصال بالخادم')
    } finally {
      setBusy(null)
    }
  }

  // ── تفضيلات الفئات ──────────────────────────────────────────
  const toggleCategory = async (key: keyof PrefsResponse['categories'], next: boolean) => {
    if (!prefs) return
    // التسويق: بوابة موافقة صريحة قبل التشغيل
    if (key === 'marketing' && next && !marketingConfirm) {
      setMarketingConfirm(true)
      return
    }
    setMarketingConfirm(false)
    setSavingCat(key)
    const prev = prefs
    setPrefs({
      ...prefs,
      categories: { ...prefs.categories, [key]: next },
    })
    try {
      const res = await apiFetch('/api/rise/user/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify({ categories: { [key]: next } }),
      })
      if (!res.ok) {
        setPrefs(prev)
        toast.error('تعذّر حفظ التفضيل')
      }
    } catch {
      setPrefs(prev)
      toast.error('تعذّر الاتصال بالخادم')
    } finally {
      setSavingCat(null)
    }
  }

  const confirmMarketing = async () => {
    setMarketingConfirm(false)
    await toggleCategory('marketing', true)
  }

  // ── إبطال جهاز (بالمعرّف من القائمة) ────────────────────────
  const revokeDevice = async (device: DeviceRow) => {
    const res = await apiFetch('/api/rise/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ id: device.id }),
    }).catch(() => null)
    if (!res || !res.ok) {
      toast.error('تعذّر إزالة الجهاز — أعد المحاولة')
      return
    }
    // لو يبدو أنه جهازنا الحالي (نفس التسمية التلقائية): نفك الاشتراك محليًا أيضًا
    if (device.label === deviceLabel()) {
      await disablePush().catch(() => null)
    }
    toast.success('أُزيل الجهاز من قائمة الإرسال')
    load()
  }

  // ── العرض ───────────────────────────────────────────────────
  const activeDevices = devices.filter((d) => d.active)
  const thisDeviceActive =
    !!status?.subscribed && activeDevices.some((d) => d.label === deviceLabel())

  const channelBadge = !status?.supported
    ? { label: 'غير مدعومة', cls: 'bg-muted text-muted-foreground' }
    : status.permission === 'denied'
      ? { label: 'محظورة من المتصفح', cls: 'bg-destructive/10 text-destructive' }
      : thisDeviceActive
        ? { label: 'مفعّلة لهذا الجهاز ✓', cls: 'bg-emerald-accent/10 text-emerald-accent' }
        : status.permission === 'granted'
          ? { label: 'الصلاحية ممنوحة', cls: 'bg-gold/10 text-gold' }
          : { label: 'غير مفعّلة', cls: 'bg-gold/10 text-gold' }

  return (
    <SectionCard icon={Smartphone} well="iw-violet" title="إشعارات الجهاز (Push)" desc="تصل إشعاراتك المهمة لجهازك حتى والموقع مغلق">
      {/* حالة القناة + أزرار التحكم */}
      <div className="p-3.5 rounded-xl bg-violet-accent/[0.06] border border-violet-accent/20 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="icon-well h-8 w-8 iw-violet">
              <MonitorSmartphone className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">قناة Push لهذا المتصفح</p>
              <p className="text-[11px] text-muted-foreground">
                {activeDevices.length > 0
                  ? `${activeDevices.length} ${activeDevices.length === 1 ? 'جهاز مسجل' : 'أجهزة مسجلة'} ل حسابك`
                  : 'لا أجهزة مسجلة بعد'}
              </p>
            </div>
          </div>
          <span className={cn('pill text-[10px] shrink-0', channelBadge.cls)}>{channelBadge.label}</span>
        </div>

        {!status?.serverConfigured && !loading && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-gold" />
            خدمة Push غير مهيأة على الخادم حاليًا — مركز الإشعارات داخل الموقع يعمل طبيعيًا
          </p>
        )}

        {status?.permission === 'denied' && (
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            الإشعارات محظورة من المتصفح: افتح قائمة الموقع بجوار شريط العنوان ← الإشعارات ← السماح، ثم أعد المحاولة
          </p>
        )}

        <div className="flex gap-2">
          {thisDeviceActive ? (
            <Button
              size="sm"
              onClick={handleDisable}
              disabled={busy === 'disable'}
              className="flex-1 h-8 text-xs rounded-lg border border-border bg-card hover:bg-secondary"
            >
              {busy === 'disable' ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5 me-1.5" />}
              إيقاف لهذا الجهاز
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={busy === 'enable' || !status?.supported || !status?.serverConfigured}
              className="flex-1 h-8 text-xs rounded-lg bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
            >
              {busy === 'enable' ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5 me-1.5" />}
              تفعيل لهذا الجهاز
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={busy === 'test' || loading}
            className="flex-1 h-8 text-xs rounded-lg border-border bg-card hover:bg-secondary"
          >
            {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 me-1.5" />}
            إشعار تجريبي
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground/70">
          إيقاف الجهاز يمنع قناة Push فقط — إشعاراتك داخل الموقع تستمر كما هي
        </p>
      </div>

      {/* فئات الإرسال (تفضيلات على الخادم) */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          ما الذي يصل إلى جهازك
        </p>
        <div className="space-y-0.5">
          {CATEGORY_META.map((cat) => {
            const Icon = cat.icon
            const checked = prefs ? prefs.categories[cat.key] : cat.key !== 'community' && cat.key !== 'marketing'
            return (
              <div
                key={cat.key}
                className="flex items-center justify-between py-2 px-2 rounded-xl hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-muted/50">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-[13px] font-medium block">{cat.label}</span>
                    <span className="text-[10px] text-muted-foreground">{cat.desc}</span>
                  </div>
                </div>
                <Switch
                  checked={!!checked}
                  onCheckedChange={(v) => toggleCategory(cat.key, v)}
                  disabled={savingCat === cat.key || loading}
                />
              </div>
            )
          })}
        </div>

        {/* بوابة موافقة التسويق الصريحة */}
        {marketingConfirm && (
          <div className="mt-2 p-3 rounded-xl bg-gold/[0.06] border border-gold/25 space-y-2">
            <p className="text-xs leading-relaxed">
              بالسماح برسائل أوج أنت توافق على استلام <span className="font-semibold">عروض وأخبار المنتج</span> على جهازك.
              إشعارات حسابك المهمة والأمان تبقى دائمًا بمعزل عن هذا الخيار، ويمكنك إيقافه في أي وقت من هنا.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmMarketing} className="h-7 text-xs rounded-lg bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90">
                أوافق على الرسائل
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMarketingConfirm(false)} className="h-7 text-xs rounded-lg border-border bg-card hover:bg-secondary">
                إلغاء
              </Button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/70 mt-2 px-1">
          تُحفظ على الخادم وتُطبق لحظة الإرسال — لا تُرسل رسائل مكررة لنفس الحدث، وبحد أقصى حماية من الإغراق
        </p>
      </div>

      {/* الأجهزة المسجلة */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          الأجهزة المسجلة ({activeDevices.length})
        </p>
        {loading ? (
          <div className="py-3 text-center text-xs text-muted-foreground">جارٍ التحميل…</div>
        ) : devices.length === 0 ? (
          <p className="text-[11px] text-muted-foreground px-2 py-2">
            لم تُسجل أي أجهزة بعد — فعّل القناة أعلاه من كل متصفح تريد استلام الإشعارات فيه
          </p>
        ) : (
          <div className="space-y-1.5">
            {devices.map((d) => (
              <div
                key={d.id}
                className={cn(
                  'flex items-center justify-between gap-2 py-2 px-2.5 rounded-xl border',
                  d.active ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60',
                )}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{d.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate num" dir="ltr">
                    {d.origin}
                    {d.lastPushAt ? ` · آخر إرسال ${new Date(d.lastPushAt).toLocaleDateString('ar-EG')}` : ''}
                    {!d.active && d.revokedReason === 'expired' ? ' · منتهي' : ''}
                    {!d.active && d.revokedReason === 'stale' ? ' · مهجور' : ''}
                    {!d.active && d.revokedReason === 'user' ? ' · أُزال' : ''}
                  </p>
                </div>
                {d.active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revokeDevice(d)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    title="إزالة الجهاز"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70 mt-1.5 px-1">
          كل متصفح يُسجل بجهاز مستقل — الأجهزة غير النشطة منذ 30 يومًا تُنظف تلقائيًا
        </p>
      </div>
    </SectionCard>
  )
}
