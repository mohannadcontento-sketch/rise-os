// RiseOS Service Worker
// Handles push notifications, background sync, and cache for PWA

const CACHE_NAME = 'rise-os-v3'
// TASK 25: bumped to v3 — drops ALL legacy API cache entries (they carry no
// freshness timestamp and must never be served as offline fallback).
const API_CACHE_NAME = 'rise-api-v3'
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
  //
  // TASK 25 — FRESHNESS GUARD on the fallback:
  // The bare catch() used to serve a cached copy of ANY age. On a flaky
  // mobile connection a GET that failed right after a successful write was
  // answered from the PRE-WRITE cache → components overwrote their fresh
  // optimistic state with old server data → "الشيك بيرجععلطول / الصحة مش
  // بتتسجل" (checks/health revert) while the dashboard (fetched later over
  // a healthy connection) showed the saved change. Now the cached fallback
  // is served ONLY if it is <30s old; anything older returns 503 so
  // components KEEP their current state (apiFetch treats non-ok as
  // "keep state").
  if (url.pathname.startsWith('/api/rise/') || url.pathname.startsWith('/api/auth/')) {
    const CACHE_TTL_MS = 30_000
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            // Store the ORIGINAL response untouched + a tiny side-entry that
            // carries the cache time. Re-wrapping the body would risk
            // content-encoding mismatches; a side-entry cannot corrupt data.
            const clone = response.clone()
            caches.open(API_CACHE_NAME).then((cache) =>
              Promise.all([
                cache.put(event.request, clone),
                cache.put(event.request.url + ':ts', new Response(String(Date.now()))),
              ])
            )
          }
          return response
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (!cached) {
              return new Response(JSON.stringify({ error: 'offline' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
            }
            // Serve from cache ONLY if it is younger than the TTL — an older
            // snapshot would roll the UI back to pre-write data.
            return caches.match(event.request.url + ':ts').then((tsRes) =>
              tsRes ? tsRes.text() : Promise.resolve('')
            ).then((tsRaw) => {
              const cachedAt = Number(tsRaw || 0)
              if (cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) return cached
              return new Response(JSON.stringify({ error: 'offline', stale: true }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
            })
          })
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