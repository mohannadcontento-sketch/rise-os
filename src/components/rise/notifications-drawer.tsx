'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellRing, CheckCheck, Trash2, X, Inbox, Filter, Smartphone, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiGet, apiPut, apiDelete } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/hooks/use-data-refresh'

// ============================================================
// NotificationsDrawer — مركز الإشعارات الكامل (المرحلة 05)
//
// يُفتح من: زر «عرض كل الإشعارات» في الجرس (حدث awj:open-
// notifications). فلاتر الخلاصة كلها server-side (RPC 026):
//   الكل | غير المقروء | الحساك والاشتراك | النشاط
// الإشعارات المنتهية تُحذف تلقائيًا عند الفتح (lazy purge).
// deep-link: النقر يحدّد كمقروء ثم ينتقل للشاشة المناسبة
// (rise:navigate — نفس آلية الجرس).
// ============================================================

interface Notification {
  id: string
  title: string
  body?: string
  type?: string
  icon?: string
  actionUrl?: string
  read?: boolean
  isRead?: boolean
  priority?: 'normal' | 'high'
  expiresAt?: string | null
  createdAt: string
}

type FeedTab = 'all' | 'unread' | 'account' | 'activity'

const TABS: Array<{ key: FeedTab; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير المقروء' },
  { key: 'account', label: 'الحساب والاشتراك' },
  { key: 'activity', label: 'النشاط' },
]

const ACCOUNT_TYPES = ['subscription', 'usage', 'system', 'background']

function isUnread(n: Notification): boolean {
  return !(n.isRead ?? n.read ?? false)
}

const typeColors: Record<string, string> = {
  success: 'bg-emerald-accent/15 text-emerald-accent',
  achievement: 'bg-violet-accent/15 text-violet-accent',
  info: 'bg-glass/15 text-glass',
  warning: 'bg-gold/15 text-gold',
  error: 'bg-destructive/15 text-destructive',
  task: 'bg-emerald-accent/15 text-emerald-accent',
  habit: 'bg-gold/15 text-gold',
  focus: 'bg-violet-accent/15 text-violet-accent',
  morning: 'bg-gold/15 text-gold',
  level: 'bg-gold/15 text-gold',
  subscription: 'bg-emerald-accent/15 text-emerald-accent',
  usage: 'bg-gold/15 text-gold',
  system: 'bg-glass/15 text-glass',
  community: 'bg-violet-accent/15 text-violet-accent',
  mention: 'bg-violet-accent/15 text-violet-accent',
  background: 'bg-emerald-accent/15 text-emerald-accent',
}

const typeIcons: Record<string, string> = {
  task: '✅', habit: '🔥', focus: '🧠', achievement: '🎊', level: '🎯',
  morning: '🌅', success: '✨', warning: '⚠️', error: '❌', info: '💡',
  subscription: '🎫', usage: '📊', system: '🛡️', community: '💬',
  mention: '📣', background: '📦',
}

const typeLabels: Record<string, string> = {
  subscription: 'اشتراك',
  usage: 'حدود الاستخدام',
  system: 'النظام',
  background: 'عمليات',
  community: 'المجتمع',
  mention: 'إشارة',
  reminder: 'تذكير',
  achievement: 'إنجاز',
}

