'use client'

// ============================================================
// admin-ads-tab.tsx — «الإعلانات» (المرحلة 11 — استكمال وحدة Ads)
//
// • البوابة العالمية (تشغيل/إيقاف كل الإعلانات فورًا) + معرف
//   ناشر AdSense + أرقام slots المواضع الثلاثة (home/community/
//   tasks — فراغ = إعلان البيت بدل الوحدة).
// • الإعلانات المباشرة (Direct Ads): إنشاء/تعديل/حذف بنافذة
//   إدخال (العنوان/الوصف/CTA/الرابط/الموضع/النافذة الزمنية/
//   الأولوية/الحالة) — الفلترة تجري على الخادم في مسار العرض.
// كل إجراء عبر /api/rise/admin/ads (requireAdmin + logAudit).
// ملاحظة الانتشار: كاش getAdsConfig 10 دقائق — القيمة قد تتأخر
// قليلًا على نسخ Lambda الأخرى (موضح للمستخدم بعد الحفظ).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  Megaphone,
  RefreshCw,
  Loader2,
  Save,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
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
import { useRiseStore } from '@/store/app-store'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'

interface DirectAd {
  id: string
  title: string
  description?: string
  cta?: string
  href?: string
  image?: string
  placement: string
  startAt?: string | null
  endAt?: string | null
  priority?: number
  active?: boolean
}

interface AdsInfo {
  enabled: boolean
  adsenseClientId: string
  slots: { home: string; community: string; tasks: string }
  directAds: DirectAd[]
  placements: Array<{ id: string; labelAr: string }>
}

const PLACEMENT_LABEL: Record<string, string> = {
  home: 'الرئيسية',
  community: 'المجتمع',
  tasks: 'المهام',
  all: 'كل المواضع',
}

const emptyAd = (): DirectAd => ({
  id: '',
  title: '',
  description: '',
  cta: 'اعرف أكثر',
  href: '',
  image: '',
  placement: 'home',
  startAt: '',
  endAt: '',
  priority: 0,
  active: true,
})

