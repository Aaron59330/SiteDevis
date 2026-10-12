'use strict';
/* Boîte à outils : conversion d'images, photos en PDF, calculs métier, messages types, astuces.
   Tout fonctionne dans le navigateur : les fichiers ne quittent jamais l'ordinateur de l'utilisateur. */

const toolsUI = { tab: 'files', tipCat: '', tipQ: '' };
const TOOL_TABS = [['files', 'Fichiers & images'], ['calc', 'Calculs & utilitaires'], ['msg', 'Messages types'], ['tips', 'Astuces']];
const fmtSize = n => (n >= 1048576 ? (n / 1048576).toFixed(2).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko');
const fnum = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const tv = id => num((document.getElementById(id) || {}).value);

EXTRA.tools = function renderTools() {
  return `<h1>Boîte à outils</h1>
  <p class="muted" style="margin-top:0">Des outils simples pour gagner du temps au quotidien. Vos fichiers restent sur votre ordinateur : ils ne sont jamais envoyés sur Internet.</p>
  <div class="tabs">${TOOL_TABS.map(([k, l]) => `<button data-act="tools-tab" data-tab="${k}" class="${toolsUI.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="toolsBody">${toolsBody()}</div>`;
};
AFTER.tools = () => { if (toolsUI.tab === 'calc') calcAll(); if (toolsUI.tab === 'msg') msgFill(); if (toolsUI.tab === 'files') { imgRender(); pdfRender(); } };
const toolsBody = () => ({ files: filesHtml, calc: calcHtml, msg: msgHtml, tips: tipsHtml }[toolsUI.tab])();

/* ================= FICHIERS & IMAGES ================= */
const img = { items: [] }, pdf = { items: [] };

function filesHtml() {
  return `
  <div class="card"><h2>Convertir et compresser des images</h2>
    <p class="muted">Passez de PNG à JPEG ou WebP, réduisez la taille et le poids des photos avant de les envoyer par email. La conversion supprime aussi les informations cachées des photos (position GPS, modèle d'appareil).</p>
    <div class="dropzone" id="imgDrop">Glissez vos images ici ou <label class="btn small" style="margin-left:6px">Parcourir<input type="file" id="imgIn" accept="image/*" multiple hidden></label></div>
    <div class="grid4" style="margin-top:14px">
      <div class="field"><label>Format de sortie</label><select id="imgFmt"><option value="image/jpeg">JPEG (photos, léger)</option><option value="image/png">PNG (logos, transparence)</option><option value="image/webp">WebP (très léger)</option></select></div>
      <div class="field"><label>Largeur maximale (px)</label><input id="imgW" type="number" min="16" placeholder="Taille d'origine"></div>
      <div class="field"><label>Qualité : <b id="imgQv">80</b> %</label><input id="imgQ" type="range" min="30" max="100" value="80"></div>
      <div class="field"><label>Réglages rapides</label><select id="imgPreset"><option value="">Personnalisé</option><option value="mail">Pour un email (1600 px, 80 %)</option><option value="web">Pour un site (1200 px, WebP)</option><option value="max">Qualité maximale (JPEG 95 %)</option></select></div>
    </div>
    <div id="imgList"></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="imgZip" data-act="img-zip" hidden>Tout télécharger (ZIP)</button><button class="btn" id="imgClear" data-act="img-clear" hidden>Vider la liste</button></div>
  </div>
  <div class="card"><h2>Photos en PDF</h2>
    <p class="muted">Regroupez des photos de chantier ou des scans en un seul PDF, prêt à envoyer. Une image par page.</p>
    <div class="dropzone" id="pdfDrop">Glissez vos images ici ou <label class="btn small" style="margin-left:6px">Parcourir<input type="file" id="pdfIn" accept="image/*" multiple hidden></label></div>
    <div class="grid4" style="margin-top:14px">
      <div class="field"><label>Format des pages</label><select id="pdfMode"><option value="a4p">A4 portrait</option><option value="a4l">A4 paysage</option><option value="fit">Taille de l'image</option></select></div>
      <div class="field"><label>Marge (mm)</label><input id="pdfMargin" type="number" min="0" max="50" value="10"></div>
      <div class="field"><label>Qualité des images</label><select id="pdfQ"><option value="0.92">Haute</option><option value="0.8" selected>Standard</option><option value="0.6">Légère (fichier petit)</option></select></div>
      <div class="field"><label>Nom du fichier</label><input id="pdfName" value="photos"></div>
    </div>
    <div id="pdfList"></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="pdfGo" data-act="pdf-go" hidden>Créer le PDF</button><button class="btn" id="pdfClear" data-act="pdf-clear" hidden>Vider la liste</button><span id="pdfMsg" class="muted"></span></div>
  </div>
  <div class="card"><h2>Besoin de convertir d'autres fichiers ?</h2>
    <p class="muted" style="margin-bottom:0">Word, Excel ou PowerPoint vers PDF : ouvrez le fichier dans votre logiciel puis « Enregistrer sous » ou « Exporter en PDF ». Pour transformer un PDF en Word, le plus simple est d'utiliser Word (Fichier, Ouvrir) ou LibreOffice. Les devis et factures de ce site s'exportent déjà en PDF depuis le bouton « Imprimer / PDF ».</p></div>`;
}

async function convertImage(file, o) {
  const bmp = await createImageBitmap(file);
  let w = bmp.width, h = bmp.height;
  if (o.maxW && w > o.maxW) { h = Math.round(h * o.maxW / w); w = Math.round(o.maxW); }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (o.type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  const blob = await new Promise(r => cv.toBlob(r, o.type, o.quality));
  return { blob, w, h };
}
const extOf = t => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[t] || 'png');
const baseName = n => n.replace(/\.[^.]+$/, '');
function imgOpts() {
  const w = tv('imgW');
  return { type: document.getElementById('imgFmt').value, maxW: w > 0 ? w : 0, quality: tv('imgQ') / 100 };
}
async function imgProcess() {
  const o = imgOpts();
  for (const it of img.items) {
    try {
      const r = await convertImage(it.file, o);
      if (it.url) URL.revokeObjectURL(it.url);
      Object.assign(it, { blob: r.blob, w: r.w, h: r.h, url: URL.createObjectURL(r.blob), err: '' });
    } catch (e) { it.err = 'Format non pris en charge par ce navigateur'; }
  }
  imgRender();
}
function imgRender() {
  const list = document.getElementById('imgList'); if (!list) return;
  list.innerHTML = img.items.map((it, i) => it.err ? `<div class="frow"><b>${esc(it.file.name)}</b><span style="color:var(--danger)">${esc(it.err)}</span></div>` : it.blob ? `<div class="frow">
    <img class="fthumb" src="${it.url}" alt=""><div class="grow"><b>${esc(baseName(it.file.name))}.${extOf(it.blob.type)}</b>
    <div class="muted" style="font-size:.82rem">${it.w} × ${it.h} px · ${fmtSize(it.file.size)} → <b>${fmtSize(it.blob.size)}</b> ${it.blob.size < it.file.size ? `(−${Math.round((1 - it.blob.size / it.file.size) * 100)} %)` : '(plus lourd : essayez JPEG/WebP ou une largeur réduite)'}</div></div>
    <a class="btn small" href="${it.url}" download="${esc(baseName(it.file.name))}.${extOf(it.blob.type)}">Télécharger</a>
    <button class="btn small icon danger" data-act="img-del" data-i="${i}" title="Retirer">✕</button></div>` : `<div class="frow"><b>${esc(it.file.name)}</b><span class="muted">Conversion…</span></div>`).join('');
  document.getElementById('imgZip').hidden = document.getElementById('imgClear').hidden = !img.items.length;
}

/* ZIP (sans compression) */
const CRC32 = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }; })();
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  files.forEach(f => {
    const name = enc.encode(f.name), crc = CRC32(f.data), size = f.data.length;
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), 0, 0]);
    parts.push(lh, name, f.data);
    cd.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), name);
    off += lh.length + name.length + size;
  });
  const cdSize = cd.reduce((s, b) => s + b.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), 0, 0]);
  return new Blob([...parts, ...cd, end], { type: 'application/zip' });
}
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* Photos -> PDF (JPEG intégrés tels quels, PDF 1.4 écrit à la main) */
async function prepareJpeg(file, quality, maxSide = 2200) {
  const bmp = await createImageBitmap(file), s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}
