'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const DATA_CHANGED_EVENT = 'rise:data-changed'

/**
 * Listens for the `rise:data-changed` custom event (dispatched by apiFetch
 * after every successful POST/PUT/DELETE) and returns a `refreshKey` counter
 * that increments each time, so components can add it as a useEffect dependency
 * to automatically re-fetch their data.
 *
 * FIX: Added 500ms debouncing — if multiple data-changed events fire in rapid
 * succession (e.g. bulk task operations, multiple API calls in a single user
 * action), only ONE refreshKey increment happens after the burst settles.
 * This prevents cascading re-fetches that caused the dashboard 429 errors.
 */
export function useDataRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = () => {
      // Debounce: wait 500ms after the last event before incrementing.
      // This batches rapid bursts (e.g. toggle habit → earn-xp → notification
      // all fire data-changed) into a single refresh.
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
