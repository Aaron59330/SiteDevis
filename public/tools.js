'use strict';
/* Boîte à outils : conversion d'images, photos en PDF, calculs métier, messages types, astuces.
   Tout fonctionne dans le navigateur : les fichiers ne quittent jamais l'ordinateur de l'utilisateur. */

const toolsUI = { tab: 'guide', tipCat: '', tipQ: '' };
const TOOL_TABS = [['guide', 'Bien faire un devis'], ['files', 'Fichiers & images'], ['calc', 'Petits calculs'], ['tips', 'Astuces']];
const fmtSize = n => (n >= 1048576 ? (n / 1048576).toFixed(2).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko');
const fnum = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const tv = id => num((document.getElementById(id) || {}).value);

EXTRA.tools = function renderTools() {
  return `<h1>Boîte à outils</h1>
  <p class="muted" style="margin-top:0">Des outils simples pour bien faire vos devis et gagner du temps. Vos fichiers restent sur votre ordinateur : ils ne sont jamais envoyés sur Internet.</p>
  <div class="tabs">${TOOL_TABS.map(([k, l]) => `<button data-act="tools-tab" data-tab="${k}" class="${toolsUI.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="toolsBody">${toolsBody()}</div>`;
};
AFTER.tools = () => { if (toolsUI.tab === 'calc') calcAll(); if (toolsUI.tab === 'guide') { simAll(); guideCheck(); } if (toolsUI.tab === 'files') { imgRender(); pdfRender(); } };
const toolsBody = () => ({ guide: guideHtml, files: filesHtml, calc: calcHtml, tips: tipsHtml }[toolsUI.tab])();

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
  const row = (id, label, extra = '') => `<div class="field"><label>${label}</label><input id="${id}" type="number" step="any" ${extra}></div>`;
  return `<div class="tool-grid">
  <div class="card"><h2>TVA : passer du HT au TTC</h2>
    <p class="muted" style="margin-top:0">Pour savoir combien facturer, ou retrouver le prix HT d'un ticket de caisse.</p>
    <div class="grid3">${row('tvaAmt', 'Montant (€)', 'value="100"')}
      <div class="field"><label>Je pars du prix</label><select id="tvaDir"><option value="ht">HT (calculer le TTC)</option><option value="ttc">TTC (calculer le HT)</option></select></div>
      <div class="field"><label>Taux de TVA</label><select id="tvaRate"><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="2.1">2,1 %</option><option value="0">0 %</option></select></div></div>
    <div class="cp-sum" id="tvaOut"></div></div>

  <div class="card"><h2>Marge et coefficient</h2>
    <p class="muted" style="margin-top:0">Vous achetez 100 € et vous voulez gagner 30 % : à quel prix vendre ?</p>
    <div class="grid3">${row('mgBuy', "Prix d'achat HT (€)", 'value="100"')}
      <div class="field"><label>Je connais</label><select id="mgKnown"><option value="coef">Le coefficient</option><option value="markup">La majoration (%)</option><option value="rate">Le taux de marque (%)</option><option value="sell">Le prix de vente</option></select></div>
      ${row('mgVal', 'Valeur', 'value="1.3"')}</div>
    <div class="cp-sum" id="mgOut"></div>
    <p class="muted" style="font-size:.8rem;margin:8px 0 0">Majoration = bénéfice ÷ achat. Taux de marque = bénéfice ÷ prix de vente. Ils ne sont pas identiques : 30 % de majoration = 23 % de taux de marque.</p></div>

  <div class="card"><h2>Surfaces et quantités d'une pièce</h2>
    <p class="muted" style="margin-top:0">Le métré de base pour chiffrer peinture, sol et plinthes.</p>
    <div class="grid3">${row('sfL', 'Longueur (m)', 'value="5"')}${row('sfW', 'Largeur (m)', 'value="4"')}${row('sfH', 'Hauteur sous plafond (m)', 'value="2.5"')}</div>
    <div class="grid3">${row('sfD', 'Portes (nombre)', 'value="1" min="0"')}${row('sfWin', 'Fenêtres (nombre)', 'value="2" min="0"')}${row('sfWaste', 'Pertes (%)', 'value="10"')}</div>
    <div class="grid3">${row('sfDa', "Surface d'une porte (m²)", 'value="1.84"')}${row('sfWa', "Surface d'une fenêtre (m²)", 'value="1.4"')}${row('sfYield', 'Rendement peinture (m²/L)', 'value="10"')}</div>
    <div class="cp-sum" id="sfOut"></div></div>
  </div>`;
}
function calcAll() {
  const $$ = id => document.getElementById(id); if (!$$('tvaOut')) return;
  { const a = tv('tvaAmt'), r = tv('tvaRate'), ttc = $$('tvaDir').value === 'ht' ? a * (1 + r / 100) : a, ht = $$('tvaDir').value === 'ht' ? a : a / (1 + r / 100);
    $$('tvaOut').innerHTML = `Prix HT : <b>${fnum(ht)} €</b> · TVA (${String(r).replace('.', ',')} %) : <b>${fnum(ttc - ht)} €</b> · Prix TTC : <b>${fnum(ttc)} €</b>`; }
  { const B = tv('mgBuy'), k = $$('mgKnown').value, v = tv('mgVal'); let S = 0;
    if (k === 'coef') S = B * v; else if (k === 'markup') S = B * (1 + v / 100); else if (k === 'rate') S = v < 100 ? B / (1 - v / 100) : NaN; else S = v;
    $$('mgOut').innerHTML = B > 0 && S > 0 ? `Prix de vente HT : <b>${fnum(S)} €</b> · Bénéfice : <b>${fnum(S - B)} €</b><br>Coefficient : <b>${fnum(S / B, 3)}</b> · Majoration : <b>${fnum((S / B - 1) * 100)} %</b> · Taux de marque : <b>${fnum((S - B) / S * 100)} %</b>` : 'Saisissez un prix d\'achat et une valeur.'; }
  { const L = tv('sfL'), W = tv('sfW'), H = tv('sfH'), nd = tv('sfD'), nw = tv('sfWin'), waste = tv('sfWaste'), y = tv('sfYield') || 10;
    const floor = L * W, per = 2 * (L + W), gross = per * H, open = nd * tv('sfDa') + nw * tv('sfWa'), net = Math.max(0, gross - open);
    $$('sfOut').innerHTML = `Sol / plafond : <b>${fnum(floor)} m²</b> · Périmètre : <b>${fnum(per)} ml</b> · Volume : <b>${fnum(floor * H)} m³</b><br>Murs : <b>${fnum(gross)} m²</b> bruts, <b>${fnum(net)} m²</b> nets (ouvertures déduites)<br>
      Revêtement de sol à prévoir (pertes ${fnum(waste, 0)} %) : <b>${fnum(floor * (1 + waste / 100))} m²</b> · Plinthes : <b>${fnum(Math.max(0, per - nd * 0.9))} ml</b><br>Peinture 2 couches : murs <b>${fnum(net * 2 / y)} L</b>, plafond <b>${fnum(floor * 2 / y)} L</b>`; }
}

