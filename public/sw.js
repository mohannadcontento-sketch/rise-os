// RiseOS Service Worker — v1
// Caches static assets (Cache-First) and API responses (Network-First)

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache (shell)
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// File extensions that should use Cache-First
const CACHE_FIRST_EXTENSIONS = [
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
];

// API / Supabase patterns that should use Network-First
const isApiOrAuthRequest = (url) => {
  const u = new URL(url);
  return (
    u.pathname.startsWith('/api/') ||
    u.hostname.includes('supabase')
  );
};

// ─── Install ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate — clean up old caches ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Route to the appropriate strategy
  if (isApiOrAuthRequest(request.url)) {
    // Network-First for API / Supabase
    event.respondWith(networkFirst(request, API_CACHE));
  } else if (isStaticAsset(url.pathname)) {
    // Cache-First for static assets
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (event.request.mode === 'navigate') {
    // Navigation fallback — try network, then serve cached shell
    event.respondWith(networkFirst(request, STATIC_CACHE));
  }
});

// ─── Cache-First Strategy ───────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// ─── Network-First Strategy ─────────────────────────────────────────────
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation requests, serve the cached shell (index.html)
    if (request.mode === 'navigate') {
      const shell = await caches.match('/');
      if (shell) return shell;
    }

    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────
function isStaticAsset(pathname) {
  return CACHE_FIRST_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}