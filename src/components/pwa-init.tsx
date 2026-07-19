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
 * Always registers the service worker (for push notifications support).
 * Caching only happens in standalone PWA mode.
 */
export function PWAInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Always register SW for notification support
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
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

      // Request notification permission after registration
      if ('Notification' in window && Notification.permission === 'default') {
        // Don't request immediately — wait for user interaction
        const requestOnInteraction = () => {
          Notification.requestPermission().catch(() => {})
          window.removeEventListener('click', requestOnInteraction)
        }
        window.addEventListener('click', requestOnInteraction, { once: true })
      }
    }).catch(() => {
      // SW failed — app still works
    })

    // Handle URL shortcuts (e.g., ?module=tasks)
    const params = new URLSearchParams(window.location.search)
    const startModule = params.get('module')
    if (startModule) {
      sessionStorage.setItem('rise-start-module', startModule)
    }
  }, [])

  return null
}