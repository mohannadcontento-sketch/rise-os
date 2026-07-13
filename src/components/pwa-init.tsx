'use client'

import { useEffect } from 'react'

/**
 * Detects if the app is running as an installed PWA (standalone mode).
 * Safe for SSR — returns false on server.
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

/**
 * PWA initialization.
 *
 * Browser mode: Unregisters any existing service worker so it doesn't
 * interfere with network requests. The app uses server APIs normally.
 *
 * Standalone mode (installed PWA): Registers the service worker for
 * offline caching and IndexedDB support.
 */
export function PWAInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (isStandaloneMode()) {
      // ─── PWA Standalone Mode: register SW ─────────────────────────
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        // If a new version is waiting, activate it
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' })
                window.location.reload()
              }
            })
          }
        })
      }).catch(() => {
        // SW failed — app still works
      })
    } else {
      // ─── Browser Mode: unregister any existing SW ─────────────────
      // This clears old v1 caches that caused the "offline mode" issue
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister().catch(() => {})
        }
      }).catch(() => {})

      // Also clear any old caches directly
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name).catch(() => {})
          }
        }).catch(() => {})
      }
    }

    // Handle URL shortcuts (e.g., ?module=tasks)
    const params = new URLSearchParams(window.location.search)
    const startModule = params.get('module')
    if (startModule) {
      sessionStorage.setItem('rise-start-module', startModule)
    }
  }, [])

  return null
}