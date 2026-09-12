'use client'

// ============================================================
// settings.tsx — وحدة «الإعدادات»
//
// مركز التحكم الشخصي: الملف والأفاتار، المظهر، الإشعارات
// والتذكيرات، الأصوات، الأهداف اليومية، البيانات والخصوصية،
// والاشتراك — مع منطقة خطر للحذف النهائي. كل قسم بطاقة
// مستقلة (SectionCard) والأقسام الثقيلة مُستخرجة لملفات مشتركة
// (SubscriptionSection / PushNotificationsSection).
//
// البنية الداخلية:
//   1) الأنواع + الإعدادات الافتراضية + أدوات حجم التخزين
//   2) الحالة المحلية: إعدادات user-storage (deep-merge)، أفاتار
//      من السيرفر، إحصاءات المستخدم، صلاحية إشعارات المتصفح
//   3) المعالجات: الاسم/الأفاتار، تصدير/استيراد JSON، تغيير كلمة
//      المرور، خروج شامل، حذف الحساب، حذف كل البيانات
//   4) التخطيط: بطاقة الملف بعرض كامل → أعمدة Masonry للأقسام
//      → منطقة الخطر → تذييل الإصدار
//
// مبادئ UX: الإعدادات تُحفظ فوراً بلا زر حفظ، والإجراءات المدمّرة
// تتطلب إعادة إثبات الهوية (كلمة مرور + كلمة تأكيد نصية).
// ============================================================

import { getUserStorage, setUserStorage, clearUserStorage } from '@/lib/user-storage'
import { clearSecureUserData } from '@/lib/secure-offline-db'


import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Palette,
  Bell,
  Sun,
  Moon,
  Monitor,
  Globe,
  Clock,
  Target,
  Droplets,
  BookOpen,
  Dumbbell,
  Download,
  Upload,
  Loader2,
  Trash2,
  Zap,
  Shield,
  Info,
  Sunrise,
  AlertTriangle,
  Pencil,
  Check,
  X,
  HardDrive,
  Heart,
  Flame,
  Trophy,
  Star,
  Volume2,
  CheckCircle2,
  BellRing,
  MessageSquare,
  KeyRound,
  LogOut,
  UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useTheme } from 'next-themes'
import { useRiseStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { AVATARS, type AvatarItem } from '@/lib/avatars'
import { getToday } from '@/lib/rise-utils'
import { RiseIcon } from '@/components/rise/icons'
import { BellToggle } from '@/components/rise/kit-v2'
import { SectionCard } from '@/components/rise/settings-section-card'
import { SubscriptionSection } from '@/components/rise/subscription-section'
import { PushNotificationsSection } from '@/components/rise/push-notifications-section'
import {
  getBrowserPermissionState,
  requestBrowserPermission,
  showBrowserNotification,
  type BrowserPermissionState,
} from '@/lib/notification-prefs'

/* ────────────── Types ────────────── */

interface SettingsData {
  userName: string
  wakeUpTime: string
  sleepTime: string
  dailyWaterGoal: number
  dailyReadingGoal: number
  weeklyExerciseGoal: number
  notifications: {
    morning: boolean
    sleep: boolean
    habits: boolean
    taskDone: boolean
    habitDone: boolean
    focusDone: boolean
  }
  sounds: boolean
  soundVolume: number
}

const STORAGE_KEY = 'rise-settings'
const NAME_KEY = 'rise-user-name'

const defaultSettings: SettingsData = {
  userName: 'مستخدم',
  wakeUpTime: '06:00',
  sleepTime: '22:00',
  dailyWaterGoal: 8,
  dailyReadingGoal: 30,
  weeklyExerciseGoal: 5,
  notifications: {
    morning: true,
    sleep: true,
    habits: true,
    taskDone: true,
    habitDone: true,
    focusDone: true,
  },
  sounds: true,
  soundVolume: 0.5,
}

/* ────────────── Helpers ────────────── */

function getLocalStorageSize(): { used: number; total: number } {
  let total = 0
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage.getItem(key)?.length || 0
    }
  }
  return { used: total, total: 5 * 1024 * 1024 } // 5MB typical limit
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/* ────────────── Section shell ────────────── */
// SectionCard انتقل إلى settings-section-card.tsx (مشترك مع قسم
// الاشتراك — المرحلة 04) والاستيراد في الأعلى.

/* ────────────── Component ────────────── */

