'use client'

import { useEffect } from 'react'
import { useRiseStore } from '@/store/app-store'

function clearClientAuthMetadata() {
  try {
    localStorage.removeItem('rise-auth')
    localStorage.removeItem('rise-user-info')
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.includes('auth-token')) doomed.push(k)
    }
    doomed.forEach((k) => localStorage.removeItem(k))
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setAuth, logout } = useRiseStore()

  useEffect(() => {
    let mounted = true

    const restore = async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        if (!mounted) return
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            clearClientAuthMetadata()
            logout()
          }
          return
        }
        const data = await res.json()
        if (!data.user) {
          clearClientAuthMetadata()
          logout()
          return
        }
        const user = data.user
        localStorage.setItem('rise-user-info', JSON.stringify(user))
        setAuth({
          isAuthenticated: true,
          userId: user.id,
          userEmail: user.email || '',
          userName: user.name || '',
          isAdmin: !!user.isAdmin,
          accessToken: '',
        })
        window.dispatchEvent(new CustomEvent('rise:user-authenticated'))
      } catch {
        // Keep any already-established in-memory session during a transient network failure.
      }
    }

    void restore()

    const onExpired = () => {
      clearClientAuthMetadata()
      logout()
    }
    const onRefreshed = (event: Event) => {
      const user = (event as CustomEvent).detail?.user
      if (!mounted || !user) return
      localStorage.setItem('rise-user-info', JSON.stringify(user))
      setAuth({
        isAuthenticated: true,
        userId: user.id,
        userEmail: user.email || '',
        userName: user.name || '',
        isAdmin: !!user.isAdmin,
        accessToken: '',
      })
      window.dispatchEvent(new CustomEvent('rise:user-authenticated'))
    }

    window.addEventListener('rise:session-expired', onExpired)
    window.addEventListener('rise:auth-refreshed', onRefreshed)

    return () => {
      mounted = false
      window.removeEventListener('rise:session-expired', onExpired)
      window.removeEventListener('rise:auth-refreshed', onRefreshed)
    }
  }, [setAuth, logout])

  return <>{children}</>
}
