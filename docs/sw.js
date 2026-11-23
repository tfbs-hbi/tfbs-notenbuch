// Offline-Start: die App-Dateien kommen aus dem Zwischenspeicher und werden im Hintergrund erneuert.
// Daten (Google Drive) laufen nie über diesen Zwischenspeicher.
const NAME = 'nb-web-1';
const DATEIEN = ['./', 'index.html', 'stil.css', 'konfig.js', 'calc.js', 'zusammenfuehren.js', 'krypto.js', 'daten.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(NAME).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== NAME).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(NAME).then(async c => {
    const alt = await c.match(e.request, { ignoreSearch: true });
    const neu = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => alt);
    return alt || neu;
  }));
});
