'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

const _store = new Map<string, any>()

export function getPersistedData<T = any>(key: string): T | undefined {
  return _store.get(key) as T | undefined
}

export function setPersistedData(key: string, data: any): void {
  _store.set(key, data)
}

export function clearPersistedData(key?: string): void {
  if (key) _store.delete(key)
  else _store.clear()
}

export function usePersistedData<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setStateRaw] = useState<T>(() => {
    const persisted = _store.get(key)
    return persisted !== undefined ? (persisted as T) : initial
  })

  const isFirstRender = useRef(true)

  useEffect(() => {
    const handleDataChange = () => {
      _store.delete(key)
      setStateRaw(initial)
    }
    
    window.addEventListener('rise:data-changed', handleDataChange)
    return () => window.removeEventListener('rise:data-changed', handleDataChange)
  }, [key, initial])

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

  const setState = useCallback<React.Dispatch<React.SetStateAction<T>>>((action) => {
    setStateRaw((prev) => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(prev) : action
      _store.set(key, next)
      return next
    })
  }, [key])

  return [state, setState]
}