// Nom aligne sur APP_VERSION (index.html). Ecrit par scripts/version.sh, pas a
// la main : un cache non renomme sert les anciens modules apres un deploiement.
const CACHE = 'depenses-2.7.0'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./manifest.json'])))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return

  // Network-first for HTML: always get the latest version, fall back to cache offline
  if (e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return response
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Cache-first for other static assets (manifest, icons, etc.)
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(response => {
      const clone = response.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone))
      return response
    }))
  )
})
