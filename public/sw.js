// RiseOS Service Worker — v3
// IMPORTANT: Only caches in PWA standalone mode (installed app).
// In browser mode, this SW does nothing — all requests pass through normally.

const CACHE_VERSION = 'v3';
const CACHE_NAME = `${CACHE_VERSION}-standalone`;

// Check if we're running in standalone (installed PWA) mode
function isStandalone() {
  return self.matchMedia?.('(display-mode: standalone)')?.matches ||
    self.navigator?.standalone === true;
}

// ─── Install ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// ─── Activate — clean up old caches ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();

  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
  });
});

// ─── Push Notifications ───────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'RiseOS', body: '', icon: '/icon-192.png', url: '/' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'dismiss', title: 'إغلاق' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── Notification Click ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ─── Fetch ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (!isStandalone()) return;

  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (!url.protocol.startsWith('http')) return;
  if (url.hostname.includes('supabase')) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, true));
    return;
  }
});

// ─── Network-First ─────────────────────────────────────────────────────
async function networkFirst(request, isNavigation = false) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (isNavigation) {
      const shell = await caches.match('/');
      if (shell) return shell;
    }

    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// ─── Cache-First ───────────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|eot)$/i.test(pathname);
}

// ─── Listen for display-mode changes ────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_STANDALONE') {
    const clients = self.clients.matchAll();
    clients.then((list) => {
      list.forEach((client) => {
        client.postMessage({
          type: 'STANDALONE_STATUS',
          isStandalone: isStandalone(),
        });
      });
    });
  }
});