/* Zusammenführen zweier Stände (2.1) – z. B. Laptop und PC haben beide gespeichert, ohne vom anderen zu wissen.
 * Drei-Wege-Vergleich: gemeinsamer Ausgangsstand (basis), eigener Stand (meins) und Stand des anderen Geräts (fremd).
 *  - Was nur auf einer Seite geändert wurde, wird übernommen (auch neue oder gelöschte Klassen, Schüler/innen, Noten …).
 *  - Listen mit Id (Klassen, Stunden, Themen …) werden Eintrag für Eintrag zusammengeführt.
 *  - Wurde dieselbe Stelle auf beiden Seiten verschieden geändert, gilt der eigene Stand – oder mit { vorrang: 'fremd' } der des
 *    anderen Geräts (der Aufrufer wählt den zeitlich späteren) – gezählt als Widerspruch.
 *  - Gelöscht auf einer Seite, auf der anderen geändert: der geänderte Eintrag bleibt (nichts geht verloren) – ebenfalls gezählt. */
(function (root, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else { const m = fabrik(); (root.NB = root.NB || {}).zusammenfuehren = m.zusammenfuehren; root.NB.gleich = m.gleich; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const istObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const gleich = (a, b) => {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!gleich(a[i], b[i])) return false; return true; }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !gleich(a[k], b[k])) return false;
    return true;
  };
  const FEHLT = Symbol('fehlt');
  // Stellen, an denen ein Unterschied kein Widerspruch ist (Ansicht, Zeitstempel): eigener Stand gilt still
  const STILL = new Set(['meta', 'ui']);
  const mitId = a => Array.isArray(a) && a.every(x => istObj(x) && (typeof x.id === 'string' || typeof x.id === 'number'));

  function zusammenfuehren(basis, meins, fremd, opt) {
    const fremdGilt = !!(opt && opt.vorrang === 'fremd');
    const w = []; // Widersprüche (Pfade)
    const wert = (b, m, f, pfad, still) => {
      if (gleich(m, f)) return m;
      if (gleich(b, m)) return f;
      if (gleich(b, f)) return m;
      // beide geändert
      if (m === FEHLT || f === FEHLT) { // auf einer Seite gelöscht, auf der anderen geändert: Geändertes behalten
        if (!still) w.push(pfad);
        return m === FEHLT ? f : m;
      }
      if (istObj(m) && istObj(f)) return objekt(istObj(b) ? b : {}, m, f, pfad, still);
      if (Array.isArray(m) && Array.isArray(f)) return liste(Array.isArray(b) ? b : [], m, f, pfad, still);
      if (!still) w.push(pfad);
      return fremdGilt && !still ? f : m;
    };
    function objekt(b, m, f, pfad, still) {
      const aus = {};
      const schluessel = [...new Set([...Object.keys(m), ...Object.keys(f)])];
      for (const k of schluessel) {
        const r = wert(k in b ? b[k] : FEHLT, k in m ? m[k] : FEHLT, k in f ? f[k] : FEHLT, pfad ? pfad + '.' + k : k, still || (!pfad && STILL.has(k)));
        if (r !== FEHLT) aus[k] = r;
      }
      // Reihenfolge der Schlüssel wie im eigenen Stand
      return aus;
    }
    function liste(b, m, f, pfad, still) {
      if (mitId(m) && mitId(f) && mitId(b)) {
        const bi = new Map(b.map(x => [String(x.id), x])), mi = new Map(m.map(x => [String(x.id), x])), fi = new Map(f.map(x => [String(x.id), x]));
        const ergebnis = new Map();
        for (const id of new Set([...mi.keys(), ...fi.keys()])) {
          const r = wert(bi.has(id) ? bi.get(id) : FEHLT, mi.has(id) ? mi.get(id) : FEHLT, fi.has(id) ? fi.get(id) : FEHLT, `${pfad}[${id}]`, still);
          if (r !== FEHLT) ergebnis.set(id, r);
        }
        // Reihenfolge: wie im eigenen Stand; Neues vom anderen Gerät hinter seinem Vorgänger dort
        const reihe = m.map(x => String(x.id)).filter(id => ergebnis.has(id));
        f.forEach((x, i) => {
          const id = String(x.id);
          if (!ergebnis.has(id) || reihe.includes(id)) return;
          let pos = 0;
          for (let j = i - 1; j >= 0; j--) { const v = reihe.indexOf(String(f[j].id)); if (v >= 0) { pos = v + 1; break; } }
          reihe.splice(pos, 0, id);
        });
        return reihe.map(id => ergebnis.get(id));
      }
      // Listen ohne Id (Texte, Mitarbeit-Einträge …): wie eine Menge – Hinzugefügtes dazu, Entferntes weg
      const sch = x => JSON.stringify(x);
      const zaehlen = a => { const z = new Map(); a.forEach(x => { const k = sch(x); z.set(k, (z.get(k) || 0) + 1); }); return z; };
      const zb = zaehlen(b), zf = zaehlen(f), zm = zaehlen(m);
      const aus = m.slice();
      // vom anderen Gerät entfernt (gegenüber dem Ausgangsstand) – hier ebenfalls entfernen, soweit noch vorhanden
      for (const [k, n] of zb) {
        let weg = n - (zf.get(k) || 0);
        for (let i = aus.length - 1; i >= 0 && weg > 0; i--) if (sch(aus[i]) === k) { aus.splice(i, 1); weg--; }
      }
      // vom anderen Gerät hinzugefügt – außer es wurde hier dasselbe schon hinzugefügt
      const dazu = new Map();
      for (const [k, n] of zf) { const d = n - (zb.get(k) || 0) - Math.max(0, (zm.get(k) || 0) - (zb.get(k) || 0)); if (d > 0) dazu.set(k, d); }
      for (const x of f) { const k = sch(x); const d = dazu.get(k) || 0; if (d > 0) { aus.push(x); dazu.set(k, d - 1); } }
      return aus;
    }
    let ergebnis = wert(basis, meins, fremd, '', false);
    // Datenformat: das höhere gilt (nur beim ganzen Notenbuch – Teilstände wie ein Thema haben keine Version)
    if (istObj(ergebnis) && istObj(meins) && istObj(fremd) && ('version' in meins || 'version' in fremd)) {
      ergebnis.version = Math.max(Number(meins.version) || 0, Number(fremd.version) || 0);
    }
    return { ergebnis, widersprueche: w };
  }
  return { zusammenfuehren, gleich };
});
