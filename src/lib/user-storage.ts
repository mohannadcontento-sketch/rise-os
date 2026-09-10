'use client'

/**
 * Synchronous, non-secret user-scoped storage for UI state.
 * Security boundary: keys are derived from the currently authenticated user
 * metadata. We deliberately do not migrate legacy unscoped keys because their
 * ownership cannot be established safely.
 */
function currentUserId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const parsed = JSON.parse(localStorage.getItem('rise-user-info') || '{}')
    return typeof parsed.id === 'string' ? parsed.id : ''
  } catch {
    return ''
  }
}

export function userStorageKey(key: string, userId = currentUserId()): string {
  if (!userId) return `rise-unbound:${key}`
  return `rise-user:${userId}:${key}`
}

export function getUserStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  const userId = currentUserId()
  if (!userId) return null
  try { return localStorage.getItem(userStorageKey(key, userId)) } catch { return null }
}

export function setUserStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  const userId = currentUserId()
  if (!userId) return
  try { localStorage.setItem(userStorageKey(key, userId), value) } catch { /* ignore */ }
}

export function removeUserStorage(key: string): void {
  if (typeof window === 'undefined') return
  const userId = currentUserId()
  if (!userId) return
  try { localStorage.removeItem(userStorageKey(key, userId)) } catch { /* ignore */ }
}

export function clearUserStorage(userId: string): void {
  if (typeof window === 'undefined' || !userId) return
  const prefix = `rise-user:${userId}:`
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch { /* ignore */ }
}
