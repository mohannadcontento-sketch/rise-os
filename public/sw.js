// RiseOS Service Worker
// Handles push notifications, background sync, and cache for PWA

const CACHE_NAME = 'rise-os-v3'
const API_CACHE_NAME = 'rise-api-v2'
const STATIC_ASSETS = [
  '/app',
  '/icon-192.png',
  '/icon-512.png',
]

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Some assets might not exist yet — that's OK
      })
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

// Fetch — network-first for API AND static, cache as offline fallback only
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip external requests
  if (url.origin !== self.location.origin) return

  // ── API calls: NETWORK-FIRST (was stale-while-revalidate) ──
  // The old SWR strategy served the cached (stale) response FIRST and
  // refreshed in the background — the root cause of "data doesn't update",
  // which forced the app to add unique _t= cache-busters to every GET.
  // Network-first: fresh data when online (99% of the time), cached data
  // ONLY as an offline fallback. Bumped API_CACHE_NAME to v2 to drop all
  // legacy SWR entries.
  if (url.pathname.startsWith('/api/rise/') || url.pathname.startsWith('/api/auth/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(API_CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() =>
          caches.match(event.request).then((cached) =>
            cached || new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        )
    )
    return
  }

  // ── Static assets: network first, fallback to cache ──
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// Push event — show notification
self.addEventListener('push', (event) => {
  let data = { title: 'RiseOS', body: '', icon: '/icon-192.png', badge: '/icon-192.png', tag: '', url: '' }

  try {
    data = { ...data, ...event.data?.json() }
  } catch {
    data.body = event.data?.text() || ''
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag || `rise-${Date.now()}`,
    data: { url: data.url || '' },
    vibrate: [100, 50, 100],
    dir: 'rtl',
    lang: 'ar',
    requireInteraction: false,
    actions: data.actions || [],
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Notification click — focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/app'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen)
          return client.focus()
        }
      }
      // Open new window
      return self.clients.openWindow(urlToOpen)
    })
  )
})

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, icon, badge } = event.data
    self.registration.showNotification(title || 'RiseOS', {
      body: body || '',
      icon: icon || '/icon-192.png',
      badge: badge || '/icon-192.png',
      tag: tag || `rise-${Date.now()}`,
      vibrate: [100, 50, 100],
      dir: 'rtl',
      lang: 'ar',
    })
  }
})