/* ================= BIEN FAIRE UN DEVIS ================= */
const gSt = { doc: '' };
const STEPS = [
  ['Comprendre le besoin', 'Avant de chiffrer, posez les bonnes questions : que veut le client, pour quand, avec quel budget ? Visitez les lieux si possible et prenez des photos. Notez l\'état du support, l\'accès au chantier (étage, ascenseur, stationnement) et les contraintes (occupé ou vide, horaires).'],
  ['Faire le métré', 'Mesurez : surfaces, longueurs, nombre de points. Un métré précis évite de perdre de l\'argent. Servez-vous de l\'onglet « Petits calculs » pour les surfaces, les murs nets et les pertes.'],
  ['Lister les lignes', 'Séparez la main-d\'œuvre et les fournitures. Une ligne = une prestation, avec une désignation claire, une quantité, une unité (m², ml, heure, forfait) et un prix unitaire. Regroupez par pièce ou par corps de métier avec des titres de section et des sous-totaux.'],
  ['Calculer le bon prix', 'Additionnez ce que ça vous coûte vraiment : matériaux (avec les pertes), temps passé, déplacement, location de matériel. Ajoutez votre marge pour couvrir vos charges et dégager un bénéfice. Le simulateur ci-dessous fait ce calcul pour vous.'],
  ['Rédiger clairement', 'Précisez ce qui est compris et ce qui ne l\'est pas (évacuation des gravats, finitions, fournitures par le client). Indiquez les délais, la date de début, la durée de validité du devis et les conditions de paiement (acompte, échéances).'],
  ['Vérifier les mentions', 'Identité de l\'entreprise, SIRET, date, numéro, client, description et prix, TVA ou mention d\'exonération, durée de validité, conditions de paiement. Utilisez « Vérifier mon devis » plus bas : il contrôle tout à votre place.'],
  ['Envoyer, relancer, signer', 'Envoyez le devis en PDF, avec un message court et poli. Relancez après quelques jours. Le client le signe avec la mention « Bon pour accord » : c\'est votre preuve. Demandez l\'acompte à la commande, puis facturez dès la fin du chantier.']
];
function guideHtml() {
  const docs = [...db.quotes].filter(q => !isInv(q)).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));
  return `
  <div class="card"><h2>Les 7 étapes d'un bon devis</h2>
    <div class="steps">${STEPS.map((s, i) => `<div class="step"><div class="sn">${i + 1}</div><div><b>${s[0]}</b><p class="muted" style="margin:4px 0 0">${s[1]}</p></div></div>`).join('')}</div></div>

  <div class="card"><h2>Une bonne ligne de devis, une mauvaise</h2>
    <div class="grid2"><div class="ex bad"><div class="muted" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.06em">À éviter</div><b>Peinture salon</b><br>Forfait : 700 €<p class="muted" style="margin:6px 0 0">Flou : le client ne sait pas ce qui est compris, vous ne pouvez pas justifier le prix ni facturer un supplément.</p></div>
      <div class="ex good"><div class="muted" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.06em">À faire</div><b>Peinture des murs du salon, 2 couches, sous-couche et protections comprises</b><br>38 m² × 18,00 € = 684,00 € HT<p class="muted" style="margin:6px 0 0">Précis : quantité, unité, prix unitaire, périmètre clair. Facile à accepter et à défendre.</p></div></div></div>

  <div class="card"><h2>Simulateur : quel prix pour cette prestation ?</h2>
    <p class="muted" style="margin-top:0">Entrez ce que la prestation vous coûte : le simulateur donne le prix à mettre sur le devis.</p>
    <div class="grid4"><div class="field"><label>Quantité</label><input id="spQty" type="number" step="any" value="40"></div><div class="field"><label>Unité</label><input id="spUnit" value="m²"></div>
      <div class="field"><label>Temps par unité (heures)</label><input id="spTime" type="number" step="any" value="0.35"></div><div class="field"><label>Coût horaire (€/h)</label><input id="spRate" type="number" step="any" value="35"></div>
      <div class="field"><label>Matériaux achetés HT (€)</label><input id="spMat" type="number" step="any" value="120"></div><div class="field"><label>Pertes sur matériaux (%)</label><input id="spWaste" type="number" step="any" value="10"></div>
      <div class="field"><label>Déplacement et frais (€)</label><input id="spFees" type="number" step="any" value="40"></div><div class="field"><label>Marge souhaitée sur coût (%)</label><input id="spMargin" type="number" step="any" value="25"></div></div>
    <div class="cp-sum" id="spOut"></div>
    <p class="muted" style="font-size:.8rem;margin:8px 0 0">Le coût horaire doit couvrir votre salaire et vos charges, pas seulement ce que vous aimeriez gagner.</p></div>

  <div class="card"><h2>Vérifier mon devis</h2>
    <p class="muted" style="margin-top:0">Choisissez un de vos devis : l'outil contrôle les points importants et vous dit comment corriger.</p>
    <div class="field" style="max-width:520px"><label>Devis à vérifier</label><select id="gDoc"><option value="">— Choisir un devis —</option>${docs.map(q => `<option value="${q.id}" ${gSt.doc === q.id ? 'selected' : ''}>${esc(q.number)} — ${esc((getClient(q.clientId) || {}).name || 'sans client')} — ${money(totals(q).ttc)}</option>`).join('')}</select></div>
    <div id="gOut">${docs.length ? '' : '<p class="muted">Créez un devis pour pouvoir le vérifier.</p>'}</div></div>`;
}
function simAll() {
  const o = document.getElementById('spOut'); if (!o) return;
  const q = tv('spQty'), unit = document.getElementById('spUnit').value || 'unité', hours = q * tv('spTime'), labor = hours * tv('spRate'), mat = tv('spMat') * (1 + tv('spWaste') / 100), fees = tv('spFees');
  const cost = labor + mat + fees, sell = cost * (1 + tv('spMargin') / 100);
  o.innerHTML = q > 0 ? `Temps total : <b>${fnum(hours, 1)} h</b> · Main-d'œuvre : <b>${money(labor)}</b> · Matériaux avec pertes : <b>${money(mat)}</b> · Frais : <b>${money(fees)}</b><br>
    Coût de revient : <b>${money(cost)}</b> → <b style="font-size:1.1rem">Prix de vente HT : ${money(sell)}</b> (bénéfice ${money(sell - cost)})<br>
    À indiquer sur le devis : <b>${fnum(q, q % 1 ? 2 : 0)} ${esc(unit)} × ${money(sell / q)} HT</b>` : 'Indiquez une quantité.';
}
function checkQuote(q) {
  const co = db.company, t = totals(q), items = q.lines.filter(l => l.t === 'item'), issuer = q.issuerText || '', filled = items.filter(l => num(l.price) > 0);
  const pays = (q.payments || []).reduce((s, p) => s + num(p.pct), 0), foot = (q.footer || '').toLowerCase();
  const C = (ok, label, fix, warn) => ({ ok, label, fix, warn });
  return [
    C(!!(q.title || '').trim(), 'Un titre décrit les travaux', 'Ajoutez l\'objet du devis (ex : « Rénovation salle de bain, 12 rue des Lilas »).'),
    C(!!(q.clientText || '').trim() && (q.clientText || '').split('\n').length > 1, 'Le client est identifié avec son adresse', 'Choisissez ou créez un client avec son adresse complète.'),
    C(issuer.split('\n').length >= 3, 'Vos coordonnées sont complètes', 'Complétez « Mon entreprise » : adresse, téléphone, email.'),
    C(/\d{3}\s?\d{3}\s?\d{3}\s?\d{5}|siret/i.test(issuer), 'Votre numéro SIRET figure sur le devis', 'Renseignez votre SIRET dans « Mon entreprise ».'),
    C(!!q.date && !!q.validUntil, 'La date et la durée de validité sont indiquées', 'Renseignez « Valable jusqu\'au » : le prix des matériaux peut changer.'),
    C(filled.length > 0, 'Au moins une ligne avec un prix', 'Ajoutez vos prestations dans la section « Prestations ».'),
    C(items.every(l => String(l.desc).trim().length >= 8 || !num(l.price)), 'Chaque ligne a une désignation claire', 'Remplacez les désignations trop courtes par une description précise (quoi, où, comment).', true),
    C(filled.every(l => num(l.qty) > 0 && String(l.unit).trim()), 'Chaque ligne a une quantité et une unité', 'Indiquez la quantité et l\'unité (m², ml, heure, forfait).'),
    C(co.vatExempt ? /293 ?b/i.test(q.footer || '') : filled.every(l => [0, 5.5, 10, 20, 2.1].includes(num(l.vat))), co.vatExempt ? 'La mention d\'exonération de TVA est présente' : 'Le taux de TVA est renseigné sur chaque ligne', co.vatExempt ? 'Ajoutez « TVA non applicable, article 293 B du CGI » dans le pied de page.' : 'Choisissez un taux de TVA pour chaque ligne.'),
    C(Math.abs(pays - 100) < 0.01 && (q.payments || []).length > 0, 'Les conditions de paiement sont définies (total 100 %)', 'Complétez l\'échéancier dans « Paiement » : acompte, solde…'),
    C(!!(q.bank || '').trim(), 'Vos coordonnées bancaires sont indiquées', 'Ajoutez votre IBAN dans « Paiement » pour être payé par virement.', true),
    C(/p[ée]nalit/.test(foot) && /40/.test(foot), 'Les pénalités de retard et l\'indemnité de 40 € sont mentionnées', 'Rétablissez les mentions légales dans le pied de page (réglages de « Mon entreprise »).', true),
    C(!!(q.opts.agreeLabel || '').trim(), 'Le « Bon pour accord » est prévu pour la signature', 'Renseignez le texte de signature dans « Mentions légales & présentation ».'),
    C(t.ttc > 0, 'Le total est supérieur à zéro', 'Vérifiez les prix et les quantités de vos lignes.')
  ];
}
function guideCheck() {
  const q = getQuote(gSt.doc), o = document.getElementById('gOut'); if (!o) return;
  if (!q) { o.innerHTML = ''; return; }
  const res = checkQuote(q), okN = res.filter(r => r.ok).length, pct = Math.round(okN / res.length * 100);
  o.innerHTML = `<div class="score"><div class="sbar"><i style="width:${pct}%;background:${pct === 100 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--danger)'}"></i></div><b>${okN} / ${res.length} points validés</b>
    ${pct === 100 ? '<span style="color:var(--ok)"> — Votre devis est complet.</span>' : ''}</div>
    ${res.map(r => `<div class="chk ${r.ok ? 'ok' : r.warn ? 'warn' : 'bad'}"><span class="mk">${r.ok ? '✓' : r.warn ? '!' : '✕'}</span><div><b>${r.label}</b>${r.ok ? '' : `<div class="muted" style="font-size:.85rem">${r.fix}</div>`}</div></div>`).join('')}
    <div class="row" style="margin-top:12px"><button class="btn" data-act="edit" data-id="${q.id}">Ouvrir ce devis pour le corriger</button></div>`;
}

