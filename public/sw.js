const CACHE = 'micasa-v8';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

// 🔔 Click en notificación nativa: enfoca/abre la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate(link); } catch {} return c.focus(); }
    }
    if (clients.openWindow) return clients.openWindow(link);
  })());
});

// 📨 Push (futuro): muestra notificación con vibración por categoría
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { title: 'Mi Casa', body: event.data.text() }; }
  const PATTERNS = {
    announcement:[80,40,80], damage:[220,80,220,80,220], payment:[40,30,40,30,40,30,120],
    bill:[120,60,120], expiry:[300,100,300], task:[60,40,60], poll:[50,30,50,30,50], default:[80]
  };
  const cat = payload.category || 'default';
  event.waitUntil(self.registration.showNotification(payload.title || 'Mi Casa', {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: PATTERNS[cat] || PATTERNS.default,
    tag: payload.tag || ('mc-' + Date.now()),
    data: { link: payload.link || '/' }
  }));
});
