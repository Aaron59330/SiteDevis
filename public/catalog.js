'use strict';
/* Catalogue complet : catégories, types (prestation / fourniture / ouvrage composé), prix d'achat et marge,
   favoris, duplication, import/export CSV, sélecteur avec quantité et total automatique. */

const ITEM_TYPES = { prestation: 'Prestation (main-d\'œuvre)', fourniture: 'Fourniture', ouvrage: 'Ouvrage composé' };
const catUI = { cat: '' };           // filtre de la page catalogue ('' = tout, '★' = favoris)
const cp = { cat: '', detail: false }; // état du sélecteur dans un devis
const r4 = x => Math.round(x * 10000) / 10000;

/* ----- calculs ----- */
const isPack = c => c.type === 'ouvrage';
const catItem = id => db.catalog.find(x => x.id === id);
function partsSum(c, key) {
  return (c.parts || []).reduce((s, p) => {
    const it = catItem(p.id);
    return s + (it ? (key === 'price' ? itemPrice(it) : itemCost(it)) * num(p.coef) : 0);
  }, 0);
}
function itemPrice(c) { return isPack(c) ? partsSum(c, 'price') : num(c.price); }
function itemCost(c) { return isPack(c) ? partsSum(c, 'cost') : num(c.cost); }
const itemMargin = c => { const k = itemCost(c); return k > 0 ? (itemPrice(c) / k - 1) * 100 : null; };
const categories = () => [...new Set(db.catalog.map(c => (c.cat || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
const sortedCatalog = list => [...list].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (a.cat || '').localeCompare(b.cat || '', 'fr') || a.desc.localeCompare(b.desc, 'fr'));
const normCat = c => { c.type = ITEM_TYPES[c.type] ? c.type : 'prestation'; c.cat = c.cat || ''; c.fav = !!c.fav; c.cost = num(c.cost); if (isPack(c)) c.parts = c.parts || []; return c; };
function openModal(html) { const m = $('#modal'); m.innerHTML = html; if (!m.open) m.showModal(); return m; }
const typeBadge = c => `<span class="badge ${c.type === 'ouvrage' ? 'info2' : c.type === 'fourniture' ? 'brouillon' : 'payee'}" style="font-size:.68rem">${c.type === 'ouvrage' ? 'Ouvrage' : c.type === 'fourniture' ? 'Fourniture' : 'Prestation'}</span>`;
const pct = v => (v == null ? '—' : fmtNum.format(v) + ' %');

/* ----- page Catalogue ----- */
EXTRA.catalog = function renderCatalog() {
  db.catalog.forEach(normCat);
  const cats = categories(), favs = db.catalog.filter(c => c.fav).length;
  const list = sortedCatalog(db.catalog.filter(c => catUI.cat === '★' ? c.fav : !catUI.cat || (c.cat || '') === catUI.cat));
  const chip = (v, label, n) => `<button class="cchip ${catUI.cat === v ? 'on' : ''}" data-act="cat-filter" data-cat="${esc(v)}">${label} <i>${n}</i></button>`;
  return `
  <div class="row between" style="margin-bottom:8px"><h1>Catalogue</h1>
    <div class="row"><button class="btn" data-act="cat-demo" title="Ajoute des prestations types à adapter">📦 Exemples</button><button class="btn" data-act="cat-export">⬇ Export CSV</button><button class="btn" data-act="cat-import">⬆ Import CSV</button>
      <button class="btn" data-act="new-pack">＋ Ouvrage composé</button><button class="btn primary" data-act="new-item">＋ Prestation</button></div></div>
  <p class="muted" style="margin-top:0">Enregistrez vos prestations avec leur <b>prix à l'unité</b> (ex : Pose de parquet — m² — 5,00 €). Dans un devis, indiquez seulement la quantité : le total se calcule tout seul.
    Un <b>ouvrage composé</b> regroupe plusieurs lignes (fourniture + pose + finitions) en un seul prix.</p>
  ${db.catalog.length ? `<div class="card">
    <div class="chips">${chip('', 'Tout', db.catalog.length)}${favs ? chip('★', '⭐ Favoris', favs) : ''}${cats.map(c => chip(c, esc(c), db.catalog.filter(x => x.cat === c).length)).join('')}</div>
    <input id="catSearch" placeholder="🔍 Rechercher une prestation, une référence…" style="max-width:380px;margin:14px 0">
    <table class="list" id="catTable">
    <thead><tr><th></th><th>Réf.</th><th>Désignation</th><th>Unité</th><th class="right">Achat HT</th><th class="right">Vente HT</th><th class="right">Marge</th><th>TVA</th><th></th></tr></thead>
    <tbody>${list.map(c => `<tr>
      <td><button class="star ${c.fav ? 'on' : ''}" data-act="cat-fav" data-id="${c.id}" title="Favori">${c.fav ? '★' : '☆'}</button></td>
      <td>${esc(c.ref)}</td>
      <td><b style="white-space:pre-line">${esc(c.desc)}</b> ${typeBadge(c)}${c.cat ? ` <span class="muted" style="font-size:.78rem">${esc(c.cat)}</span>` : ''}
        ${isPack(c) ? `<div class="muted" style="font-size:.8rem">${(c.parts || []).map(p => { const it = catItem(p.id); return it ? `${fmtNum.format(num(p.coef))} ${esc(it.unit)} ${esc(it.desc)}` : ''; }).filter(Boolean).join(' + ')}</div>` : ''}</td>
      <td>${esc(c.unit)}</td><td class="right muted">${itemCost(c) ? money(itemCost(c)) : '—'}</td>
      <td class="right"><b>${money(itemPrice(c))}</b></td><td class="right muted">${pct(itemMargin(c))}</td><td>${String(c.vat).replace('.', ',')} %</td>
      <td class="right" style="white-space:nowrap"><button class="btn small" data-act="edit-item" data-id="${c.id}">Modifier</button>
        <button class="btn small" data-act="dup-item" data-id="${c.id}" title="Dupliquer">⧉</button>
        <button class="btn small danger" data-act="del-item" data-id="${c.id}">🗑</button></td></tr>`).join('')}</tbody></table>
    ${list.length ? '' : '<div class="empty">Aucune prestation dans cette catégorie.</div>'}</div>`
  : `<div class="card empty">Votre catalogue est vide.<br><br><div class="row" style="justify-content:center"><button class="btn primary" data-act="new-item">＋ Créer ma première prestation</button>
      <button class="btn" data-act="cat-demo">📦 Charger des exemples (à adapter)</button></div></div>`}
  <input type="file" id="catFile" accept=".csv,text/csv" hidden>`;
};

/* ----- fenêtre prestation / ouvrage ----- */
function itemModal(id, after, forceType) {
  const base = catItem(id);
  const c = base ? { ...base, parts: (base.parts || []).map(p => ({ ...p })) } : { ref: '', desc: '', cat: '', type: forceType || 'prestation', unit: forceType === 'ouvrage' ? 'm²' : 'u', price: 0, cost: 0, vat: db.settings.defaultVat, fav: false, parts: [] };
  normCat(c);
  const cats = categories();
  const pickable = () => db.catalog.filter(x => !isPack(x) && x.id !== id);
  const m = openModal(`<div class="modal-wide"><form id="itemForm">
    <h2>${id ? 'Modifier' : 'Nouvelle'} ${c.type === 'ouvrage' ? 'ouvrage composé' : 'prestation'}</h2>
    <div class="grid3">
      <div class="field"><label>Type</label><select name="type" ${c.type === 'ouvrage' || id ? 'disabled' : ''}>${Object.entries(ITEM_TYPES).filter(([k]) => k !== 'ouvrage' || c.type === 'ouvrage').map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Référence</label><input name="ref" value="${esc(c.ref)}"></div>
      <div class="field"><label>Catégorie</label><input name="cat" list="catlist" value="${esc(c.cat)}" placeholder="Ex : Parquet, Peinture…"><datalist id="catlist">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
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
    const draw = () => {
      $('#parts').innerHTML = c.parts.length ? c.parts.map((p, i) => {
        const it = catItem(p.id);
        return `<div class="part" data-i="${i}"><select class="p-sel"><option value="">— choisir —</option>${pickable().map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.ref ? x.ref + ' – ' : '')}${esc(x.desc)} (${money(itemPrice(x))}/${esc(x.unit)})</option>`).join('')}</select>
          <input class="p-coef" type="number" step="any" min="0" value="${p.coef}"><span class="muted">${it ? esc(it.unit) : ''}</span>
          <b class="p-tot">${it ? money(itemPrice(it) * num(p.coef)) : '—'}</b><button type="button" class="btn small icon danger p-del">✕</button></div>`;
      }).join('') : '<p class="muted">Ajoutez les fournitures et prestations qui composent cet ouvrage.</p>';
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

/* ----- exemples ----- */
const DEMO_CATALOG = [
  ['PLA-CLO', 'Cloison de distribution BA13 sur ossature métallique', 'Plâtrerie', 'prestation', 'm²', 14, 0, 20],
  ['PLA-DBL', 'Doublage BA13 sur ossature, isolation comprise', 'Plâtrerie', 'prestation', 'm²', 16, 0, 20],
  ['PLA-PLF', 'Plafond BA13 sur ossature', 'Plâtrerie', 'prestation', 'm²', 18, 0, 20],
  ['PLA-BA13', 'Plaque de plâtre BA13', 'Plâtrerie', 'fourniture', 'pièce(s)', 8.79, 6.2, 20],
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

/* ----- import / export CSV ----- */
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
const stripAcc = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function importCatalog(text) {
  const rows = csvParse(text.replace(/^﻿/, ''));
  if (rows.length < 2) return toast('Fichier vide ou illisible');
  const map = { ref: ['ref', 'reference', 'code'], desc: ['designation', 'description', 'desc', 'libelle', 'nom'], cat: ['categorie', 'category', 'famille'], type: ['type'], unit: ['unite', 'unit'], cost: ['prixachat', 'achat', 'cost', 'cout'], price: ['prixvente', 'prix', 'price', 'pu', 'puht', 'vente'], vat: ['tva', 'vat'] };
  const head = rows[0].map(stripAcc), idx = {};
  for (const [k, names] of Object.entries(map)) idx[k] = head.findIndex(h => names.includes(h));
  if (idx.desc < 0) return alert('Colonne « designation » introuvable. En-têtes attendus : ref;designation;categorie;type;unite;prix_achat;prix_vente;tva');
  let added = 0, updated = 0;
  rows.slice(1).forEach(r => {
    const v = k => (idx[k] >= 0 ? (r[idx[k]] || '').trim() : '');
    if (!v('desc')) return;
    const data = { ref: v('ref'), desc: v('desc'), cat: v('cat'), type: stripAcc(v('type')).startsWith('fourn') ? 'fourniture' : 'prestation', unit: v('unit') || 'u', cost: num(v('cost')), price: num(v('price')), vat: v('vat') === '' ? db.settings.defaultVat : num(v('vat')) };
    const same = db.catalog.find(c => !isPack(c) && ((data.ref && c.ref === data.ref) || (!data.ref && c.desc.toLowerCase() === data.desc.toLowerCase())));
    if (same) { Object.assign(same, data); updated++; } else { db.catalog.push({ id: uid(), fav: false, ...data }); added++; }
  });
  save(); render(); toast(`Import terminé : ${added} ajoutée(s), ${updated} mise(s) à jour`);
}
function exportCatalog() {
  const items = db.catalog.filter(c => !isPack(c));
  const lines = [['ref', 'designation', 'categorie', 'type', 'unite', 'prix_achat', 'prix_vente', 'tva']].concat(items.map(c => [c.ref, c.desc, c.cat, c.type, c.unit, String(num(c.cost)).replace('.', ','), String(num(c.price)).replace('.', ','), String(c.vat).replace('.', ',')]));
  const blob = new Blob(['﻿' + lines.map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'catalogue.csv'; a.click(); URL.revokeObjectURL(a.href);
  toast(db.catalog.some(isPack) ? 'Export terminé (les ouvrages composés ne sont pas inclus)' : 'Catalogue exporté');
}

/* ----- sélecteur dans un devis ----- */
function catalogPicker() {
  db.catalog.forEach(normCat);
  openModal(`<div class="modal-wide">
    <div class="row between"><h2 style="margin:0">Ajouter depuis le catalogue</h2><button class="btn small" data-act="close-modal">✕ Fermer</button></div>
    <p class="muted" style="margin:6px 0 12px">Indiquez la quantité (m², heures…) : le total est calculé automatiquement. Les lignes s'ajoutent au devis sans fermer cette fenêtre.</p>
    <div class="row" style="margin-bottom:10px"><input id="cpSearch" class="grow" placeholder="🔍 Rechercher (parquet, peinture…)" autofocus>
      <button class="btn" data-act="cp-new">＋ Nouvelle prestation</button></div>
    <div class="chips" id="cpChips" style="margin-bottom:12px"></div>
    <label class="check" style="margin-bottom:10px"><input type="checkbox" id="cpDetail" ${cp.detail ? 'checked' : ''}> Détailler les composants des ouvrages (une ligne par composant)</label>
    <div id="cpList"></div></div>`);
  cpRender();
}
function cpRender() {
  const q = ($('#cpSearch').value || '').toLowerCase(), cats = categories();
  $('#cpChips').innerHTML = [['', 'Tout'], ...(db.catalog.some(c => c.fav) ? [['★', '⭐ Favoris']] : []), ...cats.map(c => [c, esc(c)])]
    .map(([v, l]) => `<button class="cchip ${cp.cat === v ? 'on' : ''}" data-act="cp-cat" data-cat="${esc(v)}">${l}</button>`).join('');
  const items = sortedCatalog(db.catalog.filter(c => (cp.cat === '★' ? c.fav : !cp.cat || c.cat === cp.cat) && `${c.ref} ${c.desc} ${c.cat}`.toLowerCase().includes(q)));
  $('#cpList').innerHTML = items.length ? items.map(c => {
    const price = itemPrice(c);
    return `<div class="cp-row" data-id="${c.id}"><div class="cp-info"><b>${c.fav ? '⭐ ' : ''}${c.ref ? `<span class="tag">${esc(c.ref)}</span> ` : ''}${esc(c.desc)} ${isPack(c) ? typeBadge(c) : ''}</b>
      <span class="muted">${money(price)} / ${esc(c.unit)}${db.company.vatExempt ? '' : ` · TVA ${String(c.vat).replace('.', ',')} %`}${c.cat ? ' · ' + esc(c.cat) : ''}</span>
      ${isPack(c) ? `<span class="muted" style="font-size:.78rem">${(c.parts || []).map(p => { const it = catItem(p.id); return it ? `${fmtNum.format(num(p.coef))} ${esc(it.unit)} ${esc(it.desc)}` : ''; }).filter(Boolean).join(' + ')}</span>` : ''}</div>
      <div class="cp-calc"><input type="number" class="cp-qty" step="any" min="0" value="1"><span class="muted">${esc(c.unit)}</span><b class="cp-tot">= ${money(price)}</b>
      <button class="btn small primary cp-add">＋ Ajouter</button></div></div>`;
  }).join('') : `<div class="empty">${db.catalog.length ? 'Aucun résultat.' : 'Votre catalogue est vide. Créez votre première prestation (ex : Pose de parquet, m², 5,00 €).'}</div>`;
}
function cpAdd(row) {
  const c = catItem(row.dataset.id), q = getQuote(editingId);
  if (!c || !q) return;
  const qty = num(row.querySelector('.cp-qty').value) || 1;
  const lines = [];
  if (isPack(c) && cp.detail) {
    lines.push({ t: 'title', desc: `${c.desc} (${fmtNum.format(qty)} ${c.unit})` });
    (c.parts || []).forEach(p => { const it = catItem(p.id); if (it) lines.push({ t: 'item', ref: it.ref || '', desc: it.desc, qty: r4(qty * num(p.coef)), unit: it.unit, price: itemPrice(it), vat: it.vat }); });
  } else lines.push({ t: 'item', ref: c.ref || '', desc: c.desc, qty, unit: c.unit, price: r4(itemPrice(c)), vat: c.vat });
  const first = q.lines[0];
  if (q.lines.length === 1 && first.t === 'item' && !first.desc && !num(first.price)) q.lines.splice(0, 1, ...lines); else q.lines.push(...lines);
  save(); refreshLines();
  const b = row.querySelector('.cp-add'); b.textContent = '✓ Ajouté'; setTimeout(() => { b.textContent = '＋ Ajouter'; }, 1200);
  toast(`+ ${c.desc} : ${fmtNum.format(qty)} ${c.unit} = ${money(qty * itemPrice(c))}`);
}

/* ----- actions & événements ----- */
Object.assign(actions, {
  'new-item': () => itemModal(null),
  'new-pack': () => itemModal(null, null, 'ouvrage'),
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
  'catalog-open': () => catalogPicker(),
  'cp-new': () => itemModal(null, () => catalogPicker()),
  'cp-cat'(t) { cp.cat = t.dataset.cat; cpRender(); },
  'line-save'(t) {
    const q = getQuote(editingId), l = q.lines[+t.closest('.line').dataset.i];
    if (!l || !String(l.desc).trim()) return toast('Renseignez d\'abord la désignation');
    const same = db.catalog.find(c => !isPack(c) && ((l.ref && c.ref === l.ref) || c.desc.trim().toLowerCase() === String(l.desc).trim().toLowerCase()));
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
  if (t.id === 'catSearch') { const q = t.value.toLowerCase(); document.querySelectorAll('#catTable tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); }); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'cpDetail') cp.detail = e.target.checked;
  if (e.target.id === 'catFile' && e.target.files[0]) {
    const r = new FileReader(); r.onload = () => importCatalog(String(r.result)); r.readAsText(e.target.files[0]); e.target.value = '';
  }
});
document.addEventListener('click', e => { const b = e.target.closest('.cp-add'); if (b) cpAdd(b.closest('.cp-row')); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('cp-qty')) { e.preventDefault(); cpAdd(e.target.closest('.cp-row')); } });