/* ================= ASTUCES ================= */
const TIPS = [
  ['Devis et factures', 'Détaillez chaque ligne', 'Un devis détaillé (quantité, unité, prix unitaire) rassure le client et évite les discussions : il voit ce qu\'il paie. Évitez le forfait global flou.'],
  ['Devis et factures', 'Indiquez une durée de validité', 'Le prix des matériaux évolue. Une durée de validité (15 à 30 jours par exemple) vous protège et incite le client à décider.'],
  ['Devis et factures', 'Faites signer « Bon pour accord »', 'Le devis daté et signé est votre preuve d\'acceptation. Gardez-le avec le dossier du chantier.'],
  ['Devis et factures', 'Les mentions à ne pas oublier', 'En général : identité et coordonnées de l\'entreprise, SIRET, date, description des prestations, prix, TVA (ou mention d\'exonération), conditions de paiement, pénalités de retard et, entre professionnels, indemnité forfaitaire de 40 €. Elles dépendent de votre statut : vérifiez auprès de votre comptable.'],
  ['Devis et factures', 'Une numérotation continue', 'Numérotez vos factures dans l\'ordre, sans trou ni doublon. Le site le fait pour vous (réglages dans « Mon entreprise »).'],
  ['Devis et factures', 'Facturez dès la fin du chantier', 'Plus la facture part tôt, plus elle est payée tôt. Prévoyez un acompte à la commande pour financer les fournitures.'],
  ['Prix et marge', 'Marge et taux de marque, ce n\'est pas pareil', 'Un coefficient de 1,3 donne 30 % de majoration mais seulement 23 % de taux de marque. Utilisez le calculateur de marge ou le simulateur de prix de cette boîte à outils.'],
  ['Prix et marge', 'Prévoyez les pertes', 'Sur carrelage, parquet ou plinthes, comptez souvent 5 à 10 % de pertes (coupes, casse). Le calculateur de surfaces les intègre.'],
  ['Prix et marge', 'Comptez tout dans vos prix', 'Déplacements, temps passé au téléphone et en devis, petites fournitures : s\'ils ne sont pas dans vos prix, ils sont à votre charge.'],
  ['Photos et fichiers', 'Photographiez avant, pendant, après', 'Des photos datées protègent en cas de litige et valorisent votre travail. Classez-les dans un dossier par chantier.'],
  ['Photos et fichiers', 'Allégez les photos avant d\'envoyer', 'Pour un email, une largeur de 1600 px et une qualité de 80 % suffisent largement et divisent souvent le poids par 5 à 10. Voir « Convertir et compresser des images ».'],
  ['Photos et fichiers', 'JPEG, PNG ou WebP ?', 'JPEG pour les photos, PNG pour les logos et captures d\'écran (il garde la transparence), WebP pour le web (plus léger).'],
  ['Photos et fichiers', 'Envoyez des PDF', 'Un devis ou une facture en PDF ne peut pas être modifié par erreur et s\'ouvre partout. Nommez-le clairement : 2026-10_Dupont_Devis-001.pdf.'],
  ['Organisation', 'Un dossier par chantier', 'Devis signé, photos, factures, échanges : tout au même endroit. Vous retrouvez une information en dix secondes.'],
  ['Organisation', 'Sauvegardez régulièrement', 'Exportez une sauvegarde depuis la page Devis et gardez une copie hors de votre ordinateur (clé USB, cloud).'],
  ['Relation client', 'Relancez sans attendre', 'Une relance courtoise le lendemain de l\'échéance règle la majorité des retards.'],
  ['Relation client', 'Confirmez les changements par écrit', 'Un supplément ou une modification de chantier ? Un petit email ou un avenant évite les mauvaises surprises à la facturation.'],
  ['Relation client', 'Demandez un avis', 'À la fin du chantier, un client satisfait laisse volontiers un avis. C\'est votre meilleure publicité.']
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
  'tip-cat'(t) { toolsUI.tipCat = t.dataset.cat; T().innerHTML = tipsHtml(); }
});
document.addEventListener('input', e => {
  const t = e.target; if (!t.closest || !t.closest('#toolsBody')) return;
  if (toolsUI.tab === 'calc') calcAll();
  if (toolsUI.tab === 'guide') simAll();
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
  if (t.id === 'gDoc') { gSt.doc = t.value; guideCheck(); }
});
['dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  const z = e.target.closest && e.target.closest('.dropzone'); if (!z) return;
  e.preventDefault(); z.classList.toggle('over', ev === 'dragover');
  if (ev === 'drop') { if (z.id === 'imgDrop') addImages(e.dataTransfer.files, img.items, imgProcess); else addImages(e.dataTransfer.files, pdf.items, pdfRender); }
}));
window.__tools = { convertImage, makeZip, buildPdf, prepareJpeg };
