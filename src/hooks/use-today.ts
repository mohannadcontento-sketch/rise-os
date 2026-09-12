'use client'

import { useEffect, useState } from 'react'
import { clearAllCache, bumpDataVersionExport } from '@/lib/api-fetch'

// ============================================================
// use-today.ts — «اليوم» في الواجهة مع كشف انقلاب منتصف الليل
//
// المصدر الوحيد لمفهوم «اليوم» (yyyy-MM-dd): يعيد الرسم عند تغيّر
// اليوم ويطلق تنظيف الكاش وأحداث إعادة الجلب لكل الوحدات.
//
// المسؤوليات:
//   1) مؤقت دقيق حتى 00:00:00 + safety net كل 5 دقائق.
//   2) كشف العودة من sleep/فتح التاب عبر visibilitychange.
//   3) بث rise:day-changed و rise:data-changed و rise:user-updated.
// ============================================================

/**
 * Returns today's date string (yyyy-MM-dd) and re-renders the component
 * when the calendar day changes (at exactly midnight 00:00:00).
 *
 * This is the single source of truth for "what day is it" in the UI.
 * Components that depend on today's date should use this hook instead of
 * calling `new Date()` once in useMemo([]) — which freezes the date for
 * the entire session and causes the "must logout/login to start a new day" bug.
 *
 * How it works:
 * 1. On mount, calculates the EXACT milliseconds until next midnight.
 * 2. Sets a setTimeout for that exact moment — fires precisely at 00:00:00.
 * 3. After midnight fires, recalculates and sets a new timeout for the next midnight.
 * 4. Also checks on visibilitychange (covers overnight sleep / tab refocus).
 * 5. 5-minute interval as a safety net backup.
 */
// ── القسم: الـ hook ──────────────────────────────────

export function useToday(): string {
  const [today, setToday] = useState(() => getTodayStr())

  useEffect(() => {
    // مقارنة داخل الأثر: الاستدعاءات المتكررة تُتجاهل ما لم يتغير اليوم فعلاً
    let lastDay = today

    const fireDayChange = () => {
      const now = getTodayStr()
      if (now !== lastDay) {
        lastDay = now
        setToday(now)
        // Global side-effects: clear cache + notify all components to re-fetch
        try { clearAllCache() } catch { /* ignore */ }
        // CRITICAL: bump the data-version token so the next GET's &_v= is new
        // — the server-side aggregate cache (keyed per date AND version) can
        // never serve the previous day's payload after midnight.
        try { bumpDataVersionExport() } catch { /* ignore */ }
        // ثلاثة أحداث: يوم جديد (إعادة الجلب بتاريخ اليوم) + إعادة جلب عامة
        // + تحديث بيانات المستخدم (XP اليوم/السلاسل تُصفَّر مع اليوم الجديد)
        window.dispatchEvent(new CustomEvent('rise:day-changed', { detail: { date: now } }))
        window.dispatchEvent(new CustomEvent('rise:data-changed', { detail: { reason: 'day-rollover' } }))
        window.dispatchEvent(new CustomEvent('rise:user-updated'))
      }
    }

    // ─── 1. Precise midnight timeout ───────────────────────────────
    // Calculate exact ms until next midnight (00:00:00 local time)
    const getMsUntilMidnight = (): number => {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0) // Next 00:00:00
      return midnight.getTime() - now.getTime()
    }

    let midnightTimeout: ReturnType<typeof setTimeout>

    const scheduleMidnightCheck = () => {
      midnightTimeout = setTimeout(() => {
        fireDayChange()
        // Schedule the next midnight check (recursive)
        scheduleMidnightCheck()
      }, getMsUntilMidnight())
    }

    scheduleMidnightCheck()

    // ─── 2. Visibility change (covers overnight sleep) ─────────────
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fireDayChange()
        // Re-schedule the midnight timeout in case the browser
        // throttled it during background/sleep
        clearTimeout(midnightTimeout)
        scheduleMidnightCheck()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    // ─── 3. Safety net: 5-minute interval ──────────────────────────
    const safetyInterval = setInterval(fireDayChange, 5 * 60_000)

    // ─── Cleanup ───────────────────────────────────────────────────
    return () => {
      clearTimeout(midnightTimeout)
      clearInterval(safetyInterval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}

// ── القسم: مساعدات التاريخ ──────────────────────────────────

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