function buildPdf(imgs, o) {
  const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  const obj = (id, fn) => { offs[id] = len; push(`${id} 0 obj\n`); fn(); push('endobj\n'); };
  const n = imgs.length;
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>\n'));
  obj(2, () => push(`<< /Type /Pages /Kids [${imgs.map((_, i) => (3 + i * 3) + ' 0 R').join(' ')}] /Count ${n} >>\n`));
  imgs.forEach((im, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    let pw = 595.28, ph = 841.89;
    if (o.mode === 'a4l') [pw, ph] = [ph, pw];
    if (o.mode === 'fit') { pw = im.w * 0.75; ph = im.h * 0.75; }
    const m = Math.min(o.margin, 50) * 72 / 25.4, s = Math.min((pw - 2 * m) / im.w, (ph - 2 * m) / im.h), dw = im.w * s, dh = im.h * s;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>\n`));
    const c = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${((pw - dw) / 2).toFixed(2)} ${((ph - dh) / 2).toFixed(2)} cm /Im0 Do Q`;
    obj(cid, () => push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream\n`));
    obj(iid, () => { push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push('\nendstream\n'); });
  });
  const xref = len, total = 3 + n * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
function pdfRender() {
  const list = document.getElementById('pdfList'); if (!list) return;
  list.innerHTML = pdf.items.map((f, i) => `<div class="frow"><span class="muted" style="width:24px">${i + 1}.</span><div class="grow"><b>${esc(f.file.name)}</b> <span class="muted" style="font-size:.82rem">${fmtSize(f.file.size)}</span></div>
    <button class="btn small icon" data-act="pdf-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button><button class="btn small icon" data-act="pdf-down" data-i="${i}" ${i === pdf.items.length - 1 ? 'disabled' : ''} title="Descendre">↓</button>
    <button class="btn small icon danger" data-act="pdf-del" data-i="${i}" title="Retirer">✕</button></div>`).join('');
  document.getElementById('pdfGo').hidden = document.getElementById('pdfClear').hidden = !pdf.items.length;
}

/* ================= CALCULS & UTILITAIRES ================= */
function calcHtml() {
  const today0 = today();
  const row = (id, label, extra = '') => `<div class="field"><label>${label}</label><input id="${id}" type="number" step="any" ${extra}></div>`;
  return `<div class="tool-grid">
  <div class="card"><h2>TVA : HT et TTC</h2>
    <div class="grid3">${row('tvaAmt', 'Montant (€)', 'value="100"')}
      <div class="field"><label>Je pars du prix</label><select id="tvaDir"><option value="ht">HT (calculer le TTC)</option><option value="ttc">TTC (calculer le HT)</option></select></div>
      <div class="field"><label>Taux de TVA</label><select id="tvaRate"><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="2.1">2,1 %</option><option value="0">0 %</option></select></div></div>
    <div class="cp-sum" id="tvaOut"></div></div>

  <div class="card"><h2>Marge, coefficient et prix de vente</h2>
    <div class="grid3">${row('mgBuy', "Prix d'achat HT (€)", 'value="100"')}
      <div class="field"><label>Je connais</label><select id="mgKnown"><option value="coef">Le coefficient</option><option value="markup">La majoration (%)</option><option value="rate">Le taux de marque (%)</option><option value="sell">Le prix de vente</option></select></div>
      ${row('mgVal', 'Valeur', 'value="1.3"')}</div>
    <div class="cp-sum" id="mgOut"></div>
    <p class="muted" style="font-size:.8rem;margin:8px 0 0">Majoration = bénéfice ÷ achat. Taux de marque = bénéfice ÷ prix de vente. Ils ne sont pas identiques : 30 % de majoration = 23 % de taux de marque.</p></div>

  <div class="card"><h2>Surfaces, volumes et quantités</h2>
    <div class="grid3">${row('sfL', 'Longueur (m)', 'value="5"')}${row('sfW', 'Largeur (m)', 'value="4"')}${row('sfH', 'Hauteur sous plafond (m)', 'value="2.5"')}</div>
    <div class="grid3">${row('sfD', 'Portes (nombre)', 'value="1" min="0"')}${row('sfWin', 'Fenêtres (nombre)', 'value="2" min="0"')}${row('sfWaste', 'Pertes (%)', 'value="10"')}</div>
    <div class="grid3">${row('sfDa', "Surface d'une porte (m²)", 'value="1.84"')}${row('sfWa', "Surface d'une fenêtre (m²)", 'value="1.4"')}${row('sfYield', 'Rendement peinture (m²/L)', 'value="10"')}</div>
    <div class="cp-sum" id="sfOut"></div></div>

  <div class="card"><h2>Convertisseur d'unités</h2>
    <div class="grid3"><div class="field"><label>Grandeur</label><select id="unCat"><option value="length">Longueur</option><option value="area">Surface</option><option value="volume">Volume</option><option value="mass">Poids</option></select></div>
      ${row('unVal', 'Valeur', 'value="1"')}<div class="field"><label>Unité</label><select id="unFrom"></select></div></div>
    <div class="cp-sum" id="unOut"></div></div>

  <div class="card"><h2>Date d'échéance de paiement</h2>
    <div class="grid3"><div class="field"><label>Date de la facture</label><input id="ecStart" type="date" value="${today0}"></div>${row('ecDays', 'Délai (jours)', 'value="30" min="0"')}
      <div class="field"><label>Mode de calcul</label><select id="ecMode"><option value="net">Jours calendaires</option><option value="eom">Fin de mois (après les jours)</option></select></div></div>
    <div class="cp-sum" id="ecOut"></div></div>

  <div class="card"><h2>Remise ou majoration</h2>
    <div class="grid3">${row('rmPrice', 'Prix (€)', 'value="1000"')}${row('rmPct', 'Pourcentage (%)', 'value="10"')}
      <div class="field"><label>Opération</label><select id="rmMode"><option value="-">Remise (−)</option><option value="+">Majoration (+)</option></select></div></div>
    <div class="cp-sum" id="rmOut"></div></div>

  <div class="card"><h2>Mot de passe sécurisé</h2>
    <div class="grid2"><div class="field"><label>Longueur : <b id="pwLv">16</b> caractères</label><input id="pwLen" type="range" min="8" max="40" value="16"></div>
      <div class="field"><label>Caractères</label><div class="row"><label class="check" style="margin:0"><input type="checkbox" id="pwUp" checked> A-Z</label><label class="check" style="margin:0"><input type="checkbox" id="pwDg" checked> 0-9</label><label class="check" style="margin:0"><input type="checkbox" id="pwSy" checked> #$%</label></div></div></div>
    <div class="row" style="flex-wrap:nowrap"><input id="pwOut" readonly class="grow" style="font-family:ui-monospace,monospace"><button class="btn" data-act="pw-new">Générer</button><button class="btn primary" data-act="pw-copy">Copier</button></div>
    <p class="muted" style="font-size:.8rem;margin:8px 0 0">Généré dans votre navigateur, jamais enregistré. Utilisez un mot de passe différent pour chaque site.</p></div>
  </div>`;
}
const UNITS_TBL = {
  length: { m: 1, mm: 0.001, cm: 0.01, km: 1000, pouce: 0.0254, pied: 0.3048 },
  area: { 'm²': 1, 'cm²': 1e-4, 'ha': 1e4, 'pied²': 0.09290304, 'pouce²': 6.4516e-4 },
  volume: { 'm³': 1, 'L': 0.001, 'mL': 1e-6, 'gallon US': 0.003785411784 },
  mass: { kg: 1, g: 0.001, t: 1000, livre: 0.45359237 }
};
function calcAll() {
  const $$ = id => document.getElementById(id); if (!$$('tvaOut')) return;
  // TVA
  { const a = tv('tvaAmt'), r = tv('tvaRate'), ttc = $$('tvaDir').value === 'ht' ? a * (1 + r / 100) : a, ht = $$('tvaDir').value === 'ht' ? a : a / (1 + r / 100);
    $$('tvaOut').innerHTML = `Prix HT : <b>${fnum(ht)} €</b> · TVA (${String(r).replace('.', ',')} %) : <b>${fnum(ttc - ht)} €</b> · Prix TTC : <b>${fnum(ttc)} €</b>`; }
  // Marge
  { const B = tv('mgBuy'), k = $$('mgKnown').value, v = tv('mgVal'); let S = 0;
    if (k === 'coef') S = B * v; else if (k === 'markup') S = B * (1 + v / 100); else if (k === 'rate') S = v < 100 ? B / (1 - v / 100) : NaN; else S = v;
    $$('mgOut').innerHTML = B > 0 && S > 0 ? `Prix de vente HT : <b>${fnum(S)} €</b> · Bénéfice : <b>${fnum(S - B)} €</b><br>Coefficient : <b>${fnum(S / B, 3)}</b> · Majoration : <b>${fnum((S / B - 1) * 100)} %</b> · Taux de marque : <b>${fnum((S - B) / S * 100)} %</b>` : 'Saisissez un prix d\'achat et une valeur.'; }
  // Surfaces
  { const L = tv('sfL'), W = tv('sfW'), H = tv('sfH'), nd = tv('sfD'), nw = tv('sfWin'), waste = tv('sfWaste'), y = tv('sfYield') || 10;
    const floor = L * W, per = 2 * (L + W), gross = per * H, open = nd * tv('sfDa') + nw * tv('sfWa'), net = Math.max(0, gross - open);
    $$('sfOut').innerHTML = `Sol / plafond : <b>${fnum(floor)} m²</b> · Périmètre : <b>${fnum(per)} ml</b> · Volume : <b>${fnum(floor * H)} m³</b><br>Murs : <b>${fnum(gross)} m²</b> bruts, <b>${fnum(net)} m²</b> nets (ouvertures déduites)<br>
      Revêtement de sol à prévoir (pertes ${fnum(waste, 0)} %) : <b>${fnum(floor * (1 + waste / 100))} m²</b> · Plinthes : <b>${fnum(Math.max(0, per - nd * 0.9 * 1))} ml</b><br>Peinture 2 couches : murs <b>${fnum(net * 2 / y)} L</b>, plafond <b>${fnum(floor * 2 / y)} L</b>`; }
  // Unités
  { const cat = $$('unCat').value, tbl = UNITS_TBL[cat], sel = $$('unFrom');
    if (sel.dataset.cat !== cat) { sel.innerHTML = Object.keys(tbl).map(u => `<option>${u}</option>`).join(''); sel.dataset.cat = cat; }
    const base = tv('unVal') * tbl[sel.value];
    $$('unOut').innerHTML = Object.entries(tbl).filter(([u]) => u !== sel.value).map(([u, f]) => `<b>${fnum(base / f, 4).replace(/,?0+$/, '')} ${u}</b>`).join(' · '); }
  // Échéance
  { const s = $$('ecStart').value; if (s) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + tv('ecDays')); if ($$('ecMode').value === 'eom') { d.setMonth(d.getMonth() + 1, 0); }
    $$('ecOut').innerHTML = `Échéance : <b>${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b>`; } }
  // Remise
  { const p = tv('rmPrice'), pc = tv('rmPct'), sign = $$('rmMode').value === '-' ? -1 : 1, np = p * (1 + sign * pc / 100);
    $$('rmOut').innerHTML = `Nouveau prix : <b>${fnum(np)} €</b> (${sign < 0 ? '−' : '+'} ${fnum(Math.abs(np - p))} €)`; }
}
function pwGen() {
  const $$ = id => document.getElementById(id), n = tv('pwLen');
  let set = 'abcdefghijkmnopqrstuvwxyz'; if ($$('pwUp').checked) set += 'ABCDEFGHJKLMNPQRSTUVWXYZ'; if ($$('pwDg').checked) set += '23456789'; if ($$('pwSy').checked) set += '#$%&*+-=?@!';
  const out = []; const buf = new Uint32Array(n * 2); crypto.getRandomValues(buf);
  const lim = Math.floor(4294967296 / set.length) * set.length; let j = 0;
  while (out.length < n) { if (j >= buf.length) { crypto.getRandomValues(buf); j = 0; } if (buf[j] < lim) out.push(set[buf[j] % set.length]); j++; }
  $$('pwOut').value = out.join(''); $$('pwLv').textContent = n;
}

/* ================= MESSAGES TYPES ================= */
const MSG = {
  devis: ['Envoi d\'un devis', 'Votre devis n° {numero}', 'Bonjour {client},\n\nSuite à notre échange, veuillez trouver ci-joint le devis n° {numero} d\'un montant de {montant} TTC{chantier_de}.\n\nIl est valable jusqu\'au {echeance}. Pour l\'accepter, il suffit de me le retourner daté et signé, avec la mention « Bon pour accord ».\n\nJe reste à votre disposition pour toute question ou ajustement.\n\nCordialement,\n{signataire}'],
  relanceDevis: ['Relance de devis', 'Votre devis n° {numero}', 'Bonjour {client},\n\nJe me permets de revenir vers vous au sujet du devis n° {numero} ({montant} TTC){chantier_de}, que je vous ai transmis récemment.\n\nAvez-vous pu en prendre connaissance ? Je peux l\'adapter si besoin, et vous rappelle qu\'il est valable jusqu\'au {echeance}.\n\nBien cordialement,\n{signataire}'],
  acompte: ['Demande d\'acompte', 'Acompte — devis n° {numero}', 'Bonjour {client},\n\nMerci d\'avoir accepté le devis n° {numero}{chantier_de}. Afin de lancer la commande des fournitures et de planifier le chantier, je vous remercie de bien vouloir régler l\'acompte prévu au devis ({montant}) avant le {echeance}.\n\nMes coordonnées bancaires figurent sur le devis.\n\nCordialement,\n{signataire}'],
  facture: ['Envoi d\'une facture', 'Facture n° {numero}', 'Bonjour {client},\n\nVeuillez trouver ci-joint la facture n° {numero} d\'un montant de {montant} TTC{chantier_de}.\n\nElle est à régler avant le {echeance}, par virement (coordonnées bancaires en bas de facture).\n\nJe vous remercie pour votre confiance.\n\nCordialement,\n{signataire}'],
  relance1: ['Relance amiable (facture échue)', 'Facture n° {numero} — rappel', 'Bonjour {client},\n\nSauf erreur de ma part, la facture n° {numero} d\'un montant de {montant} TTC, arrivée à échéance le {echeance}, n\'a pas encore été réglée.\n\nS\'il s\'agit d\'un oubli, je vous remercie de bien vouloir procéder au règlement dans les meilleurs délais. Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nBien cordialement,\n{signataire}'],
  relance2: ['Relance ferme (2e rappel)', 'Facture n° {numero} — second rappel', 'Bonjour {client},\n\nMalgré mon précédent message, la facture n° {numero} d\'un montant de {montant} TTC, échue le {echeance}, reste impayée.\n\nJe vous demande de bien vouloir la régler sous 8 jours. Pour rappel, des pénalités de retard ainsi qu\'une indemnité forfaitaire de 40 € pour frais de recouvrement (clients professionnels) sont dues de plein droit en cas de retard de paiement (article L441-10 du Code de commerce).\n\nSans règlement dans ce délai, je serai contraint d\'engager les démarches de recouvrement. Je reste joignable pour trouver une solution si vous rencontrez une difficulté.\n\nCordialement,\n{signataire}'],
  avis: ['Fin de chantier et demande d\'avis', 'Merci pour votre confiance', 'Bonjour {client},\n\nLes travaux{chantier_de} sont désormais terminés. Je vous remercie de votre confiance et j\'espère que le résultat vous satisfait.\n\nSi vous le souhaitez, un avis sur ma prestation m\'aiderait beaucoup. N\'hésitez pas non plus à me contacter pour toute question ou retouche.\n\nBien cordialement,\n{signataire}']
};
const msgSt = { tpl: 'devis' };
function msgHtml() {
  const docs = [...db.quotes].sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));
  return `<div class="card"><h2>Messages types prêts à envoyer</h2>
    <p class="muted">Choisissez un modèle, sélectionnez un devis ou une facture pour remplir automatiquement les informations, puis copiez le message ou ouvrez-le dans votre messagerie. Ce sont des modèles à adapter.</p>
    <div class="grid2"><div class="field"><label>Modèle</label><select id="msgTpl">${Object.entries(MSG).map(([k, v]) => `<option value="${k}" ${msgSt.tpl === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
      <div class="field"><label>Remplir depuis un document</label><select id="msgDoc"><option value="">— Saisie manuelle —</option>${docs.map(q => `<option value="${q.id}">${esc(isInv(q) ? 'Facture' : 'Devis')} ${esc(q.number)} — ${esc((getClient(q.clientId) || {}).name || 'sans client')} — ${money(totals(q).ttc)}</option>`).join('')}</select></div></div>
    <div class="grid3"><div class="field"><label>Client</label><input id="msgClient"></div><div class="field"><label>Email du client</label><input id="msgTo" type="email"></div><div class="field"><label>N° du document</label><input id="msgNum"></div>
      <div class="field"><label>Montant TTC</label><input id="msgAmt"></div><div class="field"><label>Date (validité ou échéance)</label><input id="msgDate"></div><div class="field"><label>Chantier / objet (facultatif)</label><input id="msgSite"></div></div>
    <div class="field"><label>Signature</label><input id="msgSign" value="${esc(db.company.name || '')}"></div>
    <div class="field"><label>Objet</label><input id="msgSubj"></div>
    <div class="field"><label>Message</label><textarea id="msgBody" rows="12"></textarea></div>
    <div class="row"><button class="btn primary" data-act="msg-copy">Copier le message</button><button class="btn" data-act="msg-mail">Ouvrir dans ma messagerie</button></div></div>`;
}
function msgFill() {
  const $$ = id => document.getElementById(id), t = MSG[$$('msgTpl').value];
  const v = k => ($$(k).value || '').trim(), site = v('msgSite');
  const sub = s => s.replace(/\{chantier_de\}/g, site ? ` (${site})` : '').replace(/\{client\}/g, v('msgClient') || '[client]').replace(/\{numero\}/g, v('msgNum') || '[n°]').replace(/\{montant\}/g, v('msgAmt') || '[montant]').replace(/\{echeance\}/g, v('msgDate') || '[date]').replace(/\{signataire\}/g, v('msgSign') || '[votre nom]');
  $$('msgSubj').value = sub(t[1]); $$('msgBody').value = sub(t[2]);
}

/* ================= ASTUCES ================= */
const TIPS = [
  ['Devis et factures', 'Détaillez chaque ligne', 'Un devis détaillé (quantité, unité, prix unitaire) rassure le client et évite les discussions : il voit ce qu\'il paie. Évitez le forfait global flou.'],
  ['Devis et factures', 'Indiquez une durée de validité', 'Le prix des matériaux évolue. Une durée de validité (15 à 30 jours par exemple) vous protège et incite le client à décider.'],
  ['Devis et factures', 'Faites signer « Bon pour accord »', 'Le devis daté et signé est votre preuve d\'acceptation. Gardez-le avec le dossier du chantier.'],
  ['Devis et factures', 'Les mentions à ne pas oublier', 'En général : identité et coordonnées de l\'entreprise, SIRET, date, description des prestations, prix, TVA (ou mention d\'exonération), conditions de paiement, pénalités de retard et, entre professionnels, indemnité forfaitaire de 40 €. Elles dépendent de votre statut : vérifiez auprès de votre comptable.'],
  ['Devis et factures', 'Une numérotation continue', 'Numérotez vos factures dans l\'ordre, sans trou ni doublon. Le site le fait pour vous (réglages dans « Mon entreprise »).'],
  ['Devis et factures', 'Facturez dès la fin du chantier', 'Plus la facture part tôt, plus elle est payée tôt. Prévoyez un acompte à la commande pour financer les fournitures.'],
  ['Prix et marge', 'Marge et taux de marque, ce n\'est pas pareil', 'Un coefficient de 1,3 donne 30 % de majoration mais seulement 23 % de taux de marque. Utilisez le calculateur de marge de cette boîte à outils.'],
  ['Prix et marge', 'Prévoyez les pertes', 'Sur carrelage, parquet ou plinthes, comptez souvent 5 à 10 % de pertes (coupes, casse). Le calculateur de surfaces les intègre.'],
  ['Prix et marge', 'Comptez tout dans vos prix', 'Déplacements, temps passé au téléphone et en devis, petites fournitures : s\'ils ne sont pas dans vos prix, ils sont à votre charge.'],
  ['Photos et fichiers', 'Photographiez avant, pendant, après', 'Des photos datées protègent en cas de litige et valorisent votre travail. Classez-les dans un dossier par chantier.'],
  ['Photos et fichiers', 'Allégez les photos avant d\'envoyer', 'Pour un email, une largeur de 1600 px et une qualité de 80 % suffisent largement et divisent souvent le poids par 5 à 10. Voir « Convertir et compresser des images ».'],
  ['Photos et fichiers', 'JPEG, PNG ou WebP ?', 'JPEG pour les photos, PNG pour les logos et captures d\'écran (il garde la transparence), WebP pour le web (plus léger).'],
  ['Photos et fichiers', 'Envoyez des PDF', 'Un devis ou une facture en PDF ne peut pas être modifié par erreur et s\'ouvre partout. Nommez-le clairement : 2026-10_Dupont_Devis-001.pdf.'],
  ['Organisation', 'Un dossier par chantier', 'Devis signé, photos, factures, échanges : tout au même endroit. Vous retrouvez une information en dix secondes.'],
  ['Organisation', 'Sauvegardez régulièrement', 'Exportez une sauvegarde depuis la page Devis et gardez une copie hors de votre ordinateur (clé USB, cloud).'],
  ['Relation client', 'Relancez sans attendre', 'Une relance courtoise le lendemain de l\'échéance règle la majorité des retards. Des modèles sont prêts dans « Messages types ».'],
  ['Relation client', 'Confirmez les changements par écrit', 'Un supplément ou une modification de chantier ? Un petit email ou un avenant évite les mauvaises surprises à la facturation.'],
  ['Relation client', 'Demandez un avis', 'À la fin du chantier, un client satisfait laisse volontiers un avis. C\'est votre meilleure publicité.'],
  ['Sécurité', 'Un mot de passe différent par site', 'Si un site est piraté, les autres restent protégés. Utilisez le générateur de mots de passe et un gestionnaire de mots de passe.'],
  ['Sécurité', 'Méfiez-vous des faux emails', 'Faux paiement, fausse facture, changement d\'IBAN : vérifiez l\'expéditeur et appelez le numéro que vous connaissez avant de cliquer ou de payer.']
];
function tipsHtml() {
  const cats = [...new Set(TIPS.map(t => t[0]))];
  const list = TIPS.filter(t => (!toolsUI.tipCat || t[0] === toolsUI.tipCat) && fuzzy(t.join(' '), toolsUI.tipQ));
  return `<div class="card"><div class="chips"><button class="cchip ${!toolsUI.tipCat ? 'on' : ''}" data-act="tip-cat" data-cat="">Tout <i>${TIPS.length}</i></button>${cats.map(c => `<button class="cchip ${toolsUI.tipCat === c ? 'on' : ''}" data-act="tip-cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <input id="tipQ" placeholder="Rechercher une astuce…" value="${esc(toolsUI.tipQ)}" style="max-width:360px;margin:14px 0"></div>
    <div class="tips">${list.map(t => `<div class="card tip"><span class="muted" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.06em">${esc(t[0])}</span><h3 style="margin:6px 0">${esc(t[1])}</h3><p class="muted" style="margin:0">${esc(t[2])}</p></div>`).join('') || '<div class="empty">Aucune astuce trouvée.</div>'}</div>
    <p class="muted" style="font-size:.8rem">Informations générales données à titre indicatif : elles ne remplacent pas l'avis d'un comptable ou d'un juriste.</p>`;
}

/* ================= ÉVÉNEMENTS ================= */
const T = () => document.getElementById('toolsBody');
function addImages(files, store, after) {
  [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)).forEach(f => store.push({ file: f }));
  after();
}
Object.assign(actions, {
  'tools-tab'(t) { toolsUI.tab = t.dataset.tab; render(); },
  'img-del'(t) { const it = img.items.splice(+t.dataset.i, 1)[0]; if (it && it.url) URL.revokeObjectURL(it.url); imgRender(); },
  'img-clear'() { img.items.forEach(i => i.url && URL.revokeObjectURL(i.url)); img.items = []; imgRender(); },
  async 'img-zip'() {
    const files = [], used = new Set();
    for (const it of img.items.filter(i => i.blob)) { let n = `${baseName(it.file.name)}.${extOf(it.blob.type)}`, k = 1; while (used.has(n)) n = `${baseName(it.file.name)}-${++k}.${extOf(it.blob.type)}`; used.add(n); files.push({ name: n, data: new Uint8Array(await it.blob.arrayBuffer()) }); }
    saveBlob(makeZip(files), 'images.zip');
  },
  'pdf-del'(t) { pdf.items.splice(+t.dataset.i, 1); pdfRender(); },
  'pdf-up'(t) { const i = +t.dataset.i; [pdf.items[i - 1], pdf.items[i]] = [pdf.items[i], pdf.items[i - 1]]; pdfRender(); },
  'pdf-down'(t) { const i = +t.dataset.i; [pdf.items[i + 1], pdf.items[i]] = [pdf.items[i], pdf.items[i + 1]]; pdfRender(); },
  'pdf-clear'() { pdf.items = []; pdfRender(); },
  async 'pdf-go'(t) {
    const msg = document.getElementById('pdfMsg'); t.disabled = true; msg.textContent = 'Création du PDF…';
    try {
      const q = Number(document.getElementById('pdfQ').value), imgs = [];
      for (const it of pdf.items) imgs.push(await prepareJpeg(it.file, q));
      const blob = buildPdf(imgs, { mode: document.getElementById('pdfMode').value, margin: tv('pdfMargin') });
      saveBlob(blob, (document.getElementById('pdfName').value.trim() || 'photos').replace(/[\\/:*?"<>|]/g, '_') + '.pdf');
      msg.textContent = `PDF créé (${imgs.length} page${imgs.length > 1 ? 's' : ''}, ${fmtSize(blob.size)}).`;
    } catch (e) { msg.textContent = 'Impossible de lire une des images.'; }
    t.disabled = false;
  },
  'pw-new': pwGen,
  'pw-copy'() { const v = document.getElementById('pwOut').value; navigator.clipboard && navigator.clipboard.writeText(v).then(() => toast('Mot de passe copié')); },
  'tip-cat'(t) { toolsUI.tipCat = t.dataset.cat; T().innerHTML = tipsHtml(); },
  'msg-copy'() { const b = document.getElementById('msgBody').value; navigator.clipboard && navigator.clipboard.writeText(b).then(() => toast('Message copié')); },
  'msg-mail'() {
    const to = document.getElementById('msgTo').value.trim(), s = document.getElementById('msgSubj').value, b = document.getElementById('msgBody').value;
    location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
  }
});
document.addEventListener('input', e => {
  const t = e.target; if (!t.closest || !t.closest('#toolsBody')) return;
  if (toolsUI.tab === 'calc') { if (t.id === 'pwLen') pwGen(); calcAll(); }
  if (toolsUI.tab === 'msg' && t.id !== 'msgDoc' && t.id !== 'msgTpl') { if (t.id !== 'msgBody' && t.id !== 'msgSubj') msgFill(); }
  if (toolsUI.tab === 'tips' && t.id === 'tipQ') { toolsUI.tipQ = t.value; const pos = t.selectionStart; T().innerHTML = tipsHtml(); const q = document.getElementById('tipQ'); q.focus(); q.setSelectionRange(pos, pos); }
  if (t.id === 'imgQ') { document.getElementById('imgQv').textContent = t.value; document.getElementById('imgPreset').value = ''; if (img.items.length) imgProcess(); }
  if (t.id === 'imgW') { document.getElementById('imgPreset').value = ''; if (img.items.length) imgProcess(); }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.closest || !t.closest('#toolsBody')) return;
  if (toolsUI.tab === 'calc') calcAll();
  if (t.id === 'imgFmt' && img.items.length) imgProcess();
  if (t.id === 'imgPreset' && t.value) {
    const P = { mail: ['image/jpeg', 1600, 80], web: ['image/webp', 1200, 80], max: ['image/jpeg', '', 95] }[t.value];
    document.getElementById('imgFmt').value = P[0]; document.getElementById('imgW').value = P[1]; document.getElementById('imgQ').value = P[2]; document.getElementById('imgQv').textContent = P[2];
    if (img.items.length) imgProcess();
  }
  if (t.id === 'imgIn') { addImages(t.files, img.items, imgProcess); t.value = ''; }
  if (t.id === 'pdfIn') { addImages(t.files, pdf.items, pdfRender); t.value = ''; }
  if (t.id === 'msgTpl') { msgSt.tpl = t.value; msgFill(); }
  if (t.id === 'msgDoc') {
    const q = getQuote(t.value); if (!q) return;
    const c = getClient(q.clientId), tt = totals(q);
    const set = (id, v) => { document.getElementById(id).value = v || ''; };
    set('msgClient', c ? c.name : (q.clientText || '').split('\n')[0]); set('msgTo', c ? c.email : ''); set('msgNum', q.number);
    set('msgAmt', money(isInv(q) ? tt.due : tt.ttc)); set('msgDate', fdate(isInv(q) ? q.dueDate : q.validUntil)); set('msgSite', (q.title || '').replace(/\s+/g, ' ').toLowerCase());
    const guess = isInv(q) ? (q.status === 'envoye' ? 'relance1' : 'facture') : 'devis';
    msgSt.tpl = guess; document.getElementById('msgTpl').value = guess; msgFill();
  }
});
['dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  const z = e.target.closest && e.target.closest('.dropzone'); if (!z) return;
  e.preventDefault(); z.classList.toggle('over', ev === 'dragover');
  if (ev === 'drop') { if (z.id === 'imgDrop') addImages(e.dataTransfer.files, img.items, imgProcess); else addImages(e.dataTransfer.files, pdf.items, pdfRender); }
}));
window.__tools = { convertImage, makeZip, buildPdf, prepareJpeg };
