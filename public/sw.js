/* Pontual RH Super — service worker (PWA offline shell) */
const CACHE = 'pontual-v2'
const SHELL = ['/', '/index.html', '/logo.svg', '/logo-icon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

/* Network-first para navegação e assets (dev-friendly), fallback ao cache offline.
   Assets com hash (/assets/): cache-first — são imutáveis; se a rede falhar E
   não houver cache, deixa o erro propagar (chunk recovery cuida do reload). */
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase/Storage: nunca intercepta

  if (url.pathname.startsWith('/assets/')) {
    // imutáveis: cache-first é seguro e rápido
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        return response
      })),
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        return response
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match('/index.html'))),
  )
})
