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
 * Registers the service worker for push notifications support,
 * requests notification permission, and subscribes to push.
 */
export function PWAInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Register service worker
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (reg) => {
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

      // Request notification permission and subscribe to push
      if ('Notification' in window) {
        // If already granted, try to subscribe immediately
        if (Notification.permission === 'granted') {
          await trySubscribePush(reg)
        } else if (Notification.permission === 'default') {
          // Request on first user interaction
          const requestOnInteraction = () => {
            Notification.requestPermission().then(async (result) => {
              if (result === 'granted') {
                await trySubscribePush(reg)
              }
            }).catch(() => {})
            window.removeEventListener('click', requestOnInteraction)
            window.removeEventListener('keydown', requestOnInteraction)
          }
          window.addEventListener('click', requestOnInteraction, { once: true })
          window.addEventListener('keydown', requestOnInteraction, { once: true })
        }
      }
    }).catch(() => {
      // Service worker registration failed — silent (normal in dev)
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

async function trySubscribePush(registration: ServiceWorkerRegistration) {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY
    if (!vapidKey) return

    if (!registration.pushManager) return

    // Check if already subscribed
    const existing = await registration.pushManager.getSubscription()
    if (existing) return // Already subscribed

    // Only subscribe on HTTPS (push requires secure context)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    // Save subscription to server
    const stored = localStorage.getItem('rise-auth')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (stored) {
      const session = JSON.parse(stored)
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
    }

    await fetch('/api/rise/notifications/push', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subscription }),
    })
  } catch {
    // Push subscription not available (HTTP, missing VAPID, etc.) — silent
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}