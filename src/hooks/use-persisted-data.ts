'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * usePersistedData — survives component re-mounts within the same page session.
 *
 * When a component using `hidden` CSS class re-mounts (e.g., during tab switches),
 * it loses its React state. This hook stores the latest data in a module-level Map
 * so it can be restored instantly on re-mount, BEFORE the server fetch completes.
 *
 * FIX: Now listens to `rise:data-changed` events. When data changes externally
 * (e.g., another tab, mutation in a sibling component), the store entry is cleared
 * so the component gets fresh data on its next fetch cycle. The visible React state
 * is NOT reset to avoid UI flashing (empty list → data reload).
 *
 * Usage:
 *   const [items, setItems, dataVersion] = usePersistedData<MyItem[]>('my-items', [])
 *   // Use dataVersion as a dependency in your fetch useEffect to re-fetch on changes
 *
 * The persisted data always reflects the LATEST state (including optimistic updates),
 * because we sync to the store on every state change.
 */

// Module-level store — survives component unmount/remount, cleared on page refresh
const _store = new Map<string, any>()

/** Global data version counter — incremented on any data change */
let _globalDataVersion = 0

/** Read persisted data (used internally, also exported for advanced use) */
export function getPersistedData<T = any>(key: string): T | undefined {
  return _store.get(key) as T | undefined
}

/** Write persisted data (used internally, also exported for advanced use) */
export function setPersistedData(key: string, data: any): void {
  _store.set(key, data)
}

/** Clear specific key or all keys */
export function clearPersistedData(key?: string): void {
  if (key) _store.delete(key)
  else _store.clear()
}

/** Get the current global data version (for external use) */
export function getGlobalDataVersion(): number {
  return _globalDataVersion
}

/**
 * React hook: useState + auto-persist to module-level store + real-time sync.
 *
 * @param key  Unique key for this data (e.g., 'tasks', 'projects')
 * @param initial  Fallback initial value if nothing is persisted
 * @returns [state, setState, dataVersion] — dataVersion increments on external data changes
 */
export function usePersistedData<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>, number] {
  // Initialize from persisted store (instant on re-mount)
  const [state, setStateRaw] = useState<T>(() => {
    const persisted = _store.get(key)
    return persisted !== undefined ? (persisted as T) : initial
  })

  // Track if this is the first render (to avoid overwriting persisted data with initial)
  const isFirstRender = useRef(true)

  // Data version — incremented when external data changes, used as fetch dependency
  const [dataVersion, setDataVersion] = useState(0)

  // ─── Listen to global data changes ───
  useEffect(() => {
    const handleDataChange = () => {
      // Clear the persisted store entry so this component gets fresh data
      // on next mount or re-fetch. DO NOT reset React state to avoid UI flash.
      _store.delete(key)
      // Increment local version to trigger re-fetch in component's useEffect
      setDataVersion(v => v + 1)
    }

    window.addEventListener('rise:data-changed', handleDataChange)
    return () => window.removeEventListener('rise:data-changed', handleDataChange)
  }, [key])

  // Sync state to persisted store on every change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      if (_store.get(key) === undefined) {
        _store.set(key, state)
      }
      return
    }
    _store.set(key, state)
  }, [key, state])

  // Wrap setState to also update the store
  const setState = useCallback<React.Dispatch<React.SetStateAction<T>>>((action) => {
    setStateRaw((prev) => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(prev) : action
      _store.set(key, next)
      return next
    })
  }, [key])

  return [state, setState, dataVersion]
}
