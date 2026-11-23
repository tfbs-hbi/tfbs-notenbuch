/* TFBS Notenbuch Web – Daten: Zwischenspeicher am Handy, Google Drive, Abgleich mit dem Programm
 * Am Handy liegt nur die verschlüsselte Datei (für den Start ohne Internet) und der Schlüssel als nicht auslesbarer
 * WebCrypto-Schlüssel. Ein Passwort braucht es nur beim ersten Mal (und wieder, wenn es am PC geändert wurde). */
(function () {
  'use strict';
  const NBK = window.NBK;
  const D = window.NBD = {};
  const GERAET = 'Handy (Web)';

  // ---------- IndexedDB ----------
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((ok, fehler) => { const r = indexedDB.open('tfbs-notenbuch-web', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => fehler(r.error); }));
  D.lesen = async k => { const d = await db(); return new Promise((ok, f) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => f(r.error); }); };
  D.schreiben = async (k, v) => { const d = await db(); return new Promise((ok, f) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => f(t.error); }); };
  D.loeschen = async k => { const d = await db(); return new Promise((ok, f) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => ok(); t.onerror = () => f(t.error); }); };

  // ---------- Speicherort: Google Drive (oder Testspeicher mit ?test=1) ----------
  const skript = src => new Promise((ok, f) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => f(new Error('Google ist gerade nicht erreichbar.')); document.head.appendChild(s); });
  const google = {
    name: 'Google Drive',
    token: null, ablauf: 0,
    async bereit() {
      const k = window.NB_WEB_KONFIG || {};
      if (!k.clientId || !k.apiKey) throw new Error('Die Web-App ist noch nicht mit Google verbunden (Client-ID und API-Schlüssel fehlen in konfig.js).');
      await skript('https://accounts.google.com/gsi/client');
      return k;
    },
    async anmelden(still) {
      if (this.token && Date.now() < this.ablauf - 60000) return this.token;
      const gespeichert = await D.lesen('token');
      if (gespeichert && Date.now() < gespeichert.ablauf - 60000) { this.token = gespeichert.token; this.ablauf = gespeichert.ablauf; return this.token; }
      const k = await this.bereit();
      const antwort = await new Promise((ok, f) => {
        const c = window.google.accounts.oauth2.initTokenClient({ client_id: k.clientId, scope: 'https://www.googleapis.com/auth/drive.file', callback: r => r.error ? f(new Error('Anmeldung bei Google abgebrochen.')) : ok(r), error_callback: () => f(new Error('Anmeldung bei Google abgebrochen.')) });
        c.requestAccessToken({ prompt: still ? '' : 'consent', hint: k.konto || undefined });
      });
      this.token = antwort.access_token; this.ablauf = Date.now() + (Number(antwort.expires_in) || 3600) * 1000;
      await D.schreiben('token', { token: this.token, ablauf: this.ablauf });
      return this.token;
    },
    async dateiWaehlen() {
      const k = await this.bereit();
      const token = await this.anmelden(false);
      await skript('https://apis.google.com/js/api.js');
      await new Promise(ok => window.gapi.load('picker', ok));
      const p = window.google.picker;
      return new Promise((ok, f) => {
        const ansicht = new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setQuery('notenbuch-daten');
        new p.PickerBuilder().setLocale('de').setTitle('Notenbuch-Datei wählen (Ordner „Notenbuch-Datei“ → notenbuch-daten.nbg)')
          .addView(ansicht).addView(new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true))
          .setOAuthToken(token).setDeveloperKey(k.apiKey).setAppId(k.appId || '')
          .setCallback(d => { if (d.action === p.Action.PICKED) ok({ id: d.docs[0].id, name: d.docs[0].name }); else if (d.action === p.Action.CANCEL) f(new Error('Keine Datei gewählt.')); })
          .build().setVisible(true);
      });
    },
    async anfrage(url, opt, nochmal) {
      const token = await this.anmelden(true);
      const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + token }, (opt || {}).headers || {}) }));
      if (r.status === 401 && !nochmal) { this.token = null; await D.loeschen('token'); return this.anfrage(url, opt, true); }
      if (r.status === 404) throw Object.assign(new Error('Die Notenbuch-Datei wurde in Google Drive nicht gefunden – bitte neu wählen.'), { code: 'FEHLT' });
      if (!r.ok) throw new Error(`Google Drive hat mit Fehler ${r.status} geantwortet.`);
      return r;
    },
    async laden(id) {
      const m = await (await this.anfrage(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,version,modifiedTime`)).json();
      const b = new Uint8Array(await (await this.anfrage(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { cache: 'no-store' })).arrayBuffer());
      return { bytes: b, version: m.version, zeit: m.modifiedTime, name: m.name };
    },
    async speichern(id, bytes) {
      await this.anfrage(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    }
  };
  // Testspeicher (nur mit ?test=1): die Datei liegt in IndexedDB, Tests legen sie über window.NBTEST hinein
  const test = {
    name: 'Testspeicher',
    async anmelden() { return 'test'; },
    async dateiWaehlen() { if (!(await D.lesen('test:datei'))) throw new Error('Keine Testdatei.'); return { id: 'test', name: 'notenbuch-daten.nbg' }; },
    async laden() { if (window.NBTEST && window.NBTEST.offline) throw new Error('Keine Verbindung (Test).'); const b = await D.lesen('test:datei'); return { bytes: b, version: String(b.length), zeit: new Date().toISOString(), name: 'notenbuch-daten.nbg' }; },
    async speichern(id, bytes) { if (window.NBTEST && window.NBTEST.offline) throw new Error('Keine Verbindung (Test).'); await D.schreiben('test:datei', bytes); }
  };
  D.testmodus = new URLSearchParams(location.search).has('test');
  D.ort = D.testmodus ? test : google;
  window.NBTEST = D.testmodus ? { datei: b => D.schreiben('test:datei', b), lesen: () => D.lesen('test:datei'), offline: false } : undefined;

  // ---------- Zustand ----------
  // st: Notenbuch; basis: Hülle, auf der st aufbaut (vom Programm oder von hier geschrieben); offen: Änderungen noch nicht in Drive
  const Z = D.z = { st: null, basis: null, basisDaten: null, offen: false, key: null, salt: null, datei: null, stand: null, fehler: null };
  const beobachter = new Set();
  D.beobachten = f => beobachter.add(f);
  const melden = () => beobachter.forEach(f => { try { f(Z); } catch (e) { console.error(e); } });

  async function zwischenspeichern(bytes) { await D.schreiben('cache', bytes); }
  async function annehmen(h, bytes) {
    Z.basis = { revision: h.revision, geraet: h.geraet, zeit: h.zeit };
    Z.basisDaten = h.daten;
    Z.st = JSON.parse(h.daten);
    Z.stand = { zeit: h.zeit, geraet: h.geraet };
    if (bytes) await zwischenspeichern(bytes);
  }

  // Einrichten: Datei wählen und Passwort einmal eingeben
  D.einrichten = async function (passwort, fortschritt) {
    const datei = Z.datei || await D.ort.dateiWaehlen();
    const r = await D.ort.laden(datei.id);
    const roh = NBK.zerlegen(r.bytes);
    const key = await NBK.schluesselAus(await NBK.scrypt(passwort, roh.salt, 32768, 8, 1, 32, fortschritt));
    const h = await NBK.entschluesseln(roh, key); // wirft bei falschem Passwort
    Object.assign(Z, { key, salt: roh.salt, datei });
    await D.schreiben('verbindung', { datei, key, salt: roh.salt });
    await annehmen(h, r.bytes);
    Z.offen = false; await D.loeschen('offen');
    melden();
  };
  D.dateiWaehlen = async function () { Z.datei = await D.ort.dateiWaehlen(); return Z.datei; };

  // Start: aus dem Zwischenspeicher (auch ohne Internet), dann im Hintergrund aktualisieren
  D.start = async function () {
    const v = await D.lesen('verbindung');
    if (!v) return false;
    Object.assign(Z, { key: v.key, salt: v.salt, datei: v.datei });
    const offen = await D.lesen('offen');
    const cache = await D.lesen('cache');
    try {
      if (cache) { const h = await NBK.entschluesseln(NBK.zerlegen(cache), Z.key); await annehmen(h, null); }
      if (offen) { const h = await NBK.entschluesseln(NBK.zerlegen(offen.bytes), Z.key); Z.st = JSON.parse(h.daten); Z.offen = true; }
    } catch (e) { console.error('Zwischenspeicher:', e); }
    melden();
    return true;
  };

  // Neuen Stand aus Drive holen (eigene Änderungen werden dabei zusammengeführt und gespeichert)
  let laeuft = null;
  D.aktualisieren = function () { if (!laeuft) laeuft = abgleich().finally(() => { laeuft = null; }); return laeuft; };
  async function abgleich() {
    if (!Z.key || !Z.datei) return;
    try {
      const r = await D.ort.laden(Z.datei.id);
      const roh = NBK.zerlegen(r.bytes);
      if (Z.salt && roh.salt.join() !== Z.salt.join()) throw Object.assign(new Error('Das Passwort des Notenbuchs wurde am PC geändert – bitte hier neu eingeben.'), { code: 'PASSWORT' });
      const h = await NBK.entschluesseln(roh, Z.key);
      const fremdNeu = !Z.basis || NBK.stempel(h) !== NBK.stempel(Z.basis);
      if (!Z.offen) {
        if (fremdNeu) await annehmen(h, r.bytes);
      } else {
        let daten = Z.st, widersprueche = 0;
        if (fremdNeu) {
          // Programm hat inzwischen gespeichert: zusammenführen (gemeinsamer Ausgangsstand = zuletzt geladener Stand)
          const basis = Z.basisDaten ? JSON.parse(Z.basisDaten) : JSON.parse(h.daten);
          const z = window.NB.zusammenfuehren(basis, Z.st, JSON.parse(h.daten), { vorrang: 'meins' });
          daten = z.ergebnis; widersprueche = z.widersprueche.length;
        }
        const neu = { revision: (h.revision || 0) + 1, geraet: GERAET, zeit: new Date().toISOString(), basis: NBK.stempel(h), daten: JSON.stringify(daten) };
        const bytes = await NBK.verschluesseln(neu, Z.key, roh.salt);
        await D.ort.speichern(Z.datei.id, bytes);
        await annehmen(neu, bytes);
        Z.offen = false; await D.loeschen('offen');
        if (widersprueche) Z.hinweis = `Am PC wurde gleichzeitig dasselbe geändert (${widersprueche}) – der Eintrag vom Handy gilt.`;
      }
      Z.fehler = null;
    } catch (e) {
      Z.fehler = e.message; Z.fehlerCode = e.code || null;
    }
    melden();
  }

  // Eintrag vom Handy (ToDo, Mitarbeit …): sofort anzeigen, verschlüsselt merken, dann speichern
  let timer = null;
  D.aendern = async function (fn) {
    fn(Z.st);
    Z.st.meta = Object.assign({}, Z.st.meta, { geaendert: new Date().toISOString() });
    Z.offen = true;
    melden();
    try { await D.schreiben('offen', { bytes: await NBK.verschluesseln({ revision: 0, geraet: GERAET, zeit: new Date().toISOString(), daten: JSON.stringify(Z.st) }, Z.key, Z.salt) }); } catch (e) { console.error(e); }
    clearTimeout(timer);
    timer = setTimeout(() => D.aktualisieren(), 1200);
  };

  D.trennen = async function () {
    for (const k of ['verbindung', 'cache', 'offen', 'token']) await D.loeschen(k);
    Object.assign(Z, { st: null, basis: null, basisDaten: null, offen: false, key: null, salt: null, datei: null, stand: null, fehler: null });
    melden();
  };
})();