function timeAgo(dateStr: string): string {
  try {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffMs = now - then
    const seconds = Math.floor(diffMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (seconds < 60) return 'الآن'
    if (minutes === 1) return 'منذ دقيقة'
    if (minutes === 2) return 'منذ دقيقتين'
    if (minutes < 60) return `منذ ${minutes} دقائق`
    if (hours === 1) return 'منذ ساعة'
    if (hours === 2) return 'منذ ساعتين'
    if (hours < 24) return `منذ ${hours} ساعات`
    if (days === 1) return 'منذ يوم'
    if (days === 2) return 'منذ يومين'
    if (days < 7) return `منذ ${days} أيام`
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? 'منذ أسبوع' : `منذ ${weeks} أسابيع`
  } catch {
    return ''
  }
}

export function NotificationsDrawer() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<FeedTab>('all')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)
  const loadingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // فتح من الجرس (زر «عرض كل الإشعارات»)
  useEffect(() => {
    const handleOpen = () => { setOpen(true); setTab('all') }
    window.addEventListener('awj:open-notifications', handleOpen)
    return () => window.removeEventListener('awj:open-notifications', handleOpen)
  }, [])

  // منع تمرير الخلفية أثناء الفتح
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const fetchFeed = useCallback(async (activeTab: FeedTab) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const r = await apiGet(`/api/rise/notifications?filter=${activeTab}&limit=100`)
      if (r.ok) {
        const data = await r.json()
        if (mountedRef.current && data) {
          setNotifications(data.notifications ?? [])
          setUnreadCount(data.unreadCount ?? 0)
        }
      }
    } catch { /* silent */ }
    finally {
      loadingRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void fetchFeed(tab)
  }, [open, tab, fetchFeed])

  // تحديث عند تغيّر بيانات عام أثناء الفتح
  const { refreshKey } = useDataRefresh()
  useEffect(() => {
    if (open) void fetchFeed(tab)
  }, [open, tab, refreshKey, fetchFeed])

  // Escape يغلق
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true, read: true } : n)))
    setUnreadCount(prev => Math.max(0, prev - 1))
    try {
      await apiPut('/api/rise/notifications', { ids: [id] })
    } catch { /* silent */ }
  }

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true, read: true })))
    setUnreadCount(0)
    try {
      await apiPut('/api/rise/notifications', { all: true })
    } catch { /* silent */ }
  }

  const deleteNotification = async (id: string) => {
    const notif = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (notif && isUnread(notif)) setUnreadCount(prev => Math.max(0, prev - 1))
    try {
      await apiDelete(`/api/rise/notifications?id=${id}`)
    } catch { /* silent */ }
  }

  const clearAll = async () => {
    setNotifications([])
    setUnreadCount(0)
    try {
      await apiDelete('/api/rise/notifications?all=true')
    } catch { /* silent */ }
  }

  const handleClickNotif = (notif: Notification) => {
    if (isUnread(notif)) markAsRead(notif.id)
    if (notif.actionUrl) {
      window.dispatchEvent(new CustomEvent('rise:navigate', { detail: notif.actionUrl }))
      setOpen(false)
    }
  }

  const unreadInList = notifications.filter(isUnread).length

  // ── شريحة تفعيل Push (المرحلة 06) — غير مزعجة ─────────────
  // تظهر فقط: صلاحية «default» + لا اشتراك + لم يُغلقها المستخدم
  // في هذه الجلسة. النقر = إيماءة صريحة → enablePush. لا تُطلب
  // الصلاحية أبدًا بدون نقرة (متطلب الخطة: UX واضح وغير مزعج).
  const [pushBanner, setPushBanner] = useState<'hidden' | 'visible' | 'busy'>('hidden')
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try {
        if (sessionStorage.getItem('awj-push-banner-dismissed') === '1') return
        const { getPushStatus } = await import('@/lib/push-notifications')
        const s = await getPushStatus()
        if (alive && s.supported && s.permission === 'default' && !s.subscribed) {
          setPushBanner('visible')
        } else if (alive) {
          setPushBanner('hidden')
        }
      } catch { /* صامت */ }
    })()
    return () => { alive = false }
  }, [open])

  const dismissPushBanner = () => {
    try { sessionStorage.setItem('awj-push-banner-dismissed', '1') } catch { /* ignore */ }
    setPushBanner('hidden')
  }

  const handleEnablePush = async () => {
    setPushBanner('busy')
    try {
      const { enablePush } = await import('@/lib/push-notifications')
      const result = await enablePush()
      if (result.ok) {
        toast.success('تم التفعيل — ستصل إشعاراتك المهمة إلى جهازك')
        setPushBanner('hidden')
      } else {
        toast.error(result.message || 'تعذّر تفعيل إشعارات الجهاز')
        // denied أو فشل — نخفي الشريحة كي لا نلح
        setPushBanner('hidden')
      }
    } catch {
      setPushBanner('hidden')
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* طبقة التعتيم */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* اللوحة: جوال = شاشة شبه كاملة من الأسفل، سطح المكتب = عمود جانبي */}
          <motion.div
            initial={{ opacity: 0, y: 40, x: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={cn(
              'fixed z-[70] flex flex-col bg-popover text-popover-foreground',
              'inset-x-0 bottom-0 top-16 rounded-t-2xl border border-border',
              'sm:inset-y-0 sm:left-0 sm:bottom-auto sm:top-auto sm:right-auto sm:inset-x-auto sm:w-[440px] sm:rounded-none sm:rounded-e-2xl sm:border-y-0 sm:border-s-0',
              'shadow-lift'
            )}
            role="dialog"
            aria-label="مركز الإشعارات"
          >
            {/* الرأس */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-gold" />
                <h3 className="text-sm font-bold">مركز الإشعارات</h3>
                {unreadCount > 0 && (
                  <span className="pill bg-rose-accent/15 text-rose-accent text-[10px]" dir="ltr">
                    <span className="num">{unreadCount}</span> جديد
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-gold hover:text-gold hover:bg-gold/10"
                    onClick={markAllAsRead}
                  >
                    <CheckCheck className="w-3 h-3 me-1" />
                    تحديد الكل كمقروء
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setOpen(false)}
                  aria-label="إغلاق"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* الفلاتر — كلها server-side */}
            <div className="px-3 py-2 border-b border-border shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="فلترة الإشعارات">
                <Filter className="w-3 h-3 text-muted-foreground/60 shrink-0 me-1" />
                {TABS.map(t => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors',
                      tab === t.key
                        ? 'bg-gold/15 text-gold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    {t.label}
                    {t.key === 'unread' && unreadCount > 0 && (
                      <span className="ms-1 text-rose-accent" dir="ltr">({unreadCount})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* شريحة Push — غير مزعجة (مرّة واحدة للجلسة، بنقرة فقط) */}
            {pushBanner !== 'hidden' && (
              <div className="mx-3 mt-2 p-2.5 rounded-xl bg-violet-accent/[0.08] border border-violet-accent/25 flex items-center gap-2.5 shrink-0">
                <span className="icon-well h-8 w-8 iw-violet shrink-0">
                  <Smartphone className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">استلم إشعارات أوج على جهازك</p>
                  <p className="text-[10px] text-muted-foreground">حتى والموقع مغلق — بضغطة واحدة</p>
                </div>
                <Button
                  size="sm"
                  onClick={handleEnablePush}
                  disabled={pushBanner === 'busy'}
                  className="h-7 px-3 text-[11px] rounded-lg bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 shrink-0"
                >
                  {pushBanner === 'busy' ? <Loader2 className="w-3 h-3 me-1 animate-spin" /> : <BellRing className="w-3 h-3 me-1" />}
                  تفعيل
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  onClick={dismissPushBanner}
                  aria-label="إخفاء"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}

            {/* القائمة */}
            <ScrollArea className="flex-1 min-h-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-start gap-3 animate-pulse">
                      <div className="w-8 h-8 rounded-lg bg-secondary shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-secondary rounded w-2/3" />
                        <div className="h-2.5 bg-secondary/70 rounded w-5/6" />
                        <div className="h-2 bg-secondary/50 rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <span className="icon-well mb-3 h-16 w-16 bg-secondary text-muted-foreground/50">
                    <Inbox className="w-7 h-7" />
                  </span>
                  <p className="text-sm text-muted-foreground font-medium">
                    {tab === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات هنا'}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
                    {tab === 'account'
                      ? 'تحديثات الاشتراك وحدود الاستخدام والنظام ستظهر هنا'
                      : tab === 'activity'
                        ? 'إنجازاتك وتذكيراتك ونشاطك داخل أوج ستظهر هنا'
                        : 'ستظهر هنا التنبيهات والأخبار'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  <AnimatePresence mode="popLayout">
                    {notifications.map(notif => (
                      <motion.div
                        key={notif.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: 10, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className={cn(
                          'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                          'hover:bg-secondary',
                          isUnread(notif) && 'bg-rose-accent/[0.04]'
                        )}
                        onClick={() => handleClickNotif(notif)}
                      >
                        <div className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-base',
                          typeColors[notif.type || ''] || 'bg-muted/50 text-muted-foreground',
                          notif.priority === 'high' && 'ring-1 ring-gold/40'
                        )}>
                          {notif.icon || typeIcons[notif.type || ''] || '🔔'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn(
                              'text-sm font-medium',
                              isUnread(notif) ? 'text-foreground font-semibold' : 'text-muted-foreground'
                            )}>
                              {notif.title}
                            </p>
                            {notif.priority === 'high' && (
                              <span className="shrink-0 pill bg-gold/15 text-gold text-[9px] font-bold">مهم</span>
                            )}
                            {isUnread(notif) && (
                              <span className="w-2 h-2 rounded-full bg-rose-accent shrink-0" />
                            )}
                          </div>
                          {notif.body && (
                            <p className="text-xs text-muted-foreground/75 mt-0.5 leading-relaxed">
                              {notif.body}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-muted-foreground/50">{timeAgo(notif.createdAt)}</p>
                            {notif.type && typeLabels[notif.type] && (
                              <span className="text-[9px] text-muted-foreground/40 bg-secondary/70 px-1.5 py-0.5 rounded-full">
                                {typeLabels[notif.type]}
                              </span>
                            )}
                            {notif.actionUrl && (
                              <span className="text-[9px] text-emerald-accent/70">↗ فتح الشاشة</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNotification(notif.id)
                          }}
                          aria-label="حذف"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>

            {/* التذييل */}
            {notifications.length > 0 && (
              <div className="border-t border-border px-4 py-2 shrink-0 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground/50">
                  {tab === 'unread'
                    ? `${unreadInList} غير مقروء من المعروض`
                    : `${notifications.length} إشعارًا معروضًا`}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  onClick={clearAll}
                >
                  <Trash2 className="w-3 h-3 me-1" />
                  مسح الكل
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
