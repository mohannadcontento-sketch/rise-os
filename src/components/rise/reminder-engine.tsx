'use client'

/**
 * ReminderEngine — global, always-on reminder dispatcher.
 *
 * Until now habit reminders only fired while the habits page happened to be
 * open (the checker lived inside that module). This engine is mounted once
 * in the app shell, so reminders fire on ANY page:
 *
 *   • Wake-up reminder   ← settings.wakeUpTime   (pref: notifications.morning)
 *   • Sleep reminder     ← settings.sleepTime    (pref: notifications.sleep)
 *   • Habit reminders    ← habit.reminderTime    (pref: notifications.habits)
 *
 * Each reminder fires at most ONCE per day (localStorage guard), and is
 * delivered three ways: in-app toast, browser notification (if permission
 * granted), and persisted in-app notification (bell inbox, via the API).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api-fetch'
import { pushNotification } from '@/lib/notifications'
import {
  isNotificationEnabled,
  showBrowserNotification,
} from '@/lib/notification-prefs'

interface ReminderHabit {
  id: string
  name: string
  icon: string
  reminderTime?: string | null
}

interface FiredState {
  date: string
  keys: string[]
}

const FIRED_KEY = 'rise-reminders-fired'
const HABITS_REFRESH_MS = 5 * 60 * 1000
const TICK_MS = 15 * 1000

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function loadFired(): FiredState {
  try {
    const raw = localStorage.getItem(FIRED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as FiredState
      if (parsed.date === todayStr()) return parsed
    }
  } catch { /* ignore */ }
  return { date: todayStr(), keys: [] }
}

function saveFired(state: FiredState) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

export function ReminderEngine() {
  // Habits with reminder times — refreshed periodically + on data changes
  const [habitReminders, setHabitReminders] = useState<ReminderHabit[]>([])
  const habitRemindersRef = useRef<ReminderHabit[]>([])
  const firedRef = useRef<FiredState>(loadFired())
  const checkingRef = useRef(false)

  const fetchHabits = useCallback(async () => {
    try {
      const res = await apiGet('/api/rise/habits')
      if (!res.ok) return
      const data = await res.json()
      const habits: ReminderHabit[] = (data?.habits || []).filter(
        (h: ReminderHabit) => h?.reminderTime
      )
      habitRemindersRef.current = habits
      setHabitReminders(habits)
    } catch { /* silent */ }
  }, [])

  // Initial + periodic refresh of habit reminder times
  // PERF FIX: the interval used to fetch even when the tab was hidden —
  // a hidden tab is the most common idle state (user switched to another
  // app), so this poll was pure egress. Now skipped while hidden, and
  // refetched immediately when the tab becomes visible again.
  useEffect(() => {
    fetchHabits()
    const interval = setInterval(() => {
      if (document.hidden) return
      fetchHabits()
    }, HABITS_REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) fetchHabits()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchHabits])

  // Also refresh when habit data changes (habit created/reminder updated).
  // PERF FIX: the event now carries detail.resource — this engine only needs
  // to refetch when the write touched habits (or the resource is unknown,
  // e.g. legacy dispatchers / offline flush). A finance record no longer
  // triggers a pointless habits GET on every save.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = (e: Event) => {
      const resource = (e as CustomEvent).detail?.resource
      if (resource && resource !== 'habits') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(fetchHabits, 800)
    }
    window.addEventListener('rise:data-changed', handler)
    return () => {
      window.removeEventListener('rise:data-changed', handler)
      if (timer) clearTimeout(timer)
    }
  }, [fetchHabits])

  const fireReminder = useCallback((key: string, title: string, body: string, actionUrl: string, icon: string) => {
    const fired = firedRef.current
    if (fired.keys.includes(key)) return
    fired.keys = [...fired.keys, key]
    saveFired(fired)

    toast(title, {
      description: body,
      duration: 7000,
      action: {
        label: 'افتح',
        onClick: () => window.dispatchEvent(new CustomEvent('rise:navigate', { detail: actionUrl })),
      },
    })
    // Reminders are the point — show the browser notification even when focused
    showBrowserNotification(title, { body, tag: `rise-reminder-${key}`, force: true })
    pushNotification({ title, body, type: 'reminder', icon, actionUrl })
  }, [])

  const check = useCallback(() => {
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      // Reset the guard when the day rolls over
      if (firedRef.current.date !== todayStr()) {
        firedRef.current = { date: todayStr(), keys: [] }
        saveFired(firedRef.current)
      }

      const time = nowHHMM()
      let settings: any = null
      try { settings = JSON.parse(localStorage.getItem('rise-settings') || 'null') } catch { /* ignore */ }

      // Wake-up reminder
      if (settings?.wakeUpTime && settings.wakeUpTime === time) {
        if (isNotificationEnabled('morning')) {
          fireReminder(
            'morning',
            '☀️ حان وقت الاستيقاظ!',
            'ابدأ روتينك الصباحي وامتلك يومك',
            'morning',
            '🌅'
          )
        }
      }

      // Sleep reminder
      if (settings?.sleepTime && settings.sleepTime === time) {
        if (isNotificationEnabled('sleep')) {
          fireReminder(
            'sleep',
            '🌙 وقت النوم',
            'أنهِ يومك بهدوء — راجع إنجازاتك ونم مبكراً',
            'dashboard',
            '🌙'
          )
        }
      }

      // Habit reminders
      if (isNotificationEnabled('habits')) {
        for (const habit of habitRemindersRef.current) {
          if (!habit.reminderTime || habit.reminderTime !== time) continue
          fireReminder(
            `habit:${habit.id}`,
            `${habit.icon || '⏰'} حان وقت: ${habit.name}`,
            'لا تنسَ إتمام عادتك اليوم — سلسلتك في خطر! 🔥',
            'habits',
            '⏰'
          )
        }
      }
    } finally {
      checkingRef.current = false
    }
  }, [fireReminder])

  // Tick every 15s — the once-per-day guard makes extra ticks harmless
  useEffect(() => {
    check()
    const interval = setInterval(check, TICK_MS)
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  // Render nothing — pure side-effect component
  return null
}

export default ReminderEngine
