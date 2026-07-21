'use client'

import { useState, useEffect, useCallback } from 'react'

const DATA_CHANGED_EVENT = 'rise:data-changed'

/**
 * Listens for the `rise:data-changed` custom event (dispatched by apiFetch
 * after every successful POST/PUT/DELETE) and returns a `refreshKey` counter
 * that increments each time, so components can add it as a useEffect dependency
 * to automatically re-fetch their data.
 */
export function useDataRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener(DATA_CHANGED_EVENT, handler)
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler)
  }, [])

  const triggerRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
  }, [])

  return { refreshKey, triggerRefresh }
}