'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * usePersistedData — survives component re-mounts within the same page session.
 *
 * When a component using `hidden` CSS class re-mounts (e.g., during tab switches),
 * it loses its React state. This hook stores the latest data in a module-level Map
 * so it can be restored instantly on re-mount, BEFORE the server fetch completes.
 *
 * Usage:
 *   const [items, setItems] = usePersistedData<MyItem[]>('my-items', [])
 *   // items starts with persisted data (if any), then fetchData() updates it
 *
 * The persisted data always reflects the LATEST state (including optimistic updates),
 * because we sync to the store on every state change.
 */

// Module-level store — survives component unmount/remount, cleared on page refresh
const _store = new Map<string, any>()

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

/**
 * React hook: useState + auto-persist to module-level store.
 *
 * @param key  Unique key for this data (e.g., 'tasks', 'projects')
 * @param initial  Fallback initial value if nothing is persisted
 * @returns [state, setState] — same API as useState
 */
export function usePersistedData<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  // Initialize from persisted store (instant on re-mount)
  const [state, setStateRaw] = useState<T>(() => {
    const persisted = _store.get(key)
    return persisted !== undefined ? (persisted as T) : initial
  })

  // Track if this is the first render (to avoid overwriting persisted data with initial)
  const isFirstRender = useRef(true)

  // Sync state to persisted store on every change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      // On first render, if we have persisted data, it was already set as initial state.
      // If we DON'T have persisted data, save the initial value.
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
      // Update store immediately (before React re-render)
      _store.set(key, next)
      return next
    })
  }, [key])

  return [state, setState]
}