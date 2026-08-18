const CACHE_NAME = 'memovoy-v1'
const API_CACHE  = 'memovoy-api-v1'

// Static shell to pre-cache on install
const PRECACHE = ['/', '/feed', '/itineraries', '/explore', '/offline']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {})),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle GET requests
  if (request.method !== 'GET') return

  // Skip Next.js HMR / chunk requests — they use streaming responses that
  // cannot be safely cloned and must bypass the service worker entirely
  if (url.pathname.startsWith('/_next/')) return

  // API itinerary reads — stale-while-revalidate
  if (url.pathname.startsWith('/itineraries/') && url.hostname === location.hostname.replace('3000', '4000')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE))
    return
  }

  // Navigation — network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((r) => r ?? caches.match('/offline')),
      ),
    )
    return
  }

  // Static assets — cache first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          }
          return res
        })
      }),
    )
  }
})

// ── Push Notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { return }

  const title   = data.title ?? 'Memovoy'
  const options = {
    body:  data.body  ?? '',
    icon:  '/icon-192.png',
    badge: '/badge-72.png',
    data:  { url: data.url ?? '/notifications' },
    tag:   'memovoy-notif',
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/notifications'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      return clients.openWindow(url)
    }),
  )
})

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone())
    return res
  }).catch(() => null)

  return cached ?? (await fetchPromise) ?? new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  })
}