export function AdminAdsTab() {
  const { auth } = useRiseStore()
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [clientId, setClientId] = useState('')
  const [slots, setSlots] = useState({ home: '', community: '', tasks: '' })
  const [directAds, setDirectAds] = useState<DirectAd[]>([])
  const [saving, setSaving] = useState(false)

  // نافذة الإعلان المباشر
  const [editing, setEditing] = useState<DirectAd | null>(null)
  const [adBusy, setAdBusy] = useState(false)

  const load = useCallback(async () => {
    if (!auth?.isAuthenticated) return
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/ads')
      if (res.ok) {
        const data: AdsInfo = await res.json()
        setEnabled(!!data.enabled)
        setClientId(data.adsenseClientId ?? '')
        setSlots({
          home: data.slots?.home ?? '',
          community: data.slots?.community ?? '',
          tasks: data.slots?.tasks ?? '',
        })
        setDirectAds(Array.isArray(data.directAds) ? data.directAds : [])
      } else {
        toast.error('فشل تحميل إعدادات الإعلانات')
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

  const saveSettings = async () => {
    if (clientId && !/^ca-pub-\d{6,20}$/.test(clientId.trim())) {
      toast.error('معرف الناشر بصيغة ca-pub- ثم أرقام')
      return
    }
    for (const [placement, value] of Object.entries(slots)) {
      if (value && !/^\d{6,20}$/.test(value.trim())) {
        toast.error(`رقم slot «${PLACEMENT_LABEL[placement]}» أرقام فقط (أو اتركه فارغًا)`)
        return
      }
    }
    setSaving(true)
    try {
      const res = await apiPost('/api/rise/admin/ads', {
        action: 'set',
        enabled,
        adsenseClientId: clientId.trim(),
        slots: {
          home: slots.home.trim(),
          community: slots.community.trim(),
          tasks: slots.tasks.trim(),
        },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'فشل حفظ الإعدادات')
        return
      }
      toast.success(body.message || 'تم الحفظ')
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setSaving(false)
    }
  }

  const saveAd = async () => {
    if (!editing) return
    if (!editing.id.trim() || !/^[a-z0-9-]{2,40}$/.test(editing.id.trim())) {
      toast.error('معرّف الإعلان: أحرف صغيرة وأرقام وشرطات (2-40)')
      return
    }
    if (!editing.title.trim()) {
      toast.error('عنوان الإعلان مطلوب')
      return
    }
    if (editing.href && !/^https?:\/\/.+/.test(editing.href.trim())) {
      toast.error('الرابط يجب أن يبدأ بـ http(s)://')
      return
    }
    setAdBusy(true)
    try {
      const payload: DirectAd = {
        ...editing,
        id: editing.id.trim(),
        title: editing.title.trim(),
        description: editing.description?.trim() || undefined,
        cta: editing.cta?.trim() || undefined,
        href: editing.href?.trim() || undefined,
        image: editing.image?.trim() || undefined,
        placement: editing.placement,
        startAt: editing.startAt || null,
        endAt: editing.endAt || null,
        priority: Number(editing.priority) || 0,
        active: editing.active !== false,
      }
      const res = await apiPost('/api/rise/admin/ads', { action: 'direct-ad-save', ad: payload })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'فشل حفظ الإعلان')
        return
      }
      toast.success(body.message || 'تم الحفظ')
      setEditing(null)
      load()
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setAdBusy(false)
    }
  }

  const deleteAd = async (id: string) => {
    try {
      const res = await apiPost('/api/rise/admin/ads', { action: 'direct-ad-delete', id })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'فشل حذف الإعلان')
        return
      }
      toast.success(body.message || 'تم الحذف')
      setDirectAds((prev) => prev.filter((a) => a.id !== id))
    } catch {
      toast.error('فشل الاتصال بالخادم')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pt-4">
      {/* ── ترويسة ── */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-lime" />
          إدارة الإعلانات
        </h3>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </Button>
      </div>

      {/* ── الإعدادات العامة ── */}
      <div className="rounded-xl border border-border/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">الإعلانات تعمل (Free فقط يراها)</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              الإيقاف يوقف كل الوحدات وإعلانات البيت فورًا لأي مستخدم جديد بعد ≤10 دقائق (كاش الخادم).
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ads-client" className="text-xs">معرف ناشر AdSense</Label>
          <Input
            id="ads-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="ca-pub-0000000000000000"
            className="h-8 text-xs font-mono"
            dir="ltr"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(['home', 'community', 'tasks'] as const).map((placement) => (
            <div key={placement} className="space-y-1.5">
              <Label htmlFor={`slot-${placement}`} className="text-xs">
                Slot «{PLACEMENT_LABEL[placement]}»
              </Label>
              <Input
                id={`slot-${placement}`}
                value={slots[placement]}
                onChange={(e) => setSlots((prev) => ({ ...prev, [placement]: e.target.value }))}
                placeholder="رقم الوحدة (أو فراغ = إعلان البيت)"
                className="h-8 text-xs font-mono"
                dir="ltr"
                inputMode="numeric"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button size="sm" disabled={saving} onClick={saveSettings} className="gap-1.5 h-8">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            حفظ الإعدادات
          </Button>
        </div>
      </div>

      {/* ── الإعلانات المباشرة ── */}
      <div className="rounded-xl border border-border/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">الإعلانات المباشرة (Direct Ads)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              للمعلنين المباشرين لاحقًا — تُفلتر على الخادم (حالة + نافذة زمنية + أولوية).
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing(emptyAd())} className="gap-1 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" />
            إعلان جديد
          </Button>
        </div>

        {directAds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
            لا إعلانات مباشرة — تُعرض بطاقة البيت «أوج بلس» في المواضع النشطة.
          </div>
        ) : (
          <div className="space-y-2">
            {directAds.map((ad) => (
              <div key={ad.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {ad.title}
                    <span className="text-[10px] font-normal text-muted-foreground"> · {PLACEMENT_LABEL[ad.placement] ?? ad.placement}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    <span className="font-mono">{ad.id}</span>
                    {ad.href ? <span dir="ltr"> · {ad.href}</span> : null}
                    {ad.startAt || ad.endAt ? ` · ${ad.startAt || '…'} ← ${ad.endAt || '…'}` : ''}
                    {` · أولوية ${ad.priority ?? 0}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-bold ${ad.active === false ? 'text-muted-foreground' : 'text-lime'}`}>
                    {ad.active === false ? 'متوقف' : 'نشط'}
                  </span>
                  {ad.href && (
                    <a
                      href={ad.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditing({ ...ad })}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => deleteAd(ad.id)}>
                    <Trash2 className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── نافذة إنشاء/تعديل إعلان مباشر ── */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editing && directAds.some((a) => a.id === editing.id) ? 'تعديل إعلان مباشر' : 'إعلان مباشر جديد'}
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label className="text-xs">المعرّف (فريد)</Label>
                <Input
                  value={editing.id}
                  onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                  placeholder="acme-ramadan"
                  className="h-8 text-xs font-mono"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label className="text-xs">الموضع</Label>
                <Select
                  value={editing.placement}
                  onValueChange={(v) => setEditing({ ...editing, placement: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['home', 'community', 'tasks', 'all'].map((p) => (
                      <SelectItem key={p} value={p}>{PLACEMENT_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">العنوان</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="h-8 text-xs"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">الوصف</Label>
                <Input
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="h-8 text-xs"
                  maxLength={160}
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label className="text-xs">نص الزر (CTA)</Label>
                <Input
                  value={editing.cta ?? ''}
                  onChange={(e) => setEditing({ ...editing, cta: e.target.value })}
                  className="h-8 text-xs"
                  maxLength={30}
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label className="text-xs">الأولوية (أعلى = أولًا)</Label>
                <Input
                  type="number"
                  value={editing.priority ?? 0}
                  onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) || 0 })}
                  className="h-8 text-xs"
                  min={0}
                  max={1000}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">رابط الهدف</Label>
                <Input
                  value={editing.href ?? ''}
                  onChange={(e) => setEditing({ ...editing, href: e.target.value })}
                  placeholder="https://example.com/offer"
                  className="h-8 text-xs"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">رابط صورة (اختياري)</Label>
                <Input
                  value={editing.image ?? ''}
                  onChange={(e) => setEditing({ ...editing, image: e.target.value })}
                  placeholder="https://example.com/banner.png"
                  className="h-8 text-xs"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label className="text-xs">يبدأ من (اختياري)</Label>
                <Input
                  type="date"
                  value={editing.startAt ?? ''}
                  onChange={(e) => setEditing({ ...editing, startAt: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label className="text-xs">ينتهي في (اختياري)</Label>
                <Input
                  type="date"
                  value={editing.endAt ?? ''}
                  onChange={(e) => setEditing({ ...editing, endAt: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center justify-between col-span-2 rounded-lg border border-border/50 px-3 py-2">
                <span className="text-xs">نشط (يظهر للمستخدمين)</span>
                <Switch
                  checked={editing.active !== false}
                  onCheckedChange={(checked) => setEditing({ ...editing, active: checked })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">إلغاء</Button>
            </DialogClose>
            <Button size="sm" disabled={adBusy} onClick={saveAd} className="gap-1.5">
              {adBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              حفظ الإعلان
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
