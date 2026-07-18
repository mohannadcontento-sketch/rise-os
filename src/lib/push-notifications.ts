/**
 * usePushNotifications — hook for web push notification support.
 * Requests browser notification permission and shows browser notifications
 * for in-app notifications (works when tab is in background).
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

  async function subscribeToPush() {
    if (typeof window === 'undefined') return null
    if (!('serviceWorker' in navigator)) return null

    const registration = await navigator.serviceWorker.ready

    // Check if push manager is available
    if (!registration.pushManager) {
      console.warn('Push manager not available')
      return null
    }

    // Use a valid VAPID key (generate with: npx web-push generate-vapid-keys)
    // For now, we use a placeholder — the user needs to set NEXT_PUBLIC_VAPID_KEY
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY
    if (!vapidKey) {
      console.warn('NEXT_PUBLIC_VAPID_KEY not set — push subscription disabled')
      return null
    }

    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // Save subscription to server
      const res = await fetch('/api/rise/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      })

      if (res.ok) return subscription
      return null
    } catch (err) {
      console.error('Push subscription error:', err)
      return null
    }
  }

  return {
    requestPermission,
    showBrowserNotification,
    subscribeToPush,
    permission: typeof window !== 'undefined' ? Notification?.permission : 'default',
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