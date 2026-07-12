'use client'

import { useState, useEffect } from 'react'
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
  Trash2,
  Zap,
  Shield,
  Info,
  Sunrise,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ────────────── Types ────────────── */

interface SettingsData {
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

const defaultSettings: SettingsData = {
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

/* ────────────── Component ────────────── */

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<SettingsData>(() => {
    if (typeof window === 'undefined') return defaultSettings
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return { ...defaultSettings, ...JSON.parse(stored) }
    } catch { /* ignore */ }
    return defaultSettings
  })
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const updateNotification = (key: string, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
  }

  const handleExportData = () => {
    const allKeys = [
      'rise-learning',
      'rise-weekly-review',
      'rise-monthly-review',
      'rise-ai-chat',
      'rise-settings',
    ]
    const data: Record<string, unknown> = {}
    allKeys.forEach((key) => {
      try {
        const val = localStorage.getItem(key)
        if (val) data[key] = JSON.parse(val)
      } catch {
        // ignore
      }
    })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `riseos-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير البيانات بنجاح')
  }

  const handleResetData = () => {
    const keysToRemove = [
      'rise-learning',
      'rise-weekly-review',
      'rise-monthly-review',
      'rise-ai-chat',
      'rise-settings',
    ]
    keysToRemove.forEach((key) => localStorage.removeItem(key))
    setSettings(defaultSettings)
    setResetDialogOpen(false)
    toast.success('تم إعادة تعيين جميع البيانات')
  }

  const themes = [
    { value: 'system', label: 'النظام', icon: Monitor },
    { value: 'light', label: 'فاتح', icon: Sun },
    { value: 'dark', label: 'داكن', icon: Moon },
  ]

  const notifItems = [
    { key: 'morning', label: 'تذكير صباحي', icon: Sun },
    { key: 'exercise', label: 'تذكير تمارين', icon: Dumbbell },
    { key: 'reading', label: 'تذكير قراءة', icon: BookOpen },
    { key: 'focus', label: 'تذكير تركيز', icon: Target },
    { key: 'water', label: 'تذكير ماء', icon: Droplets },
    { key: 'prayer', label: 'تذكير صلاة', icon: Clock },
    { key: 'sleep', label: 'تذكير نوم', icon: Moon },
  ]

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

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-accent" />
              الملف الشخصي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                م
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">الاسم</Label>
                  <p className="text-sm font-semibold">مستخدم</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">البريد</Label>
                  <p className="text-sm text-muted-foreground">user@riseos.app</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-emerald-accent/10 text-emerald-accent">
                المستوى ١
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Appearance */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4 text-gold" />
              المظهر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Theme */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">السمة</Label>
              <div className="grid grid-cols-3 gap-3">
                {themes.map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.value}
                      onClick={() => setTheme(t.value)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all',
                        theme === t.value
                          ? 'border-emerald-accent bg-emerald-accent/5 shadow-md'
                          : 'border-transparent bg-muted/30 hover:bg-muted/50'
                      )}
                    >
                      <div className={cn(
                        'p-2.5 rounded-xl',
                        theme === t.value ? 'bg-emerald-accent/15 text-emerald-accent' : 'bg-muted/50 text-muted-foreground'
                      )}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={cn('text-xs font-medium', theme === t.value ? 'text-emerald-accent' : 'text-muted-foreground')}>
                        {t.label}
                      </span>
                    </button>
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

      {/* Notifications */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-forest" />
              الإشعارات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {notifItems.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.key} className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-muted/50">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <Switch
                      checked={settings.notifications[item.key as keyof typeof settings.notifications]}
                      onCheckedChange={(v) => updateNotification(item.key, v)}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Morning Routine */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-accent" />
              الروتين الصباحي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-gold" />
                  وقت الاستيقاظ
                </Label>
                <Input
                  type="time"
                  value={settings.wakeUpTime}
                  onChange={(e) => setSettings((prev) => ({ ...prev, wakeUpTime: e.target.value }))}
                  className="text-center"
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
                  className="text-center"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Goals Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-forest" />
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
                  className="text-center h-12 text-lg font-bold"
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
                  className="text-center h-12 text-lg font-bold"
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
                  className="text-center h-12 text-lg font-bold"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Data */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              البيانات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-accent/10">
                  <Download className="w-4 h-4 text-emerald-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium">تصدير البيانات</p>
                  <p className="text-xs text-muted-foreground">تنزيل نسخة احتياطية من بياناتك</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportData} className="text-xs">
                تصدير
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/5 border border-destructive/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-medium text-destructive">إعادة تعيين البيانات</p>
                  <p className="text-xs text-muted-foreground">حذف جميع البيانات المحلية نهائياً</p>
                </div>
              </div>
              <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                    إعادة تعيين
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>تأكيد إعادة التعيين</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground mt-4">
                    هل أنت متأكد من حذف جميع البيانات المحلية؟ هذا الإجراء لا يمكن التراجع عنه.
                  </p>
                  <DialogFooter className="gap-2 mt-4">
                    <DialogClose asChild>
                      <Button variant="outline" className="text-sm">إلغاء</Button>
                    </DialogClose>
                    <Button onClick={handleResetData} className="bg-destructive hover:bg-destructive/90 text-white text-sm">
                      حذف الكل
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* About */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              حول
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg">RiseOS</h3>
                <p className="text-xs text-muted-foreground">نظام تشغيل الحياة</p>
              </div>
              <Badge variant="secondary" className="bg-emerald-accent/10 text-emerald-accent mr-auto">
                v1.0.0
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              RiseOS هو نظام تشغيل حياتك الشخصية. صُمم لمساعدتك على بناء عادات إيجابية،
              تحقيق أهدافك، وعيش حياة أكثر وعياً وإنتاجية.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-3">
              صُنع بـ ❤️ لأمتلك صباحك. امتلك حياتك.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}