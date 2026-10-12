'use strict';
/* Catalogue : prestations, ouvrages composés, matériaux par fournisseur, fournisseurs.
   Sélecteur de devis avec quantité et total automatique, liste d'achat par fournisseur, import/export CSV. */

const ITEM_TYPES = { prestation: 'Prestation (main-d\'œuvre)', fourniture: 'Fourniture', ouvrage: 'Ouvrage composé', materiau: 'Matériau (fournisseur)' };
const catUI = { tab: 'prestations', cat: '', sup: '' };   // état de la page
const cp = { tab: 'prestations', cat: '', sup: '', detail: false }; // état du sélecteur dans un devis
const r4 = x => Math.round(x * 10000) / 10000;
const r2 = x => Math.round(x * 100) / 100;

/* ----- accès & calculs ----- */
const sups = () => (db.suppliers = db.suppliers || []);
const supplier = id => sups().find(s => s.id === id);
const catItem = id => db.catalog.find(x => x.id === id);
const isPack = c => c.type === 'ouvrage';
const isMat = c => c.type === 'materiau';
const matMarkup = c => (c.markup === '' || c.markup == null ? num((supplier(c.supplierId) || {}).markup) : num(c.markup));
function partsSum(c, key) {
  return (c.parts || []).reduce((s, p) => {
    const it = catItem(p.id);
    return s + (it ? (key === 'price' ? itemPrice(it) : itemCost(it)) * num(p.coef) : 0);
  }, 0);
}
function itemPrice(c) { return isPack(c) ? partsSum(c, 'price') : isMat(c) ? r2(num(c.cost) * (1 + matMarkup(c) / 100)) : num(c.price); }
function itemCost(c) { return isPack(c) ? partsSum(c, 'cost') : num(c.cost); }
const itemMargin = c => { const k = itemCost(c); return k > 0 ? (itemPrice(c) / k - 1) * 100 : null; };
const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function fuzzy(hay, q) { // tous les mots recherchés doivent être présents ("gouttière 80mm" trouve « Gouttière … 80 mm »)
  const h = nrm(hay), hc = h.replace(/[\s\-.,]/g, '');
  return nrm(q).split(/\s+/).filter(Boolean).every(t => h.includes(t) || hc.includes(t.replace(/[\s\-.,]/g, '')));
}
const hayOf = c => `${c.ref} ${c.desc} ${c.cat} ${isMat(c) ? (supplier(c.supplierId) || {}).name : ''}`;
const categories = mat => [...new Set(db.catalog.filter(c => !!isMat(c) === !!mat).map(c => (c.cat || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
const sortedCatalog = list => [...list].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (a.cat || '').localeCompare(b.cat || '', 'fr') || a.desc.localeCompare(b.desc, 'fr'));
const normCat = c => { c.type = ITEM_TYPES[c.type] ? c.type : 'prestation'; c.cat = c.cat || ''; c.fav = !!c.fav; c.cost = num(c.cost); if (isPack(c)) c.parts = c.parts || []; return c; };
function openModal(html) { const m = $('#modal'); m.innerHTML = html; if (!m.open) m.showModal(); return m; }
const typeBadge = c => `<span class="badge ${c.type === 'ouvrage' ? 'info2' : c.type === 'materiau' ? 'envoye' : c.type === 'fourniture' ? 'brouillon' : 'payee'}" style="font-size:.68rem">${{ ouvrage: 'Ouvrage', materiau: 'Matériau', fourniture: 'Fourniture', prestation: 'Prestation' }[c.type]}</span>`;
const pct = v => (v == null ? '—' : fmtNum.format(v) + ' %');
const partsText = c => (c.parts || []).map(p => { const it = catItem(p.id); return it ? `${fmtNum.format(num(p.coef))} ${esc(it.unit)} ${esc(it.desc)}` : ''; }).filter(Boolean).join(' + ');

/* ================= PAGE CATALOGUE ================= */
EXTRA.catalog = function renderCatalog() {
  db.catalog.forEach(normCat);
  const n = { p: db.catalog.filter(c => !isMat(c)).length, m: db.catalog.filter(isMat).length, f: sups().length };
  const tabs = [['prestations', 'Prestations & ouvrages', n.p], ['materiaux', '🧱 Matériaux', n.m], ['fournisseurs', '🏪 Fournisseurs', n.f]];
  return `<div class="tabs">${tabs.map(([k, l, c]) => `<button data-act="cat-tab" data-tab="${k}" class="${catUI.tab === k ? 'on' : ''}">${l} <i style="font-style:normal;opacity:.6">${c}</i></button>`).join('')}</div>
    ${catUI.tab === 'materiaux' ? renderMaterials() : catUI.tab === 'fournisseurs' ? renderSuppliers() : renderPrestations()}
    <input type="file" id="catFile" accept=".csv,text/csv" hidden><input type="file" id="matFile" accept=".csv,text/csv" hidden>`;
};

function renderPrestations() {
  const base = db.catalog.filter(c => !isMat(c)), cats = categories(false), favs = base.filter(c => c.fav).length;
  const list = sortedCatalog(base.filter(c => catUI.cat === '★' ? c.fav : !catUI.cat || (c.cat || '') === catUI.cat));
  const chip = (v, label, n) => `<button class="cchip ${catUI.cat === v ? 'on' : ''}" data-act="cat-filter" data-cat="${esc(v)}">${label} <i>${n}</i></button>`;
  return `
  <div class="row between" style="margin-bottom:8px"><h1>Prestations &amp; ouvrages</h1>
    <div class="row"><button class="btn" data-act="cat-demo" title="Ajoute des prestations types à adapter">📦 Exemples</button><button class="btn" data-act="cat-export">⬇ Export CSV</button><button class="btn" data-act="cat-import">⬆ Import CSV</button>
      <button class="btn" data-act="new-pack">＋ Ouvrage composé</button><button class="btn primary" data-act="new-item">＋ Prestation</button></div></div>
  <p class="muted" style="margin-top:0">Votre main-d'œuvre et vos forfaits, avec leur <b>prix à l'unité</b> (ex : Pose de parquet — m² — 5,00 €). Dans un devis, indiquez seulement la quantité : le total se calcule tout seul.
    Un <b>ouvrage composé</b> regroupe plusieurs lignes (fourniture + pose + finitions) en un seul prix. Vos matériaux se gèrent dans l'onglet 🧱 Matériaux.</p>
  ${base.length ? `<div class="card">
    <div class="chips">${chip('', 'Tout', base.length)}${favs ? chip('★', '⭐ Favoris', favs) : ''}${cats.map(c => chip(c, esc(c), base.filter(x => x.cat === c).length)).join('')}</div>
    <input id="catSearch" placeholder="🔍 Rechercher une prestation, une référence…" style="max-width:380px;margin:14px 0">
    <table class="list" id="catTable">
    <thead><tr><th></th><th>Réf.</th><th>Désignation</th><th>Unité</th><th class="right">Achat HT</th><th class="right">Vente HT</th><th class="right">Marge</th><th>TVA</th><th></th></tr></thead>
    <tbody>${list.map(c => `<tr>
      <td><button class="star ${c.fav ? 'on' : ''}" data-act="cat-fav" data-id="${c.id}" title="Favori">${c.fav ? '★' : '☆'}</button></td>
      <td>${esc(c.ref)}</td>
      <td><b style="white-space:pre-line">${esc(c.desc)}</b> ${typeBadge(c)}${c.cat ? ` <span class="muted" style="font-size:.78rem">${esc(c.cat)}</span>` : ''}
        ${isPack(c) ? `<div class="muted" style="font-size:.8rem">${partsText(c)}</div>` : ''}</td>
      <td>${esc(c.unit)}</td><td class="right muted">${itemCost(c) ? money(itemCost(c)) : '—'}</td>
      <td class="right"><b>${money(itemPrice(c))}</b></td><td class="right muted">${pct(itemMargin(c))}</td><td>${String(c.vat).replace('.', ',')} %</td>
      <td class="right" style="white-space:nowrap"><button class="btn small" data-act="edit-item" data-id="${c.id}">Modifier</button>
        <button class="btn small" data-act="dup-item" data-id="${c.id}" title="Dupliquer">⧉</button>
        <button class="btn small danger" data-act="del-item" data-id="${c.id}">🗑</button></td></tr>`).join('')}</tbody></table>
    ${list.length ? '' : '<div class="empty">Aucune prestation dans cette catégorie.</div>'}</div>`
  : `<div class="card empty">Aucune prestation enregistrée.<br><br><div class="row" style="justify-content:center"><button class="btn primary" data-act="new-item">＋ Créer ma première prestation</button>
      <button class="btn" data-act="cat-demo">📦 Charger des exemples (à adapter)</button></div></div>`}`;
}

function renderMaterials() {
  const all = db.catalog.filter(isMat), ss = sups();
  const list = sortedCatalog(all.filter(c => !catUI.sup || c.supplierId === catUI.sup));
  const chip = (v, label, n) => `<button class="cchip ${catUI.sup === v ? 'on' : ''}" data-act="sup-filter" data-sup="${esc(v)}">${label} <i>${n}</i></button>`;
  return `
  <div class="row between" style="margin-bottom:8px"><h1>Matériaux</h1>
    <div class="row"><button class="btn" data-act="mat-demo" title="Ajoute des fournisseurs et matériaux d'exemple">📦 Exemples</button><button class="btn" data-act="mat-export">⬇ Export CSV</button><button class="btn" data-act="mat-import">⬆ Import CSV</button>
      <button class="btn primary" data-act="new-mat">＋ Matériau</button></div></div>
  <p class="muted" style="margin-top:0">Enregistrez les matériaux de chacun de vos fournisseurs avec <b>leur prix d'achat</b>. Le prix de vente est calculé avec votre marge (réglable par fournisseur ou par matériau).
    Dans un devis : <b>Catalogue, onglet Matériaux</b>, vous choisissez le fournisseur, cherchez le matériau (ex : « gouttière 2 m 80 mm »), indiquez la quantité, et c'est calculé.</p>
  ${!ss.length ? `<div class="card empty">Commencez par ajouter un fournisseur (ex : votre négoce habituel).<br><br><button class="btn primary" data-act="new-sup">＋ Ajouter un fournisseur</button> <button class="btn" data-act="mat-demo">📦 Charger des exemples</button></div>`
  : `<div class="card">
    <div class="chips">${chip('', 'Tous', all.length)}${ss.map(s => chip(s.id, esc(s.name), all.filter(c => c.supplierId === s.id).length)).join('')}</div>
    <input id="catSearch" placeholder="🔍 Rechercher un matériau (ex : gouttière 80 mm)…" style="max-width:420px;margin:14px 0">
    ${list.length ? `<table class="list" id="catTable"><thead><tr><th></th><th>Fournisseur</th><th>Réf. fourn.</th><th>Désignation</th><th>Unité</th><th class="right">Achat HT</th><th class="right">Marge</th><th class="right">Vente HT</th><th>TVA</th><th></th></tr></thead>
    <tbody>${list.map(c => `<tr>
      <td><button class="star ${c.fav ? 'on' : ''}" data-act="cat-fav" data-id="${c.id}">${c.fav ? '★' : '☆'}</button></td>
      <td>${esc((supplier(c.supplierId) || {}).name || '—')}</td><td>${esc(c.ref)}</td>
      <td><b>${esc(c.desc)}</b>${c.cat ? ` <span class="muted" style="font-size:.78rem">${esc(c.cat)}</span>` : ''}</td><td>${esc(c.unit)}</td>
      <td class="right">${money(c.cost)}${c.priceDate || c.sourceUrl ? `<div class="muted" style="font-size:.72rem">${c.priceDate ? 'au ' + fdate(c.priceDate) : ''} ${/^https?:\/\//.test(c.sourceUrl || '') ? `<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">🔗</a>` : ''}</div>` : ''}</td><td class="right muted">${pct(matMarkup(c))}${c.markup === '' || c.markup == null ? ' <span title="Marge du fournisseur">*</span>' : ''}</td>
      <td class="right"><b>${money(itemPrice(c))}</b></td><td>${String(c.vat).replace('.', ',')} %</td>
      <td class="right" style="white-space:nowrap"><button class="btn small" data-act="edit-item" data-id="${c.id}">Modifier</button>
        <button class="btn small" data-act="dup-item" data-id="${c.id}" title="Dupliquer">⧉</button>
        <button class="btn small danger" data-act="del-item" data-id="${c.id}">🗑</button></td></tr>`).join('')}</tbody></table>
    <p class="muted" style="font-size:.8rem;margin:10px 0 0">* marge par défaut du fournisseur. Le prix d'achat et la marge ne figurent jamais sur le devis.</p>`
    : '<div class="empty">Aucun matériau. <button class="btn small primary" data-act="new-mat">＋ Ajouter un matériau</button></div>'}</div>`}`;
}

function renderSuppliers() {
  const ss = sups();
  return `
  <div class="row between" style="margin-bottom:8px"><h1>Fournisseurs</h1><button class="btn primary" data-act="new-sup">＋ Fournisseur</button></div>
  <p class="muted" style="margin-top:0">Vos fournisseurs de matériaux (négoces, grandes surfaces de bricolage, grossistes…) avec leurs coordonnées et votre marge habituelle.</p>
  ${ss.length ? `<div class="sup-grid">${ss.map(s => { const n = db.catalog.filter(c => c.supplierId === s.id).length; return `<div class="card sup">
    <div class="row between"><h3 style="margin:0">${esc(s.name)}</h3><span class="badge brouillon">${n} matériau${n > 1 ? 'x' : ''}</span></div>
    <div class="muted sup-info">${[s.contact && '👤 ' + esc(s.contact), s.phone && '📞 ' + esc(s.phone), s.email && '✉ ' + esc(s.email), s.address && '📍 ' + esc(s.address).replace(/\n/g, ', '), s.website && '🌐 ' + esc(s.website), s.account && 'N° client : ' + esc(s.account)].filter(Boolean).join('<br>') || 'Aucune coordonnée'}</div>
    ${s.notes ? `<div style="font-size:.85rem;white-space:pre-line">${esc(s.notes)}</div>` : ''}
    <div class="muted" style="font-size:.85rem">Marge par défaut : <b>${fmtNum.format(num(s.markup))} %</b></div>
    <div class="row"><button class="btn small" data-act="sup-open" data-id="${s.id}">🧱 Matériaux</button><button class="btn small" data-act="new-mat" data-sup="${s.id}">＋ Matériau</button>
      <button class="btn small" data-act="edit-sup" data-id="${s.id}">Modifier</button><button class="btn small danger" data-act="del-sup" data-id="${s.id}">🗑</button></div></div>`; }).join('')}</div>`
  : '<div class="card empty">Aucun fournisseur.<br><br><button class="btn primary" data-act="new-sup">＋ Ajouter mon premier fournisseur</button></div>'}`;
}

/* ================= FOURNISSEURS ================= */
function supplierModal(id, after) {
  const s = supplier(id) || { name: '', contact: '', phone: '', email: '', address: '', website: '', account: '', notes: '', markup: 0 };
  const m = openModal(`<div class="modal-wide"><form id="supForm"><h2>${id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h2>
    <div class="field"><label>Nom du fournisseur *</label><input name="name" required value="${esc(s.name)}" placeholder="Ex : Négoce du Bâtiment, Point P, Leroy Merlin…"></div>
    <div class="grid2"><div class="field"><label>Contact (nom)</label><input name="contact" value="${esc(s.contact)}"></div>
      <div class="field"><label>Téléphone</label><input name="phone" value="${esc(s.phone)}"></div>
      <div class="field"><label>Email (commandes)</label><input name="email" type="email" value="${esc(s.email)}"></div>
      <div class="field"><label>Site web</label><input name="website" value="${esc(s.website)}"></div>
      <div class="field"><label>N° de compte client</label><input name="account" value="${esc(s.account)}"></div>
      <div class="field"><label>Marge par défaut sur ses matériaux (%)</label><input name="markup" type="number" step="any" value="${s.markup}"></div></div>
    <div class="field"><label>Adresse</label><textarea name="address" rows="2">${esc(s.address)}</textarea></div>
    <div class="field"><label>Notes (horaires, délais de livraison, conditions…)</label><textarea name="notes" rows="2">${esc(s.notes)}</textarea></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></form></div>`);
  $('#supForm').onsubmit = e => {
    e.preventDefault();
    const f = e.target, g = k => f.elements[k].value.trim();
    const data = { name: g('name'), contact: g('contact'), phone: g('phone'), email: g('email'), website: g('website'), account: g('account'), address: g('address'), notes: g('notes'), markup: num(g('markup')) };
    if (sups().some(x => x.id !== id && nrm(x.name) === nrm(data.name))) return toast('Un fournisseur porte déjà ce nom');
    const cur = supplier(id); let sp = cur;
    if (cur) Object.assign(cur, data); else { sp = { id: uid(), ...data }; sups().push(sp); }
    sups().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    save(); m.close(); if (after) after(sp); else render();
  };
}

/* ================= MATÉRIAUX ================= */
function matModal(id, after, presetSup) {
  if (!sups().length) { toast('Ajoutez d\'abord un fournisseur'); return supplierModal(null, sp => matModal(id, after, sp.id)); }
  const base = catItem(id);
  const c = base ? { ...base } : { type: 'materiau', supplierId: presetSup || catUI.sup || sups()[0].id, ref: '', desc: '', cat: '', unit: 'pièce(s)', cost: '', markup: '', vat: db.settings.defaultVat, fav: false, sourceUrl: '', priceDate: '' };
  const m = openModal(`<div class="modal-wide"><form id="matForm"><h2>${id ? 'Modifier le matériau' : 'Nouveau matériau'}</h2>
    <div class="grid2"><div class="field"><label>Fournisseur *</label><div class="row" style="flex-wrap:nowrap"><select name="supplierId" id="msup">${sups().map(s => `<option value="${s.id}" ${s.id === c.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <button type="button" class="btn" id="msupNew" title="Nouveau fournisseur">＋</button></div></div>
      <div class="field"><label>Référence fournisseur</label><input name="ref" value="${esc(c.ref)}"></div></div>
    <div class="field"><label>Désignation * (dimensions, diamètre, conditionnement…)</label><textarea name="desc" required rows="2" placeholder="Ex : Gouttière PVC demi-ronde Ø 80 mm — barre de 2 m">${esc(c.desc)}</textarea></div>
    <div class="grid3"><div class="field"><label>Catégorie de matériau</label><input name="cat" list="matcats" value="${esc(c.cat)}" placeholder="Ex : Zinguerie, Isolation…"><datalist id="matcats">${categories(true).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="field"><label>Unité de vente</label><input name="unit" list="units" value="${esc(c.unit)}"></div>
      <div class="field"><label>TVA</label><select name="vat">${VATS.map(v => `<option value="${v}" ${num(c.vat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></div></div>
    <div class="grid3"><div class="field"><label>Prix d'achat HT *</label><input name="cost" id="mcost" type="number" step="any" min="0" required value="${c.cost}"></div>
      <div class="field"><label>Marge (%) — vide = marge du fournisseur</label><input name="markup" id="mmk" type="number" step="any" value="${c.markup ?? ''}"></div>
      <div class="field"><label>Prix de vente HT</label><input id="mprice" type="number" step="any" min="0"></div></div>
    <p class="muted" id="mhint" style="font-size:.82rem;margin:-4px 0 8px"></p>
    <details class="finder" id="finder"><summary>🔎 Trouver le prix en ligne &amp; convertir à l'unité</summary>
      <p class="muted" style="font-size:.82rem;margin:8px 0">Recherchez le produit chez Leroy Merlin, Castorama, Brico Dépôt, Point.P… puis saisissez le prix affiché : il est converti automatiquement en <b>prix HT par unité</b>.</p>
      <div class="row" style="flex-wrap:nowrap"><input id="pfq" class="grow" placeholder="Produit à chercher (ex : gouttière PVC Ø 80 mm 2 m)">
        ${session.config.priceSearch ? '<button type="button" class="btn" id="pfgo">🔍 Chercher les prix</button>' : ''}</div>
      <div class="row" style="margin:8px 0" id="pflinks"></div>
      <div id="pfres"></div>
      <div class="pf-calc">
        <div class="field"><label>Prix affiché (€)</label><input id="pfprice" type="number" step="any" min="0"></div>
        <div class="field"><label>Ce prix est</label><select id="pfttc"><option value="1">TTC (prix magasin)</option><option value="0">HT</option></select></div>
        <div class="field"><label>Contenu vendu à ce prix</label><div class="row" style="flex-wrap:nowrap"><input id="pfqty" type="number" step="any" min="0" value="1"><input id="pfunit" list="units" style="max-width:110px"></div></div>
      </div>
      <div class="cp-sum" id="pfout">Saisissez le prix affiché pour voir le prix HT par unité.</div>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="btn small primary" id="pfuse" disabled>Utiliser ce prix d'achat</button></div>
    </details>
    <div class="grid2" style="margin-top:12px"><div class="field"><label>Lien de la fiche produit (facultatif)</label><input name="sourceUrl" value="${esc(c.sourceUrl || '')}" placeholder="https://…"></div>
      <div class="field"><label>Prix relevé le</label><input name="priceDate" type="date" value="${c.priceDate || ''}"></div></div>
    <label class="check"><input type="checkbox" name="fav" ${c.fav ? 'checked' : ''}> ⭐ Favori</label>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></form></div>`);
  const f = $('#matForm'), E = f.elements, price = $('#mprice');
  const curMk = () => (E.markup.value !== '' ? num(E.markup.value) : num((supplier(E.supplierId.value) || {}).markup));
  const refresh = () => { price.value = r2(num(E.cost.value) * (1 + curMk() / 100)) || ''; $('#mhint').textContent = `Marge appliquée : ${fmtNum.format(curMk())} %${E.markup.value === '' ? ' (marge du fournisseur)' : ''} — bénéfice : ${money(num(price.value) - num(E.cost.value))} par ${E.unit.value || 'unité'}.`; };
  E.cost.oninput = refresh; E.markup.oninput = refresh; E.supplierId.onchange = refresh; E.unit.oninput = refresh;
  price.oninput = () => { const k = num(E.cost.value); if (k > 0) { E.markup.value = r4((num(price.value) / k - 1) * 100); $('#mhint').textContent = `Marge appliquée : ${fmtNum.format(num(E.markup.value))} %`; } };
  $('#msupNew').onclick = () => supplierModal(null, sp => matModal(id, after, sp.id));
  refresh();
  priceFinder(f, refresh);
  f.onsubmit = e => {
    e.preventDefault();
    const g = k => E[k].value.trim();
    const data = { type: 'materiau', supplierId: g('supplierId'), ref: g('ref'), desc: g('desc'), cat: g('cat'), unit: g('unit') || 'u', cost: num(g('cost')), markup: g('markup') === '' ? '' : num(g('markup')), vat: num(g('vat')), fav: E.fav.checked, price: 0, sourceUrl: g('sourceUrl'), priceDate: g('priceDate') || ((!base || num(base.cost) !== num(g('cost'))) ? today() : base.priceDate || '') };
    if (base) Object.assign(base, data); else db.catalog.push({ id: uid(), ...data });
    save(); m.close(); if (after) after(); else { catUI.tab = 'materiaux'; render(); }
  };
}

/* ----- assistant de prix : recherche en ligne + conversion en prix HT par unité ----- */
const STORES = [['Leroy Merlin', 'leroymerlin.fr'], ['Castorama', 'castorama.fr'], ['Brico Dépôt', 'bricodepot.fr'], ['Point.P', 'pointp.fr'], ['Tous les magasins', '']];
function guessContent(title) { // « barre de 2 m », « paquet 2,2 m² », « 25 kg »… (suggestion seulement)
  const m = /(\d+(?:[.,]\d+)?)\s?(m²|m2|ml|m|kg|l)\b/i.exec(title || '');
  return m ? { qty: num(m[1]), unit: m[2].toLowerCase() === 'm2' ? 'm²' : m[2].toLowerCase() === 'm' ? 'ml' : m[2].toLowerCase() } : null;
}
function priceFinder(f, refreshHint) {
  const E = f.elements, $$ = id => document.getElementById(id);
  const fd = $$('finder'), q = $$('pfq');
  const links = () => {
    const t = encodeURIComponent((q.value || E.desc.value || '').trim() + ' prix');
    $$('pflinks').innerHTML = STORES.map(([n, d]) => `<a class="btn small" target="_blank" rel="noopener" href="https://www.google.fr/search?q=${t}${d ? '+site%3A' + d : ''}${d ? '' : '&tbm=shop'}">${n} ↗</a>`).join('');
  };
  fd.addEventListener('toggle', () => { if (fd.open) { if (!q.value) q.value = E.desc.value; if (!$$('pfunit').value) $$('pfunit').value = E.unit.value; links(); } });
  q.addEventListener('input', links);
  const calc = () => {
    const price = num($$('pfprice').value), ttc = $$('pfttc').value === '1', qty = num($$('pfqty').value), vat = num(E.vat.value);
    const unit = $$('pfunit').value.trim() || E.unit.value, ht = ttc ? price / (1 + vat / 100) : price, per = qty > 0 ? ht / qty : 0;
    $$('pfuse').disabled = !(price > 0 && qty > 0);
    $$('pfout').innerHTML = price > 0 && qty > 0
      ? `${fmtNum.format(price)} € ${ttc ? 'TTC' : 'HT'} pour ${fmtNum.format(qty)} ${esc(unit)}${ttc ? ` → ${money(ht)} HT` : ''} ⇒ <b>${money(per)} HT par ${esc(unit)}</b>`
      : 'Saisissez le prix affiché pour voir le prix HT par unité.';
    return { per, unit };
  };
  ['pfprice', 'pfttc', 'pfqty', 'pfunit'].forEach(i => { $$(i).addEventListener('input', calc); $$(i).addEventListener('change', calc); });
  E.vat.addEventListener('change', calc);
  $$('pfuse').onclick = () => {
    const { per, unit } = calc();
    E.cost.value = r4(per); E.unit.value = unit; E.priceDate.value = today(); refreshHint();
    toast(`Prix d'achat renseigné : ${money(per)} HT / ${unit}`);
  };
  if ($$('pfgo')) $$('pfgo').onclick = async () => {
    const term = q.value.trim(); if (term.length < 3) return toast('Saisissez au moins 3 caractères');
    $$('pfres').innerHTML = '<p class="muted">Recherche en cours…</p>';
    try {
      const { offers } = await api('GET', '/api/prices/search?q=' + encodeURIComponent(term));
      $$('pfres').innerHTML = offers.length ? offers.map((o, i) => `<div class="offer"><div><b>${esc(o.title)}</b><div class="muted" style="font-size:.8rem">🏪 ${esc(o.store)}${o.link ? ` · <a href="${esc(o.link)}" target="_blank" rel="noopener">voir ↗</a>` : ''}</div></div>
        <div class="right" style="white-space:nowrap"><b>${money(o.price)}</b> <span class="muted">TTC</span><br><button type="button" class="btn small" data-i="${i}">Utiliser</button></div></div>`).join('') : '<p class="muted">Aucune offre trouvée.</p>';
      $$('pfres').onclick = e => {
        const b = e.target.closest('button[data-i]'); if (!b) return;
        const o = offers[+b.dataset.i], g = guessContent(o.title);
        $$('pfprice').value = o.price; $$('pfttc').value = '1';
        if (g) { $$('pfqty').value = g.qty; $$('pfunit').value = g.unit; }
        if (o.link) E.sourceUrl.value = o.link;
        calc(); toast(g ? `Contenu détecté : ${g.qty} ${g.unit} — vérifiez-le` : 'Vérifiez le contenu vendu à ce prix');
      };
    } catch (err) { $$('pfres').innerHTML = `<p style="color:var(--danger)">${esc(err.message)}</p>`; }
  };
}

/* ================= PRESTATION / OUVRAGE ================= */
function itemModal(id, after, forceType) {
  const base = catItem(id);
  if (base && isMat(base)) return matModal(id, after);
  const c = base ? { ...base, parts: (base.parts || []).map(p => ({ ...p })) } : { ref: '', desc: '', cat: '', type: forceType || 'prestation', unit: forceType === 'ouvrage' ? 'm²' : 'u', price: 0, cost: 0, vat: db.settings.defaultVat, fav: false, parts: [] };
  normCat(c);
  const pickable = () => db.catalog.filter(x => !isPack(x) && x.id !== id);
  const m = openModal(`<div class="modal-wide"><form id="itemForm">
    <h2>${id ? 'Modifier' : 'Nouvelle'} ${c.type === 'ouvrage' ? 'ouvrage composé' : 'prestation'}</h2>
    <div class="grid3">
      <div class="field"><label>Type</label><select name="type" ${c.type === 'ouvrage' || id ? 'disabled' : ''}>${Object.entries(ITEM_TYPES).filter(([k]) => (k !== 'ouvrage' && k !== 'materiau') || c.type === k).map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Référence</label><input name="ref" value="${esc(c.ref)}"></div>
      <div class="field"><label>Catégorie</label><input name="cat" list="catlist" value="${esc(c.cat)}" placeholder="Ex : Parquet, Peinture…"><datalist id="catlist">${categories(false).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    </div>
    <div class="field"><label>Désignation *</label><textarea name="desc" required rows="2">${esc(c.desc)}</textarea></div>
    <div class="grid3">
      <div class="field"><label>Unité de vente</label><input name="unit" list="units" value="${esc(c.unit)}"></div>
      <div class="field"><label>TVA</label><select name="vat">${VATS.map(v => `<option value="${v}" ${num(c.vat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><label class="check" style="margin:10px 0 0"><input type="checkbox" name="fav" ${c.fav ? 'checked' : ''}> ⭐ Favori</label></div>
    </div>
    ${c.type === 'ouvrage' ? `
    <h3 style="margin:6px 0 4px;font-size:.85rem">Composition (pour 1 <span id="pu">${esc(c.unit)}</span> d'ouvrage)</h3>
    <div id="parts"></div>
    <button type="button" class="btn small" id="addPart">＋ Ajouter un composant</button>
    <div class="cp-sum" id="packSum"></div>` : `
    <div class="grid3">
      <div class="field"><label>Prix d'achat HT (facultatif)</label><input name="cost" id="icost" type="number" step="any" min="0" value="${c.cost || ''}"></div>
      <div class="field"><label>Marge sur coût (%)</label><input id="imk" type="number" step="any" value="${c.cost > 0 ? r4((num(c.price) / c.cost - 1) * 100) : ''}"></div>
      <div class="field"><label id="priceLbl">Prix de vente HT par ${esc(c.unit || 'unité')}</label><input name="price" id="iprice" type="number" step="any" min="0" value="${c.price}"></div>
    </div>
    <p class="muted" style="font-size:.8rem;margin:-4px 0 8px">Le prix d'achat et la marge restent internes (jamais affichés sur le devis). Modifier l'un recalcule l'autre.</p>`}
    <div class="form-err" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div>
  </form></div>`);
  const f = $('#itemForm');
  f.elements.unit.addEventListener('input', () => {
    const l = $('#priceLbl'); if (l) l.textContent = 'Prix de vente HT par ' + (f.elements.unit.value || 'unité');
    const pu = $('#pu'); if (pu) pu.textContent = f.elements.unit.value;
  });
  if (c.type === 'ouvrage') {
    const label = x => `${esc(x.ref ? x.ref + ' – ' : '')}${esc(x.desc)}${isMat(x) ? ' · ' + esc((supplier(x.supplierId) || {}).name || '') : ''} (${money(itemPrice(x))}/${esc(x.unit)})`;
    const draw = () => {
      $('#parts').innerHTML = c.parts.length ? c.parts.map((p, i) => {
        const it = catItem(p.id);
        return `<div class="part" data-i="${i}"><select class="p-sel"><option value="">— choisir —</option>${pickable().map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${label(x)}</option>`).join('')}</select>
          <input class="p-coef" type="number" step="any" min="0" value="${p.coef}"><span class="muted">${it ? esc(it.unit) : ''}</span>
          <b class="p-tot">${it ? money(itemPrice(it) * num(p.coef)) : '—'}</b><button type="button" class="btn small icon danger p-del">✕</button></div>`;
      }).join('') : '<p class="muted">Ajoutez les fournitures, matériaux et prestations qui composent cet ouvrage.</p>';
      sum();
    };
    const sum = () => {
      const t = { parts: c.parts, type: 'ouvrage' };
      $('#packSum').innerHTML = `Prix de vente : <b>${money(partsSum(t, 'price'))}</b> / ${esc(f.elements.unit.value)} · Coût : ${money(partsSum(t, 'cost'))} · Marge : ${pct(partsSum(t, 'cost') > 0 ? (partsSum(t, 'price') / partsSum(t, 'cost') - 1) * 100 : null)}`;
    };
    $('#addPart').onclick = () => { c.parts.push({ id: '', coef: 1 }); draw(); };
    $('#parts').addEventListener('change', e => { const i = +e.target.closest('.part').dataset.i; if (e.target.classList.contains('p-sel')) { c.parts[i].id = e.target.value; draw(); } });
    $('#parts').addEventListener('input', e => {
      if (!e.target.classList.contains('p-coef')) return;
      const row = e.target.closest('.part'), p = c.parts[+row.dataset.i], it = catItem(p.id);
      p.coef = num(e.target.value); row.querySelector('.p-tot').textContent = it ? money(itemPrice(it) * p.coef) : '—'; sum();
    });
    $('#parts').addEventListener('click', e => { if (e.target.closest('.p-del')) { c.parts.splice(+e.target.closest('.part').dataset.i, 1); draw(); } });
    f.elements.unit.addEventListener('input', sum);
    draw();
  } else {
    const cost = $('#icost'), mk = $('#imk'), price = $('#iprice');
    cost.oninput = () => { const k = num(cost.value); if (k > 0 && mk.value !== '') price.value = r4(k * (1 + num(mk.value) / 100)); else if (k > 0 && price.value !== '') mk.value = r4((num(price.value) / k - 1) * 100); };
    mk.oninput = () => { const k = num(cost.value); if (k > 0) price.value = r4(k * (1 + num(mk.value) / 100)); };
    price.oninput = () => { const k = num(cost.value); mk.value = k > 0 ? r4((num(price.value) / k - 1) * 100) : ''; };
  }
  f.onsubmit = e => {
    e.preventDefault();
    const g = k => (f.elements[k] ? f.elements[k].value : '').trim();
    const data = { ref: g('ref'), desc: g('desc'), cat: g('cat'), unit: g('unit') || 'u', vat: num(g('vat')), fav: f.elements.fav.checked, type: c.type === 'ouvrage' ? 'ouvrage' : (id ? c.type : g('type') || 'prestation') };
    if (c.type === 'ouvrage') {
      const parts = c.parts.filter(p => p.id && catItem(p.id));
      if (!parts.length) return formMsg(f, 'Ajoutez au moins un composant.');
      Object.assign(data, { parts, price: 0, cost: 0 });
    } else Object.assign(data, { price: num(g('price')), cost: num(g('cost')), parts: undefined });
    if (base) Object.assign(base, data); else db.catalog.push({ id: uid(), ...data });
    save(); m.close(); if (after) after(); else render();
  };
}

/* ================= EXEMPLES ================= */
const DEMO_CATALOG = [
  ['PLA-CLO', 'Cloison de distribution BA13 sur ossature métallique', 'Plâtrerie', 'prestation', 'm²', 14, 0, 20],
  ['PLA-DBL', 'Doublage BA13 sur ossature, isolation comprise', 'Plâtrerie', 'prestation', 'm²', 16, 0, 20],
  ['PLA-PLF', 'Plafond BA13 sur ossature', 'Plâtrerie', 'prestation', 'm²', 18, 0, 20],
  ['PAR-POSE', 'Pose de parquet', 'Parquet & sols', 'prestation', 'm²', 5, 0, 20],
  ['PAR-FOUR', 'Fourniture parquet stratifié', 'Parquet & sols', 'fourniture', 'm²', 14, 9, 20],
  ['PAR-SOUS', 'Sous-couche isolante', 'Parquet & sols', 'fourniture', 'm²', 2.5, 1.4, 20],
  ['PAR-PLIN', 'Pose de plinthes', 'Parquet & sols', 'prestation', 'ml', 3.5, 0, 20],
  ['PEI-MUR', 'Peinture murs (2 couches)', 'Peinture', 'prestation', 'm²', 18, 0, 20],
  ['PEI-PLF', 'Peinture plafond (2 couches)', 'Peinture', 'prestation', 'm²', 20, 0, 20],
  ['PEI-ENDUIT', 'Enduit de lissage', 'Peinture', 'prestation', 'm²', 12, 0, 20],
  ['CAR-POSE', 'Pose de carrelage au sol', 'Carrelage', 'prestation', 'm²', 45, 0, 20],
  ['MO-H', 'Main-d\'œuvre', 'Divers', 'prestation', 'h', 45, 0, 20],
  ['DEP', 'Déplacement', 'Divers', 'prestation', 'forfait', 40, 0, 20]
];
function loadDemoCatalog() {
  DEMO_CATALOG.forEach(([ref, desc, cat, type, unit, price, cost, vat]) => { if (!db.catalog.some(c => c.ref === ref)) db.catalog.push({ id: uid(), ref, desc, cat, type, unit, price, cost, vat: db.company.vatExempt ? 0 : vat, fav: false }); });
  const id = ref => (db.catalog.find(c => c.ref === ref) || {}).id;
  if (!db.catalog.some(c => c.ref === 'PAR-COMPLET')) db.catalog.push({ id: uid(), ref: 'PAR-COMPLET', desc: 'Parquet stratifié posé, complet (fourniture, sous-couche, pose, plinthes)', cat: 'Parquet & sols', type: 'ouvrage', unit: 'm²', vat: db.company.vatExempt ? 0 : 20, fav: true, price: 0, cost: 0,
    parts: [{ id: id('PAR-FOUR'), coef: 1.05 }, { id: id('PAR-SOUS'), coef: 1 }, { id: id('PAR-POSE'), coef: 1 }, { id: id('PAR-PLIN'), coef: 0.4 }] });
  save(); render(); toast('Exemples ajoutés : adaptez les prix à votre activité');
}
const DEMO_SUPPLIERS = [
  { name: 'Négoce du Bâtiment (exemple)', markup: 15, items: [
    ['NB-GOU2', 'Gouttière PVC demi-ronde Ø 80 mm — barre de 2 m', 'Zinguerie', 'barre', 6.9], ['NB-GOU4', 'Gouttière PVC demi-ronde Ø 80 mm — barre de 4 m', 'Zinguerie', 'barre', 13.2],
    ['NB-CRO80', 'Crochet de gouttière Ø 80 mm', 'Zinguerie', 'pièce(s)', 0.85], ['NB-ANG80', 'Angle extérieur gouttière Ø 80 mm', 'Zinguerie', 'pièce(s)', 4.9],
    ['NB-NAI80', 'Naissance de gouttière Ø 80 mm', 'Zinguerie', 'pièce(s)', 5.5], ['NB-TDE2', 'Tuyau de descente PVC Ø 80 mm — barre de 2 m', 'Zinguerie', 'barre', 9.4],
    ['NB-COL80', 'Collier tuyau de descente Ø 80 mm', 'Zinguerie', 'pièce(s)', 1.6], ['NB-COLLE', 'Colle PVC — tube 125 ml', 'Zinguerie', 'tube', 7.9]] },
  { name: 'Plâtre & Isolation Pro (exemple)', markup: 20, items: [
    ['PI-BA13', 'Plaque de plâtre BA13 2,50 × 1,20 m', 'Plâtrerie', 'pièce(s)', 6.2], ['PI-R48', 'Rail R48 — 3 m', 'Plâtrerie', 'pièce(s)', 2.1], ['PI-M48', 'Montant M48 — 2,60 m', 'Plâtrerie', 'pièce(s)', 1.7],
    ['PI-LDV100', 'Laine de verre 100 mm — rouleau', 'Isolation', 'rouleau', 38], ['PI-TTPC25', 'Vis TTPC 25 mm — boîte de 1000', 'Plâtrerie', 'boîte', 8.5], ['PI-ENDUIT', 'Enduit à joint — sac de 25 kg', 'Plâtrerie', 'sac', 14],
    ['PI-STR8', 'Parquet stratifié 8 mm', 'Sols', 'm²', 9]] }
];
function loadDemoMaterials() {
  DEMO_SUPPLIERS.forEach(d => {
    let s = sups().find(x => x.name === d.name);
    if (!s) { s = { id: uid(), name: d.name, contact: '', phone: '', email: '', address: '', website: '', account: '', notes: 'Fournisseur d\'exemple : remplacez par le vôtre.', markup: d.markup }; sups().push(s); }
    d.items.forEach(([ref, desc, cat, unit, cost]) => { if (!db.catalog.some(c => c.supplierId === s.id && c.ref === ref)) db.catalog.push({ id: uid(), type: 'materiau', supplierId: s.id, ref, desc, cat, unit, cost, markup: '', vat: db.company.vatExempt ? 0 : 20, fav: false, price: 0 }); });
  });
  sups().sort((a, b) => a.name.localeCompare(b.name, 'fr')); save(); render(); toast('Fournisseurs et matériaux d\'exemple ajoutés : adaptez-les');
}

/* ================= IMPORT / EXPORT CSV ================= */
function csvParse(text) {
  const first = text.split(/\r?\n/)[0] || '', d = first.split(';').length >= first.split(',').length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const key = s => nrm(s).replace(/[^a-z0-9]/g, '');
function readTable(text, map) {
  const rows = csvParse(text.replace(/^﻿/, ''));
  if (rows.length < 2) return null;
  const head = rows[0].map(key), idx = {};
  for (const [k, names] of Object.entries(map)) idx[k] = head.findIndex(h => names.includes(h));
  return { idx, rows: rows.slice(1) };
}
function download(name, lines) {
  const blob = new Blob(['﻿' + lines.map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const dec = v => String(v ?? '').replace('.', ',');
function importCatalog(text) {
  const t = readTable(text, { ref: ['ref', 'reference', 'code'], desc: ['designation', 'description', 'desc', 'libelle', 'nom'], cat: ['categorie', 'category', 'famille'], type: ['type'], unit: ['unite', 'unit'], cost: ['prixachat', 'achat', 'cost', 'cout'], price: ['prixvente', 'prix', 'price', 'pu', 'puht', 'vente'], vat: ['tva', 'vat'] });
  if (!t) return toast('Fichier vide ou illisible');
  if (t.idx.desc < 0) return alert('Colonne « designation » introuvable. En-têtes attendus : ref;designation;categorie;type;unite;prix_achat;prix_vente;tva');
  let added = 0, updated = 0;
  t.rows.forEach(r => {
    const v = k => (t.idx[k] >= 0 ? (r[t.idx[k]] || '').trim() : '');
    if (!v('desc')) return;
    const data = { ref: v('ref'), desc: v('desc'), cat: v('cat'), type: key(v('type')).startsWith('fourn') ? 'fourniture' : 'prestation', unit: v('unit') || 'u', cost: num(v('cost')), price: num(v('price')), vat: v('vat') === '' ? db.settings.defaultVat : num(v('vat')) };
    const same = db.catalog.find(c => !isPack(c) && !isMat(c) && ((data.ref && c.ref === data.ref) || (!data.ref && c.desc.toLowerCase() === data.desc.toLowerCase())));
    if (same) { Object.assign(same, data); updated++; } else { db.catalog.push({ id: uid(), fav: false, ...data }); added++; }
  });
  save(); render(); toast(`Import terminé : ${added} ajoutée(s), ${updated} mise(s) à jour`);
}
function exportCatalog() {
  const items = db.catalog.filter(c => !isPack(c) && !isMat(c));
  download('prestations.csv', [['ref', 'designation', 'categorie', 'type', 'unite', 'prix_achat', 'prix_vente', 'tva']].concat(items.map(c => [c.ref, c.desc, c.cat, c.type, c.unit, dec(num(c.cost)), dec(num(c.price)), dec(c.vat)])));
  toast('Prestations exportées (les ouvrages composés et matériaux ne sont pas inclus)');
}
function importMaterials(text) {
  const t = readTable(text, { sup: ['fournisseur', 'supplier'], ref: ['ref', 'reffournisseur', 'reference', 'code'], desc: ['designation', 'description', 'desc', 'libelle', 'nom'], cat: ['categorie', 'category', 'famille'], unit: ['unite', 'unit'], cost: ['prixachat', 'achat', 'cost', 'prix', 'pa'], markup: ['marge', 'margepourcent', 'markup'], vat: ['tva', 'vat'] });
  if (!t) return toast('Fichier vide ou illisible');
  if (t.idx.desc < 0 || t.idx.cost < 0) return alert('Colonnes « designation » et « prix_achat » obligatoires. En-têtes attendus : fournisseur;ref;designation;categorie;unite;prix_achat;marge;tva');
  let added = 0, updated = 0;
  t.rows.forEach(r => {
    const v = k => (t.idx[k] >= 0 ? (r[t.idx[k]] || '').trim() : '');
    if (!v('desc')) return;
    const name = v('sup') || 'Fournisseur importé';
    let s = sups().find(x => nrm(x.name) === nrm(name));
    if (!s) { s = { id: uid(), name, contact: '', phone: '', email: '', address: '', website: '', account: '', notes: '', markup: 0 }; sups().push(s); }
    const data = { type: 'materiau', supplierId: s.id, ref: v('ref'), desc: v('desc'), cat: v('cat'), unit: v('unit') || 'u', cost: num(v('cost')), markup: v('markup') === '' ? '' : num(v('markup')), vat: v('vat') === '' ? db.settings.defaultVat : num(v('vat')) };
    const same = db.catalog.find(c => isMat(c) && c.supplierId === s.id && ((data.ref && c.ref === data.ref) || (!data.ref && nrm(c.desc) === nrm(data.desc))));
    if (same) { Object.assign(same, data); updated++; } else { db.catalog.push({ id: uid(), fav: false, price: 0, ...data }); added++; }
  });
  save(); render(); toast(`Import terminé : ${added} matériau(x) ajouté(s), ${updated} mis à jour`);
}
function exportMaterials() {
  download('materiaux.csv', [['fournisseur', 'ref', 'designation', 'categorie', 'unite', 'prix_achat', 'marge', 'tva']].concat(db.catalog.filter(isMat).map(c => [(supplier(c.supplierId) || {}).name || '', c.ref, c.desc, c.cat, c.unit, dec(num(c.cost)), c.markup === '' || c.markup == null ? '' : dec(c.markup), dec(c.vat)])));
  toast('Matériaux exportés');
}

/* ================= SÉLECTEUR DANS UN DEVIS ================= */
function catalogPicker() {
  db.catalog.forEach(normCat);
  openModal(`<div class="modal-wide">
    <div class="row between"><h2 style="margin:0">Ajouter depuis le catalogue</h2><button class="btn small" data-act="close-modal">✕ Fermer</button></div>
    <div class="tabs" style="margin:10px 0" id="cpTabs"></div>
    <div class="row" style="margin-bottom:10px"><input id="cpSearch" class="grow" autofocus><button class="btn" data-act="cp-new" id="cpNew"></button></div>
    <div class="chips" id="cpChips" style="margin-bottom:12px"></div>
    <label class="check" style="margin-bottom:10px" id="cpDetailBox"><input type="checkbox" id="cpDetail" ${cp.detail ? 'checked' : ''}> Détailler les composants des ouvrages (une ligne par composant)</label>
    <div id="cpList"></div></div>`);
  cpRender();
}
function cpRender() {
  const mat = cp.tab === 'materiaux', q = $('#cpSearch').value || '';
  $('#cpTabs').innerHTML = [['prestations', 'Prestations & ouvrages'], ['materiaux', '🧱 Matériaux']].map(([k, l]) => `<button data-act="cp-tab" data-tab="${k}" class="${cp.tab === k ? 'on' : ''}">${l}</button>`).join('');
  $('#cpSearch').placeholder = mat ? '🔍 Rechercher un matériau (ex : gouttière 2 m 80 mm)…' : '🔍 Rechercher (parquet, peinture…)';
  $('#cpNew').textContent = mat ? '＋ Nouveau matériau' : '＋ Nouvelle prestation';
  $('#cpDetailBox').hidden = mat;
  const base = db.catalog.filter(c => !!isMat(c) === mat);
  const chips = mat ? [['', 'Tous les fournisseurs'], ...sups().map(s => [s.id, esc(s.name)])] : [['', 'Tout'], ...(base.some(c => c.fav) ? [['★', '⭐ Favoris']] : []), ...categories(false).map(c => [c, esc(c)])];
  const cur = mat ? cp.sup : cp.cat;
  $('#cpChips').innerHTML = chips.map(([v, l]) => `<button class="cchip ${cur === v ? 'on' : ''}" data-act="cp-chip" data-v="${esc(v)}">${l}</button>`).join('');
  const items = sortedCatalog(base.filter(c => (mat ? !cp.sup || c.supplierId === cp.sup : cp.cat === '★' ? c.fav : !cp.cat || c.cat === cp.cat) && fuzzy(hayOf(c), q)));
  $('#cpList').innerHTML = items.length ? items.map(c => {
    const price = itemPrice(c), sp = supplier(c.supplierId);
    return `<div class="cp-row" data-id="${c.id}"><div class="cp-info"><b>${c.fav ? '⭐ ' : ''}${c.ref ? `<span class="tag">${esc(c.ref)}</span> ` : ''}${esc(c.desc)} ${isPack(c) ? typeBadge(c) : ''}</b>
      <span class="muted">${mat && sp ? '🏪 ' + esc(sp.name) + ' · ' : ''}${money(price)} / ${esc(c.unit)}${db.company.vatExempt ? '' : ` · TVA ${String(c.vat).replace('.', ',')} %`}${mat ? ` · achat ${money(c.cost)}` : c.cat ? ' · ' + esc(c.cat) : ''}</span>
      ${isPack(c) ? `<span class="muted" style="font-size:.78rem">${partsText(c)}</span>` : ''}</div>
      <div class="cp-calc"><input type="number" class="cp-qty" step="any" min="0" value="1"><span class="muted">${esc(c.unit)}</span><b class="cp-tot">= ${money(price)}</b>
      <button class="btn small primary cp-add">＋ Ajouter</button></div></div>`;
  }).join('') : `<div class="empty">${base.length ? 'Aucun résultat.' : mat ? 'Aucun matériau. Ajoutez vos fournisseurs et leurs matériaux (Catalogue, onglet Matériaux), ou créez-en un maintenant.' : 'Votre catalogue est vide. Créez votre première prestation (ex : Pose de parquet, m², 5,00 €).'}</div>`;
}
function cpAdd(row) {
  const c = catItem(row.dataset.id), q = getQuote(editingId);
  if (!c || !q) return;
  const qty = num(row.querySelector('.cp-qty').value) || 1;
  const lines = [];
  if (isPack(c) && cp.detail) {
    lines.push({ t: 'title', desc: `${c.desc} (${fmtNum.format(qty)} ${c.unit})` });
    (c.parts || []).forEach(p => { const it = catItem(p.id); if (it) lines.push({ t: 'item', cid: it.id, ref: it.ref || '', desc: it.desc, qty: r4(qty * num(p.coef)), unit: it.unit, price: itemPrice(it), vat: it.vat }); });
  } else lines.push({ t: 'item', cid: c.id, ref: isMat(c) ? '' : c.ref || '', desc: c.desc, qty, unit: c.unit, price: r4(itemPrice(c)), vat: c.vat });
  const first = q.lines[0];
  if (q.lines.length === 1 && first.t === 'item' && !first.desc && !num(first.price)) q.lines.splice(0, 1, ...lines); else q.lines.push(...lines);
  save(); refreshLines();
  const b = row.querySelector('.cp-add'); b.textContent = '✓ Ajouté'; setTimeout(() => { b.textContent = '＋ Ajouter'; }, 1200);
  toast(`+ ${c.desc} : ${fmtNum.format(qty)} ${c.unit} = ${money(qty * itemPrice(c))}`);
}

/* ================= LISTE D'ACHAT PAR FOURNISSEUR ================= */
function purchaseData(q) {
  const by = new Map();
  const add = (it, qty) => {
    if (!it || !isMat(it) || !qty) return;
    const g = by.get(it.supplierId) || { sup: supplier(it.supplierId), items: new Map() };
    const e = g.items.get(it.id) || { it, qty: 0 }; e.qty += qty; g.items.set(it.id, e); by.set(it.supplierId, g);
  };
  q.lines.forEach(l => {
    if (l.t !== 'item' || !l.cid) return;
    const it = catItem(l.cid); if (!it) return;
    if (isPack(it)) (it.parts || []).forEach(p => add(catItem(p.id), num(l.qty) * num(p.coef))); else add(it, num(l.qty));
  });
  return [...by.values()];
}
function purchaseModal() {
  const q = getQuote(editingId); if (!q) return;
  const groups = purchaseData(q);
  let totBuy = 0, totSell = 0;
  const html = groups.map((g, gi) => {
    const rows = [...g.items.values()], buy = rows.reduce((s, r) => s + r.qty * num(r.it.cost), 0), sell = rows.reduce((s, r) => s + r.qty * itemPrice(r.it), 0);
    totBuy += buy; totSell += sell;
    const text = `Commande — ${(g.sup || {}).name || 'Fournisseur'}\nChantier : ${q.title || q.number}\n\n` + rows.map(r => `- ${fmtNum.format(r.qty)} ${r.it.unit} × ${r.it.desc}${r.it.ref ? ' (réf. ' + r.it.ref + ')' : ''}`).join('\n');
    g.text = text;
    const mail = g.sup && g.sup.email ? `mailto:${g.sup.email}?subject=${encodeURIComponent('Commande — ' + (q.title || q.number))}&body=${encodeURIComponent(text)}` : '';
    return `<div class="card" style="margin-bottom:14px"><div class="row between"><h3 style="margin:0">🏪 ${esc((g.sup || {}).name || 'Fournisseur supprimé')}</h3>
      <div class="row"><button class="btn small" data-act="pl-copy" data-i="${gi}">📋 Copier</button>${mail ? `<a class="btn small" href="${mail}">✉ E-mail</a>` : ''}</div></div>
      ${g.sup && (g.sup.phone || g.sup.contact) ? `<div class="muted" style="font-size:.85rem">${esc([g.sup.contact, g.sup.phone].filter(Boolean).join(' · '))}</div>` : ''}
      <table class="list"><thead><tr><th>Réf.</th><th>Matériau</th><th class="right">Quantité</th><th class="right">PU achat</th><th class="right">Total achat</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.it.ref)}</td><td>${esc(r.it.desc)}</td><td class="right">${fmtNum.format(r.qty)} ${esc(r.it.unit)}</td><td class="right">${money(r.it.cost)}</td><td class="right">${money(r.qty * num(r.it.cost))}</td></tr>`).join('')}
      </tbody></table><div class="right" style="margin-top:8px"><b>Total ${esc((g.sup || {}).name || '')} : ${money(buy)}</b></div></div>`;
  }).join('');
  window._pl = groups;
  openModal(`<div class="modal-wide"><div class="row between"><h2 style="margin:0">🛒 Liste d'achat — ${esc(q.opts.docLabel)} ${esc(q.number)}</h2><button class="btn small" data-act="close-modal">✕ Fermer</button></div>
    <p class="muted" style="margin:6px 0 14px">Matériaux du devis regroupés par fournisseur (issus du catalogue Matériaux). Les quantités suivent celles du devis.</p>
    ${groups.length ? html + `<div class="cp-sum">Achats matériaux : <b>${money(totBuy)}</b> · Vendus au client : <b>${money(totSell)}</b> · Marge sur matériaux : <b>${money(totSell - totBuy)}</b></div>`
    : '<div class="empty">Aucun matériau fournisseur dans ce devis.<br>Ajoutez-en via <b>Catalogue, onglet Matériaux</b>.</div>'}</div>`);
}

/* ================= ACTIONS & ÉVÉNEMENTS ================= */
Object.assign(actions, {
  'cat-tab'(t) { catUI.tab = t.dataset.tab; render(); },
  'new-item': () => itemModal(null),
  'new-pack': () => itemModal(null, null, 'ouvrage'),
  'new-mat'(t) { matModal(null, null, t && t.dataset ? t.dataset.sup : ''); },
  'new-sup': () => supplierModal(null),
  'edit-sup': t => supplierModal(t.dataset.id),
  'sup-open'(t) { catUI.tab = 'materiaux'; catUI.sup = t.dataset.id; render(); },
  'sup-filter'(t) { catUI.sup = t.dataset.sup; render(); },
  'del-sup'(t) {
    const s = supplier(t.dataset.id); if (!s) return;
    const mats = db.catalog.filter(c => c.supplierId === s.id);
    if (!confirm(`Supprimer le fournisseur « ${s.name} » ?${mats.length ? `\nSes ${mats.length} matériau(x) seront aussi supprimés.` : ''}`)) return;
    const ids = new Set(mats.map(x => x.id));
    db.catalog.filter(isPack).forEach(p => { p.parts = (p.parts || []).filter(x => !ids.has(x.id)); });
    db.catalog = db.catalog.filter(c => !ids.has(c.id)); db.suppliers = sups().filter(x => x !== s); save(); render();
  },
  'edit-item': t => itemModal(t.dataset.id),
  'dup-item'(t) { const c = catItem(t.dataset.id); if (!c) return; db.catalog.push({ ...JSON.parse(JSON.stringify(c)), id: uid(), desc: c.desc + ' (copie)', ref: c.ref ? c.ref + '-2' : '' }); save(); render(); },
  'del-item'(t) {
    const c = catItem(t.dataset.id); if (!c) return;
    const used = db.catalog.filter(x => isPack(x) && (x.parts || []).some(p => p.id === c.id));
    if (!confirm(`Supprimer « ${c.desc} » ?${used.length ? `\nIl est utilisé dans ${used.length} ouvrage(s) (${used.map(u => u.desc).join(', ')}) : il en sera retiré.` : ''}`)) return;
    used.forEach(u => { u.parts = u.parts.filter(p => p.id !== c.id); });
    db.catalog = db.catalog.filter(x => x !== c); save(); render();
  },
  'cat-fav'(t) { const c = catItem(t.dataset.id); if (c) { c.fav = !c.fav; save(); render(); } },
  'cat-filter'(t) { catUI.cat = t.dataset.cat; render(); },
  'cat-export': exportCatalog,
  'cat-import': () => $('#catFile').click(),
  'cat-demo': loadDemoCatalog,
  'mat-demo': loadDemoMaterials,
  'mat-export': exportMaterials,
  'mat-import': () => $('#matFile').click(),
  'catalog-open': () => catalogPicker(),
  'cp-new': () => (cp.tab === 'materiaux' ? matModal(null, () => catalogPicker(), cp.sup) : itemModal(null, () => catalogPicker())),
  'cp-tab'(t) { cp.tab = t.dataset.tab; cpRender(); },
  'cp-chip'(t) { if (cp.tab === 'materiaux') cp.sup = t.dataset.v; else cp.cat = t.dataset.v; cpRender(); },
  'purchase-list': purchaseModal,
  'pl-copy'(t) {
    const text = (window._pl[+t.dataset.i] || {}).text || '';
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Liste copiée'), () => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Liste copiée'); });
  },
  'line-save'(t) {
    const q = getQuote(editingId), l = q.lines[+t.closest('.line').dataset.i];
    if (!l || !String(l.desc).trim()) return toast('Renseignez d\'abord la désignation');
    const same = db.catalog.find(c => !isPack(c) && !isMat(c) && ((l.ref && c.ref === l.ref) || c.desc.trim().toLowerCase() === String(l.desc).trim().toLowerCase()));
    const data = { ref: l.ref || '', desc: String(l.desc).trim(), unit: l.unit, price: num(l.price), vat: num(l.vat) };
    if (same) { Object.assign(same, data); toast(`Prestation mise à jour dans le catalogue (${money(data.price)} / ${data.unit})`); }
    else { db.catalog.push({ id: uid(), type: 'prestation', cat: '', cost: 0, fav: false, ...data }); toast(`Enregistré dans le catalogue : ${data.desc} (${money(data.price)} / ${data.unit})`); }
    save();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'cpSearch') cpRender();
  if (t.classList.contains('cp-qty')) { const row = t.closest('.cp-row'); row.querySelector('.cp-tot').textContent = '= ' + money(num(t.value) * itemPrice(catItem(row.dataset.id))); }
  if (t.id === 'catSearch') { const q = t.value; document.querySelectorAll('#catTable tbody tr').forEach(tr => { tr.hidden = !fuzzy(tr.textContent, q); }); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'cpDetail') cp.detail = t.checked;
  if ((t.id === 'catFile' || t.id === 'matFile') && t.files[0]) {
    const r = new FileReader(), mat = t.id === 'matFile'; r.onload = () => (mat ? importMaterials : importCatalog)(String(r.result)); r.readAsText(t.files[0]); t.value = '';
  }
});
document.addEventListener('click', e => { const b = e.target.closest('.cp-add'); if (b) cpAdd(b.closest('.cp-row')); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('cp-qty')) { e.preventDefault(); cpAdd(e.target.closest('.cp-row')); } });