export default function Settings() {
  // ── القسم: الحالة المحلية والجلب الأولي (أفاتار/إحصاءات/صلاحية الإشعارات) ──
  const { theme, setTheme } = useTheme()
  const { auth } = useRiseStore()
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return getUserStorage('rise-user-avatar') || ''
  })

  // FIX: Load avatar from server (survives cookie/cache clearing)
  useEffect(() => {
    apiFetch('/api/auth/session')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user?.avatar) {
          setSelectedAvatar(data.user.avatar)
          setUserStorage('rise-user-avatar', data.user.avatar)
        }
      })
      .catch(() => {})
  }, [])
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [settings, setSettings] = useState<SettingsData>(() => {
    if (typeof window === 'undefined') return defaultSettings
    try {
      const stored = getUserStorage(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          ...defaultSettings,
          ...parsed,
          // Deep-merge notifications so newly-added pref keys always exist
          notifications: { ...defaultSettings.notifications, ...(parsed?.notifications || {}) },
        }
      }
    } catch { /* ignore */ }
    return defaultSettings
  })
  // أولوية اسم العرض: مخزن الجلسة (auth) أولاً ثم الاسم المحلي fallback
  const [editName, setEditName] = useState(() => {
    return auth?.userName && auth.userName !== 'مستخدم' ? auth.userName : settings.userName
  })
  const displayName = auth?.userName && auth.userName !== 'مستخدم' ? auth.userName : settings.userName
  const [storageSize, setStorageSize] = useState({ used: 0, total: 10 * 1024 * 1024, percent: 0, counts: {} as Record<string, number> })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [userStats, setUserStats] = useState<{ level: number; xp: number; xpToNext: number; streak: number } | null>(null)

  // Browser notification permission state (live)
  const [permission, setPermission] = useState<BrowserPermissionState>('unsupported')
  // نستمع لعودة التركيز للنافذة: المستخدم قد يغيّر صلاحية الإشعارات من
  // إعدادات المتصفح خارج الصفحة، فنُحدّث الشارة فور عودته
  useEffect(() => {
    setPermission(getBrowserPermissionState())
    const onFocus = () => setPermission(getBrowserPermissionState())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    apiFetch(`/api/rise/dashboard`)
      .then(r => r.json())
      .then(data => {
        if (data.user) setUserStats(data.user)
      })
    // Fetch real server storage
    apiFetch('/api/rise/storage')
      .then(r => r.json())
      .then(data => {
        if (data.limit) {
          setStorageSize({ used: data.used || 0, total: data.limit, percent: data.percent || 0, counts: data.counts || {} })
        }
      })
      .catch(() => {})
  }, [])

  // حفظ تلقائي: كل تغيير في الإعدادات يُخزَّن فوراً — لا يوجد زر «حفظ»
  useEffect(() => {
    setUserStorage(STORAGE_KEY, JSON.stringify(settings))
    setUserStorage(NAME_KEY, settings.userName)
  }, [settings])

  // ── القسم: معالجات الملف الشخصي والبيانات ──────────────
  const updateNotification = (key: string, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
  }

  const saveName = async () => {
    const newName = editName.trim()
    if (!newName) return
    setSettings((prev) => ({ ...prev, userName: newName }))
    setIsEditingName(false)
    toast.success('تم تحديث الاسم')

    try {
      await apiPost('/api/rise/user/name', { name: newName })
      // حدث مخصص: يبثّ الاسم الجديد للقائمة الجانبية وبقية المكونات فوراً
      window.dispatchEvent(new CustomEvent('rise:user-updated'))
    } catch { /* silent */ }
  }

  const handleSelectAvatar = async (avatar: AvatarItem) => {
    setSelectedAvatar(avatar.id)
    setUserStorage('rise-user-avatar', avatar.id)
    // نفس النمط: نبثّ حدث تغيّر الأفاتار لكل المكونات المستمِعة
    window.dispatchEvent(new CustomEvent('rise:avatar-changed'))
    setAvatarPickerOpen(false)
    toast.success(`تم اختيار ${avatar.name}`)
    try {
      await apiPost('/api/rise/user/avatar', { avatar: avatar.id })
    } catch { /* silent */ }
  }

  const handleExportData = () => {
    toast.loading('جاري تصدير البيانات...', { id: 'export' })
    apiFetch('/api/rise/export')
      .then(async (res) => {
        // ── المرحلة 04: 402 LIMIT_REACHED → upgrade prompt ──
        if (res.status === 402) {
          const body = await res.json().catch(() => ({}))
          toast.dismiss('export')
          toast.error(body.error || 'وصلت للحد اليومي من التصدير', {
            id: 'export-limit',
            duration: 8000,
            action: {
              label: 'ترقية الخطة',
              onClick: () => window.dispatchEvent(new CustomEvent('awj:open-upgrade')),
            },
          })
          return null
        }
        if (!res.ok) throw new Error('فشل التصدير')
        return res.blob()
      })
      .then((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `riseos-export-${getToday()}.json`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('تم تصدير البيانات بنجاح', { id: 'export' })
      })
      .catch(() => {
        toast.error('فشل في تصدير البيانات', { id: 'export' })
      })
  }

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        Object.entries(data).forEach(([key, value]) => {
          setUserStorage(key, JSON.stringify(value))
        })
        toast.success('تم استيراد البيانات بنجاح')
        const ls = getLocalStorageSize()
        setStorageSize({ used: ls.used, total: ls.total, percent: Math.round((ls.used / ls.total) * 100), counts: {} })
      } catch {
        toast.error('فشل في قراءة الملف')
      }
    }
    reader.readAsText(file)
    // تصفير حقل الملف حتى يمكن اختيار الملف نفسه مرة أخرى لاحقاً
    fileInputRef.current!.value = ''
  }

  const [deletingAll, setDeletingAll] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  // ── المرحلة 03: الحساب والأمان ──
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwOk, setPwOk] = useState(false)
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('')
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('')
  const [deleteAccountError, setDeleteAccountError] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  /** بريد المستخدم الحالي من localStorage (نفس مصدر getAuthHeaders) */
  function getUserEmail(): string {
    try {
      const info = localStorage.getItem('rise-user-info')
      if (info) return JSON.parse(info).email || ''
    } catch { /* ignore */ }
    return ''
  }

  // DELETE-ALL FIX: كان بينادي apiDelete بدون جسم إطلاقاً بينما السيرفر يطلب
  // إعادة إثبات الهوية {email, password, confirmDelete} → 400 دائماً
  // ("الحذف مش شغال"). دلوقتي بنبعت بيانات إعادة التأكيد + رسالة خطأ السيرفر.
  const handleResetData = async () => {
    setDeleteError('')
    const email = getUserEmail()
    if (!email || !deletePassword) {
      setDeleteError('اكتب كلمة المرور للمتابعة')
      return
    }
    setDeletingAll(true)
    try {
      const res = await apiFetch('/api/rise/delete-all', {
        method: 'DELETE',
        body: JSON.stringify({ email, password: deletePassword, confirmDelete: true }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeleteError(result?.error || 'فشل حذف البيانات من الخادم')
        toast.error(result?.error || 'فشل حذف البيانات من الخادم')
        return
      }

      // معرّف المستخدم من مفتاح legacy عام (rise-user-info) — خارج نطاق
      // user-storage المعزول، لذا يُقرأ بـ localStorage مباشرة
      const currentUserId = (() => { try { return JSON.parse(localStorage.getItem('rise-user-info') || '{}').id || '' } catch { return '' } })()
      if (currentUserId) {
        clearUserStorage(currentUserId)
        void clearSecureUserData(currentUserId)
      }
      // Remove only legacy global application data. Never delete another
      // user's encrypted queue/cache or migrate unknown ownership.
      for (const key of ['rise-auth']) {
        try { localStorage.removeItem(key) } catch { /* ignore */ }
      }
      setSettings(defaultSettings)
      setResetDialogOpen(false)
      setConfirmText('')
      setDeletePassword('')
      setStorageSize({ used: 0, total: 10 * 1024 * 1024, percent: 0, counts: {} })

      const msg = result.deleted >= 0
        ? `تم حذف ${result.deleted} سجل من قاعدة البيانات`
        : 'تم حذف جميع البيانات من قاعدة البيانات'
      toast.success(msg)
    } catch {
      setDeleteError('فشل الاتصال بالخادم')
      toast.error('فشل حذف البيانات')
    } finally {
      setDeletingAll(false)
    }
  }

  /* ── المرحلة 03: تغيير كلمة المرور (مع إعادة إثبات الهوية) ── */
  const handleChangePassword = async () => {
    setPwError('')
    setPwOk(false)
    if (pwNew.length < 8) {
      setPwError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (pwNew !== pwConfirm) {
      setPwError('كلمتا المرور الجديدتان غير متطابقتين')
      return
    }
    if (!pwCurrent) {
      setPwError('اكتب كلمة المرور الحالية للمتابعة')
      return
    }
    setPwLoading(true)
    try {
      const res = await apiFetch('/api/auth/update-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPwError(result?.error || 'فشل تغيير كلمة المرور')
        return
      }
      // نجاح: السيرفر أبطل كل الجلسات → إعادة تسجيل الدخول إلزامية.
      setPwOk(true)
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
      toast.success('تم تغيير كلمة المرور — سجّل الدخول من جديد')
      setTimeout(() => { window.location.href = '/app' }, 1800)
    } catch {
      setPwError('فشل الاتصال بالخادم')
    } finally {
      setPwLoading(false)
    }
  }

  /* ── المرحلة 03: تسجيل الخروج من جميع الأجهزة ── */
  const handleLogoutAll = async () => {
    setLogoutAllLoading(true)
    try {
      const res = await apiFetch('/api/auth/logout-all', { method: 'POST' })
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        toast.error(result?.error || 'تعذر تسجيل الخروج من الأجهزة')
        return
      }
      toast.success('تم تسجيل الخروج من جميع الأجهزة')
      setTimeout(() => { window.location.href = '/app' }, 900)
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setLogoutAllLoading(false)
    }
  }

  /* ── المرحلة 03: حذف الحساب نهائيًا (الحساب نفسه لا البيانات فقط) ── */
  const handleDeleteAccount = async () => {
    setDeleteAccountError('')
    const email = getUserEmail()
    if (!email || !deleteAccountPassword) {
      setDeleteAccountError('اكتب كلمة المرور للمتابعة')
      return
    }
    setDeletingAccount(true)
    try {
      const res = await apiFetch('/api/auth/delete-account', {
        method: 'DELETE',
        body: JSON.stringify({ email, password: deleteAccountPassword, confirmDelete: true }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeleteAccountError(result?.error || 'فشل حذف الحساب')
        return
      }
      // الحساب حُذف: نظّف أي أثر محلي ثم عُد للصفحة الرئيسية.
      try { localStorage.removeItem('rise-user-info') } catch { /* ignore */ }
      try { localStorage.removeItem('rise-user-avatar') } catch { /* ignore */ }
      toast.success('تم حذف حسابك نهائيًا. نتمنى رؤيتك مرة أخرى.')
      setTimeout(() => { window.location.href = '/' }, 1200)
    } catch {
      setDeleteAccountError('فشل الاتصال بالخادم')
    } finally {
      setDeletingAccount(false)
    }
  }

  /* ── Browser notifications controls ── */
  const handleEnableNotifications = async () => {
    const result = await requestBrowserPermission()
    setPermission(result)
    if (result === 'granted') {
      toast.success('تم تفعيل إشعارات المتصفح')
      showBrowserNotification('إشعارات أوج مفعّلة 🎉', {
        body: 'هكذا ستوصلك التنبيهات والتذكيرات حتى لو كان المتصفح بالخلفية',
        force: true,
        tag: 'rise-welcome',
      })
    } else if (result === 'denied') {
      toast.error('الإشعارات محظورة', {
        description: 'اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح ثم أعد المحاولة',
      })
    }
  }

  const handleTestNotification = () => {
    playSound('notification')
    const ok = showBrowserNotification('🔔 إشعار تجريبي من أوج', {
      body: 'ممتاز! الإشعارات تعمل بشكل كامل الآن',
      force: true,
      tag: 'rise-test',
    })
    if (ok) {
      toast.success('وصلك الإشعار؟ هكذا ستظهر التذكيرات')
    } else {
      toast.error('لم يُرسل الإشعار', {
        description: permission === 'denied'
          ? 'الإشعارات محظورة من المتصفح — اسمح لها أولاً'
          : 'فعّل إشعارات المتصفح أولاً من الزر أعلاه',
      })
    }
  }

  const permissionMeta: Record<BrowserPermissionState, { label: string; className: string }> = {
    granted: { label: 'مفعّلة ✓', className: 'bg-emerald-accent/10 text-emerald-accent' },
    denied: { label: 'محظورة', className: 'bg-destructive/10 text-destructive' },
    default: { label: 'غير مفعّلة', className: 'bg-gold/10 text-gold' },
    unsupported: { label: 'غير مدعومة', className: 'bg-muted text-muted-foreground' },
  }

  // ── القسم: بيانات العرض الثابتة — الثيمات ومجموعات الإشعارات ──
  const themes = [
    {
      value: 'light',
      label: 'فاتح',
      icon: Sun,
      preview: (
        <div className="w-full h-12 rounded-lg bg-paper-soft border border-ink/15 shadow-sm flex items-center justify-center">
          <div className="flex gap-1">
            <div className="w-4 h-4 rounded bg-ink/15" />
            <div className="w-8 h-4 rounded bg-ink/10" />
          </div>
        </div>
      ),
    },
    {
      value: 'dark',
      label: 'داكن',
      icon: Moon,
      preview: (
        <div className="w-full h-12 rounded-lg bg-ink border border-paper-soft/15 shadow-sm flex items-center justify-center">
          <div className="flex gap-1">
            <div className="w-4 h-4 rounded bg-paper-soft/25" />
            <div className="w-8 h-4 rounded bg-paper-soft/15" />
          </div>
        </div>
      ),
    },
    {
      value: 'system',
      label: 'النظام',
      icon: Monitor,
      preview: (
        <div className="w-full h-12 rounded-lg overflow-hidden flex shadow-sm border border-border">
          <div className="w-1/2 bg-paper-soft flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded bg-ink/25" />
          </div>
          <div className="w-1/2 bg-ink flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded bg-paper-soft/40" />
          </div>
        </div>
      ),
    },
  ]

  /* Real toggle groups — each key is read live by the notification engine */
  const notifGroups = [
    {
      title: 'التذكيرات اليومية',
      items: [
        { key: 'morning', label: 'تذكير الاستيقاظ', desc: `يومياً الساعة ${settings.wakeUpTime}`, icon: Sunrise },
        { key: 'sleep', label: 'تذكير النوم', desc: `يومياً الساعة ${settings.sleepTime}`, icon: Moon },
        { key: 'habits', label: 'تذكيرات العادات', desc: 'حسب وقت كل عادة — تعمل من أي صفحة', icon: Bell },
      ],
    },
    {
      title: 'احتفالات الإنجاز',
      items: [
        { key: 'taskDone', label: 'إتمام المهام', desc: 'رسالة تحفيزية عند إتمام مهمة', icon: CheckCircle2 },
        { key: 'habitDone', label: 'إتمام العادات', desc: 'رسالة تحفيزية عند إتمام عادة', icon: Flame },
        { key: 'focusDone', label: 'جلسات التركيز والشغل', desc: 'عند إنهاء جلسة عمل عميق', icon: Target },
      ],
    },
  ]

  const storagePercent = storageSize.percent || Math.min(100, Math.round((storageSize.used / storageSize.total) * 100))

  // ── القسم: التخطيط — بطاقة الملف ثم أعمدة Masonry ثم منطقة الخطر ──
  return (
    <div className="space-y-4">
      {/* Profile — full width */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className=""
      >
        <div className="neo-card card-lift overflow-hidden relative">
          {/* subtle top accent */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-emerald-accent/60 via-gold/50 to-forest/60" />
          <div className="p-5">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              {/* Avatar — clickable to open picker */}
              <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
                <DialogTrigger asChild>
                  <motion.div
                    className="relative cursor-pointer shrink-0"
                    whileHover={{ scale: 1.05, rotate: -3 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <motion.div
                      className="absolute inset-[-4px] rounded-full bg-gradient-to-br from-emerald-accent via-forest to-gold"
                      animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.05, 1] }}
                      transition={{ type: 'tween', duration: 3, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                    />
                    <div className="relative w-20 h-20 rounded-full shadow-xl shadow-emerald-accent/25 overflow-hidden flex items-center justify-center">
                      {selectedAvatar && AVATARS.find(a => a.id === selectedAvatar) ? (
                        <div
                          className="w-full h-full flex items-center justify-center text-2xl"
                          style={AVATARS.find(a => a.id === selectedAvatar)!.style}
                        >
                          {AVATARS.find(a => a.id === selectedAvatar)!.svg}
                        </div>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-forest via-emerald-accent to-gold dark:via-emerald-accent dark:to-forest flex items-center justify-center text-3xl font-bold text-paper-soft">
                          {String(displayName || 'م').charAt(0)}
                        </div>
                      )}
                      <div className="absolute bottom-0 end-0 w-6 h-6 rounded-full bg-forest border-2 border-background flex items-center justify-center">
                        <Pencil className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </motion.div>
                </DialogTrigger>
                <DialogContent className="max-w-md" dir="rtl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-gold" />
                      اختر صورتك الرمزية
                    </DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto p-1">
                    {AVATARS.map((avatar) => (
                      <motion.button
                        key={avatar.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSelectAvatar(avatar)}
                        className={cn(
                          'relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all',
                          'hover:bg-muted/50',
                          selectedAvatar === avatar.id && 'ring-2 ring-forest bg-forest/5 dark:ring-lime dark:bg-lime/10'
                        )}
                      >
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-md"
                          style={avatar.style}
                        >
                          {avatar.svg}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate w-full text-center">{avatar.name}</span>
                        {selectedAvatar === avatar.id && (
                          <div className="absolute top-0.5 start-0.5 w-4 h-4 rounded-full bg-forest dark:bg-lime flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-paper-soft dark:text-ink" />
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex-1 space-y-3 w-full">
                {/* Name */}
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-sm font-semibold h-9 neo-input"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName()
                        if (e.key === 'Escape') { setIsEditingName(false); setEditName(displayName) }
                      }}
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={saveName}
                      className="p-1.5 rounded-lg bg-forest/10 text-forest hover:bg-forest/20 dark:text-lime dark:bg-lime/10 dark:hover:bg-lime/20 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { setIsEditingName(false); setEditName(displayName) }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">الاسم</Label>
                      <p className="text-base font-bold flex items-center gap-1.5">
                        {displayName}
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => { setEditName(displayName); setIsEditingName(true) }}
                          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-50 hover:opacity-100"
                          aria-label="تعديل الاسم"
                        >
                          <Pencil className="w-3 h-3" />
                        </motion.button>
                      </p>
                    </div>
                  </div>
                )}
                {/* Email */}
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">البريد</Label>
                  <p className="text-sm text-muted-foreground" dir="ltr">{auth?.userEmail || 'user@riseos.app'}</p>
                </div>
                {/* صلاحية الأدمن — تشخيص ذاتي للمالك بلا روابط خارجية */}
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">الصلاحية</Label>
                  <p className="text-sm">
                    {auth?.isAdmin
                      ? <span className="text-emerald-accent font-semibold">أدمن — لوحة الإدارة في القائمة الجانبية</span>
                      : <span className="text-muted-foreground">مستخدم عادي</span>}
                  </p>
                </div>
                {/* Stats Row */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="pill pill-success">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>المستوى <span className="num" dir="ltr">{userStats?.level ?? 1}</span></span>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="pill pill-lime">
                    <Star className="w-3.5 h-3.5" />
                    <span><span className="num" dir="ltr">{userStats?.xp ?? 0}</span> XP</span>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="pill bg-destructive/10 text-destructive">
                    <Flame className="w-3.5 h-3.5" />
                    <span><span className="num" dir="ltr">{userStats?.streak ?? 0}</span> يوم</span>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Appearance */}
      {/* Masonry: sections flow into balanced columns — no dead space on laptop */}
      <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
      {/* الخطة والاشتراك — المرحلة 04 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="break-inside-avoid mb-4"
      >
        <SubscriptionSection />
      </motion.div>
      {/* إشعارات الجهاز (Push) — المرحلة 06 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="break-inside-avoid mb-4"
      >
        <PushNotificationsSection />
      </motion.div>
      {/* الحساب والأمان — المرحلة 03 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="break-inside-avoid mb-4"
      >
        <SectionCard icon={Shield} well="iw-forest" title="الحساب والأمان" desc="كلمة المرور والجلسات وحذف الحساب">
          <div className="space-y-4">
            {/* تغيير كلمة المرور */}
            <div className="space-y-2.5">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                تغيير كلمة المرور
              </Label>
              {pwOk ? (
                <div className="rounded-xl bg-success/10 border border-success/25 px-4 py-3 text-sm text-success flex items-start gap-2" role="status">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>تم التغيير. جارٍ تحويلك لتسجيل الدخول من جديد…</span>
                </div>
              ) : (
                <>
                  <Input
                    type="password"
                    placeholder="كلمة المرور الحالية"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    className="h-11 rounded-xl neo-input"
                    dir="ltr"
                    autoComplete="current-password"
                  />
                  <Input
                    type="password"
                    placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    className="h-11 rounded-xl neo-input"
                    dir="ltr"
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <Input
                    type="password"
                    placeholder="تأكيد كلمة المرور الجديدة"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    className="h-11 rounded-xl neo-input"
                    dir="ltr"
                    autoComplete="new-password"
                    minLength={8}
                  />
                  {pwError && <p className="text-xs text-destructive font-medium">{pwError}</p>}
                  <Button
                    onClick={handleChangePassword}
                    disabled={pwLoading || !pwCurrent || pwNew.length < 8 || pwNew !== pwConfirm}
                    className="w-full h-10 rounded-xl bg-forest hover:bg-forest/90 text-white dark:bg-lime dark:text-ink dark:hover:bg-lime/90 text-sm font-bold press"
                  >
                    {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 me-1.5" />}
                    {pwLoading ? 'جاري التغيير…' : 'تغيير كلمة المرور'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    بعد التغيير تُبطل جميع جلساتك على كل الأجهزة حفاظًا على أمان حسابك.
                  </p>
                </>
              )}
            </div>

            <div className="h-[1px] bg-border/60" />

            {/* تسجيل الخروج من جميع الأجهزة */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-violet-accent/10">
                  <LogOut className="w-4 h-4 text-violet-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">الخروج من كل الأجهزة</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">إنهاء جلساتك على جميع المتصفحات والأجهزة</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogoutAll}
                disabled={logoutAllLoading}
                className="text-xs shrink-0 border-violet-accent/30 text-violet-accent hover:bg-violet-accent/10 hover:border-violet-accent/50"
              >
                {logoutAllLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'خروج شامل'}
              </Button>
            </div>

            <div className="h-[1px] bg-border/60" />

            {/* حذف الحساب نهائيًا */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <UserX className="w-4 h-4 text-destructive" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-destructive">حذف الحساب نهائيًا</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">الحساب نفسه مع جميع البيانات — لا رجعة</p>
                </div>
              </div>
              <Dialog
                open={deleteAccountOpen}
                onOpenChange={(open) => {
                  setDeleteAccountOpen(open)
                  if (!open) { setDeleteAccountPassword(''); setDeleteAccountConfirm(''); setDeleteAccountError('') }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
                  >
                    حذف الحساب
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      حذف الحساب نهائيًا
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <p className="text-sm text-muted-foreground">
                      سيُحذف حسابك بالكامل: البيانات والمهام والعادات والأهداف وسجل XP والملف الشخصي
                      ومستخدم المصادقة نفسه. لا يمكن التراجع عن هذا الإجراء إطلاقًا.
                      إن أردت البدء من جديد مع الاحتفاظ بالحساب، استخدم «حذف جميع البيانات» في منطقة الخطر بدلًا من هذا.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      اكتب <span className="font-bold text-destructive">حذف</span> ثم كلمة مرور حسابك
                      (<span dir="ltr" className="font-medium text-foreground">{getUserEmail() || '—'}</span>) للمتابعة:
                    </p>
                    <Input
                      placeholder="اكتب حذف هنا..."
                      value={deleteAccountConfirm}
                      onChange={(e) => setDeleteAccountConfirm(e.target.value)}
                      className="h-12 text-center text-lg font-mono rounded-xl neo-input"
                      dir="ltr"
                      autoFocus
                    />
                    <Input
                      type="password"
                      placeholder="كلمة المرور"
                      value={deleteAccountPassword}
                      onChange={(e) => setDeleteAccountPassword(e.target.value)}
                      className="h-12 rounded-xl neo-input"
                      dir="ltr"
                      autoComplete="current-password"
                    />
                    {deleteAccountError && (
                      <p className="text-xs text-destructive font-medium">{deleteAccountError}</p>
                    )}
                    <DialogFooter className="gap-2 mt-2">
                      <DialogClose asChild>
                        <Button variant="outline" className="text-sm">إلغاء</Button>
                      </DialogClose>
                      <Button
                        onClick={handleDeleteAccount}
                        className="bg-destructive hover:bg-destructive/90 text-white text-sm"
                        disabled={deleteAccountConfirm !== 'حذف' || !deleteAccountPassword || deletingAccount}
                      >
                        {deletingAccount ? (
                          <>
                            <Loader2 className="w-4 h-4 me-2 animate-spin" />
                            جاري حذف الحساب...
                          </>
                        ) : (
                          <>
                            <UserX className="w-4 h-4 me-2" />
                            حذف الحساب نهائيًا
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </SectionCard>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="break-inside-avoid mb-4"
      >
        <SectionCard icon={Palette} well="iw-violet" title="المظهر" desc="السمة واللغة">
          <div className="space-y-4">
            <Label className="text-sm font-medium">السمة</Label>
            <div className="grid grid-cols-3 gap-3">
              {themes.map((t) => {
                const Icon = t.icon
                const isActive = theme === t.value
                return (
                  <motion.button
                    key={t.value}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setTheme(t.value)}
                    className={cn(
                      'flex flex-col items-center gap-2.5 p-3 rounded-2xl border-2 transition-all',
                      isActive
                        ? 'border-forest bg-forest/5 shadow-lg shadow-forest/15 ring-2 ring-forest/20 dark:border-lime dark:bg-lime/10 dark:ring-lime/20'
                        : 'border-border bg-card hover:bg-secondary'
                    )}
                  >
                    {t.preview}
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-forest dark:text-lime' : 'text-muted-foreground')} />
                      <span className={cn('text-xs font-medium', isActive ? 'text-forest dark:text-lime' : 'text-muted-foreground')}>
                        {t.label}
                      </span>
                    </div>
                  </motion.button>
                )
              })}
            </div>

            <div className="h-px bg-border/60" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">اللغة</Label>
              </div>
              <Select defaultValue="ar" disabled>
                <SelectTrigger className="w-32 neo-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">عربي</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      </motion.div>

      {/* Notifications — everything notification-related lives here */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="break-inside-avoid mb-4"
      >
        <SectionCard icon={Bell} well="iw-amber" title="الإشعارات والتذكيرات" desc="تذكيرات حقيقية تعمل من أي صفحة">
          {/* Browser permission */}
          <div className="p-3.5 rounded-xl bg-gold/[0.06] border border-gold/20 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="icon-well h-8 w-8 iw-amber">
                  <BellRing className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">إشعارات المتصفح</p>
                  <p className="text-[11px] text-muted-foreground">توصلك حتى والموقع بالخلفية</p>
                </div>
              </div>
              <span className={cn('pill text-[10px] shrink-0', permissionMeta[permission].className)}>
                {permissionMeta[permission].label}
              </span>
            </div>
            <div className="flex gap-2">
              {permission !== 'granted' && permission !== 'unsupported' && (
                <Button
                  size="sm"
                  onClick={handleEnableNotifications}
                  className="flex-1 h-8 text-xs rounded-lg bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
                >
                  <BellRing className="w-3.5 h-3.5 me-1.5" />
                  تفعيل الإشعارات
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestNotification}
                disabled={permission === 'unsupported'}
                className="flex-1 h-8 text-xs rounded-lg border-border bg-card hover:bg-secondary"
              >
                <MessageSquare className="w-3.5 h-3.5 me-1.5" />
                إشعار تجريبي
              </Button>
            </div>
          </div>

          {/* Reminder times — these POWER the global reminder engine */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Sunrise className="w-3.5 h-3.5 text-gold" />
                وقت الاستيقاظ
              </Label>
              <Input
                type="time"
                dir="ltr"
                value={settings.wakeUpTime}
                onChange={(e) => setSettings((prev) => ({ ...prev, wakeUpTime: e.target.value }))}
                className="text-center h-10 text-sm font-medium rounded-xl neo-input num"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5 text-violet-accent" />
                وقت النوم
              </Label>
              <Input
                type="time"
                dir="ltr"
                value={settings.sleepTime}
                onChange={(e) => setSettings((prev) => ({ ...prev, sleepTime: e.target.value }))}
                className="text-center h-10 text-sm font-medium rounded-xl neo-input num"
              />
            </div>
          </div>

          {/* Toggle groups — now actually wired to the engine */}
          {notifGroups.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group.title}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isChecked = settings.notifications[item.key as keyof typeof settings.notifications]
                  return (
                    <div key={item.key} className="flex items-center justify-between py-2 px-2 rounded-xl hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-muted/50">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <span className="text-[13px] font-medium block">{item.label}</span>
                          <span className="text-[10px] text-muted-foreground num">{item.desc}</span>
                        </div>
                      </div>
                      <BellToggle enabled={!!isChecked} onToggle={(v) => updateNotification(item.key, v)} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 px-1">
            <Clock className="w-3 h-3" />
            تُطبق فوراً — تذكيرات العادات تُقرأ من صفحة العادات لكل عادة على حدة
          </p>
        </SectionCard>
      </motion.div>

      {/* Sounds */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="break-inside-avoid mb-4"
      >
        <SectionCard icon={Volume2} well="iw-blue" title="الأصوات" desc="مؤثرات تفاعلية للإنجازات">
          <div className="flex items-center justify-between py-1.5 px-1">
            <div>
              <span className="text-sm font-medium block">تأثيرات صوتية</span>
              <span className="text-[11px] text-muted-foreground">أصوات للمهام والعادات والإشعارات</span>
            </div>
            <Switch
              checked={settings.sounds}
              onCheckedChange={(v) => {
                setSettings((prev) => ({ ...prev, sounds: v }))
                if (v) playSound('success')
              }}
              className="data-[state=checked]:bg-forest dark:data-[state=checked]:bg-lime"
            />
          </div>
          {settings.sounds && (
            <div className="space-y-3 px-1 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">مستوى الصوت</Label>
                <span className="text-xs text-muted-foreground"><span className="num" dir="ltr">{Math.round(settings.soundVolume * 100)}%</span></span>
              </div>
              <Slider
                value={[settings.soundVolume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) => {
                  setSettings((prev) => ({ ...prev, soundVolume: v }))
                  playSound('click')
                }}
                className="w-full"
              />
              <Button
                variant="outline"
                size="sm"
                className="text-xs w-full rounded-xl border-border bg-card hover:bg-secondary"
                onClick={() => playSound('task-complete')}
              >
                <Volume2 className="w-3.5 h-3.5 me-1.5" />
                اختبار الصوت
              </Button>
            </div>
          )}
        </SectionCard>
      </motion.div>

      {/* Daily goals */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="break-inside-avoid mb-4"
      >
        <SectionCard icon={Target} well="iw-lime" title="أهداف يومية" desc="تظهر في الصحة والروتين">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Droplets className="w-3 h-3" />
                الماء (كؤوس)
              </Label>
              <Input
                type="number"
                dir="ltr"
                min={1}
                max={20}
                value={settings.dailyWaterGoal}
                onChange={(e) => setSettings((prev) => ({ ...prev, dailyWaterGoal: parseInt(e.target.value) || 8 }))}
                className="text-center h-11 text-base font-bold rounded-xl neo-input num"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                القراءة (صفحة)
              </Label>
              <Input
                type="number"
                dir="ltr"
                min={1}
                max={500}
                value={settings.dailyReadingGoal}
                onChange={(e) => setSettings((prev) => ({ ...prev, dailyReadingGoal: parseInt(e.target.value) || 30 }))}
                className="text-center h-11 text-base font-bold rounded-xl neo-input num"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Dumbbell className="w-3 h-3" />
                التمرين (أيام)
              </Label>
              <Input
                type="number"
                dir="ltr"
                min={1}
                max={7}
                value={settings.weeklyExerciseGoal}
                onChange={(e) => setSettings((prev) => ({ ...prev, weeklyExerciseGoal: parseInt(e.target.value) || 5 }))}
                className="text-center h-11 text-base font-bold rounded-xl neo-input num"
              />
            </div>
          </div>
        </SectionCard>
      </motion.div>

      {/* Data & Privacy */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="break-inside-avoid mb-4"
      >
        <SectionCard icon={Shield} well="iw-forest" title="البيانات والخصوصية" desc="نسخ احتياطي ومساحة الخادم">
          {/* Storage */}
          <div className="p-4 rounded-xl bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">مساحة التخزين في الخادم</span>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                <span className="num" dir="ltr">{formatBytes(storageSize.used)} / {formatBytes(storageSize.total)}</span>
              </span>
            </div>
            <Progress value={storagePercent} className="h-2" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span><span className="num" dir="ltr">{storagePercent}%</span> مستخدم</span>
              <span><span className="num" dir="ltr">{formatBytes(storageSize.total - storageSize.used)}</span> متاح</span>
            </div>
            {storageSize.counts && Object.keys(storageSize.counts).length > 0 && (
              <div className="pt-2 border-t border-border/40 space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground">تفاصيل البيانات:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                  {Object.entries(storageSize.counts).map(([key, count]) => {
                    const labels: Record<string, string> = {
                      tasks: 'المهام', habits: 'العادات', journals: 'اليوميات',
                      focusSessions: 'جلسات التركيز', healthLogs: 'الصحة',
                      financeRecords: 'المالية', books: 'الكتب', knowledgeItems: 'المعرفة',
                      plannerItems: 'المخطط', morningLogs: 'الروتين', goals: 'الأهداف',
                      projects: 'المشاريع', achievements: 'الإنجازات', dailyScores: 'الدرجات',
                    }
                    return count > 0 ? (
                      <div key={key} className="flex justify-between">
                        <span>{labels[key] || key}</span>
                        <span className="num" dir="ltr">{count}</span>
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Export */}
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <span className="icon-well h-9 w-9 iw-forest">
                <Download className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">تصدير البيانات</p>
                <p className="text-[11px] text-muted-foreground">نسخة احتياطية JSON</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportData} className="text-xs border-border bg-card hover:bg-secondary shrink-0">
              تصدير
            </Button>
          </div>

          {/* Import */}
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <span className="icon-well h-9 w-9 iw-blue">
                <Upload className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">استيراد البيانات</p>
                <p className="text-[11px] text-muted-foreground">استعادة من ملف JSON</p>
              </div>
            </div>
            <label className="cursor-pointer shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportData}
              />
              <Button variant="outline" size="sm" className="text-xs border-border bg-card hover:bg-secondary" asChild>
                <span>استيراد</span>
              </Button>
            </label>
          </div>
        </SectionCard>
      </motion.div>

      {/* About */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
        className="break-inside-avoid mb-4"
      >
        <SectionCard icon={Info} well="iw-forest" title="عن أوج">
          <div className="flex items-center gap-4 mb-4">
            <motion.div whileHover={{ scale: 1.05, rotate: -3 }} className="shrink-0">
              <RiseIcon glyph="bolt" hue="forest" size="lg" lift />
            </motion.div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">أوج</h3>
              <p className="text-xs text-muted-foreground">نظام حياتك الشخصي</p>
            </div>
            <span className="pill pill-success">
              <span className="num" dir="ltr">v1.0.0</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            أوج هو نظام حياتك الشخصية. صُمم لمساعدتك على بناء عادات إيجابية،
            تحقيق أهدافك، وعيش حياة أكثر وعياً وإنتاجية.
          </p>
          <div className="h-px bg-border/60" />
          <div className="flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-rose-accent" />
            <p className="text-xs text-muted-foreground">
              صُنع بأيدٍ عربية. امتلك صباحك. امتلك حياتك.
            </p>
          </div>
        </SectionCard>
      </motion.div>
      </div>

      {/* Danger Zone — full width */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
        <div className="rounded-2xl border-2 border-dashed border-destructive/40 overflow-hidden hover:border-destructive/60 transition-colors group relative">
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            animate={{ boxShadow: ['inset 0 0 20px rgba(220, 38, 38, 0.05)', 'inset 0 0 40px rgba(220, 38, 38, 0.08)', 'inset 0 0 20px rgba(220, 38, 38, 0.05)'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="bg-destructive/5 group-hover:bg-destructive/10 transition-colors p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-destructive/15">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-bold text-destructive">منطقة الخطر</h3>
                <p className="text-xs text-muted-foreground mt-0.5">هذه الإجراءات لا يمكن التراجع عنها</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-dashed border-destructive/30 group-hover:border-destructive/60 group-hover:bg-destructive/5 transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-destructive">حذف جميع البيانات</p>
                  <p className="text-xs text-muted-foreground mt-0.5">سيتم حذف جميع بياناتك من قاعدة البيانات نهائياً</p>
                </div>
              </div>
              <Dialog open={resetDialogOpen} onOpenChange={(open) => { setResetDialogOpen(open); if (!open) { setConfirmText(''); setDeletePassword(''); setDeleteError('') } }}>
                <DialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button variant="outline" size="sm" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 shrink-0">
                      حذف الكل
                    </Button>
                  </motion.div>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      تأكيد حذف البيانات
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <p className="text-sm text-muted-foreground">
                      هل أنت متأكد من حذف جميع بياناتك من قاعدة البيانات؟ سيتم حذف جميع المهام والعادات والأهداف واليوميات والمشاريع والمالية نهائياً. هذا الإجراء لا يمكن التراجع عنه.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      يرجى كتابة <span className="font-bold text-destructive">تأكيد</span> أدناه للمتابعة:
                    </p>
                    <Input
                      placeholder="اكتب تأكيد هنا..."
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      className="h-12 text-center text-lg font-mono rounded-xl neo-input"
                      dir="ltr"
                      autoFocus
                    />
                    {/* إعادة إثبات الهوية — السيرفر يرفض الحذف بدون كلمة المرور */}
                    <div className="space-y-1.5">
                      <p className="text-sm text-muted-foreground">
                        اكتب كلمة مرور حسابك (<span dir="ltr" className="font-medium text-foreground">{getUserEmail() || '—'}</span>) للمتابعة:
                      </p>
                      <Input
                        type="password"
                        placeholder="كلمة المرور"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="h-12 rounded-xl neo-input"
                        dir="ltr"
                        autoComplete="current-password"
                      />
                      {deleteError && (
                        <p className="text-xs text-destructive font-medium">{deleteError}</p>
                      )}
                    </div>
                    <DialogFooter className="gap-2 mt-2">
                      <DialogClose asChild>
                        <Button variant="outline" className="text-sm">إلغاء</Button>
                      </DialogClose>
                      <Button
                        onClick={handleResetData}
                        className="bg-destructive hover:bg-destructive/90 text-white text-sm"
                        disabled={confirmText !== 'تأكيد' || !deletePassword || deletingAll}
                      >
                        {deletingAll ? (
                          <>
                            <Loader2 className="w-4 h-4 me-2 animate-spin" />
                            جاري الحذف...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 me-2" />
                            حذف الكل نهائياً
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Version Footer */}
      <div className="text-center pt-2 pb-2">
        <div className="h-[1px] bg-gradient-to-l from-transparent via-border to-transparent mb-4" />
        <div className="flex items-center justify-center gap-2 mb-2">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          >
            <Zap className="w-4 h-4 text-forest dark:text-lime" />
          </motion.div>
          <span className="text-gradient-forest font-bold text-sm">أوج</span>
        </div>
        <p className="text-[10px] text-muted-foreground">awj.life — الإصدار ١.٠.٠</p>
      </div>
    </div>
  )
}
