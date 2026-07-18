'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiGet, apiPut, apiDelete } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  title: string
  body?: string
  type?: string
  icon?: string
  action_url?: string
  is_read: boolean
  created_at: string
}

function timeAgo(dateStr: string): string {
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
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadingRef = useRef(false)
  const mountedRef = useRef(true)

  // Ensure cleanup doesn't update unmounted component
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // Fetch on open
  useEffect(() => {
    if (open && !loadingRef.current) {
      loadingRef.current = true
      apiGet('/api/rise/notifications')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!mountedRef.current) return
          if (data) {
            setNotifications(data.notifications || [])
            setUnreadCount(data.unreadCount || 0)
          }
        })
        .catch(() => {})
        .finally(() => { loadingRef.current = false })
    }
  }, [open])

  // Poll every 30s when open
  useEffect(() => {
    if (!open) return
    const poll = setInterval(() => {
      apiGet('/api/rise/notifications')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!mountedRef.current) return
          if (data) {
            setNotifications(data.notifications || [])
            setUnreadCount(data.unreadCount || 0)
          }
        })
        .catch(() => {})
    }, 30000)
    pollRef.current = poll
    return () => clearInterval(poll)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const markAsRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
    try {
      await apiPut('/api/rise/notifications', { ids: [id] })
    } catch {
      // silent
    }
  }

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
    try {
      await apiPut('/api/rise/notifications', { ids: unreadIds })
    } catch {
      // silent
    }
  }

  const deleteNotification = async (id: string) => {
    const notif = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (notif && !notif.is_read) {
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    try {
      await apiDelete(`/api/rise/notifications?id=${id}`)
    } catch {
      // silent
    }
  }

  const handleClickNotif = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id)
    if (notif.action_url) {
      // Navigate via custom event
      window.dispatchEvent(new CustomEvent('rise:navigate', { detail: notif.action_url }))
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
        <Bell className="w-4 h-4" />
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
                <Bell className="w-4 h-4 text-forest" />
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
                          'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                          'hover:bg-white/5 dark:hover:bg-white/[0.03]',
                          !notif.is_read && 'bg-emerald-accent/[0.03]'
                        )}
                        onClick={() => handleClickNotif(notif)}
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5 text-sm">
                          {notif.icon || '🔔'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              'text-sm truncate',
                              notif.is_read ? 'text-muted-foreground' : 'text-foreground font-semibold'
                            )}>
                              {notif.title}
                            </p>
                            {!notif.is_read && (
                              <span className="w-2 h-2 rounded-full bg-emerald-accent shrink-0" />
                            )}
                          </div>
                          {notif.body && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
                              {notif.body}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/50 mt-1">
                            {timeAgo(notif.created_at)}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}