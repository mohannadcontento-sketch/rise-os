'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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
export function useDataRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setRefreshKey((k) => k + 1)
      }, 500)
    }
    window.addEventListener(DATA_CHANGED_EVENT, handler)
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handler)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const triggerRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
  }, [])

  return { refreshKey, triggerRefresh }
}
