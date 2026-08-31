'use client'

// ============================================================
// RiseOS — AuthProvider
// ------------------------------------------------------------
// Single source of truth for authentication state.
//
// PRODUCTION (Supabase configured):
//   • Uses the client-side Supabase client (autoRefreshToken: true)
//   • Listens to onAuthStateChange:
//       - SIGNED_IN / TOKEN_REFRESHED → update Zustand + sync httpOnly cookie
//       - SIGNED_OUT → clear Zustand + clear cookies + show login
//   • The Supabase client refreshes the JWT ~60s before expiry, so
//     API calls ALWAYS have a valid token (no 401 storm).
//   • On TOKEN_REFRESHED, syncs the new token to the httpOnly cookie
//     via /api/auth/sync-token (so server-side routes also see the fresh JWT).
//
// MOCK/DEV (no Supabase env vars):
//   • Falls back to the httpOnly cookie + localStorage approach.
//   • Validates session via /api/auth/session on mount.
// ============================================================

import { useEffect, useRef } from 'react'
import { supabaseClient, isSupabaseClientConfigured } from '@/lib/supabase-client'
import { useRiseStore } from '@/store/app-store'

// Stale-session cleanup: when Supabase cannot restore/refresh a session
// (expired or revoked refresh token → its internal /auth/v1/token call
// returns 400), we must clear the cached session so the user gets a
// clean login instead of a broken authed shell.
function clearStaleSession() {
  try {
    localStorage.removeItem('rise-auth')
    localStorage.removeItem('rise-user-info')
    localStorage.removeItem('rise-user-avatar')
    // Also purge Supabase's own cached session (sb-<ref>-auth-token) so a
    // dead session cannot be resurrected by supabase.auth.getSession() on
    // the next page load — this is what caused "enters the app without
    // login, but with no account".
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.includes('auth-token')) doomed.push(k)
    }
    doomed.forEach((k) => localStorage.removeItem(k))
  } catch { /* ignore */ }
  try {
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim()
      if (name.startsWith('rise-')) {
        document.cookie = `${name}=; Path=/; Max-Age=0`
      }
    })
  } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setAuth, logout } = useRiseStore()
  const syncInProgress = useRef(false)

  const syncSessionToCookie = async (session: any) => {
    if (syncInProgress.current) return
    if (!session?.access_token || !session?.refresh_token) return
    syncInProgress.current = true
    try {
      await fetch('/api/auth/sync-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        }),
        credentials: 'include',
      })
    } catch {
      // Network error — non-fatal, the Authorization header still works
    } finally {
      syncInProgress.current = false
    }
  }

  const buildAuthFromSupabase = async (user: any, session: any) => {
    if (!user) return null
    let isAdmin = false
    let name = user.user_metadata?.name || user.email?.split('@')[0] || 'مستخدم'
    try {
      // COOKIE-LESS FIX: /api/auth/session used to rely on the httpOnly cookie
      // only. Sessions established BEFORE the cookie system (or where cookie
      // sync failed) worked fine via the Authorization header in apiFetch —
      // but this route returned {user:null} → isAdmin stayed false forever,
      // so the owner never saw the admin panel despite profiles.role='admin'.
      // Now we pass the token explicitly (session → localStorage fallback).
      const token = session?.access_token
        || (() => { try { return JSON.parse(localStorage.getItem('rise-auth') || 'null')?.access_token } catch { return null } })()
      const res = await fetch('/api/auth/session', {
        credentials: 'include',
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      })
      if (res.status === 401 || res.status === 403) {
        // The server rejected the token (revoked/expired session) — treat
        // the whole session as stale. Without this, users with a dead
        // Supabase session still "enter" the app with an empty account.
        return 'stale' as const
      }
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          isAdmin = !!data.user.isAdmin
          name = data.user.name || name
        }
      }
    } catch { /* network error — keep lenient behavior */ }

    return {
      isAuthenticated: true,
      userId: user.id,
      userEmail: user.email || '',
      userName: name,
      isAdmin,
      accessToken: session?.access_token || '',
    }
  }

  useEffect(() => {
    // MODE 1: Supabase client (production)
    if (isSupabaseClientConfigured && supabaseClient) {
      let mounted = true

      supabaseClient.auth.getSession().then(async ({ data: { session }, error }) => {
        if (!mounted) return
        // Session restore failed (expired refresh token etc.) → clean slate
        if (error) {
          clearStaleSession()
          logout()
          return
        }
        if (session?.user) {
          await syncSessionToCookie(session)
          const auth = await buildAuthFromSupabase(session.user, session)
          if (auth === 'stale') {
            // Dead session — sign out everywhere so the user gets a clean login
            supabaseClient?.auth.signOut().catch(() => {})
            clearStaleSession()
            logout()
            return
          }
          if (mounted && auth) {
            localStorage.setItem('rise-user-info', JSON.stringify({
              id: session.user.id,
              email: session.user.email || '',
              name: auth.userName,
              isAdmin: auth.isAdmin,
              avatar: null,
            }))
            setAuth(auth)
          }
        } else {
          await tryRestoreFromCookie()
        }
      })

      const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) return
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              await syncSessionToCookie(session)
              const auth = await buildAuthFromSupabase(session.user, session)
              if (auth === 'stale') {
                supabaseClient?.auth.signOut().catch(() => {})
                clearStaleSession()
                logout()
                return
              }
              if (mounted && auth) {
                localStorage.setItem('rise-user-info', JSON.stringify({
                  id: session.user.id,
                  email: session.user.email || '',
                  name: auth.userName,
                  isAdmin: auth.isAdmin,
                  avatar: null,
                }))
                setAuth(auth)
              }
            }
          } else if (!session && event === 'INITIAL_SESSION') {
            // INITIAL_SESSION with a null session = no recoverable session.
            // If we still hold a cached session it is stale — clear quietly
            // so the user gets a clean login (prevents refresh-400 loops).
            const stored = (() => { try { return localStorage.getItem('rise-auth') } catch { return null } })()
            if (stored) { clearStaleSession(); logout() }
          } else if (event === 'SIGNED_OUT') {
            clearStaleSession()
            try {
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            } catch { /* ignore */ }
            logout()
          }
        }
      )

      // IMPORTANT: also honor 'rise:session-expired' in production mode.
      // This event is dispatched by api-fetch when a 401 survives the
      // refresh attempt. Previously it was only handled in mock/dev mode,
      // so a stale token could keep the user inside a ghost session
      // (empty account, 401/403 console errors) with no forced logout.
      const handleExpired = () => {
        clearStaleSession()
        logout()
      }
      window.addEventListener('rise:session-expired', handleExpired)

      return () => {
        mounted = false
        subscription.unsubscribe()
        window.removeEventListener('rise:session-expired', handleExpired)
      }
    }

    // MODE 2: Mock/dev (no Supabase env vars)
    tryRestoreFromCookie()

    // Listen for session-expired events (from api-fetch 401 handler)
    const handleExpired = () => {
      logout()
    }
    window.addEventListener('rise:session-expired', handleExpired)
    return () => {
      window.removeEventListener('rise:session-expired', handleExpired)
    }
  }, [])

  async function tryRestoreFromCookie() {
    try {
      const stored = localStorage.getItem('rise-auth')
      const userInfo = localStorage.getItem('rise-user-info')
      if (stored && userInfo) {
        const session = JSON.parse(stored)
        const info = JSON.parse(userInfo)
        if (session.access_token) {
          setAuth({
            isAuthenticated: true,
            userId: info.id || '',
            userEmail: info.email || '',
            userName: info.name || '',
            isAdmin: info.isAdmin || false,
            accessToken: session.access_token,
          })
        }
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      const res = await fetch('/api/auth/session', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      if (data.user) {
        localStorage.setItem('rise-user-info', JSON.stringify(data.user))
        const session = stored ? JSON.parse(stored) : {
          access_token: 'restored-from-cookie',
          refresh_token: '',
          expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
        }
        if (!stored) {
          localStorage.setItem('rise-auth', JSON.stringify(session))
        }
        setAuth({
          isAuthenticated: true,
          userId: data.user.id,
          userEmail: data.user.email || '',
          userName: data.user.name || '',
          isAdmin: data.user.isAdmin || false,
          accessToken: session.access_token,
        })
      }
    } catch {
      // Network error — if localStorage has a session, keep showing UI
    }
  }

  return <>{children}</>
}
