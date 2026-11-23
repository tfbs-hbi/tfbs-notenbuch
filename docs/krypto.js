/* TFBS Notenbuch Web – Verschlüsselung wie im Programm (gemeinsamer Ordner, Datei notenbuch-daten.nbg)
 * Aufbau: "NBG1" | salt (16) | iv (12) | tag (16) | AES-256-GCM( gzip( JSON-Hülle ) )
 * Schlüssel = scrypt(Passwort, salt, N=32768, r=8, p=1, 32 Byte) – wie crypto.scryptSync im Programm.
 * Hülle = { revision, geraet, zeit, basis, daten: '<JSON des Notenbuchs>' } */
(function (root) {
  'use strict';
  const K = root.NBK = {};
  const MAGIC = [0x4e, 0x42, 0x47, 0x31]; // NBG1

  // ---------- scrypt (RFC 7914) – PBKDF2 über WebCrypto, ROMix in JavaScript ----------
  async function pbkdf2(pass, salt, len) {
    const key = await crypto.subtle.importKey('raw', pass, 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1 }, key, len * 8));
  }
  function salsa(B, x) { // Salsa20/8 auf 16 Wörtern (B wird überschrieben)
    for (let i = 0; i < 16; i++) x[i] = B[i];
    const R = (a, b) => (a << b) | (a >>> (32 - b));
    for (let i = 0; i < 8; i += 2) {
      x[4] ^= R(x[0] + x[12], 7); x[8] ^= R(x[4] + x[0], 9); x[12] ^= R(x[8] + x[4], 13); x[0] ^= R(x[12] + x[8], 18);
      x[9] ^= R(x[5] + x[1], 7); x[13] ^= R(x[9] + x[5], 9); x[1] ^= R(x[13] + x[9], 13); x[5] ^= R(x[1] + x[13], 18);
      x[14] ^= R(x[10] + x[6], 7); x[2] ^= R(x[14] + x[10], 9); x[6] ^= R(x[2] + x[14], 13); x[10] ^= R(x[6] + x[2], 18);
      x[3] ^= R(x[15] + x[11], 7); x[7] ^= R(x[3] + x[15], 9); x[11] ^= R(x[7] + x[3], 13); x[15] ^= R(x[11] + x[7], 18);
      x[1] ^= R(x[0] + x[3], 7); x[2] ^= R(x[1] + x[0], 9); x[3] ^= R(x[2] + x[1], 13); x[0] ^= R(x[3] + x[2], 18);
      x[6] ^= R(x[5] + x[4], 7); x[7] ^= R(x[6] + x[5], 9); x[4] ^= R(x[7] + x[6], 13); x[5] ^= R(x[4] + x[7], 18);
      x[11] ^= R(x[10] + x[9], 7); x[8] ^= R(x[11] + x[10], 9); x[9] ^= R(x[8] + x[11], 13); x[10] ^= R(x[9] + x[8], 18);
      x[12] ^= R(x[15] + x[14], 7); x[13] ^= R(x[12] + x[15], 9); x[14] ^= R(x[13] + x[12], 13); x[15] ^= R(x[14] + x[13], 18);
    }
    for (let i = 0; i < 16; i++) B[i] = (B[i] + x[i]) | 0;
  }
  function blockMix(B, Y, r, x, t) { // B: 32r Wörter
    const n = 16;
    for (let i = 0; i < n; i++) t[i] = B[(2 * r - 1) * n + i];
    for (let i = 0; i < 2 * r; i++) {
      for (let j = 0; j < n; j++) t[j] ^= B[i * n + j];
      salsa(t, x);
      const ziel = (i & 1 ? r + (i >> 1) : i >> 1) * n;
      for (let j = 0; j < n; j++) Y[ziel + j] = t[j];
    }
    B.set(Y);
  }
  K.scrypt = async function (passwort, salt, N = 32768, r = 8, p = 1, len = 32, fortschritt) {
    const pass = new TextEncoder().encode(String(passwort));
    const Bb = await pbkdf2(pass, salt, 128 * r * p);
    const w = 32 * r;
    const V = new Uint32Array(w * N), X = new Uint32Array(w), Y = new Uint32Array(w), x = new Uint32Array(16), t = new Uint32Array(16);
    const dv = new DataView(Bb.buffer);
    for (let q = 0; q < p; q++) {
      for (let i = 0; i < w; i++) X[i] = dv.getUint32((q * w + i) * 4, true);
      for (let i = 0; i < N; i++) { V.set(X, i * w); blockMix(X, Y, r, x, t); if (fortschritt && !(i & 2047)) { fortschritt(i / (2 * N)); await new Promise(z => setTimeout(z, 0)); } }
      for (let i = 0; i < N; i++) {
        const j = X[(2 * r - 1) * 16] & (N - 1);
        for (let k = 0; k < w; k++) X[k] ^= V[j * w + k];
        blockMix(X, Y, r, x, t);
        if (fortschritt && !(i & 2047)) { fortschritt(0.5 + i / (2 * N)); await new Promise(z => setTimeout(z, 0)); }
      }
      for (let i = 0; i < w; i++) dv.setUint32((q * w + i) * 4, X[i], true);
    }
    return pbkdf2(pass, Bb, len);
  };

  // ---------- gzip ----------
  async function strom(daten, s) { return new Uint8Array(await new Response(new Blob([daten]).stream().pipeThrough(s)).arrayBuffer()); }
  K.gunzip = d => strom(d, new DecompressionStream('gzip'));
  K.gzip = d => strom(d, new CompressionStream('gzip'));

  // ---------- Datei ----------
  K.zerlegen = function (buf) {
    const b = new Uint8Array(buf);
    if (b.length < 48 || MAGIC.some((m, i) => b[i] !== m)) throw new Error('Das ist keine Notenbuch-Datei (notenbuch-daten.nbg aus dem Ordner „Notenbuch-Datei“).');
    return { salt: b.slice(4, 20), iv: b.slice(20, 32), tag: b.slice(32, 48), enc: b.slice(48) };
  };
  // Schlüssel (32 Byte) → nicht auslesbarer WebCrypto-Schlüssel (lässt sich so im Handy speichern, aber nicht herauskopieren)
  K.schluesselAus = bytes => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  K.entschluesseln = async function (roh, key) {
    const ct = new Uint8Array(roh.enc.length + 16); ct.set(roh.enc); ct.set(roh.tag, roh.enc.length);
    let plain;
    try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: roh.iv }, key, ct)); }
    catch { throw Object.assign(new Error('Das Passwort passt nicht zu dieser Datei.'), { code: 'PASSWORT' }); }
    return JSON.parse(new TextDecoder().decode(await K.gunzip(plain)));
  };
  K.verschluesseln = async function (huelle, key, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const z = await K.gzip(new TextEncoder().encode(JSON.stringify(huelle)));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, z));
    const enc = ct.slice(0, ct.length - 16), tag = ct.slice(ct.length - 16);
    const out = new Uint8Array(48 + enc.length);
    out.set(MAGIC, 0); out.set(salt, 4); out.set(iv, 20); out.set(tag, 32); out.set(enc, 48);
    return out;
  };
  K.stempel = h => [h.revision || 0, h.geraet || '', h.zeit || ''].join('|');
})(typeof self !== 'undefined' ? self : this);
