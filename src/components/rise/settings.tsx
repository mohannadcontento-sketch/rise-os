'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon,
  User,
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
  Users,
  Bot,
  Database,
  Save,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
    exercise: boolean
    reading: boolean
    focus: boolean
    water: boolean
    prayer: boolean
    sleep: boolean
  }
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
    exercise: true,
    reading: false,
    focus: true,
    water: true,
    prayer: true,
    sleep: true,
  },
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

/* ────────────── Admin Panel ────────────── */

function AdminPanel() {
  const { auth } = useRiseStore()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editStorageLimit, setEditStorageLimit] = useState('')
  const [editAiLimit, setEditAiLimit] = useState('')
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{ id: string; email: string; name: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [lastError, setLastError] = useState('')

  const loadUsers = useCallback(async (showLoading = true) => {
    if (!auth?.accessToken || auth.accessToken === 'guest') return
    if (showLoading) setLoading(true)
    setLastError('')
    try {
      const res = await apiFetch('/api/rise/admin/users')
      if (!res.ok) {
        setLastError(`خطأ ${res.status}: فشل في تحميل المستخدمين`)
        return
      }
      const data = await res.json()
      if (data.users) setUsers(data.users)
    } catch (err) {
      setLastError('فشل الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [auth?.accessToken])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const updateUserLimits = async (supabaseUserId: string) => {
    const storageMB = parseInt(editStorageLimit)
    const aiLim = parseInt(editAiLimit)
    if (isNaN(storageMB) || isNaN(aiLim)) {
      toast.error('يرجى إدخال أرقام صحيحة')
      return
    }
    try {
      const res = await apiPost('/api/rise/admin/users', {
        supabaseUserId,
        storageLimit: storageMB * 1024 * 1024,
        aiLimit: aiLim,
      })
      if (!res.ok) {
        toast.error('فشل تحديث الصلاحيات')
        return
      }
      toast.success('تم تحديث الصلاحيات بنجاح')
      setEditingUser(null)
      loadUsers(false)
    } catch {
      toast.error('فشل الاتصال بالخادم')
    }
  }

  const confirmDeleteUser = async () => {
    if (!deleteConfirmUser) return
    try {
      const res = await apiFetch('/api/rise/admin/users', {
        method: 'DELETE',
        body: JSON.stringify({ supabaseUserId: deleteConfirmUser.id }),
      })
      if (!res.ok) {
        toast.error('فشل حذف المستخدم')
        return
      }
      toast.success(`تم حذف المستخدم: ${deleteConfirmUser.email}`)
      setDeleteConfirmUser(null)
      loadUsers(false)
    } catch {
      toast.error('فشل الاتصال بالخادم')
    }
  }

  const formatMB = (bytes: number | null | undefined) => {
    if (!bytes) return '0 MB'
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return '—'
    }
  }

  const filteredUsers = users.filter((u: any) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)
  })

  const totalStorage = users.reduce((acc: number, u: any) => acc + (u.storageUsed || 0), 0)
  const totalAI = users.reduce((acc: number, u: any) => acc + (u.aiUsed || 0), 0)
  const activeUsers = users.filter((u: any) => u.email).length

  return (
    <div
      className="space-y-4 animate-[fadeSlideIn_0.3s_ease-out]"
    >
      <div className="h-[2px] bg-gradient-to-l from-transparent via-gold/30 to-transparent" />

      <Card className="glass border border-gold/20 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-gold" />
              </div>
              <div>
                <span>لوحة تحكم الأدمن</span>
                <Badge className="mr-2 bg-gold/20 text-gold text-[10px] px-2 py-0.5">Admin</Badge>
              </div>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => loadUsers(true)}
              disabled={loading}
            >
              <span className={cn(loading && 'animate-spin inline-block')}>
                <Save className="w-3.5 h-3.5" />
              </span>
              تحديث
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-muted/30 text-center">
              <Users className="w-5 h-5 mx-auto mb-1.5 text-emerald-accent" />
              <p className="text-lg font-bold">{users.length}</p>
              <p className="text-[10px] text-muted-foreground">إجمالي المستخدمين</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 text-center">
              <User className="w-5 h-5 mx-auto mb-1.5 text-forest" />
              <p className="text-lg font-bold">{activeUsers}</p>
              <p className="text-[10px] text-muted-foreground">مستخدم نشط</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 text-center">
              <Bot className="w-5 h-5 mx-auto mb-1.5 text-gold" />
              <p className="text-lg font-bold">{totalAI}</p>
              <p className="text-[10px] text-muted-foreground">رسائل AI هذا الشهر</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 text-center">
              <Database className="w-5 h-5 mx-auto mb-1.5 text-forest" />
              <p className="text-lg font-bold">{formatMB(totalStorage)}</p>
              <p className="text-[10px] text-muted-foreground">إجمالي التخزين</p>
            </div>
          </div>

          {/* Error */}
          {lastError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{lastError}</span>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث عن مستخدم بالاسم أو البريد..."
              className="pr-9 h-9 text-sm"
              dir="rtl"
            />
          </div>

          {/* Users List */}
          <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'لا توجد نتائج للبحث' : 'لا يوجد مستخدمين بعد'}
                </p>
              </div>
            ) : (
              filteredUsers.map((user: any) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-white">
                      {(user.name || user.email || '؟').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{user.name || 'مستخدم'}</p>
                      {user.isAdmin && (
                        <Badge className="bg-gold/20 text-gold text-[9px] px-1.5 py-0 shrink-0">أدمن</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email || '—'}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatDate(user.createdAt)}</p>
                  </div>

                  {editingUser === user.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground w-6">MB</span>
                          <Input
                            type="number"
                            value={editStorageLimit}
                            onChange={(e) => setEditStorageLimit(e.target.value)}
                            className="w-16 h-6 text-[11px] text-center"
                            dir="ltr"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground w-6">AI</span>
                          <Input
                            type="number"
                            value={editAiLimit}
                            onChange={(e) => setEditAiLimit(e.target.value)}
                            className="w-16 h-6 text-[11px] text-center"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 w-7 p-0 bg-emerald-accent hover:bg-emerald-accent/90"
                        onClick={() => updateUserLimits(user.id)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditingUser(null)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg hidden sm:flex items-center gap-2" dir="ltr">
                        <span>{formatMB(user.storageLimit)}</span>
                        <span className="text-border">|</span>
                        <span>{user.aiLimit || 100} AI</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setEditingUser(user.id)
                          setEditStorageLimit(String(Math.round((user.storageLimit || 10485760) / (1024 * 1024))))
                          setEditAiLimit(String(user.aiLimit || 100))
                        }}
                        title="تعديل الصلاحيات"
                        aria-label="تعديل صلاحيات المستخدم"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      {!user.isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                          onClick={() => setDeleteConfirmUser({ id: user.id, email: user.email, name: user.name })}
                          title="حذف المستخدم"
                          aria-label="حذف المستخدم"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={(open) => !open && setDeleteConfirmUser(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              هل أنت متأكد من حذف هذا المستخدم؟ هذا الإجراء <span className="text-destructive font-semibold">لا يمكن التراجع عنه</span>.
            </p>
            <div className="p-3 rounded-xl bg-muted/30 space-y-1">
              <p className="text-sm font-medium">{deleteConfirmUser?.name || 'مستخدم'}</p>
              <p className="text-xs text-muted-foreground">{deleteConfirmUser?.email}</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              className="gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              حذف نهائياً
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ────────────── Component ────────────── */

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const { auth } = useRiseStore()
  const [settings, setSettings] = useState<SettingsData>(() => {
    if (typeof window === 'undefined') return defaultSettings
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return { ...defaultSettings, ...JSON.parse(stored) }
    } catch { /* ignore */ }
    return defaultSettings
  })
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(settings.userName)
  const [storageSize, setStorageSize] = useState(() => {
    if (typeof window === 'undefined') return { used: 0, total: 5 * 1024 * 1024 }
    return getLocalStorageSize()
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Fetch user stats
  const [userStats, setUserStats] = useState<{ level: number; xp: number; xpToNext: number; streak: number } | null>(null)

  useEffect(() => {
    apiFetch('/api/rise/dashboard')
      .then(r => r.json())
      .then(data => {
        if (data.user) setUserStats(data.user)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    // Also save to the separate name key
    localStorage.setItem(NAME_KEY, settings.userName)
  }, [settings])

  const updateNotification = (key: string, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
  }

  const saveName = () => {
    if (!editName.trim()) return
    setSettings((prev) => ({ ...prev, userName: editName.trim() }))
    setIsEditingName(false)
    toast.success('تم تحديث الاسم')
  }

  const handleExportData = () => {
    toast.loading('جاري تصدير البيانات...', { id: 'export' })
    apiFetch('/api/rise/export')
      .then((res) => {
        if (!res.ok) throw new Error('فشل التصدير')
        return res.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `riseos-export-${new Date().toISOString().split('T')[0]}.json`
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
          localStorage.setItem(key, JSON.stringify(value))
        })
        toast.success('تم استيراد البيانات بنجاح')
        setStorageSize(getLocalStorageSize())
      } catch {
        toast.error('فشل في قراءة الملف')
      }
    }
    reader.readAsText(file)
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleResetData = () => {
    const allKeys = Object.keys(localStorage).filter((k) => k.startsWith('rise-') && k !== 'rise-auth' && k !== 'rise-user-info')
    allKeys.forEach((key) => localStorage.removeItem(key))
    setSettings(defaultSettings)
    setResetDialogOpen(false)
    setConfirmText('')
    setStorageSize({ used: 0, total: 5 * 1024 * 1024 })
    toast.success('تم إعادة تعيين البيانات المحلية (تم الاحتفاظ بجلسة الدخول)')
  }

  const themes = [
    {
      value: 'light',
      label: 'فاتح',
      icon: Sun,
      preview: (
        <div className="w-full h-12 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center">
          <div className="flex gap-1">
            <div className="w-4 h-4 rounded bg-gray-200" />
            <div className="w-8 h-4 rounded bg-gray-100" />
          </div>
        </div>
      ),
    },
    {
      value: 'dark',
      label: 'داكن',
      icon: Moon,
      preview: (
        <div className="w-full h-12 rounded-lg bg-gray-900 border border-gray-700 shadow-sm flex items-center justify-center">
          <div className="flex gap-1">
            <div className="w-4 h-4 rounded bg-gray-700" />
            <div className="w-8 h-4 rounded bg-gray-800" />
          </div>
        </div>
      ),
    },
    {
      value: 'system',
      label: 'النظام',
      icon: Monitor,
      preview: (
        <div className="w-full h-12 rounded-lg overflow-hidden flex shadow-sm border border-gray-200">
          <div className="w-1/2 bg-white flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded bg-gray-300" />
          </div>
          <div className="w-1/2 bg-gray-900 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded bg-gray-600" />
          </div>
        </div>
      ),
    },
  ]

  const notifGroups = [
    {
      title: 'صباحي',
      items: [
        { key: 'morning', label: 'تذكير صباحي', desc: 'بداية روتينك الصباحي', icon: Sunrise },
        { key: 'sleep', label: 'تذكير نوم', desc: 'وقت النوم والاسترخاء', icon: Moon },
      ],
    },
    {
      title: 'صحية',
      items: [
        { key: 'exercise', label: 'تذكير تمارين', desc: 'تمارينك الرياضية اليومية', icon: Dumbbell },
        { key: 'water', label: 'تذكير ماء', desc: 'شرب الماء بانتظام', icon: Droplets },
      ],
    },
    {
      title: 'إنتاجية',
      items: [
        { key: 'reading', label: 'تذكير قراءة', desc: 'هدف القراءة اليومي', icon: BookOpen },
        { key: 'focus', label: 'تذكير تركيز', desc: 'جلسات العمل العميق', icon: Target },
        { key: 'prayer', label: 'تذكير صلاة', desc: 'أوقات الصلاة', icon: Clock },
      ],
    },
  ]

  const storagePercent = Math.round((storageSize.used / storageSize.total) * 100)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-emerald-accent" />
          الإعدادات
        </h2>
        <p className="text-sm text-muted-foreground mt-1">خصّص تجربتك في RiseOS</p>
      </div>

      {/* Profile Section with Stats */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass border border-border/30 overflow-hidden border-r-4 border-r-emerald-accent premium-card">
          <CardContent className="p-6">
            <div className="flex items-start gap-5">
              {/* Avatar with gradient + animated glow */}
              <motion.div
                className="relative"
                whileHover={{ scale: 1.05, rotate: -3 }}
                whileTap={{ scale: 0.98 }}
              >
                <motion.div
                  className="absolute inset-[-4px] rounded-full bg-gradient-to-br from-emerald-accent via-forest to-gold"
                  animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.05, 1] }}
                  transition={{ type: 'tween', duration: 3, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-accent via-emerald-600 to-emerald-800 dark:from-emerald-accent dark:via-emerald-600 dark:to-emerald-900 flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-emerald-accent/25">
                  {settings.userName.charAt(0)}
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
              </motion.div>
              <div className="flex-1 space-y-3">
                {/* Name */}
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-sm font-semibold h-9"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName()
                        if (e.key === 'Escape') { setIsEditingName(false); setEditName(settings.userName) }
                      }}
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={saveName}
                      className="p-1.5 rounded-lg bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { setIsEditingName(false); setEditName(settings.userName) }}
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
                        {settings.userName}
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => { setEditName(settings.userName); setIsEditingName(true) }}
                          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-50 hover:opacity-100"
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
                  <p className="text-sm text-muted-foreground">user@riseos.app</p>
                </div>
                {/* Stats Row */}
                <div className="flex items-center gap-3 pt-1">
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-accent/10 border border-emerald-accent/20"
                  >
                    <Trophy className="w-3.5 h-3.5 text-emerald-accent" />
                    <span className="text-xs font-bold text-emerald-accent">المستوى {userStats?.level ?? 1}</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gold/10 border border-gold/20"
                  >
                    <Star className="w-3.5 h-3.5 text-gold" />
                    <span className="text-xs font-bold text-gold">{userStats?.xp ?? 0} XP</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20"
                  >
                    <Flame className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-xs font-bold text-rose-500">{userStats?.streak ?? 0} يوم</span>
                  </motion.div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Gradient Divider ── */}
      <div className="h-[2px] bg-gradient-to-l from-transparent via-amber-500/30 to-transparent" />

      {/* Appearance */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="glass border border-border/30 overflow-hidden border-r-4 border-r-amber-500">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2.5">
              <Palette className="w-4 h-4 text-amber-500" />
              المظهر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Theme Cards with Mini Preview */}
            <div className="space-y-3">
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
                          ? 'border-emerald-accent bg-emerald-accent/5 shadow-lg shadow-emerald-accent/15 ring-2 ring-emerald-accent/20'
                          : 'border-transparent bg-muted/20 hover:bg-muted/40'
                      )}
                    >
                      {t.preview}
                      <div className="flex items-center gap-1.5">
                        <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-emerald-accent' : 'text-muted-foreground')} />
                        <span className={cn('text-xs font-medium', isActive ? 'text-emerald-accent' : 'text-muted-foreground')}>
                          {t.label}
                        </span>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Language */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">اللغة</Label>
              </div>
              <Select defaultValue="ar" disabled>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">عربي</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Gradient Divider ── */}
      <div className="h-[2px] bg-gradient-to-l from-transparent via-emerald-700/30 to-transparent" />

      {/* Notifications - Grouped */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="glass border border-border/30 overflow-hidden border-r-4 border-r-emerald-700 dark:border-r-emerald-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              الإشعارات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {notifGroups.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">{group.title}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isChecked = settings.notifications[item.key as keyof typeof settings.notifications]
                    return (
                      <div key={item.key} className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-muted/50">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <span className="text-sm font-medium block">{item.label}</span>
                            <span className="text-[11px] text-muted-foreground">{item.desc}</span>
                          </div>
                        </div>
                        <Switch
                          checked={isChecked}
                          onCheckedChange={(v) => updateNotification(item.key, v)}
                          className="data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent"
                        />
                      </div>
                    )
                  })}
                </div>
                {group.title !== notifGroups[notifGroups.length - 1].title && <Separator className="mt-3" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Gradient Divider ── */}
      <div className="h-[2px] bg-gradient-to-l from-transparent via-emerald-accent/30 to-transparent" />

      {/* Morning Routine */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="glass border border-border/30 overflow-hidden border-r-4 border-r-emerald-accent">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-emerald-accent" />
              الروتين الصباحي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Sunrise className="w-3.5 h-3.5 text-amber-500" />
                  وقت الاستيقاظ
                </Label>
                <Input
                  type="time"
                  value={settings.wakeUpTime}
                  onChange={(e) => setSettings((prev) => ({ ...prev, wakeUpTime: e.target.value }))}
                  className="text-center h-11 text-sm font-medium rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-purple-500" />
                  وقت النوم
                </Label>
                <Input
                  type="time"
                  value={settings.sleepTime}
                  onChange={(e) => setSettings((prev) => ({ ...prev, sleepTime: e.target.value }))}
                  className="text-center h-11 text-sm font-medium rounded-xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Gradient Divider ── */}
      <div className="h-[2px] bg-gradient-to-l from-transparent via-purple-500/30 to-transparent" />

      {/* Goals Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass border border-border/30 overflow-hidden border-r-4 border-r-purple-500">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2.5">
              <Target className="w-4 h-4 text-purple-500" />
              أهداف يومية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Droplets className="w-3 h-3" />
                  هدف الماء (كؤوس)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.dailyWaterGoal}
                  onChange={(e) => setSettings((prev) => ({ ...prev, dailyWaterGoal: parseInt(e.target.value) || 8 }))}
                  className="text-center h-12 text-lg font-bold rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" />
                  هدف القراءة (صفحة)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={settings.dailyReadingGoal}
                  onChange={(e) => setSettings((prev) => ({ ...prev, dailyReadingGoal: parseInt(e.target.value) || 30 }))}
                  className="text-center h-12 text-lg font-bold rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Dumbbell className="w-3 h-3" />
                  هدف التمرين (أيام/أسبوع)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={settings.weeklyExerciseGoal}
                  onChange={(e) => setSettings((prev) => ({ ...prev, weeklyExerciseGoal: parseInt(e.target.value) || 5 }))}
                  className="text-center h-12 text-lg font-bold rounded-xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Gradient Divider ── */}
      <div className="h-[2px] bg-gradient-to-l from-transparent via-blue-500/30 to-transparent" />

      {/* Data & Privacy */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="glass border border-border/30 overflow-hidden border-r-4 border-r-blue-500">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-blue-500" />
              البيانات والخصوصية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Storage Usage */}
            <div className="p-4 rounded-xl bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">مساحة التخزين</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(storageSize.used)} / {formatBytes(storageSize.total)}
                </span>
              </div>
              <Progress value={storagePercent} className="h-2" />
              <p className="text-[11px] text-muted-foreground">
                البيانات مخزنة محلياً على جهازك فقط ولا تُرسل لأي خادم.
              </p>
            </div>

            {/* Export */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-accent/10">
                  <Download className="w-4 h-4 text-emerald-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium">تصدير البيانات</p>
                  <p className="text-xs text-muted-foreground">تنزيل نسخة احتياطية JSON من بياناتك</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportData} className="text-xs">
                تصدير
              </Button>
            </div>

            {/* Import */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Upload className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">استيراد البيانات</p>
                  <p className="text-xs text-muted-foreground">استعادة نسخة احتياطية من ملف JSON</p>
                </div>
              </div>
              <label className="cursor-pointer">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportData}
                />
                <Button variant="outline" size="sm" className="text-xs border-blue-500/30 text-blue-500 hover:bg-blue-500/10" asChild>
                  <span>استيراد</span>
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Gradient Divider (red) ── */}
      <div className="h-[2px] bg-gradient-to-l from-transparent via-destructive/30 to-transparent" />

      {/* Danger Zone with red glow */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <div className="rounded-2xl border-2 border-dashed border-destructive/40 overflow-hidden hover:border-destructive/60 transition-colors group relative">
          {/* Red glow effect */}
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            animate={{ boxShadow: ['inset 0 0 20px oklch(0.6 0.25 25 / 0.05)', 'inset 0 0 40px oklch(0.6 0.25 25 / 0.08)', 'inset 0 0 20px oklch(0.6 0.25 25 / 0.05)'] }}
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
            <div className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed border-destructive/30 group-hover:border-destructive/60 group-hover:bg-destructive/5 transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-destructive">إعادة تعيين جميع البيانات</p>
                  <p className="text-xs text-muted-foreground mt-0.5">سيتم حذف جميع البيانات المحلية نهائياً</p>
                </div>
              </div>
              <Dialog open={resetDialogOpen} onOpenChange={(open) => { setResetDialogOpen(open); if (!open) setConfirmText('') }}>
                <DialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button variant="outline" size="sm" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50">
                      حذف الكل
                    </Button>
                  </motion.div>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      تأكيد إعادة التعيين
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <p className="text-sm text-muted-foreground">
                      هل أنت متأكد من حذف جميع البيانات المحلية؟ هذا الإجراء لا يمكن التراجع عنه.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      يرجى كتابة <span className="font-bold text-destructive">تأكيد</span> أدناه للمتابعة:
                    </p>
                    <Input
                      placeholder="اكتب تأكيد هنا..."
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      className="h-12 text-center text-lg font-mono rounded-xl"
                      dir="ltr"
                      autoFocus
                    />
                    <DialogFooter className="gap-2 mt-2">
                      <DialogClose asChild>
                        <Button variant="outline" className="text-sm">إلغاء</Button>
                      </DialogClose>
                      <Button
                        onClick={handleResetData}
                        className="bg-destructive hover:bg-destructive/90 text-white text-sm"
                        disabled={confirmText !== 'تأكيد'}
                      >
                        <Trash2 className="w-4 h-4 ml-2" />
                        حذف الكل نهائياً
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Gradient Divider ── */}
      <div className="h-[2px] bg-gradient-to-l from-transparent via-muted-foreground/20 to-transparent" />

      {/* About RiseOS with branding */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="glass border border-border/30 overflow-hidden border-r-4 border-r-muted-foreground/30 premium-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2.5">
              <Info className="w-4 h-4 text-muted-foreground" />
              عن RiseOS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-5">
              <motion.div
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-accent via-emerald-600 to-emerald-800 dark:to-emerald-900 flex items-center justify-center shadow-xl shadow-emerald-accent/20"
                whileHover={{ scale: 1.05, rotate: -3 }}
              >
                <Zap className="w-7 h-7 text-white" />
              </motion.div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">RiseOS</h3>
                <p className="text-xs text-muted-foreground">نظام تشغيل الحياة</p>
              </div>
              <Badge variant="secondary" className="bg-emerald-accent/10 text-emerald-accent text-xs px-3 py-1">
                v1.0.0
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              RiseOS هو نظام تشغيل حياتك الشخصية. صُمم لمساعدتك على بناء عادات إيجابية،
              تحقيق أهدافك، وعيش حياة أكثر وعياً وإنتاجية.
            </p>
            <Separator className="my-4" />
            <div className="flex items-center gap-2">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <p className="text-xs text-muted-foreground">
                صُنع بأيدٍ عربية. امتلك صباحك. امتلك حياتك.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      {/* ══ Admin Panel ══ */}
      {auth?.isAdmin && (
        <AdminPanel />
      )}

      {/* Version Footer */}
      <div className="text-center pt-4 pb-2">
        <div className="h-[1px] bg-gradient-to-l from-transparent via-border to-transparent mb-4" />
        <div className="flex items-center justify-center gap-2 mb-2">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          >
            <Zap className="w-4 h-4 text-emerald-accent" />
          </motion.div>
          <span className="text-gradient-forest font-bold text-sm">RiseOS</span>
        </div>
        <p className="text-[10px] text-muted-foreground">نظام تشغيل الحياة — الإصدار ١.٠.٠</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">صُنع بأيدٍ عربية 🇸🇦</p>
      </div>
    </div>
  )
}