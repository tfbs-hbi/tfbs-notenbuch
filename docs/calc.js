/* TFBS Notenbuch – Rechenlogik
 * Bildet die Formeln der Excel-Vorlage "Notenaufzeichnung mit Kompetenzraster"
 * (Werner Scheyrer, TFBS für Handel und Büro Innsbruck) exakt nach.
 * Läuft im Programm und in Node (für die Tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Excel ROUND: kaufmännisch, Hälfte weg von null
  function round(x, digits) {
    const f = Math.pow(10, digits);
    const v = Math.abs(x) * f;
    const r = Math.round(v + 1e-9 * Math.max(1, v)) / f;
    return x < 0 ? -r : r;
  }

  const DEFAULT_SETTINGS = {
    // A. Kompetenzstufen und Notengrenzen (Zeilen wie Blatt "Anleitung" A64:D68)
    stufen: [
      { code: 'D', wert: 1, name: 'Sehr gut', ab: 1 },
      { code: 'C', wert: 2, name: 'Gut', ab: 1.5 },
      { code: 'B', wert: 3, name: 'Befriedigend', ab: 2.5 },
      { code: 'A', wert: 4, name: 'Genügend', ab: 3.5 },
      { code: 'X', wert: 5, name: 'Nicht genügend', ab: 4.5 }
    ],
    // B. Mitarbeit als Tendenz
    mitarbeit: { hoch: 0.75, tief: 0.5, mindest: 3 },
    // C. Grenzfälle
    grenzAbstand: 0.15,
    // Punkte -> Stufe (Anteil der erreichbaren Punkte); darunter = schlechteste Stufe
    punkte: [
      { code: 'D', ab: 0.90 },
      { code: 'C', ab: 0.80 },
      { code: 'B', ab: 0.65 },
      { code: 'A', ab: 0.50 }
    ]
  };

  function stufeWert(settings, code) {
    if (!code) return null;
    const c = String(code).trim().toUpperCase();
    const s = settings.stufen.find(x => String(x.code).toUpperCase() === c);
    return s ? Number(s.wert) : null;
  }

  // Punkte in Stufe umrechnen
  function punkteZuStufe(settings, punkte, maxPunkte) {
    const p = Number(punkte), m = Number(maxPunkte);
    if (!isFinite(p) || !isFinite(m) || m <= 0) return null;
    const anteil = round(p / m, 6);
    const grenzen = [...settings.punkte].sort((a, b) => b.ab - a.ab);
    for (const g of grenzen) if (anteil >= g.ab - 1e-9) return g.code;
    const schlechteste = [...settings.stufen].sort((a, b) => b.wert - a.wert)[0];
    return schlechteste ? schlechteste.code : null;
  }

  // Effektive Stufe eines Eintrags (Buchstabe direkt oder aus Punkten)
  function eintragStufe(settings, eintrag, item) {
    if (!eintrag || eintrag.fehlt || eintrag.befreit) return null; // befreit = keine Abgabe nötig, zählt wie leer
    if (eintrag.stufe) return String(eintrag.stufe).toUpperCase();
    if (eintrag.punkte !== null && eintrag.punkte !== undefined && eintrag.punkte !== '' && item && item.maxPunkte > 0) {
      return punkteZuStufe(settings, eintrag.punkte, item.maxPunkte);
    }
    return null;
  }

  // Gewichteter Schnitt eines Bereichs (Ø KC bzw. Ø AA), Formel L8/U8
  function bereichsSchnitt(settings, items, noten) {
    let summeGewicht = 0, summe = 0;
    for (const item of items) {
      if (item.wiederholungVon && items.some(i => i.id === item.wiederholungVon)) continue; // zählt mit dem Original
      const st = eintragStufe(settings, noten[item.id], item);
      let w = stufeWert(settings, st);
      for (const wdh of items.filter(i => i.wiederholungVon === item.id)) {
        const w2 = stufeWert(settings, eintragStufe(settings, noten[wdh.id], wdh));
        if (w2 !== null && (w === null || w2 < w)) w = w2; // bessere Arbeit zählt
      }
      if (w === null) continue;
      const g = Number(item.gewicht);
      const gewicht = isFinite(g) ? g : 1;
      summeGewicht += gewicht;
      summe += gewicht * w;
    }
    if (summeGewicht === 0) return null;
    return summe / summeGewicht;
  }

  // KC-Anteil wie L7: Werte > 1 als Prozent lesen, auf 0..1 begrenzen
  function kcAnteil(kcGewicht) {
    const v = Number(kcGewicht);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
  }

  // Bereiche in der Reihenfolge der Tabelle
  const BEREICHE = ['sa', 'kc', 'aa'];

  const saAktiv = klasse => !!(klasse && klasse.schularbeiten && klasse.schularbeiten.aktiv);

  // Gewichtung als Anteile (0..1): Schularbeiten bekommen ihren Anteil (nur wenn eingeschaltet),
  // Kompetenzchecks und Arbeitsaufträge teilen sich den Rest im eingestellten Verhältnis (Standard 40 : 60).
  function gewichte(klasse) {
    const wk = kcAnteil(klasse && klasse.kcGewicht !== undefined ? klasse.kcGewicht : 0.4);
    const sa = saAktiv(klasse) ? Math.max(0, Math.min(1, Number(klasse.schularbeiten.anteil) || 0)) : 0;
    return { sa, kc: (1 - sa) * wk, aa: (1 - sa) * (1 - wk) };
  }

  // Notenschlüssel der Schularbeiten (Punkte -> Note) als Einstellungen für diesen Bereich
  function einstellungenFuer(settings, klasse, bereich) {
    if (bereich !== 'sa' || !klasse || !klasse.schularbeiten || !Array.isArray(klasse.schularbeiten.schluessel)) return settings;
    const punkte = klasse.schularbeiten.schluessel.map(g => {
      const st = settings.stufen.find(s => Number(s.wert) === Number(g.wert));
      return st ? { code: st.code, ab: Number(g.ab) } : null;
    }).filter(Boolean);
    return Object.assign({}, settings, { punkte });
  }

  // Gesamtschnitt über alle Bereiche; Bereiche ohne Eintrag zählen nicht (wie Formel C8)
  function gesamtSchnittBereiche(werte, gew) {
    let summe = 0, nenner = 0;
    for (const b of BEREICHE) {
      const v = werte[b];
      if (v === null || v === undefined) continue;
      summe += v * gew[b];
      nenner += gew[b];
    }
    if (nenner === 0) return null;
    return summe / nenner;
  }

  // Gesamtschnitt, Formel C8 (zwei Bereiche, für Vergleich mit der Excel-Vorlage)
  function gesamtSchnitt(kc, aa, kcGewicht) {
    const wk = kcAnteil(kcGewicht), wa = 1 - wk;
    const nenner = (kc === null ? 0 : wk) + (aa === null ? 0 : wa);
    if (nenner === 0) return null;
    return ((kc === null ? 0 : kc * wk) + (aa === null ? 0 : aa * wa)) / nenner;
  }

  // Notenvorschlag, Formel D8/E8: MATCH(ROUND(C,2), Grenzen, 1)
  function notenZeile(settings, schnitt) {
    if (schnitt === null) return null;
    const r = round(schnitt, 2);
    let treffer = null;
    for (const s of settings.stufen) if (Number(s.ab) <= r + 1e-12) treffer = s; // Grenzen aufsteigend
    return treffer;
  }

  // Grenzfall, bedingte Formatierung C8
  function istGrenzfall(settings, schnitt) {
    if (schnitt === null || !(settings.grenzAbstand > 0)) return false;
    const r = round(schnitt, 2);
    const grenzen = settings.stufen.slice(1).map(s => Number(s.ab));
    return grenzen.some(g => Math.abs(r - g) <= settings.grenzAbstand + 0.000001);
  }

  // Mitarbeit, Formeln AK/AL/AM/F
  function mitarbeit(settings, eintraege) {
    const plus = eintraege.filter(e => e.wert === '+').length;
    const minus = eintraege.filter(e => e.wert === '-').length;
    const neutral = eintraege.filter(e => e.wert === '0').length; // neutral: zählt nicht zum Plus-Anteil
    const n = plus + minus;
    const anteil = n === 0 ? null : plus / n;
    let tendenz = '';
    if (n > 0 && n >= settings.mitarbeit.mindest) {
      const a = round(anteil, 4);
      if (a >= settings.mitarbeit.hoch) tendenz = '↑';
      else if (a < settings.mitarbeit.tief) tendenz = '↓';
      else tendenz = '→';
    }
    return { plus, minus, neutral, anteil, tendenz };
  }

  function schlechtesteNote(settings) {
    return Math.max(...settings.stufen.map(s => Number(s.wert)));
  }

  // Alles für eine Schülerin / einen Schüler
  function schueler(settings, klasse, s) {
    const noten = s.noten || {};
    const sa = saAktiv(klasse) ? bereichsSchnitt(einstellungenFuer(settings, klasse, 'sa'), klasse.items.sa || [], noten) : null;
    const kc = bereichsSchnitt(settings, klasse.items.kc, noten);
    const aa = bereichsSchnitt(settings, klasse.items.aa, noten);
    const schnitt = gesamtSchnittBereiche({ sa, kc, aa }, gewichte(klasse));
    const zeile = notenZeile(settings, schnitt);
    const ma = mitarbeit(settings, s.mitarbeit || []);
    const note = zeile ? Number(zeile.wert) : null;
    const offen = offeneLeistungen(settings, klasse, s);
    return {
      sa, kc, aa, schnitt,
      note, noteName: zeile ? zeile.name : '',
      grenzfall: istGrenzfall(settings, schnitt),
      fruehwarnung: note !== null && note === schlechtesteNote(settings),
      plus: ma.plus, minus: ma.minus, neutral: ma.neutral, anteil: ma.anteil, tendenz: ma.tendenz,
      offen
    };
  }

  // Offene Leistungen: als "fehlt" markiert oder noch leer, obwohl andere schon beurteilt sind
  function offeneLeistungen(settings, klasse, s) {
    const out = [];
    for (const bereich of BEREICHE) {
      if (bereich === 'sa' && !saAktiv(klasse)) continue;
      const es = einstellungenFuer(settings, klasse, bereich);
      for (const item of klasse.items[bereich] || []) {
        const e = (s.noten || {})[item.id];
        if (e && e.befreit) continue; // keine Abgabe nötig
        if (e && e.fehlt) { out.push({ bereich, item, grund: 'fehlt' }); continue; }
        if (eintragStufe(es, e, item)) continue;
        if (item.wiederholungVon) continue; // an der Wiederholung muss nicht jede/r teilnehmen
        // Leer gilt erst als offen, wenn die Leistung ein Datum hat oder schon mehr als die Hälfte der Klasse beurteilt ist –
        // sonst wäre nach der allerersten Note sofort die ganze Klasse „offen“
        const beurteilt = klasse.schueler.filter(o => o !== s && eintragStufe(es, (o.noten || {})[item.id], item)).length;
        if (beurteilt && (item.datum || beurteilt * 2 >= klasse.schueler.length)) out.push({ bereich, item, grund: 'leer' });
      }
    }
    return out;
  }

  // Klassenwerte: Schnitt, Notenspiegel, Spaltenschnitte (Zeilen 34–42)
  function klasse(settings, k) {
    const rows = k.schueler.map(s => ({ s, r: schueler(settings, k, s) }));
    const avg = arr => { const v = arr.filter(x => x !== null && x !== undefined && x !== ''); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const spalte = (es, item) => avg(k.schueler.map(s => stufeWert(es, eintragStufe(es, (s.noten || {})[item.id], item))));
    const verteilung = (es, item) => {
      const z = {}; settings.stufen.forEach(st => z[st.code] = 0);
      k.schueler.forEach(s => { const st = eintragStufe(es, (s.noten || {})[item.id], item); if (st && z[st] !== undefined) z[st]++; });
      return z;
    };
    const spalten = {}, vert = {};
    for (const b of BEREICHE) {
      const es = einstellungenFuer(settings, k, b);
      spalten[b] = (k.items[b] || []).map(it => spalte(es, it));
      vert[b] = (k.items[b] || []).map(it => verteilung(es, it));
    }
    const spiegel = settings.stufen.map(st => ({
      wert: Number(st.wert), name: st.name, code: st.code,
      vorschlag: rows.filter(x => x.r.note === Number(st.wert)).length,
      zeugnis: k.schueler.filter(s => Number(s.zeugnisnote) === Number(st.wert)).length
    }));
    return {
      rows,
      schnitt: avg(rows.map(x => x.r.schnitt)),
      noteSchnitt: avg(rows.map(x => x.r.note)),
      zeugnisSchnitt: avg(k.schueler.map(s => (s.zeugnisnote === null || s.zeugnisnote === undefined || s.zeugnisnote === '') ? null : Number(s.zeugnisnote))),
      saSchnitt: avg(rows.map(x => x.r.sa)),
      kcSchnitt: avg(rows.map(x => x.r.kc)),
      aaSchnitt: avg(rows.map(x => x.r.aa)),
      anteilSchnitt: avg(rows.map(x => x.r.anteil)),
      spalten, verteilung: vert,
      spiegel
    };
  }

  // Zahl im österreichischen Format
  function fmt(x, digits) {
    if (x === null || x === undefined || x === '' || !isFinite(x)) return '';
    return round(x, digits).toFixed(digits).replace('.', ',');
  }
  function pct(x) {
    if (x === null || x === undefined || !isFinite(x)) return '';
    return Math.round(x * 100) + ' %';
  }

  return { DEFAULT_SETTINGS, BEREICHE, gewichte, einstellungenFuer, saAktiv, gesamtSchnittBereiche, round, stufeWert, punkteZuStufe, eintragStufe, bereichsSchnitt, kcAnteil,
    gesamtSchnitt, notenZeile, istGrenzfall, mitarbeit, schueler, klasse, offeneLeistungen, fmt, pct };
});
