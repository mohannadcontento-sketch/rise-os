'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellRing, CheckCheck, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiGet, apiPut, apiDelete } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

interface Notification {
  id: string
  title: string
  body?: string
  type?: string
  icon?: string
  actionUrl?: string
  isRead: boolean
  createdAt: string
}

// Type-based icon color mapping
const typeColors: Record<string, string> = {
  success: 'bg-emerald-accent/15 text-emerald-accent',
  achievement: 'bg-amber-500/15 text-amber-500',
  info: 'bg-sky-500/15 text-sky-500',
  warning: 'bg-orange-500/15 text-orange-500',
  error: 'bg-red-500/15 text-red-500',
  task: 'bg-emerald-accent/15 text-emerald-accent',
  habit: 'bg-orange-500/15 text-orange-500',
  focus: 'bg-violet-500/15 text-violet-500',
  morning: 'bg-amber-500/15 text-amber-400',
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
    if (minutes < 60) return `منذ ${minutes} دقائق`
    if (hours < 24) return `منذ ${hours} ساعات`
    if (days < 7) return `منذ ${days} أيام`
    return `منذ ${Math.floor(days / 7)} أسابيع`
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
  const panelRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadingRef = useRef(false)
  const mountedRef = useRef(true)
  const prevUnreadRef = useRef(-1)

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
              const latestUnread = newNotifs.filter(n => !n.isRead).slice(0, newUnread - prevUnreadRef.current)
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

            // Request permission on first notification if not yet granted
            if (newUnread > 0 && 'Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission().catch(() => {})
            }
          }

          prevUnreadRef.current = newUnread
          setNotifications(newNotifs)
          setUnreadCount(newUnread)
        }
      }
    } catch { /* silent */ }
    finally { loadingRef.current = false }
  }, [])

  // Fetch on open + initial
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Poll every 30s when panel is open
  useEffect(() => {
    if (!open) return
    const poll = setInterval(fetchNotifications, 30000)
    pollRef.current = poll
    return () => clearInterval(poll)
  }, [open, fetchNotifications])

  // Poll every 45s globally for badge count (even when closed)
  useEffect(() => {
    const poll = setInterval(() => {
      if (!open) {
        apiGet('/api/rise/notifications?unreadOnly=true')
          .then(r => r.ok ? r.json() : null)
          .then(data => {
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
          })
          .catch(() => {})
      }
    }, 45000)
    return () => clearInterval(poll)
  }, [open])

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
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)))
    setUnreadCount(prev => Math.max(0, prev - 1))
    try {
      await apiPut('/api/rise/notifications', { ids: [id] })
    } catch { /* silent */ }
  }

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id)
    if (unreadIds.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
    try {
      await apiPut('/api/rise/notifications', { ids: unreadIds })
    } catch { /* silent */ }
  }

  const deleteNotification = async (id: string) => {
    const notif = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (notif && !notif.isRead) {
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
      for (const id of ids) {
        await apiDelete(`/api/rise/notifications?id=${id}`)
      }
    } catch { /* silent */ }
  }

  const handleClickNotif = (notif: Notification) => {
    if (!notif.isRead) markAsRead(notif.id)
    if (notif.actionUrl) {
      window.dispatchEvent(new CustomEvent('rise:navigate', { detail: notif.actionUrl }))
      setOpen(false)
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
            className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-md"
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
              'absolute left-0 top-full mt-2 w-80 sm:w-96 z-50',
              'glass rounded-xl border border-white/10 dark:border-white/5',
              'shadow-xl shadow-black/10 dark:shadow-black/30',
              'overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 dark:border-white/5">
              <div className="flex items-center gap-2">
                {unreadCount > 0 ? (
                  <BellRing className="w-4 h-4 text-forest" />
                ) : (
                  <Bell className="w-4 h-4 text-forest" />
                )}
                <h3 className="text-sm font-bold">الإشعارات</h3>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                    {unreadCount} جديد
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-forest hover:text-forest hover:bg-forest/10"
                    onClick={markAllAsRead}
                  >
                    <CheckCheck className="w-3 h-3 ml-1" />
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

            {/* Notifications list */}
            <ScrollArea className="max-h-96">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                    <Bell className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">لا توجد إشعارات</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">ستظهر هنا التنبيهات والأخبار</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5 dark:divide-white/5">
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
                          'hover:bg-white/5 dark:hover:bg-white/[0.03]',
                          !notif.isRead && 'bg-emerald-accent/[0.03]'
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
                              notif.isRead ? 'text-muted-foreground' : 'text-foreground font-semibold'
                            )}>
                              {notif.title}
                            </p>
                            {!notif.isRead && (
                              <span className="w-2 h-2 rounded-full bg-emerald-accent shrink-0" />
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
              <div className="border-t border-white/10 dark:border-white/5 px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  onClick={clearAll}
                >
                  <Trash2 className="w-3 h-3 ml-1" />
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