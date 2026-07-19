/**
 * usePushNotifications — hook for web push notification support.
 * Requests browser notification permission, subscribes to push,
 * and shows browser notifications for in-app notifications.
 */

export function useBrowserNotifications() {
  async function requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false

    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false

    const result = await Notification.requestPermission()
    return result === 'granted'
  }

  function showBrowserNotification(title: string, options?: NotificationOptions) {
    if (typeof window === 'undefined') return
    if (Notification.permission !== 'granted') return

    // Don't show if page is focused (user can see in-app notification)
    if (document.hasFocus()) return

    try {
      new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        dir: 'rtl',
        ...options,
      })
    } catch {
      // Service worker context — use registration
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          ...options,
        })
      }
    }
  }

  async function subscribeToPush(): Promise<PushSubscription | null> {
    if (typeof window === 'undefined') return null
    if (!('serviceWorker' in navigator)) return null

    try {
      const registration = await navigator.serviceWorker.ready

      // Check if push manager is available
      if (!registration.pushManager) {
        console.warn('[push] Push manager not available')
        return null
      }

      // Check existing subscription first
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        // Re-send to server in case it changed
        await saveSubscription(existing)
        return existing
      }

      // Use VAPID key from env
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY
      if (!vapidKey) {
        console.warn('[push] NEXT_PUBLIC_VAPID_KEY not set — push subscription disabled')
        return null
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      await saveSubscription(subscription)
      return subscription
    } catch (err) {
      console.error('[push] Subscription error:', err)
      return null
    }
  }

  async function unsubscribeFromPush(): Promise<boolean> {
    if (typeof window === 'undefined') return false
    if (!('serviceWorker' in navigator)) return false

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) return true

      await subscription.unsubscribe()

      // Remove from server
      try {
        const stored = localStorage.getItem('rise-auth')
        if (stored) {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          const session = JSON.parse(stored)
          if (session.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }
          await fetch('/api/rise/notifications/push', {
            method: 'DELETE',
            headers,
          })
        }
      } catch { /* silent */ }

      return true
    } catch {
      return false
    }
  }

  return {
    requestPermission,
    showBrowserNotification,
    subscribeToPush,
    unsubscribeFromPush,
    permission: typeof window !== 'undefined' ? Notification?.permission : 'default',
  }
}

async function saveSubscription(subscription: PushSubscription) {
  try {
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
  } catch (err) {
    console.error('[push] Save subscription error:', err)
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