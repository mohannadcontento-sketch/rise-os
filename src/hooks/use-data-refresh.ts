'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ============================================================
// use-data-refresh.ts — ناقل حدث تغيّر البيانات إلى المتحكمات
//
// يحوّل بث rise:data-changed (يبثه apiFetch بعد كل طفرة ناجحة) إلى
// عدّاد refreshKey تضيفه المتحكمات كتبعية لإعادة الجلب تلقائياً.
//
// المسؤوليات:
//   1) الاستماع للحدث مع debounce يدمج الأحداث المتتالية في جلب واحد.
//   2) triggerRefresh: بث الحدث يدوياً من أي مكون عند الحاجة.
// ============================================================

const DATA_CHANGED_EVENT = 'rise:data-changed'

/**
 * Listens for the `rise:data-changed` custom event (dispatched by apiFetch
 * after every successful POST/PUT/DELETE) and returns a `refreshKey` counter
 * that increments each time, so components can add it as a useEffect dependency
 * to automatically re-fetch their data.
 *
 * Uses a short 100ms debounce to batch rapid events (e.g. toggle habit →
 * earn-xp → notification all fire data-changed) into a single refresh.
 * 100ms is fast enough to feel instant to the user while preventing
 * cascading re-fetches.
 */
// ── القسم: الـ hook — عدّاد التحديث ──────────────────────────────────

export function useDataRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = () => {
      // debounce 200ms: دمج سلسلة أحداث متتالية (طفرة → XP → إشعار) في جلب واحد
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setRefreshKey((k) => k + 1)
      }, 200)
    }
    window.addEventListener(DATA_CHANGED_EVENT, handler)
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handler)
      // إلغاء مؤقت معلّق عند unmount — لا setRefreshKey على مكون مُزال
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ── القسم: البث اليدوي للحدث ──────────────────────────────────

  const triggerRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
  }, [])

  return { refreshKey, triggerRefresh }
}
