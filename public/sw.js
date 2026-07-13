// RiseOS Service Worker — v2
// IMPORTANT: Only caches in PWA standalone mode (installed app).
// In browser mode, this SW does nothing — all requests pass through normally.

const CACHE_VERSION = 'v2';
const CACHE_NAME = `${CACHE_VERSION}-standalone`;

// Check if we're running in standalone (installed PWA) mode
function isStandalone() {
  return self.matchMedia?.('(display-mode: standalone)')?.matches ||
    self.navigator?.standalone === true;
}

// ─── Install ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Always install but don't pre-cache anything yet
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

  // Notify all clients about the update
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
  });
});

// ─── Fetch ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // In browser mode — do nothing, let browser handle everything
  if (!isStandalone()) return;

  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Skip Supabase requests — always go to network
  if (url.hostname.includes('supabase')) return;

  // API requests: Network-First (try server, fallback to cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: Cache-First
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation (HTML pages): Network-First with offline shell fallback
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
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation, try serving the cached root page
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
    // Re-check standalone status
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