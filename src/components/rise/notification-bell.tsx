'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellRing, CheckCheck, Trash2, X, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RiseGlyphIcon } from './icons'
import { apiGet, apiPut, apiDelete } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'
import { getBrowserPermissionState, requestBrowserPermission, showBrowserNotification } from '@/lib/notification-prefs'

interface Notification {
  id: string
  title: string
  body?: string
  type?: string
  icon?: string
  actionUrl?: string
  read?: boolean
  isRead?: boolean
  createdAt: string
}

/** DB column is `read`; older payloads may lack `isRead` — normalize once. */
function isUnread(n: Notification): boolean {
  return !(n.isRead ?? n.read ?? false)
}

// Type-based icon color mapping
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
}

// Fallback icon by type
const typeIcons: Record<string, string> = {
  task: '✅',
  habit: '🔥',
  focus: '🧠',
  achievement: '🎊',
  level: '🎯',
  morning: '🌅',
  success: '✨',
  warning: '⚠️',
  error: '❌',
  info: '💡',
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

function getNotificationColor(type?: string): string {
  return typeColors[type || ''] || 'bg-muted/50 text-muted-foreground'
}

function getNotificationIcon(notif: Notification): string {
  if (notif.icon) return notif.icon
  return typeIcons[notif.type || ''] || '🔔'
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [wiggling, setWiggling] = useState(false)
  const [permState, setPermState] = useState<ReturnType<typeof getBrowserPermissionState>>('unsupported')
  const panelRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadingRef = useRef(false)
  const mountedRef = useRef(true)
  const prevUnreadRef = useRef(-1)
  const lastFetchAtRef = useRef(0)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const fetchNotifications = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const r = await apiGet('/api/rise/notifications')
      if (r.ok) {
        const data = await r.json()
        if (mountedRef.current && data) {
          const newNotifs: Notification[] = data.notifications || []
          const newUnread: number = data.unreadCount || 0

          // Detect new notifications
          if (prevUnreadRef.current >= 0 && newUnread > prevUnreadRef.current) {
            playSound('notification')
            setWiggling(true)
            setTimeout(() => setWiggling(false), 600)

            // Show browser notification for new unread (only when tab not focused)
            if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
              const latestUnread = newNotifs.filter(isUnread).slice(0, newUnread - prevUnreadRef.current)
              for (const notif of latestUnread) {
                try {
                  new Notification(notif.title, {
                    body: notif.body || '',
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: notif.id,
                  })
                } catch {
                  // SW context fallback
                  if (navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({
                      type: 'SHOW_NOTIFICATION',
                      title: notif.title,
                      body: notif.body || '',
                      tag: notif.id,
                    })
                  }
                }
              }
            }
          }

          prevUnreadRef.current = newUnread
          setNotifications(newNotifs)
          setUnreadCount(newUnread)
          lastFetchAtRef.current = Date.now()
        }
      }
    } catch { /* silent */ }
    finally { loadingRef.current = false }
  }, [])

  // Lightweight badge-only fetch (tiny payload) for background polling —
  // avoids pulling the full notifications list every cycle.
  const fetchBadgeCount = useCallback(async () => {
    try {
      const r = await apiGet('/api/rise/notifications?unreadOnly=true')
      if (!r.ok) return
      const data = await r.json()
      lastFetchAtRef.current = Date.now()
      if (mountedRef.current && data) {
        const newUnread = data.unreadCount || 0
        if (prevUnreadRef.current >= 0 && newUnread > prevUnreadRef.current) {
          playSound('notification')
          setWiggling(true)
          setTimeout(() => setWiggling(false), 600)
        }
        prevUnreadRef.current = newUnread
        setUnreadCount(newUnread)
      }
    } catch { /* silent */ }
  }, [])

  // Fetch on open + initial + when data changes (real-time)
  const { refreshKey } = useDataRefresh()
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications, refreshKey])

  // Sync browser permission state (also reacts to Settings changes)
  useEffect(() => {
    setPermState(getBrowserPermissionState())
  }, [open])

  // Poll every 30s when panel is open
  useEffect(() => {
    if (!open) return
    const poll = setInterval(() => {
      // EGRESS: skip ticks while the tab is hidden — the visibilitychange
      // handler below refetches on return.
      if (document.hidden) return
      fetchNotifications()
    }, 30000)
    pollRef.current = poll
    return () => clearInterval(poll)
  }, [open, fetchNotifications])

  // Poll every 5 min globally for badge count (even when closed).
  // PERF/EGRESS: was 45s, then 180s. With the tab left open this endpoint
  // dominated background Supabase egress (most polls return zero unread).
  // 300s + hidden-tab skip cuts visible-idle polling to ~12 req/hr and
  // hidden-idle to ZERO; any data change still refreshes the badge
  // instantly via useDataRefresh, and opening the panel fetches on demand.
  useEffect(() => {
    const REFRESH_MS = 300000
    const poll = setInterval(() => {
      if (document.hidden || open) return
      void fetchBadgeCount()
    }, REFRESH_MS)
    const handleVisibility = () => {
      if (document.hidden || open) return
      if (Date.now() - lastFetchAtRef.current >= REFRESH_MS) {
        void fetchBadgeCount()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [open, fetchBadgeCount])

  // Close on outside click + escape
  useEffect(() => {
    if (!open) return

    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true, read: true } : n)))
    setUnreadCount(prev => Math.max(0, prev - 1))
    try {
      await apiPut('/api/rise/notifications', { ids: [id] })
    } catch { /* silent */ }
  }

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(isUnread).map(n => n.id)
    if (unreadIds.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true, read: true })))
    setUnreadCount(0)
    try {
      await apiPut('/api/rise/notifications', { ids: unreadIds })
    } catch { /* silent */ }
  }

  const deleteNotification = async (id: string) => {
    const notif = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (notif && isUnread(notif)) {
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    try {
      await apiDelete(`/api/rise/notifications?id=${id}`)
    } catch { /* silent */ }
  }

  const clearAll = async () => {
    const ids = notifications.map(n => n.id)
    setNotifications([])
    setUnreadCount(0)
    try {
      // Single batch request instead of one DELETE per notification
      await apiDelete('/api/rise/notifications?all=true')
    } catch {
      // Fallback: legacy per-id deletion
      for (const id of ids) {
        try { await apiDelete(`/api/rise/notifications?id=${id}`) } catch { /* silent */ }
      }
    }
  }

  const handleClickNotif = (notif: Notification) => {
    if (isUnread(notif)) markAsRead(notif.id)
    if (notif.actionUrl) {
      window.dispatchEvent(new CustomEvent('rise:navigate', { detail: notif.actionUrl }))
      setOpen(false)
    }
  }

  const handleEnableNotifications = async () => {
    const state = await requestBrowserPermission()
    setPermState(state)
    if (state === 'granted') {
      playSound('success')
      showBrowserNotification('تم تفعيل الإشعارات ✓', {
        body: 'ستصلك التنبيهات والتذكيرات هنا',
        tag: 'rise-permission-granted',
        force: true,
      })
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 relative text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
        aria-label="الإشعارات"
      >
        {unreadCount > 0 ? (
          <motion.span
            animate={wiggling ? { rotate: [0, 15, -15, 10, -10, 0] } : {}}
            transition={{ duration: 0.5 }}
            className="inline-flex"
          >
            <BellRing className="w-4 h-4" />
          </motion.span>
        ) : (
          <Bell className="w-4 h-4" />
        )}
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -start-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold px-1 shadow-md"
          >
            {unreadCount > 99 ? '٩٩+' : unreadCount}
          </motion.span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              // Mobile: fixed sheet anchored under the header, fits any screen
              'fixed inset-x-3 top-16 z-50 max-h-[75vh] overflow-hidden',
              // Desktop: anchored popover next to the bell
              'sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-96',
              'bg-popover text-popover-foreground rounded-2xl border border-border',
              'shadow-lift'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                {unreadCount > 0 ? (
                  <BellRing className="w-4 h-4 text-gold" />
                ) : (
                  <Bell className="w-4 h-4 text-gold" />
                )}
                <h3 className="text-sm font-bold">الإشعارات</h3>
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
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Browser permission nudge — actionable, only when still undecided */}
            {permState === 'default' && (
              <div className="px-4 py-3 bg-gold/[0.07] border-b border-border flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-gold/15 text-gold flex items-center justify-center shrink-0">
                  <BellOff className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">فعّل إشعارات المتصفح</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">لتصلك التنبيهات والتذكيرات حتى لو التطبيق مقفول</p>
                </div>
                <Button
                  size="sm"
                  className="h-8 px-3 text-[11px] font-bold bg-gold hover:bg-gold/90 text-ink"
                  onClick={handleEnableNotifications}
                >
                  تفعيل
                </Button>
              </div>
            )}

            {/* Notifications list */}
            <ScrollArea className="max-h-96">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <span className="icon-well mb-3 h-14 w-14 bg-secondary text-muted-foreground/50">
                    <RiseGlyphIcon glyph="bell" size={22} />
                  </span>
                  <p className="text-sm text-muted-foreground">لا توجد إشعارات</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">ستظهر هنا التنبيهات والأخبار</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  <AnimatePresence mode="popLayout">
                    {notifications.map((notif) => (
                      <motion.div
                        key={notif.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                          'hover:bg-secondary',
                          isUnread(notif) && 'bg-rose-accent/[0.04]'
                        )}
                        onClick={() => handleClickNotif(notif)}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-sm',
                          getNotificationColor(notif.type)
                        )}>
                          {getNotificationIcon(notif)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              'text-sm truncate',
                              isUnread(notif) ? 'text-foreground font-semibold' : 'text-muted-foreground'
                            )}>
                              {notif.title}
                            </p>
                            {isUnread(notif) && (
                              <span className="w-2 h-2 rounded-full bg-rose-accent shrink-0" />
                            )}
                          </div>
                          {notif.body && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
                              {notif.body}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/50 mt-1">
                            {timeAgo(notif.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNotification(notif.id)
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>

            {/* Footer: Clear all */}
            {notifications.length > 0 && (
              <div className="border-t border-border px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  onClick={clearAll}
                >
                  <Trash2 className="w-3 h-3 me-1" />
                  مسح جميع الإشعارات
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}