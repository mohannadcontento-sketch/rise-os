'use client'

import { useEffect, useRef, useState } from 'react'
import { clearAllCache } from '@/lib/api-fetch'

/**
 * Returns today's date string (yyyy-MM-dd) and re-renders the component
 * when the calendar day changes (at midnight, or when the tab regains focus
 * after being inactive across midnight).
 *
 * This is the single source of truth for "what day is it" in the UI.
 * Components that depend on today's date should use this hook instead of
 * calling `new Date()` once in useMemo([]) — which freezes the date for
 * the entire session and causes the "must logout/login to start a new day" bug.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => getTodayStr())

  useEffect(() => {
    let lastDay = today

    const check = () => {
      const now = getTodayStr()
      if (now !== lastDay) {
        lastDay = now
        setToday(now)
        // Global side-effects: clear cache + notify all components to re-fetch
        try { clearAllCache() } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent('rise:day-changed', { detail: { date: now } }))
        // Also dispatch the generic data-changed event so useDataRefresh subscribers re-fetch
        window.dispatchEvent(new CustomEvent('rise:data-changed', { detail: { reason: 'day-rollover' } }))
        // Force a full page state refresh by dispatching user-updated too (sidebar re-fetches XP/streak)
        window.dispatchEvent(new CustomEvent('rise:user-updated'))
      }
    }

    // Check every 5 minutes (catches midnight rollover while tab is open).
    // FIX: Reduced from 30s to 5min — checking every 30s was unnecessary
    // load and contributed to the dashboard 429 rate-limit cascade.
    // Midnight only happens once a day; 5min polling is more than enough.
    const interval = setInterval(check, 5 * 60_000)

    // Also check when the tab becomes visible again (catches overnight sleep).
    // FIX: Removed window.addEventListener('focus', check) — the focus event
    // fires on EVERY click that returns focus to the window, which caused
    // check() to run on every user interaction. visibilitychange already
    // covers the "tab refocus" case and only fires when visibility actually
    // changes (hidden → visible), not on every focus.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}

function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Static helper (no reactivity) — for one-off date computations.
 * For components that need to re-render on day change, use useToday() instead.
 */
export function todayStr(): string {
  return getTodayStr()
}
