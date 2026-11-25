/* Service worker: precarga la app para uso sin conexion. */
const CACHE = 'hsk-flash-v4';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/vocab.js', 'js/store.js', 'js/srs.js', 'js/session.js',
  'js/modes.js', 'js/stats.js', 'js/ui.js', 'js/pinyin.js', 'js/wordsheet.js',
  'js/vocab-es.js', 'js/lang.js', 'js/version.js',
  'icons/icon.svg', 'icons/favicon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      throw err;
    }
  })());
});

// --- recordatorio en segundo plano (si el navegador lo permite) ---------

function idb(store, key) {
  return new Promise((res) => {
    const r = indexedDB.open('hsk-flash');
    r.onsuccess = () => {
      try {
        const db = r.result;
        const g = db.transaction([store], 'readonly').objectStore(store).get(key);
        g.onsuccess = () => res(g.result);
        g.onerror = () => res(null);
      } catch { res(null); }
    };
    r.onerror = () => res(null);
  });
}

async function maybeNotify() {
  const s = await idb('meta', 'settings');
  if (!s || !s.reminderOn) return;
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const d = await idb('days', key);
  const done = d ? d.c : 0;
  const goal = s.dailyGoal || 30;
  if (done >= goal) return;
  if (now.getHours() < (s.reminderHour || 20)) return;
  await self.registration.showNotification('HSK Flash', {
    body: `Te faltan ${goal - done} tarjetas para la meta de hoy.`,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'hsk-daily',
  });
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'hsk-daily') e.waitUntil(maybeNotify());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  })());
});
