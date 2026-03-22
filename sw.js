// ============================================================
// sw.js — Service Worker
// Gabriel PWA
// ============================================================

const CACHE_NAME    = 'gabriel-v7';
const OFFLINE_URL   = 'index.html';

const CACHE_ASSETS = [
  'index.html',
  'login.html',
  'dashboard.html',
  'chat.html',
  'folders.html',
  'agenda.html',
  'finance.html',
  'notes.html',
  'onboarding.html',
  'termosservicos.html',
  'politicapublica.html',
  'global.css',
  'db.js',
  'auth.js',
  'groq.js',
  'actions.js',
  'memory.js',
  'notifications.js',
  'weather.js',
  'google.js',
  'games.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'drive.html',
  'photos.html',
  'keep.html',
  'settings.html'
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Cacheando assets...');
      return cache.addAll(CACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Alguns assets não cacheados:', err));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
  console.log('[SW] Ativado.');
});

// ── Fetch — Cache First para assets, Network First para APIs ─
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora requisições de extensões e não-http
  if (!event.request.url.startsWith('http')) return;

  // APIs externas — Network First
  const isApi = url.hostname.includes('groq.com') ||
                url.hostname.includes('wttr.in') ||
                url.hostname.includes('duckduckgo.com') ||
                url.hostname.includes('ipapi.co');

  if (isApi) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Assets locais — Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(OFFLINE_URL));
    })
  );
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Gabriel', {
      body:    data.body || '',
      icon:    'icon-192.png',
      badge:   'icon-192.png',
      vibrate: [200, 100, 200],
      data:    data.data || {}
    })
  );
});

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('./dashboard.html');
    })
  );
});

// ── Mensagens do app (agendamento) ───────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_NOTIFICATIONS') {
    // Armazena para referência (polling é feito no app)
    console.log('[SW] Notificações agendadas recebidas:', event.data.notifications?.length);
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Gabriel] sw.js carregado ✓');
