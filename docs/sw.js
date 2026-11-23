// App-Dateien: zuerst aus dem Netz (neue Versionen sind sofort da), ohne Netz aus dem Zwischenspeicher.
// Daten (Google Drive) laufen nie über diesen Zwischenspeicher.
const NAME = 'nb-web-2';
const DATEIEN = ['./', 'index.html', 'stil.css', 'konfig.js', 'calc.js', 'zusammenfuehren.js', 'krypto.js', 'daten.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(NAME).then(c => c.addAll(DATEIEN.map(d => new Request(d, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== NAME).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(NAME).then(async c => {
    // schlechtes Netz: nach 4 s die gespeicherte Kopie nehmen
    const netz = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    const alt = c.match(e.request, { ignoreSearch: true });
    const warten = new Promise(r => setTimeout(r, 4000)).then(() => alt);
    try { const r = await Promise.race([netz, warten]); if (r) return r; } catch (x) { /* offline */ }
    return (await alt) || netz;
  }));
});
