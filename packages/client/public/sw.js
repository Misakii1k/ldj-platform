/**
 * PWA Service Worker：离线时提供 fallback 页。
 * 策略：网络优先；导航请求失败则返回 offline.html。
 */
const CACHE_NAME = 'ldj-platform-v1';
const CORE_ASSETS = ['/', '/offline.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/offline.html').then((cached) => cached ?? new Response('Offline', { status: 503 }));
        }
        return new Response('Offline', { status: 503 });
      }),
  );
});
