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
  function klasseFuer(st) {
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
  const ausgefallen = s => !!(s.entfall || s.nichtGehalten || s.eigenAus);
  const offeneTodos = k => (k ? k.todos || [] : Z.st.todos || []).filter(t => !t.erledigt);
  const fachName = k => { const f = (Z.st.faecher || []).find(x => x.id === k.fachId); return f ? f.name : ''; };

  // ---------- Bausteine ----------
  function stundeZeile(s, mitDatum) {
    const k = klasseFuer(s);
    const titel = s.eigen ? esc(s.eigen.name || 'Eigener Eintrag') : k ? `${esc(k.name)} <span class="ged">${esc(k.fach)}</span>` : esc(s.titel);
    const todo = k ? offeneTodos(k).length : 0;
    const vorbei = s.datum < heute() || (s.datum === heute() && minuten(s.ende) <= jetztMin());
    return `<button class="stunde ${vorbei ? 'vorbei' : ''} ${ausgefallen(s) ? 'aus' : ''} ${s.eigen ? 'eigen' : ''}" ${k ? `data-go="#klasse/${k.id}"` : 'disabled'}>
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
        ${tag !== t ? '<p class="ged klein">Heute keine Stunden – der nächste Schultag:</p>' : ''}
        <div class="liste">${liste.map(s => stundeZeile(s)).join('') || '<p class="ged">Keine Stunden im Stundenplan. Der Stundenplan kommt aus dem Programm am PC.</p>'}</div>
        ${allg.length ? `<h2>Allgemeine ToDos</h2><div class="liste">${allg.map(x => todoZeile(x, null)).join('')}</div>` : ''}`;
    },
    woche(p) {
      const mo = montag(p[0] || heute());
      const tage = [0, 1, 2, 3, 4].map(i => plus(mo, i));
      return `<div class="kopfzeile"><button class="knopf" data-go="#woche/${plus(mo, -7)}" aria-label="Woche zurück">‹</button><h1>KW ${kw(mo)} <span class="ged">${kurz(mo)}–${kurz(plus(mo, 4))}</span></h1><button class="knopf" data-go="#woche/${plus(mo, 7)}" aria-label="Woche vor">›</button></div>
        ${mo !== montag(heute()) ? '<button class="knopf leise klein" data-go="#woche">Diese Woche</button>' : ''}
        ${tage.map(t => { const l = stundenAm(t); return `<section class="tag ${t === heute() ? 'heute' : ''}"><h2>${wtag(t)} <span class="ged">${kurz(t)}</span></h2><div class="liste">${l.map(s => stundeZeile(s)).join('') || '<p class="ged klein">frei</p>'}</div></section>`; }).join('')}`;
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
        ${zeilen.map(({ s, r }) => `<tr data-go="#schueler/${k.id}/${s.id}" class="${r.fruehwarnung ? 'fw' : ''}"><td>${esc(s.name)}${r.offen.length ? ` <span class="marke">${r.offen.length} offen</span>` : ''}</td><td>${r.schnitt !== null ? Calc.fmt(r.schnitt, 2) : '–'}</td><td><span class="note ${r.note ? 'st' + r.note : ''}">${esc(notenText(r.note))}</span>${r.grenzfall ? '<small title="Grenzfall">±</small>' : ''}${(s.zeugnisnote !== null && s.zeugnisnote !== undefined && s.zeugnisnote !== '') ? `<small> Z ${esc(notenText(Number(s.zeugnisnote)))}</small>` : ''}</td><td>${r.tendenz || ''}<small> ${r.plus}/${r.minus}</small></td></tr>`).join('')}
        </tbody></table>
        <h2>ToDos der Klasse</h2><div class="liste">${offeneTodos(k).map(x => todoZeile(x, k)).join('') || '<p class="ged klein">Keine offenen ToDos.</p>'}</div>
        <form class="neu" data-todo-neu="${k.id}"><input name="text" placeholder="Neues ToDo für ${esc(k.name)}" maxlength="300" autocomplete="off"><button class="knopf primaer">+</button></form>`;
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
      return `<div class="kopfzeile"><button class="knopf" data-go="#klasse/${k.id}" aria-label="Zurück">‹</button><h1>${esc(s.name)}</h1></div>
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
        <form class="neu" data-todo-neu=""><select name="klasse" aria-label="Für"><option value="">Allgemein</option>${Z.st.klassen.filter(laeuft).map(k => `<option value="${k.id}">${esc(k.name)} ${esc(k.fach)}</option>`).join('')}</select><input name="text" placeholder="Neues ToDo" maxlength="300" autocomplete="off"><button class="knopf primaer">+</button></form>
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
  const dauer = m => m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60 ? (m % 60) + ' Min.' : ''}`.trim();
  function todoZeile(t, k) { return `<label class="zeile todo"><input type="checkbox" data-todo="${k ? k.id : ''}|${t.id}"><span>${esc(t.text)}${t.datum ? ` <span class="ged klein">${kurz(t.datum)}</span>` : ''}</span></label>`; }

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
    $('#inhalt').innerHTML = f(p);
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('aktiv', a.dataset.tab === ({ klasse: 'klassen', schueler: 'klassen' }[name] || name)));
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
    if (g && !e.target.closest('input, label.todo')) { e.preventDefault(); location.hash = g.dataset.go; return; }
    const a = e.target.closest('[data-akt]');
    if (!a) return;
    const akt = a.dataset.akt;
    try {
      if (akt === 'waehlen' || akt === 'andere') { await D.dateiWaehlen(); if (akt === 'andere') { Z.st = null; } return zeichnen(); }
      if (akt === 'aktualisieren') { await D.aktualisieren(); return meldung(Z.fehler ? Z.fehler : 'Aktuell', Z.fehler ? 'fehler' : ''); }
      if (akt === 'trennen') { if (confirm('Notenbuch von diesem Handy entfernen? (Die Daten am PC und in Google Drive bleiben.)')) { await D.trennen(); location.hash = ''; zeichnen(); } }
    } catch (x) { if (!Z.st) einrichtung(x.message); else meldung(x.message, 'fehler'); }
  });
  document.addEventListener('change', e => {
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
      await D.aendern(st => { const k = kid ? st.klassen.find(x => x.id === kid) : null; const l = k ? (k.todos = k.todos || []) : (st.todos = st.todos || []); l.push({ id: uid(), text: text.slice(0, 300), erstellt: new Date().toISOString(), datum: heute(), stunde: null, erledigt: null }); });
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
  window.addEventListener('hashchange', zeichnen);
  $('#stand').addEventListener('click', () => { D.aktualisieren(); });
  D.beobachten(() => { if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName) && Z.st) return standZeigen(); zeichnen(); if (Z.hinweis) { meldung(Z.hinweis); Z.hinweis = null; } });
  // beim Zurückkehren in die App und jede Minute aktualisieren (die „nächste Stunde“ wandert mit)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Z.key) D.aktualisieren(); });
  setInterval(() => { if (document.visibilityState === 'visible' && Z.st) { if (Z.key && !Z.offen) D.aktualisieren(); else zeichnen(); } }, 60000);

  (async () => {
    try { if (await D.start()) { zeichnen(); D.aktualisieren(); } else einrichtung(); }
    catch (x) { einrichtung(x.message); }
    if ('serviceWorker' in navigator && !D.testmodus && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
