/* Daybook service worker — notifications + offline app shell.
 *
 * Two jobs:
 *   1. Turn server pushes into notifications (unchanged).
 *   2. Keep the app openable with no connection, by caching the shell and
 *      assets as they're fetched and serving them back when offline.
 *
 * Note on data: your reminders/notes/etc. are already offline-safe without
 * the SW — the app keeps a local mirror in localStorage and syncs to the
 * cloud when a connection returns (see repo.jsx). This SW only makes the app
 * *itself* (the HTML/JS/CSS) load offline; it does not touch your data.
 */
const CACHE = 'daybook-shell-v2';

// The bare minimum to boot. Hashed asset filenames change every build, so we
// can't list them here — they're cached at runtime as they're requested.
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Drop older shell caches so a deploy doesn't serve last version's files.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('daybook-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/**
 * Fetch strategy:
 *   - Navigations (opening the app / any route): network first so you get the
 *     freshest deploy, falling back to the cached shell when offline. SPA
 *     routes all resolve to index.html.
 *   - Same-origin GET assets (hashed JS/CSS/icons): cache first — they're
 *     immutable by hash, so once cached they're safe to serve instantly, and
 *     we still update the cache in the background.
 *   - Everything else (Firestore, fonts, cross-origin): left to the network,
 *     untouched.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // don't touch Firestore/fonts/etc.

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Static assets: cache-first, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});

/* A server POSTs a push here; we turn it into a notification. */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() }; }
  const title = payload.title || 'Daybook';
  const options = {
    body: payload.body || '',
    tag: payload.tag,
    data: { url: payload.url || '/' },
    icon: '/icon-192.png',
    badge: '/icon-mono.png',
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Tapping a notification focuses the app, or opens it at the right route. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => 'focus' in c);
    if (open) { await open.focus(); open.navigate?.(url); }
    else await self.clients.openWindow(url);
  })());
});
