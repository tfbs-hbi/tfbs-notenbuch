/* TFBS Notenbuch Web – Oberfläche fürs Handy: Heute, Woche, Klassen (Noten zum Nachschauen), ToDos, Mitarbeit */
(function () {
  'use strict';
  const D = window.NBD, Z = D.z, Calc = window.Calc;
  const $ = s => document.querySelector(s);
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const heute = () => iso(new Date());
  const plus = (t, n) => { const [y, m, d] = t.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
  const wtag = t => { const [y, m, d] = t.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('de-AT', { weekday: 'long' }); };
  const datum = t => { if (!t) return ''; const [y, m, d] = String(t).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
  const kurz = t => { if (!t) return ''; const [, m, d] = String(t).slice(0, 10).split('-'); return `${d}.${m}.`; };
  const minuten = hm => { const [h, m] = String(hm || '0:0').split(':').map(Number); return h * 60 + m; };
  const jetztMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const montag = t => { const [y, m, d] = t.split('-').map(Number); const x = new Date(y, m - 1, d); const w = (x.getDay() + 6) % 7; return plus(t, -w); };
  const kw = t => { const [y, m, d] = t.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d)); const n = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - n); const j = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - j) / 86400000 + 1) / 7); };
  const zeitText = i => i ? new Date(i).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // ---------- Zugriff auf das Notenbuch ----------
  const S = () => Z.st.settings;
  const klasse = id => Z.st.klassen.find(k => k.id === id) || null;
  const lehrgang = id => Z.st.lehrgaenge.find(l => l.id === id) || null;
  const laeuft = k => { const l = lehrgang(k.lehrgangId); const t = heute(); return !l || ((!l.start || l.start <= plus(t, 14)) && (!l.ende || l.ende >= t)); };
  const mitNoten = () => S().stufenAnzeige === 'noten';
  const stufeText = code => { if (!code) return ''; if (!mitNoten()) return String(code); const w = Calc.stufeWert(S(), code); return w === null || w === undefined ? String(code) : String(w); };
  const stufeKlasse = code => { const s = S().stufen.find(x => String(x.code).toUpperCase() === String(code || '').toUpperCase()); return s ? 'st' + Math.max(1, Math.min(5, Math.round(Number(s.wert)))) : ''; };
  const notenText = wert => { if (wert === null || wert === undefined) return '–'; if (mitNoten()) return String(wert); const s = S().stufen.find(x => Number(x.wert) === Number(wert)); return s ? s.code : String(wert); };
  const schluessel = st => (st.titel + '|' + (st.info || '').split('\n')[0]).toLowerCase();
  let kfCache = new WeakMap(); // je Zeichnen neu – die Woche fragt oft nach derselben Stunde
  function klasseFuer(st) {
    if (kfCache.has(st)) return kfCache.get(st);
    const k = klasseSuchen(st); kfCache.set(st, k); return k;
  }
  function klasseSuchen(st) {
    if (st.eigen) return null;
    if (st.klasseId && klasse(st.klasseId)) return klasse(st.klasseId);
    const z = (Z.st.zuordnung || {})[schluessel(st)];
    if (z && klasse(z)) return klasse(z);
    const text = ` ${st.titel} ${st.info} ${st.ort} `.toLowerCase();
    const akt = Z.st.klassen.filter(k => { const l = lehrgang(k.lehrgangId); return l && l.start && l.ende && l.start <= st.datum && st.datum <= l.ende; });
    const t = akt.filter(k => k.name && new RegExp(`(^|[^a-z0-9äöü])${k.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9äöü]|$)`).test(text));
    return t.length === 1 ? t[0] : null;
  }
  const stundenAm = t => Z.st.stunden.filter(s => s.datum === t).sort((a, b) => a.beginn.localeCompare(b.beginn));
  const ausgefallen = s => !!(s.entfall || s.nichtGehalten);
  const statusText = s => s.nichtGehalten ? 'nicht gehalten' + (s.nichtGehalten.grund ? ' – ' + s.nichtGehalten.grund : '') : s.entfall ? 'entfallen laut WebUntis' : '';
  const EIGEN_ARTEN = { supplierung: 'Supplierung', aufsicht: 'Aufsicht', sonstiges: 'Sonstiges' };

  // ---------- Planung und Farben wie im Programm (Wochenansicht) ----------
  const planungAn = () => S().planung !== false;
  const fach = id => (Z.st.faecher || []).find(f => f.id === id) || null;
  const ordnerVon = f => f && f.ordnerId ? (Z.st.fachOrdner || []).find(o => o.id === f.ordnerId) || null : null;
  const FARBEN = ['blau', 'gruen', 'rot', 'orange', 'lila', 'tuerkis', 'gelb', 'pink', 'braun', 'grau'];
  const farbeOk = c => FARBEN.includes(c);
  const fachFarbe = f => (f && farbeOk(f.farbe) ? f.farbe : null) || (ordnerVon(f) && farbeOk(ordnerVon(f).farbe) ? ordnerVon(f).farbe : null);
  const einheitEnde = x => (Number(x.ab) || 1) + (Number(x.ue) || 1) - 1;
  // Themen einer Stunde, je Thema zusammengefasst: [{ e, bereiche, einheiten }]
  function planEintraege(st) {
    const k = klasseFuer(st);
    if (!k || !Array.isArray(st.plan) || !planungAn()) return [];
    const out = [];
    st.plan.forEach(p => {
      const e = (k.einsaetze || []).find(x => x.id === p.einsatz); if (!e) return;
      let z = out.find(x => x.e === e); if (!z) { z = { e, bereiche: [] }; out.push(z); }
      z.bereiche.push([p.von, p.bis]);
    });
    out.forEach(z => {
      z.bereiche.sort((a, b) => a[0] - b[0]);
      z.einheiten = (z.e.einheiten || []).slice().sort((a, b) => a.ab - b.ab || a.ue - b.ue).filter(x => z.bereiche.some(([v, b]) => x.ab <= b && einheitEnde(x) >= v));
    });
    return out;
  }
  const ueText = z => { const g = Math.max(1, Number(z.e.ue) || 1); if (g <= 1) return ''; return z.bereiche.map(([v, b]) => v === b ? `${v}` : `${v}–${b}`).join(', ') + '/' + g; };
  const teileText = z => z.einheiten.map(y => y.titel || y.art).filter(Boolean).filter(t => t !== z.e.titel);
  const fachDerStunde = (k, st) => { if (k.fachId && fach(k.fachId)) return fach(k.fachId); const z = planEintraege(st).find(x => x.e.fachId && fach(x.e.fachId)); return z ? fach(z.e.fachId) : null; };
  const klassenFarbe = k => { const g = Z.st.klassen.filter(x => x.lehrgangId === k.lehrgangId).sort((a, b) => (a.name + ' ' + a.fach).localeCompare(b.name + ' ' + b.fach, 'de')); return (g.indexOf(k) % 8) + 1; };
  const einheiten = st => { const l = Number(S().stundenplan && S().stundenplan.laenge) || 50; const d = minuten(st.ende) - minuten(st.beginn); return d > 0 ? Math.max(1, Math.round(d / l)) : 1; };
  // Nächste Stunde einer Klasse mit offenen ToDos (läuft sie gerade, zählt sie noch) – dort steht ☐ n wie im Programm
  function naechsteMitTodo(k) {
    if (!offeneTodos(k).length) return null;
    const t = heute(), m = jetztMin();
    return Z.st.stunden.filter(s => klasseFuer(s) === k && !ausgefallen(s) && (s.datum > t || (s.datum === t && minuten(s.ende) > m))).sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn))[0] || null;
  }
  // ToDos: fällige zuerst (wie im Programm ab 2.1.1)
  const faellig = t => (t && /^\d{4}-\d{2}-\d{2}$/.test(t.faellig || '') ? t.faellig : null);
  const nachFaellig = (a, b) => { const fa = faellig(a), fb = faellig(b); if (fa && fb && fa !== fb) return fa < fb ? -1 : 1; if (!!fa !== !!fb) return fa ? -1 : 1; return String(a.erstellt || '').localeCompare(String(b.erstellt || '')); };
  const offeneTodos = k => (k ? k.todos || [] : Z.st.todos || []).filter(t => !t.erledigt).sort(nachFaellig);
  const lage = t => { const f = faellig(t); if (!f || t.erledigt) return null; const h = heute(); return f < h ? 'ueber' : f === h ? 'heute' : f === plus(h, 1) ? 'morgen' : 'spaeter'; };
  const faelligText = t => { const f = faellig(t), l = lage(t); if (!f) return ''; return l === 'ueber' ? `überfällig · ${kurz(f)}` : l === 'heute' ? 'heute fällig' : l === 'morgen' ? 'morgen fällig' : `fällig ${wtag(f).slice(0, 2)} ${kurz(f)}`; };
  const alleFaelligen = () => [{ k: null, l: Z.st.todos || [] }, ...Z.st.klassen.map(k => ({ k, l: k.todos || [] }))].flatMap(({ k, l }) => l.filter(t => !t.erledigt && faellig(t) && t.faellig <= heute()).map(t => ({ k, t }))).sort((a, b) => a.t.faellig.localeCompare(b.t.faellig));
  // Rollen (Klassensprecher/in …) wie im Programm
  const ROLLEN = { 'Klassensprecher/in': 'KS', 'Klassensprecher-Stellvertreter/in': 'KS-Stv.', 'Schulsprecher/in': 'SS', 'Schulsprecher-Stellvertreter/in': 'SS-Stv.' };
  const rollen = s => (Array.isArray(s.rollen) ? s.rollen.filter(r => typeof r === 'string' && r) : []);
  const rollenMarken = (s, lang) => rollen(s).map(r => `<span class="rolle" title="${esc(r)}">${esc(lang ? r : ROLLEN[r] || r)}</span>`).join('');
  const fachName = k => { const f = (Z.st.faecher || []).find(x => x.id === k.fachId); return f ? f.name : ''; };

  // ---------- Bausteine ----------
  function stundeZeile(s, mitDatum) {
    const k = klasseFuer(s);
    const titel = s.eigen ? esc(s.eigen.name || 'Eigener Eintrag') : k ? `${esc(k.name)} <span class="ged">${esc(k.fach)}</span>` : esc(s.titel);
    const todo = k ? offeneTodos(k).length : 0;
    const vorbei = s.datum < heute() || (s.datum === heute() && minuten(s.ende) <= jetztMin());
    return `<button class="stunde ${vorbei ? 'vorbei' : ''} ${ausgefallen(s) ? 'aus' : ''} ${s.eigen ? 'eigen' : ''}" data-stunde="${esc(s.id)}">
      <span class="zeit">${esc(s.beginn)}<small>${esc(s.ende)}</small></span>
      <span class="inhalt"><b>${titel}</b>${s.ort ? ` <span class="ged">· ${esc(s.ort)}</span>` : ''}${mitDatum ? ` <span class="ged">· ${wtag(s.datum).slice(0, 2)} ${kurz(s.datum)}</span>` : ''}
        ${s.thema ? `<span class="thema">${esc(s.thema)}</span>` : ''}${ausgefallen(s) ? `<span class="thema rot">${s.entfall ? 'entfallen' : 'nicht gehalten'}</span>` : ''}</span>
      ${todo ? `<span class="marke">☐ ${todo}</span>` : ''}</button>`;
  }
  function naechste() {
    const t = heute(), m = jetztMin();
    return Z.st.stunden.filter(s => !ausgefallen(s) && !s.eigen && (s.datum > t || (s.datum === t && minuten(s.ende) > m))).sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn))[0] || null;
  }

  // ---------- Ansichten ----------
  const ANSICHTEN = {
    heute() {
      const t = heute();
      let tag = t, liste = stundenAm(t);
      if (!liste.length) { const n = Z.st.stunden.filter(s => s.datum > t).sort((a, b) => a.datum.localeCompare(b.datum))[0]; if (n) { tag = n.datum; liste = stundenAm(tag); } }
      const n = naechste();
      const nk = n && klasseFuer(n);
      const lauf = n && n.datum === t && minuten(n.beginn) <= jetztMin();
      const allg = offeneTodos(null);
      return `<h1>${tag === t ? 'Heute' : wtag(tag)}, ${datum(tag)}</h1>
        ${n ? `<div class="karte naechste" ${nk ? `data-go="#klasse/${nk.id}"` : ''}><div class="ged klein">${lauf ? 'Jetzt' : 'Als Nächstes'}${n.datum !== t ? ` · ${wtag(n.datum)} ${kurz(n.datum)}` : lauf ? '' : ` · in ${dauer(minuten(n.beginn) - jetztMin())}`}</div>
          <div class="gross">${nk ? esc(nk.name) + ' <span class="ged">' + esc(nk.fach) + '</span>' : esc(n.titel)}</div>
          <div>${esc(n.beginn)}–${esc(n.ende)}${n.ort ? ' · ' + esc(n.ort) : ''}</div>${n.thema ? `<div class="thema">${esc(n.thema)}</div>` : ''}
          ${nk && offeneTodos(nk).length ? `<div class="klein">☐ ${offeneTodos(nk).map(x => esc(x.text)).join(' · ')}</div>` : ''}</div>` : ''}
        ${alleFaelligen().length ? `<h2 class="rot">Fällige ToDos</h2><div class="liste">${alleFaelligen().map(x => todoZeile(x.t, x.k, true)).join('')}</div>` : ''}
        ${tag !== t ? '<p class="ged klein">Heute keine Stunden – der nächste Schultag:</p>' : ''}
        <div class="liste">${liste.map(s => stundeZeile(s)).join('') || '<p class="ged">Keine Stunden im Stundenplan. Der Stundenplan kommt aus dem Programm am PC.</p>'}</div>
        ${allg.length ? `<h2>Allgemeine ToDos</h2><div class="liste">${allg.map(x => todoZeile(x, null)).join('')}</div>` : ''}`;
    },
    // Woche wie im Programm: Montag bis Freitag nebeneinander, Stunden als Blöcke nach Uhrzeit, Farbe des Fachs
    woche(p) {
      const mo = montag(p[0] || heute());
      const tage = [0, 1, 2, 3, 4].map(i => plus(mo, i));
      const diese = mo === montag(heute());
      const stunden = Z.st.stunden.filter(s => s.datum >= tage[0] && s.datum <= tage[4]);
      const ue = stunden.filter(s => klasseFuer(s) && !ausgefallen(s)).reduce((a, s) => a + einheiten(s), 0);
      let von = 8 * 60, bis = 16 * 60;
      if (stunden.length) { von = Math.floor(Math.min(...stunden.map(s => minuten(s.beginn))) / 60) * 60; bis = Math.ceil(Math.max(...stunden.map(s => minuten(s.ende))) / 60) * 60; }
      // Pixel je Minute: der ganze Schultag soll ins Handy passen (Kopf, Wochenzeile und Reiter abgezogen)
      const px = Math.max(0.75, Math.min(1.6, (window.innerHeight - 230) / Math.max(60, bis - von)));
      const hoehe = (bis - von) * px;
      let skala = '';
      for (let m = von; m <= bis; m += 60) skala += `<div class="wz-zeit" style="top:${(m - von) * px}px">${m / 60}</div>`;
      const h = heute(), jetzt = jetztMin();
      const spalten = tage.map(d => {
        const ds = stunden.filter(s => s.datum === d).sort((a, b) => a.beginn.localeCompare(b.beginn));
        const enden = [], spur = new Map(); // überschneidende Termine nebeneinander
        ds.forEach(s => { const b = minuten(s.beginn); let i = enden.findIndex(e => e <= b); if (i < 0) { i = enden.length; enden.push(0); } enden[i] = minuten(s.ende); spur.set(s, i); });
        const n = Math.max(1, enden.length);
        const linie = d === h && jetzt >= von && jetzt <= bis ? `<div class="wt-jetzt" style="top:${(jetzt - von) * px}px"></div>` : '';
        const wt = new Date(d + 'T12:00:00').toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '');
        return `<div class="wt ${d === h ? 'heute' : ''}"><button class="wt-kopf" data-go="#tag/${d}">${esc(wt)}<b>${kurz(d)}</b></button>
          <div class="wt-raster" style="height:${hoehe}px;background-size:100% ${60 * px}px">${ds.map(s => wochenBlock(s, spur.get(s), n, von, px)).join('')}${linie}</div></div>`;
      }).join('');
      return `<div class="kopfzeile woche-kopf"><button class="knopf" data-go="#woche/${plus(mo, -7)}" aria-label="Woche zurück">‹</button>
          <h1>${diese ? 'Diese Woche' : 'Woche ' + kw(mo)}<span class="ged klein">KW ${kw(mo)} · ${kurz(mo)}–${kurz(plus(mo, 4))}${ue ? ` · ${ue} UE` : ''}</span></h1>
          ${diese ? '' : '<button class="knopf klein" data-go="#woche">Diese Woche</button>'}
          <button class="knopf" data-go="#woche/${plus(mo, 7)}" aria-label="Woche vor">›</button></div>
        <div class="woche" data-mo="${mo}"><div class="wz"><div class="wz-kopf"></div><div class="wz-skala" style="height:${hoehe}px">${skala}</div></div>${spalten}
          ${stunden.length ? '' : '<div class="woche-leer">Keine Stunden in dieser Woche</div>'}</div>
        <p class="ged klein hinweis">Stunde antippen für Details · Tag antippen für die Liste · wischen für die nächste Woche</p>`;
    },
    tag(p) {
      const t = p[0] || heute();
      const l = stundenAm(t);
      return `<div class="kopfzeile"><button class="knopf" data-go="#woche/${t}" aria-label="Zur Woche">‹</button><h1>${t === heute() ? 'Heute, ' : ''}${wtag(t)} <span class="ged">${datum(t)}</span></h1></div>
        <div class="liste">${l.map(s => stundeZeile(s)).join('') || '<p class="ged">Keine Stunden an diesem Tag.</p>'}</div>`;
    },
    klassen() {
      const k = Z.st.klassen.slice();
      const akt = k.filter(laeuft), alt = k.filter(x => !laeuft(x));
      const zeile = x => { const r = Calc.klasse(S(), x); const fw = x.schueler.filter(s => Calc.schueler(S(), x, s).fruehwarnung).length; const l = lehrgang(x.lehrgangId);
        return `<button class="zeile" data-go="#klasse/${x.id}"><span><b>${esc(x.name)}</b> <span class="ged">${esc(x.fach)}</span><br><span class="ged klein">${x.schueler.length} Schüler/innen${l ? ` · ${l.schuljahr || ''} LG ${l.nummer || ''}` : ''}</span></span><span class="rechts">${r.schnitt !== null && r.schnitt !== undefined ? 'Ø ' + Calc.fmt(r.schnitt, 2) : ''}${fw ? ` <span class="marke rot">⚠ ${fw}</span>` : ''}</span></button>`; };
      return `<h1>Klassen</h1><div class="liste">${akt.map(zeile).join('') || '<p class="ged">Keine laufenden Klassen.</p>'}</div>
        ${alt.length ? `<details><summary>Ältere Klassen (${alt.length})</summary><div class="liste">${alt.sort((a, b) => b.erstellt > a.erstellt ? 1 : -1).map(zeile).join('')}</div></details>` : ''}`;
    },
    klasse(p) {
      const k = klasse(p[0]); if (!k) return '<p>Diese Klasse gibt es nicht mehr.</p>';
      const n = Z.st.stunden.filter(s => klasseFuer(s) === k && !ausgefallen(s) && (s.datum > heute() || (s.datum === heute() && minuten(s.ende) > jetztMin()))).sort((a, b) => (a.datum + a.beginn).localeCompare(b.datum + b.beginn))[0];
      const zeilen = k.schueler.map(s => ({ s, r: Calc.schueler(S(), k, s) }));
      const kr = Calc.klasse(S(), k);
      return `<div class="kopfzeile"><button class="knopf" data-go="#klassen" aria-label="Zurück">‹</button><h1>${esc(k.name)} <span class="ged">${esc(k.fach)}</span></h1></div>
        ${n ? `<p class="klein">Nächste Stunde: <b>${wtag(n.datum).slice(0, 2)} ${kurz(n.datum)} ${esc(n.beginn)}</b>${n.ort ? ' · ' + esc(n.ort) : ''}${n.thema ? ` · ${esc(n.thema)}` : ''}</p>` : ''}
        <div class="spiegel">${kr.spiegel.map(z => `<span class="${stufeKlasse(z.code)}">${esc(notenText(z.wert))}<b>${z.vorschlag}</b></span>`).join('')}<span class="ged">Ø ${kr.schnitt !== null && kr.schnitt !== undefined ? Calc.fmt(kr.schnitt, 2) : '–'}</span></div>
        <table class="noten"><thead><tr><th>Name</th><th>Ø</th><th>Note</th><th title="Mitarbeit">MA</th></tr></thead><tbody>
        ${zeilen.map(({ s, r }) => `<tr data-go="#schueler/${k.id}/${s.id}" class="${r.fruehwarnung ? 'fw' : ''}"><td>${esc(s.name)}${rollenMarken(s)}${r.offen.length ? ` <span class="marke">${r.offen.length} offen</span>` : ''}</td><td>${r.schnitt !== null ? Calc.fmt(r.schnitt, 2) : '–'}</td><td><span class="note ${r.note ? 'st' + r.note : ''}">${esc(notenText(r.note))}</span>${r.grenzfall ? '<small title="Grenzfall">±</small>' : ''}${(s.zeugnisnote !== null && s.zeugnisnote !== undefined && s.zeugnisnote !== '') ? `<small> Z ${esc(notenText(Number(s.zeugnisnote)))}</small>` : ''}</td><td>${r.tendenz || ''}<small> ${r.plus}/${r.minus}</small></td></tr>`).join('')}
        </tbody></table>
        ${offeneTodos(k).length ? `<h2>ToDos der Klasse</h2><div class="liste">${offeneTodos(k).map(x => todoZeile(x, k)).join('')}</div>` : ''}`;
    },
    schueler(p) {
      const k = klasse(p[0]); const s = k && k.schueler.find(x => x.id === p[1]); if (!s) return '<p>Nicht gefunden.</p>';
      const r = Calc.schueler(S(), k, s);
      const bereich = (b, name) => { const items = k.items[b] || []; if (!items.length || (b === 'sa' && !Calc.saAktiv(k))) return '';
        const es = Calc.einstellungenFuer(S(), k, b);
        return `<h2>${name}</h2><div class="liste">${items.map(it => { const e = (s.noten || {})[it.id]; const st = Calc.eintragStufe(es, e, it);
          return `<div class="zeile"><span>${esc(it.bez)}${it.datum ? ` <span class="ged klein">${kurz(it.datum)}</span>` : ''}${e && e.kommentar ? `<br><span class="ged klein">${esc(e.kommentar)}</span>` : ''}</span><span class="note ${st ? stufeKlasse(st) : ''}">${e && e.fehlt ? 'f' : e && e.befreit ? '–' : b === 'sa' && st ? Calc.stufeWert(S(), st) : esc(stufeText(st)) || '·'}</span></div>`; }).join('')}</div>`; };
      const ma = (s.mitarbeit || []).slice().reverse();
      const tb = S().textbausteine || {};
      return `<div class="kopfzeile"><button class="knopf" data-go="#klasse/${k.id}" aria-label="Zurück">‹</button><h1>${esc(s.name)}${rollenMarken(s, true)}</h1></div>
        <div class="karte"><div class="gross"><span class="note ${r.note ? 'st' + r.note : ''}">${esc(notenText(r.note))}</span> ${esc(r.noteName || '')}</div>
          <div class="klein">Ø ${r.schnitt !== null ? Calc.fmt(r.schnitt, 2) : '–'}${r.grenzfall ? ' · Grenzfall' : ''} · Mitarbeit ${r.plus} + / ${r.minus} −${r.tendenz ? ' ' + r.tendenz : ''}${(s.zeugnisnote !== null && s.zeugnisnote !== undefined && s.zeugnisnote !== '') ? ` · Zeugnis ${esc(notenText(Number(s.zeugnisnote)))}` : ''}</div>
          ${r.fruehwarnung ? '<div class="rot klein">Frühwarnung</div>' : ''}${r.offen.length ? `<div class="klein">Offen: ${r.offen.map(o => esc(o.item.bez) + (o.grund === 'fehlt' ? ' (fehlt)' : '')).join(', ')}</div>` : ''}
          ${s.notiz ? `<div class="klein ged">${esc(s.notiz)}</div>` : ''}</div>
        <h2>Mitarbeit eintragen</h2>
        <form class="mitarbeit" data-ma="${k.id}/${s.id}">
          <div class="ma-knoepfe"><label><input type="radio" name="w" value="+" checked><span class="plus">+</span></label><label><input type="radio" name="w" value="-"><span class="minus">−</span></label><label><input type="radio" name="w" value="0"><span>○</span></label></div>
          <input name="grund" placeholder="Begründung (optional)" maxlength="300" autocomplete="off" list="tb-${s.id}">
          <datalist id="tb-${s.id}">${[...(tb.plus || []), ...(tb.minus || []), ...(tb.neutral || [])].map(t => `<option value="${esc(t)}">`).join('')}</datalist>
          <button class="knopf primaer">Eintragen</button></form>
        ${ma.length ? `<div class="liste">${ma.slice(0, 15).map(m => `<div class="zeile"><span><b class="${m.wert === '+' ? 'plus' : m.wert === '-' ? 'minus' : ''}">${m.wert === '+' ? '+' : m.wert === '-' ? '−' : '○'}</b> ${esc(m.grund || '')}</span><span class="ged klein">${kurz(m.datum)}</span></div>`).join('')}</div>` : ''}
        ${bereich('sa', 'Schularbeiten')}${bereich('kc', 'Kompetenzchecks')}${bereich('aa', 'Arbeitsaufträge')}`;
    },
    todos() {
      const gruppen = [{ k: null, name: 'Allgemein' }, ...Z.st.klassen.filter(k => offeneTodos(k).length || laeuft(k)).map(k => ({ k, name: k.name + ' ' + k.fach }))];
      return `<h1>ToDos</h1>
        <form class="todo-form" data-todo-neu="">
          <input name="text" placeholder="Was ist zu tun?" maxlength="300" autocomplete="off" required>
          <div class="zeile2"><select name="klasse" aria-label="Wo?"><option value="">Allgemein</option>${Z.st.klassen.filter(laeuft).map(k => `<option value="${k.id}">${esc(k.name)} ${esc(k.fach)}</option>`).join('')}</select>
            <select name="schueler" aria-label="Schüler/in" hidden><option value="">ganze Klasse</option></select></div>
          <div class="zeile2"><label class="klein ged">Fällig bis <input type="date" name="faellig"></label><button class="knopf primaer">+ ToDo</button></div>
        </form>
        ${gruppen.map(g => { const l = offeneTodos(g.k); return l.length ? `<h2>${esc(g.name)}</h2><div class="liste">${l.map(x => todoZeile(x, g.k)).join('')}</div>` : ''; }).join('') || '<p class="ged">Keine offenen ToDos. 🎉</p>'}`;
    },
    einstellungen() {
      return `<h1>Einstellungen</h1>
        <div class="karte"><b>Verbunden mit</b><br>${esc(D.ort.name)}: ${esc(Z.datei ? Z.datei.name : '')}<br><span class="ged klein">Stand: ${esc(zeitText(Z.stand && Z.stand.zeit))}${Z.stand && Z.stand.geraet ? ' · ' + esc(Z.stand.geraet) : ''}</span></div>
        <p class="klein ged">Die Web-App zeigt die Daten aus deinem Notenbuch am PC (gemeinsamer Ordner in Google Drive). Am Handy liegt nur die verschlüsselte Datei; der Schlüssel ist im Browser geschützt gespeichert. Das Handy selbst schützt du mit Fingerabdruck, Gesichtserkennung oder PIN.</p>
        <div class="liste"><button class="zeile" data-akt="aktualisieren">Jetzt aktualisieren</button><button class="zeile" data-akt="andere">Andere Datei wählen …</button><button class="zeile rot" data-akt="trennen">Von diesem Handy entfernen</button></div>
        <p class="klein ged">TFBS Notenbuch Web ${esc(window.NB_WEB_VERSION || '')} · © 2026 Werner Scheyrer, BEd</p>`;
    }
  };
  // Ein Block in der Woche – Inhalt wie im Programm (Klasse, Fach, geplante Themen mit UE, Zeit, Ort, ToDos, Status)
  function wochenBlock(s, spur, n, von, px) {
    const k = klasseFuer(s);
    const b = minuten(s.beginn), e = minuten(s.ende);
    const status = statusText(s);
    const lage = `top:${(b - von) * px + 1}px;height:${Math.max(18, (e - b) * px - 2)}px;left:calc(${spur * 100 / n}% + 2px);width:calc(${100 / n}% - 4px)`;
    const kurzKl = (e - b) * px < 34 ? 'kurz' : '';
    const aus = status ? 'ausfall' : '';
    if (s.eigen) {
      return `<button class="wblock eigen ${kurzKl} ${aus} ep-${esc(s.eigen.farbe || 'p0')}" data-stunde="${esc(s.id)}" style="${lage}">
        <span class="wb-titel">${esc(s.eigen.name || 'Eigener Eintrag')}</span><span class="wb-zeit">${esc(s.beginn)}–${esc(s.ende)}</span>${status ? `<span class="wb-status">${esc(status)}</span>` : ''}</button>`;
    }
    const plan = planEintraege(s);
    const planText = plan.map(z => esc(z.e.titel) + (ueText(z) ? ` <span class="wb-teil">${ueText(z)}</span>` : '') + (teileText(z).length ? `<span class="wb-einheit">${esc(teileText(z).join(', '))}</span>` : '')).join(' · ');
    const todo = k && naechsteMitTodo(k) === s ? offeneTodos(k).length : 0;
    let p = 0, m = 0, o = 0;
    if (k) k.schueler.forEach(x => (x.mitarbeit || []).forEach(y => { if (y.stunde === s.id) { if (y.wert === '+') p++; else if (y.wert === '0') o++; else m++; } }));
    const marken = [todo ? `<span class="wb-todo">☐ ${todo}</span>` : '', s.thema && !plan.length ? '<span>✓ Thema</span>' : '', p + m + o ? `<span>${[p ? '+' + p : '', m ? '−' + m : '', o ? '○' + o : ''].filter(Boolean).join(' ')}</span>` : ''].join('');
    // 1.3.1: wie im Programm 2.2.3 – Farbe je Fachname (auch ohne Planung); mit Planung geht die Farbe des Fachs der Planung vor
    const fnF = k ? (S().fachnameFarben || {})[String(k.fach || '').trim().toLowerCase() || String(k.name || '').trim().toLowerCase()] : null;
    const fn = farbeOk(fnF) ? fnF : null, fp = k ? fachFarbe(fachDerStunde(k, s)) : null;
    const ff = k ? ((planungAn() && fachDerStunde(k, s)) ? (fp || fn) : (fn || fp)) : null;
    const farbe = ff ? 'fc fc-' + ff : 'f' + (k ? klassenFarbe(k) : 0);
    return `<button class="wblock ${farbe} ${k ? '' : 'offen-zuordnen'} ${kurzKl} ${aus}" data-stunde="${esc(s.id)}" style="${lage}">
      <span class="wb-titel">${k ? `${esc(k.name)} <span class="wb-fach">${esc(k.fach)}</span>` : esc(s.titel)}</span>
      ${planText ? `<span class="wb-plan">${planText}</span>` : s.thema ? `<span class="wb-plan">${esc(s.thema)}</span>` : ''}
      ${status ? `<span class="wb-status">${esc(status)}</span>` : s.supplierung ? '<span class="wb-status suppl">Supplierung</span>' : ''}
      <span class="wb-zeit">${esc(s.beginn)}–${esc(s.ende)}${s.ort ? ' · ' + esc(s.ort) : ''}</span>
      ${marken ? `<span class="wb-marken">${marken}</span>` : ''}</button>`;
  }
  // Details einer Stunde als Blatt von unten (statt Tooltip im Programm)
  function stundeDetails(id) {
    const s = Z.st.stunden.find(x => x.id === id); if (!s) return;
    const k = klasseFuer(s);
    const status = statusText(s);
    const kopf = s.eigen ? esc(s.eigen.name || 'Eigener Eintrag') : k ? `${esc(k.name)} <span class="ged">${esc(k.fach)}</span>` : esc(s.titel);
    const plan = planEintraege(s);
    const td = k ? offeneTodos(k) : [];
    blatt(`<h2 class="blatt-titel">${kopf}</h2>
      <p>${wtag(s.datum)}, ${datum(s.datum)} · ${esc(s.beginn)}–${esc(s.ende)}${s.ort ? ' · ' + esc(s.ort) : ''}${!s.eigen && einheiten(s) > 1 ? ` · ${einheiten(s) === 2 ? 'Doppelstunde' : einheiten(s) + ' Std.'}` : ''}</p>
      ${s.eigen ? `<p class="ged klein">${esc(EIGEN_ARTEN[s.eigen.art] || '')}${s.eigen.regel ? ' · jede Woche' : ''} · in WebUntis „${esc(s.titel)}“</p>` : ''}
      ${status ? `<p class="rot">${esc(status)}</p>` : s.supplierung ? '<p>Supplierung</p>' : ''}
      ${plan.length ? `<h3>Geplant</h3>${plan.map(z => `<div class="plan-zeile"><b>${esc(z.e.titel)}</b>${ueText(z) ? ` <span class="ged">UE ${ueText(z)}</span>` : ''}${z.einheiten.length ? `<ul>${z.einheiten.map(x => `<li>${esc(x.titel || x.art || 'Unterpunkt')}${x.art && x.titel ? ` <span class="ged klein">${esc(x.art)}</span>` : ''}</li>`).join('')}</ul>` : ''}</div>`).join('')}`
        : s.thema ? `<h3>Thema</h3><p>${esc(s.thema)}</p>` : ''}
      ${td.length ? `<h3>Offene ToDos der Klasse</h3><ul>${td.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''}
      <div class="blatt-knoepfe">${k ? `<button class="knopf primaer" data-go="#klasse/${k.id}">Klasse ${esc(k.name)} öffnen</button>` : ''}<button class="knopf" data-akt="blatt-zu">Schließen</button></div>`);
  }
  function blatt(html) {
    blattZu();
    const h = document.createElement('div'); h.className = 'blatt-huelle'; h.id = 'blatt';
    h.innerHTML = `<div class="blatt" role="dialog" aria-modal="true">${html}</div>`;
    h.addEventListener('click', e => { if (e.target === h) blattZu(); });
    document.body.appendChild(h);
  }
  const blattZu = () => { const b = $('#blatt'); if (b) b.remove(); };
  const dauer = m =>m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60 ? (m % 60) + ' Min.' : ''}`.trim();
  function todoZeile(t, k, mitKlasse) {
    const sch = k && t.schueler ? (k.schueler || []).find(x => x.id === t.schueler) : null;
    const l = lage(t);
    const links = (Array.isArray(t.anhaenge) ? t.anhaenge : []).map(m => m.url ? `<a class="anh" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(m.name || m.url.replace(/^https?:\/\//, ''))}</a>` : `<span class="anh ged" title="Datei am PC">📄 ${esc(m.name || '')}</span>`).join('');
    return `<label class="zeile todo"><input type="checkbox" data-todo="${k ? k.id : ''}|${t.id}"><span class="todo-inhalt"><span>${esc(t.text)}${l ? ` <span class="faellig f-${l}">${esc(faelligText(t))}</span>` : t.datum ? ` <span class="ged klein">${kurz(t.datum)}</span>` : ''}</span>
      ${mitKlasse || sch || t.notiz || links ? `<span class="ged klein">${[mitKlasse ? (k ? esc(k.name) : 'Allgemein') : '', sch ? '👤 ' + esc(sch.name) : '', t.notiz ? esc(t.notiz.split('\n')[0].slice(0, 80)) : ''].filter(Boolean).join(' · ')}</span>${links ? `<span class="anh-liste">${links}</span>` : ''}` : ''}</span></label>`;
  }

  // ---------- Einrichtung ----------
  function einrichtung(fehler) {
    $('#inhalt').innerHTML = `<div class="willkommen"><img src="icon-192.png" alt="" width="72" height="72"><h1>TFBS Notenbuch</h1>
      <p>Noten nachschauen, die nächsten Stunden, ToDos und Mitarbeit – mit den Daten aus deinem Notenbuch am PC.</p>
      <ol class="klein"><li>Am PC muss der <b>gemeinsame Ordner</b> in Google Drive eingerichtet sein (Einstellungen → Daten auf mehreren Geräten).</li><li>Hier mit Google anmelden und im Ordner „Notenbuch-Datei“ die Datei <b>notenbuch-daten.nbg</b> wählen.</li><li>Einmal das Passwort des Notenbuchs eingeben – danach nie wieder.</li></ol>
      ${Z.datei ? `<p class="klein">Gewählt: <b>${esc(Z.datei.name)}</b></p><form id="pw-form"><input type="password" name="pw" placeholder="Passwort des Notenbuchs" autocomplete="current-password" required minlength="1"><button class="knopf primaer">Verbinden</button></form><div class="fortschritt" hidden><span></span></div>`
        : `<button class="knopf primaer gross" data-akt="waehlen">Mit Google Drive verbinden</button>`}
      ${fehler ? `<p class="rot">${esc(fehler)}</p>` : ''}</div>`;
    $('#tabs').hidden = true; $('#stand').textContent = '';
  }

  // ---------- Zeichnen ----------
  let ansicht = ['heute'];
  function zeichnen() {
    if (!Z.st) return einrichtung();
    if (Z.fehlerCode === 'PASSWORT') return einrichtung(Z.fehler); // am PC geändertes Passwort: einmal neu eingeben
    $('#tabs').hidden = false;
    const [name, ...p] = (location.hash.slice(1) || 'heute').split('/');
    const f = ANSICHTEN[name] || ANSICHTEN.heute;
    const neu = [name, ...p].join('/') !== ansicht.join('/');
    ansicht = [name, ...p];
    kfCache = new WeakMap();
    $('#inhalt').innerHTML = f(p);
    document.body.classList.toggle('breit', name === 'woche');
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('aktiv', a.dataset.tab === ({ klasse: 'klassen', schueler: 'klassen', tag: 'woche' }[name] || name)));
    if (neu) window.scrollTo(0, 0);
    standZeigen();
  }
  function standZeigen() {
    const el = $('#stand');
    if (Z.fehler) { el.textContent = '⚠ ' + (Z.offen ? 'Nicht gespeichert' : 'Offline'); el.title = Z.fehler; el.className = 'stand rot'; return; }
    el.className = 'stand';
    el.textContent = Z.offen ? '• Speichert …' : Z.stand ? '✓ ' + zeitText(Z.stand.zeit) : '';
    el.title = Z.stand ? `Stand vom ${zeitText(Z.stand.zeit)}${Z.stand.geraet ? ' (' + Z.stand.geraet + ')' : ''}` : '';
  }
  const meldung = (t, art) => { const m = $('#meldung'); m.textContent = t; m.className = 'meldung zeigen ' + (art || ''); clearTimeout(meldung.t); meldung.t = setTimeout(() => { m.className = 'meldung'; }, 3200); };

  // ---------- Bedienung ----------
  document.addEventListener('click', async e => {
    const g = e.target.closest('[data-go]');
    if (g && !e.target.closest('input, label.todo')) { e.preventDefault(); blattZu(); location.hash = g.dataset.go; return; }
    const sb = e.target.closest('[data-stunde]');
    if (sb) { stundeDetails(sb.dataset.stunde); return; }
    const a = e.target.closest('[data-akt]');
    if (!a) return;
    const akt = a.dataset.akt;
    if (akt === 'blatt-zu') return blattZu();
    try {
      if (akt === 'waehlen' || akt === 'andere') { await D.dateiWaehlen(); if (akt === 'andere') { Z.st = null; } return zeichnen(); }
      if (akt === 'aktualisieren') { await D.aktualisieren(); return meldung(Z.fehler ? Z.fehler : 'Aktuell', Z.fehler ? 'fehler' : ''); }
      if (akt === 'trennen') { if (confirm('Notenbuch von diesem Handy entfernen? (Die Daten am PC und in Google Drive bleiben.)')) { await D.trennen(); location.hash = ''; zeichnen(); } }
    } catch (x) { if (!Z.st) einrichtung(x.message); else meldung(x.message, 'fehler'); }
  });
  document.addEventListener('change', e => {
    const f = e.target.closest('form.todo-form');
    if (f && e.target.name === 'klasse') {
      const k = klasse(e.target.value), sel = f.schueler;
      sel.innerHTML = '<option value="">ganze Klasse</option>' + (k ? k.schueler.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('') : '');
      sel.hidden = !k; return;
    }
    const c = e.target.closest('[data-todo]');
    if (!c) return;
    const [kid, tid] = c.dataset.todo.split('|');
    D.aendern(st => { const l = kid ? (st.klassen.find(k => k.id === kid) || {}).todos || [] : st.todos || []; const t = l.find(x => x.id === tid); if (t) t.erledigt = heute(); });
    meldung('Erledigt');
  });
  document.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'pw-form') {
      const pw = f.pw.value; const fs = $('.fortschritt'); fs.hidden = false; f.querySelector('button').disabled = true;
      try { await D.einrichten(pw, x => { fs.firstElementChild.style.width = Math.round(x * 100) + '%'; }); location.hash = '#heute'; zeichnen(); meldung('Verbunden – das Passwort wird nicht mehr gebraucht'); }
      catch (x) { einrichtung(x.code === 'PASSWORT' ? 'Das Passwort passt nicht. Bitte nochmals versuchen.' : x.message); }
      return;
    }
    if (f.dataset.todoNeu !== undefined) {
      const text = f.text.value.trim(); if (!text) return;
      const kid = f.dataset.todoNeu || (f.klasse ? f.klasse.value : '');
      const sid = kid && f.schueler ? f.schueler.value : '';
      const fae = f.faellig && /^\d{4}-\d{2}-\d{2}$/.test(f.faellig.value) ? f.faellig.value : '';
      await D.aendern(st => { const k = kid ? st.klassen.find(x => x.id === kid) : null; const l = k ? (k.todos = k.todos || []) : (st.todos = st.todos || []); const t = { id: uid(), text: text.slice(0, 300), erstellt: new Date().toISOString(), datum: heute(), stunde: null, erledigt: null }; if (sid) t.schueler = sid; if (fae) t.faellig = fae; l.push(t); });
      meldung('ToDo eingetragen');
      return;
    }
    if (f.dataset.ma) {
      const [kid, sid] = f.dataset.ma.split('/');
      const w = f.w.value, grund = f.grund.value.trim().slice(0, 300);
      await D.aendern(st => { const k = st.klassen.find(x => x.id === kid); const s = k && k.schueler.find(x => x.id === sid); if (s) (s.mitarbeit = s.mitarbeit || []).push({ id: uid(), wert: w, datum: heute(), grund }); });
      meldung(`Mitarbeit ${w === '+' ? '+' : w === '-' ? '−' : '○'} eingetragen`);
    }
  });
  window.addEventListener('hashchange', () => { blattZu(); zeichnen(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') blattZu(); });
  // In der Woche nach links/rechts wischen = nächste/vorige Woche
  let wisch = null;
  document.addEventListener('touchstart', e => { const w = e.target.closest('.woche'); wisch = w && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, mo: w.dataset.mo } : null; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!wisch) return; const t = e.changedTouches[0]; const dx = t.clientX - wisch.x, dy = t.clientY - wisch.y; const mo = wisch.mo; wisch = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) location.hash = '#woche/' + plus(mo, dx < 0 ? 7 : -7);
  }, { passive: true });
  // Drehen des Handys: Woche neu einpassen
  window.addEventListener('resize', () => { clearTimeout(zeichnen.t); zeichnen.t = setTimeout(() => { if (ansicht[0] === 'woche' && Z.st) zeichnen(); }, 150); });
  $('#stand').addEventListener('click', () => { D.aktualisieren(); });
  D.beobachten(() => { if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName) && Z.st) return standZeigen(); zeichnen(); if (Z.hinweis) { meldung(Z.hinweis); Z.hinweis = null; } });
  // beim Zurückkehren in die App und jede Minute aktualisieren (die „nächste Stunde“ wandert mit)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Z.key) D.aktualisieren(); });
  setInterval(() => { if (document.visibilityState === 'visible' && Z.st) { if (Z.key && !Z.offen) D.aktualisieren(); else zeichnen(); } }, 60000);

  (async () => {
    try { if (await D.start()) { zeichnen(); D.aktualisieren(); } else einrichtung(); }
    catch (x) { einrichtung(x.message); }
    if ('serviceWorker' in navigator && !D.testmodus && location.protocol === 'https:') {
      // Neue Version der App: einmal neu laden, sobald sie bereitsteht (nur wenn vorher schon eine lief)
      const hatte = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hatte && !zeichnen.neu) { zeichnen.neu = true; location.reload(); } });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
    }
  })();
})();
