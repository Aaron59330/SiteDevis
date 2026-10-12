'use strict';

/* ---------- Données ---------- */
const KEY = 'sitedevis.v1';
const STATUS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé' };
const UNITS = ['u', 'h', 'jour', 'forfait', 'm²', 'm', 'kg', 'mois'];
const VATS = [0, 5.5, 10, 20];

const defaults = () => ({
  company: { name: '', address: '', email: '', phone: '', siret: '', vatNumber: '', iban: '', logo: '', vatExempt: false, footer: '' },
  settings: { prefix: 'DEV', next: 1, defaultVat: 20, validityDays: 30, defaultDeposit: 30,
    defaultConditions: 'Paiement à 30 jours à réception de facture.\nDevis valable pendant la durée indiquée ci-dessus.' },
  clients: [],
  catalog: [],
  quotes: []
});

let db = load();
let view = 'quotes';
let editingId = null;
let filter = { q: '', status: '' };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) {
      const d = defaults();
      return { ...d, ...raw, company: { ...d.company, ...raw.company }, settings: { ...d.settings, ...raw.settings } };
    }
  } catch (e) { /* ignore */ }
  return defaults();
}
let saveTimer;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Stockage plein : exportez une sauvegarde'); return; }
  const el = document.getElementById('saved');
  el.textContent = '✓ Enregistré automatiquement';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { el.textContent = ''; }, 1800);
}

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, d) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
const fdate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '';
const getClient = id => db.clients.find(c => c.id === id);
const getQuote = id => db.quotes.find(q => q.id === id);
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

function nextNumber() {
  const y = new Date().getFullYear();
  const { prefix, next } = db.settings;
  return `${prefix}-${y}-${String(next).padStart(3, '0')}`;
}

function totals(q) {
  const exempt = db.company.vatExempt;
  const lines = q.lines.map(l => ({ ...l, total: num(l.qty) * num(l.price) }));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const discountAmt = subtotal * num(q.discount) / 100;
  const ratio = subtotal ? (subtotal - discountAmt) / subtotal : 1;
  const byRate = {};
  lines.forEach(l => {
    const r = exempt ? 0 : num(l.vat);
    byRate[r] = (byRate[r] || 0) + l.total * ratio * r / 100;
  });
  const ht = subtotal - discountAmt;
  const vat = Object.values(byRate).reduce((s, v) => s + v, 0);
  const ttc = ht + vat;
  const deposit = ttc * num(q.deposit) / 100;
  return { lines, subtotal, discountAmt, ht, vat, byRate, ttc, deposit };
}

/* ---------- Rendu principal ---------- */
function render() {
  document.querySelectorAll('#nav button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view || (view === 'editor' && b.dataset.view === 'quotes')));
  const app = $('#app');
  if (view === 'quotes') app.innerHTML = renderQuotes();
  else if (view === 'editor') app.innerHTML = renderEditor();
  else if (view === 'clients') app.innerHTML = renderClients();
  else if (view === 'catalog') app.innerHTML = renderCatalog();
  else if (view === 'company') app.innerHTML = renderCompany();
  window.scrollTo(0, 0);
}
function go(v, id = null) { view = v; editingId = id; render(); }

/* ---------- Liste des devis ---------- */
function renderQuotes() {
  const all = db.quotes;
  const sum = st => all.filter(q => q.status === st).reduce((s, q) => s + totals(q).ttc, 0);
  const list = all.filter(q => {
    const c = getClient(q.clientId);
    const hay = `${q.number} ${q.title} ${c ? c.name : ''}`.toLowerCase();
    return (!filter.q || hay.includes(filter.q.toLowerCase())) && (!filter.status || q.status === filter.status);
  }).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));

  return `
  <div class="row between" style="margin-bottom:16px">
    <h1>Mes devis</h1>
    <button class="btn primary" data-act="new-quote">＋ Nouveau devis</button>
  </div>
  ${!db.company.name ? `<div class="card" style="border-color:#fbbf24;background:#fffbeb">👋 Commencez par renseigner <a href="#" data-act="goto-company">votre entreprise</a> : son nom et ses coordonnées apparaîtront sur vos devis.</div>` : ''}
  <div class="stats">
    <div class="stat"><div class="n">${all.length}</div><div class="l">Devis au total</div></div>
    <div class="stat"><div class="n">${money(sum('envoye'))}</div><div class="l">En attente de réponse</div></div>
    <div class="stat"><div class="n">${money(sum('accepte'))}</div><div class="l">Acceptés</div></div>
    <div class="stat"><div class="n">${all.length ? Math.round(all.filter(q => q.status === 'accepte').length / all.length * 100) : 0} %</div><div class="l">Taux d'acceptation</div></div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:12px">
      <input class="grow" id="search" placeholder="🔍 Rechercher (numéro, client, objet)…" value="${esc(filter.q)}" style="max-width:360px">
      <select id="statusFilter" style="width:180px">
        <option value="">Tous les statuts</option>
        ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${filter.status === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    ${list.length ? `<table class="list">
      <thead><tr><th>Numéro</th><th>Client</th><th>Objet</th><th>Date</th><th>Statut</th><th class="right">Total TTC</th><th></th></tr></thead>
      <tbody>${list.map(q => {
        const c = getClient(q.clientId);
        return `<tr>
          <td><a href="#" data-act="edit" data-id="${q.id}"><b>${esc(q.number)}</b></a></td>
          <td>${esc(c ? c.name : '—')}</td>
          <td>${esc(q.title)}</td>
          <td>${fdate(q.date)}</td>
          <td><span class="badge ${q.status}">${STATUS[q.status]}</span></td>
          <td class="right"><b>${money(totals(q).ttc)}</b></td>
          <td class="right" style="white-space:nowrap">
            <button class="btn small" data-act="edit" data-id="${q.id}">Ouvrir</button>
            <button class="btn small" data-act="dup" data-id="${q.id}" title="Dupliquer">⧉</button>
            <button class="btn small danger" data-act="del-quote" data-id="${q.id}" title="Supprimer">🗑</button>
          </td></tr>`;
      }).join('')}</tbody></table>`
      : `<div class="empty">${all.length ? 'Aucun devis ne correspond.' : 'Aucun devis pour le moment.<br><br><button class="btn primary" data-act="new-quote">Créer mon premier devis</button>'}</div>`}
  </div>
  <div class="card">
    <h2>Sauvegarde</h2>
    <p class="muted">Vos données sont enregistrées dans ce navigateur, sur cet ordinateur. Pensez à exporter une sauvegarde de temps en temps.</p>
    <div class="row">
      <button class="btn" data-act="export">⬇ Exporter une sauvegarde</button>
      <button class="btn" data-act="import">⬆ Importer une sauvegarde</button>
    </div>
  </div>`;
}

/* ---------- Éditeur de devis ---------- */
function renderEditor() {
  const q = getQuote(editingId);
  if (!q) return renderQuotes();
  return `
  <div class="row between no-print" style="margin-bottom:16px">
    <div class="row"><button class="btn" data-act="back">← Retour</button><h1 style="margin:0">Devis ${esc(q.number)}</h1></div>
    <div class="row">
      <button class="btn" data-act="dup" data-id="${q.id}">⧉ Dupliquer</button>
      <button class="btn primary" data-act="print">🖨 Imprimer / Enregistrer en PDF</button>
    </div>
  </div>
  <div class="editor">
    <div class="form no-print">
      <div class="card">
        <h2>Informations</h2>
        <div class="grid3">
          <div class="field"><label>Numéro</label><input data-f="number" value="${esc(q.number)}"></div>
          <div class="field"><label>Date</label><input type="date" data-f="date" value="${q.date}"></div>
          <div class="field"><label>Valable jusqu'au</label><input type="date" data-f="validUntil" value="${q.validUntil}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Client</label>
            <div class="row" style="flex-wrap:nowrap">
              <select data-f="clientId" id="clientSel">${clientOptions(q.clientId)}</select>
              <button class="btn" data-act="new-client-inline" title="Nouveau client">＋</button>
            </div></div>
          <div class="field"><label>Statut</label>
            <select data-f="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Objet du devis</label><input data-f="title" value="${esc(q.title)}" placeholder="Ex : Rénovation de la salle de bain"></div>
      </div>

      <div class="card ${db.company.vatExempt ? 'novat' : ''}" id="linesCard">
        <div class="row between"><h2>Prestations</h2>
          ${db.catalog.length ? `<select id="catalogPick" style="width:auto;max-width:260px"><option value="">+ Ajouter depuis le catalogue…</option>${db.catalog.map(c => `<option value="${c.id}">${esc(c.desc)} — ${money(c.price)}</option>`).join('')}</select>` : ''}
        </div>
        <table class="lines">
          <thead><tr><th class="c-desc">Description</th><th class="c-num">Qté</th><th class="c-num">Unité</th><th class="c-num">Prix HT</th><th class="c-num c-vat">TVA</th><th class="c-tot">Total HT</th><th></th></tr></thead>
          <tbody id="linesBody">${q.lines.map((l, i) => lineRow(l, i, q.lines.length)).join('')}</tbody>
        </table>
        <div style="margin-top:10px"><button class="btn" data-act="add-line">＋ Ajouter une ligne</button></div>
      </div>

      <div class="card">
        <h2>Remise &amp; acompte</h2>
        <div class="grid2">
          <div class="field"><label>Remise globale (%)</label><input type="number" min="0" max="100" step="0.5" data-f="discount" value="${q.discount}"></div>
          <div class="field"><label>Acompte demandé (%)</label><input type="number" min="0" max="100" step="5" data-f="deposit" value="${q.deposit}"></div>
        </div>
        <h2 style="margin-top:8px">Notes &amp; conditions</h2>
        <div class="field"><label>Notes (visibles sur le devis)</label><textarea data-f="notes" placeholder="Précisions, délais, matériel fourni…">${esc(q.notes)}</textarea></div>
        <div class="field"><label>Conditions</label><textarea data-f="conditions">${esc(q.conditions)}</textarea></div>
      </div>
    </div>
    <div class="preview-wrap"><div class="doc" id="doc">${renderDoc(q)}</div></div>
  </div>`;
}

function clientOptions(sel) {
  return `<option value="">— Choisir un client —</option>` +
    db.clients.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function lineRow(l, i, n) {
  const total = num(l.qty) * num(l.price);
  return `<tr data-i="${i}">
    <td class="c-desc"><textarea rows="1" data-l="desc" style="min-height:34px" placeholder="Description">${esc(l.desc)}</textarea></td>
    <td class="c-num"><input type="number" step="any" min="0" data-l="qty" value="${l.qty}"></td>
    <td class="c-num"><input data-l="unit" list="units" value="${esc(l.unit)}"></td>
    <td class="c-num"><input type="number" step="any" min="0" data-l="price" value="${l.price}"></td>
    <td class="c-num c-vat"><select data-l="vat">${VATS.map(v => `<option value="${v}" ${num(l.vat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></td>
    <td class="c-tot" data-total>${money(total)}</td>
    <td class="c-act">
      <button class="btn small icon" data-act="line-up" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
      <button class="btn small icon" data-act="line-down" ${i === n - 1 ? 'disabled' : ''} title="Descendre">↓</button>
      <button class="btn small icon danger" data-act="line-del" title="Supprimer">✕</button>
    </td></tr>`;
}

function renderDoc(q) {
  const co = db.company, c = getClient(q.clientId) || {};
  const t = totals(q);
  const exempt = co.vatExempt;
  const lines = t.lines.filter(l => l.desc || l.total);
  const legal = [
    co.siret && `SIRET : ${co.siret}`,
    co.vatNumber && !exempt && `N° TVA : ${co.vatNumber}`,
    exempt && 'TVA non applicable, art. 293 B du CGI',
    co.iban && `IBAN : ${co.iban}`,
    co.footer
  ].filter(Boolean).join('\n');
  return `
  <div class="head">
    <div>
      ${co.logo ? `<img class="logo" src="${co.logo}" alt="">` : ''}
      <div class="co-name">${esc(co.name || 'Votre entreprise')}</div>
      <div style="white-space:pre-line">${esc(co.address)}</div>
      ${co.phone ? `<div>Tél : ${esc(co.phone)}</div>` : ''}${co.email ? `<div>${esc(co.email)}</div>` : ''}
    </div>
    <div class="title"><h1>DEVIS</h1>
      <div><b>N° ${esc(q.number)}</b></div>
      <div>Date : ${fdate(q.date)}</div>
      ${q.validUntil ? `<div>Valable jusqu'au : ${fdate(q.validUntil)}</div>` : ''}
    </div>
  </div>
  <div class="parties"><div></div>
    <div class="box"><div class="lbl">Client</div>
      <b>${esc(c.name || '—')}</b>
      <div style="white-space:pre-line">${esc(c.address || '')}</div>
      ${c.email ? `<div>${esc(c.email)}</div>` : ''}${c.phone ? `<div>${esc(c.phone)}</div>` : ''}
    </div>
  </div>
  ${q.title ? `<div class="subject">Objet : ${esc(q.title)}</div>` : ''}
  <table class="items">
    <thead><tr><th>Description</th><th class="r">Qté</th><th>Unité</th><th class="r">PU HT</th>${exempt ? '' : '<th class="r">TVA</th>'}<th class="r">Total HT</th></tr></thead>
    <tbody>${lines.length ? lines.map(l => `<tr>
      <td>${esc(l.desc)}</td><td class="r">${num(l.qty).toLocaleString('fr-FR')}</td><td>${esc(l.unit)}</td>
      <td class="r">${money(num(l.price))}</td>${exempt ? '' : `<td class="r">${String(num(l.vat)).replace('.', ',')} %</td>`}
      <td class="r">${money(l.total)}</td></tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;color:#999">Aucune prestation</td></tr>`}</tbody>
  </table>
  <table class="totals">
    ${t.discountAmt ? `<tr><td>Sous-total HT</td><td class="r">${money(t.subtotal)}</td></tr>
    <tr><td>Remise (${num(q.discount)} %)</td><td class="r">− ${money(t.discountAmt)}</td></tr>` : ''}
    <tr><td>Total HT</td><td class="r">${money(t.ht)}</td></tr>
    ${exempt ? '' : Object.entries(t.byRate).filter(([r]) => num(r) > 0).map(([r, v]) => `<tr><td>TVA ${String(r).replace('.', ',')} %</td><td class="r">${money(v)}</td></tr>`).join('')}
    <tr class="grand"><td>Total ${exempt ? 'net à payer' : 'TTC'}</td><td class="r">${money(t.ttc)}</td></tr>
    ${t.deposit ? `<tr><td>Acompte à la commande (${num(q.deposit)} %)</td><td class="r">${money(t.deposit)}</td></tr>
    <tr><td>Solde restant</td><td class="r">${money(t.ttc - t.deposit)}</td></tr>` : ''}
  </table>
  ${q.notes ? `<div class="notes"><b>Notes</b><br>${esc(q.notes)}</div>` : ''}
  ${q.conditions ? `<div class="notes"><b>Conditions</b><br>${esc(q.conditions)}</div>` : ''}
  <div class="sign">
    <div><b>Le prestataire</b><br><span class="muted">Date et signature</span></div>
    <div><b>Bon pour accord</b><br><span class="muted">Date, signature précédée de la mention « Bon pour accord »</span></div>
  </div>
  ${legal ? `<div class="foot">${esc(legal)}</div>` : ''}`;
}

function refreshPreview() {
  const q = getQuote(editingId); if (!q) return;
  $('#doc').innerHTML = renderDoc(q);
  document.querySelectorAll('#linesBody tr').forEach(tr => {
    const l = q.lines[tr.dataset.i];
    if (l) tr.querySelector('[data-total]').textContent = money(num(l.qty) * num(l.price));
  });
}
function refreshLines() {
  const q = getQuote(editingId);
  $('#linesBody').innerHTML = q.lines.map((l, i) => lineRow(l, i, q.lines.length)).join('');
  refreshPreview();
}

/* ---------- Clients ---------- */
function renderClients() {
  return `
  <div class="row between" style="margin-bottom:16px"><h1>Clients</h1><button class="btn primary" data-act="new-client">＋ Nouveau client</button></div>
  <div class="card">${db.clients.length ? `<table class="list">
    <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Devis</th><th></th></tr></thead>
    <tbody>${db.clients.map(c => `<tr>
      <td><b>${esc(c.name)}</b><div class="muted" style="white-space:pre-line">${esc(c.address)}</div></td>
      <td>${esc(c.email)}</td><td>${esc(c.phone)}</td>
      <td>${db.quotes.filter(q => q.clientId === c.id).length}</td>
      <td class="right"><button class="btn small" data-act="edit-client" data-id="${c.id}">Modifier</button>
      <button class="btn small danger" data-act="del-client" data-id="${c.id}">🗑</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">Aucun client enregistré.</div>`}</div>`;
}

function clientModal(id, afterSave) {
  const c = db.clients.find(x => x.id === id) || { name: '', address: '', email: '', phone: '' };
  const m = $('#modal');
  m.innerHTML = `<form method="dialog" id="clientForm">
    <h2>${id ? 'Modifier le client' : 'Nouveau client'}</h2>
    <div class="field"><label>Nom / société *</label><input name="name" required value="${esc(c.name)}"></div>
    <div class="field"><label>Adresse</label><textarea name="address">${esc(c.address)}</textarea></div>
    <div class="grid2">
      <div class="field"><label>Email</label><input name="email" type="email" value="${esc(c.email)}"></div>
      <div class="field"><label>Téléphone</label><input name="phone" value="${esc(c.phone)}"></div>
    </div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div>
  </form>`;
  m.showModal();
  $('#clientForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { name: f.get('name').trim(), address: f.get('address'), email: f.get('email'), phone: f.get('phone') };
    let cl = db.clients.find(x => x.id === id);
    if (cl) Object.assign(cl, data); else { cl = { id: uid(), ...data }; db.clients.push(cl); }
    db.clients.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    save(); m.close(); afterSave && afterSave(cl);
  };
}

/* ---------- Catalogue ---------- */
function renderCatalog() {
  return `
  <div class="row between" style="margin-bottom:16px"><h1>Catalogue de prestations</h1><button class="btn primary" data-act="new-item">＋ Nouvelle prestation</button></div>
  <p class="muted">Enregistrez vos prestations habituelles pour les ajouter en un clic dans un devis.</p>
  <div class="card">${db.catalog.length ? `<table class="list">
    <thead><tr><th>Description</th><th>Unité</th><th class="right">Prix HT</th><th>TVA</th><th></th></tr></thead>
    <tbody>${db.catalog.map(c => `<tr><td>${esc(c.desc)}</td><td>${esc(c.unit)}</td><td class="right">${money(c.price)}</td><td>${String(c.vat).replace('.', ',')} %</td>
      <td class="right"><button class="btn small" data-act="edit-item" data-id="${c.id}">Modifier</button>
      <button class="btn small danger" data-act="del-item" data-id="${c.id}">🗑</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">Le catalogue est vide.</div>`}</div>`;
}

function itemModal(id) {
  const c = db.catalog.find(x => x.id === id) || { desc: '', unit: 'u', price: 0, vat: db.settings.defaultVat };
  const m = $('#modal');
  m.innerHTML = `<form method="dialog" id="itemForm">
    <h2>${id ? 'Modifier la prestation' : 'Nouvelle prestation'}</h2>
    <div class="field"><label>Description *</label><input name="desc" required value="${esc(c.desc)}"></div>
    <div class="grid3">
      <div class="field"><label>Unité</label><input name="unit" list="units" value="${esc(c.unit)}"></div>
      <div class="field"><label>Prix HT</label><input name="price" type="number" step="any" min="0" value="${c.price}"></div>
      <div class="field"><label>TVA</label><select name="vat">${VATS.map(v => `<option value="${v}" ${num(c.vat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></div>
    </div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div>
  </form>`;
  m.showModal();
  $('#itemForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { desc: f.get('desc').trim(), unit: f.get('unit'), price: num(f.get('price')), vat: num(f.get('vat')) };
    const it = db.catalog.find(x => x.id === id);
    if (it) Object.assign(it, data); else db.catalog.push({ id: uid(), ...data });
    save(); m.close(); render();
  };
}

/* ---------- Mon entreprise ---------- */
function renderCompany() {
  const co = db.company, s = db.settings;
  return `
  <h1>Mon entreprise</h1>
  <div class="editor" style="grid-template-columns:1fr 1fr">
    <div>
      <div class="card"><h2>Coordonnées</h2>
        <div class="field"><label>Nom de l'entreprise</label><input data-c="name" value="${esc(co.name)}"></div>
        <div class="field"><label>Adresse</label><textarea data-c="address">${esc(co.address)}</textarea></div>
        <div class="grid2">
          <div class="field"><label>Email</label><input data-c="email" value="${esc(co.email)}"></div>
          <div class="field"><label>Téléphone</label><input data-c="phone" value="${esc(co.phone)}"></div>
          <div class="field"><label>SIRET</label><input data-c="siret" value="${esc(co.siret)}"></div>
          <div class="field"><label>N° TVA intracommunautaire</label><input data-c="vatNumber" value="${esc(co.vatNumber)}"></div>
        </div>
        <div class="field"><label>IBAN (affiché en bas du devis)</label><input data-c="iban" value="${esc(co.iban)}"></div>
        <div class="field"><label>Mention de pied de page (assurance, forme juridique…)</label><textarea data-c="footer">${esc(co.footer)}</textarea></div>
        <div class="field"><label><input type="checkbox" data-c="vatExempt" ${co.vatExempt ? 'checked' : ''} style="width:auto"> Non assujetti à la TVA (micro-entreprise, art. 293 B du CGI)</label></div>
      </div>
    </div>
    <div>
      <div class="card"><h2>Logo</h2>
        ${co.logo ? `<img class="logo-prev" src="${co.logo}" alt="">` : '<p class="muted">Aucun logo</p>'}
        <div class="row"><input type="file" id="logoFile" accept="image/*" style="max-width:260px">${co.logo ? '<button class="btn danger" data-act="rm-logo">Retirer</button>' : ''}</div>
      </div>
      <div class="card"><h2>Réglages des devis</h2>
        <div class="grid2">
          <div class="field"><label>Préfixe de numérotation</label><input data-s="prefix" value="${esc(s.prefix)}"></div>
          <div class="field"><label>Prochain numéro</label><input type="number" min="1" data-s="next" value="${s.next}"></div>
          <div class="field"><label>Validité par défaut (jours)</label><input type="number" min="1" data-s="validityDays" value="${s.validityDays}"></div>
          <div class="field"><label>Acompte par défaut (%)</label><input type="number" min="0" max="100" data-s="defaultDeposit" value="${s.defaultDeposit}"></div>
          <div class="field"><label>TVA par défaut</label><select data-s="defaultVat">${VATS.map(v => `<option value="${v}" ${num(s.defaultVat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Conditions par défaut</label><textarea data-s="defaultConditions">${esc(s.defaultConditions)}</textarea></div>
      </div>
    </div>
  </div>`;
}

/* ---------- Actions ---------- */
function newQuote() {
  const date = today();
  const q = {
    id: uid(), number: nextNumber(), date, validUntil: addDays(date, num(db.settings.validityDays)),
    clientId: '', title: '', status: 'brouillon',
    lines: [{ desc: '', qty: 1, unit: 'u', price: 0, vat: db.settings.defaultVat }],
    discount: 0, deposit: num(db.settings.defaultDeposit), notes: '', conditions: db.settings.defaultConditions
  };
  db.settings.next = num(db.settings.next) + 1;
  db.quotes.push(q); save(); go('editor', q.id);
}

const actions = {
  'new-quote': newQuote,
  'goto-company': () => go('company'),
  edit: t => go('editor', t.dataset.id),
  back: () => go('quotes'),
  print: () => window.print(),
  dup(t) {
    const src = getQuote(t.dataset.id); if (!src) return;
    const q = JSON.parse(JSON.stringify(src));
    q.id = uid(); q.number = nextNumber(); q.date = today(); q.status = 'brouillon';
    q.validUntil = addDays(q.date, num(db.settings.validityDays));
    db.settings.next = num(db.settings.next) + 1;
    db.quotes.push(q); save(); toast('Devis dupliqué'); go('editor', q.id);
  },
  'del-quote'(t) {
    const q = getQuote(t.dataset.id);
    if (q && confirm(`Supprimer le devis ${q.number} ?`)) { db.quotes = db.quotes.filter(x => x !== q); save(); render(); }
  },
  'add-line'() {
    const q = getQuote(editingId);
    q.lines.push({ desc: '', qty: 1, unit: 'u', price: 0, vat: db.settings.defaultVat });
    save(); refreshLines();
  },
  'line-del'(t) {
    const q = getQuote(editingId), i = +t.closest('tr').dataset.i;
    q.lines.splice(i, 1);
    if (!q.lines.length) q.lines.push({ desc: '', qty: 1, unit: 'u', price: 0, vat: db.settings.defaultVat });
    save(); refreshLines();
  },
  'line-up'(t) { moveLine(+t.closest('tr').dataset.i, -1); },
  'line-down'(t) { moveLine(+t.closest('tr').dataset.i, 1); },
  'new-client': () => clientModal(null, () => render()),
  'new-client-inline': () => clientModal(null, cl => {
    getQuote(editingId).clientId = cl.id; save();
    $('#clientSel').innerHTML = clientOptions(cl.id); refreshPreview();
  }),
  'edit-client': t => clientModal(t.dataset.id, () => render()),
  'del-client'(t) {
    const c = getClient(t.dataset.id);
    const used = db.quotes.filter(q => q.clientId === c.id).length;
    if (confirm(`Supprimer ${c.name} ?${used ? `\n${used} devis lui sont rattachés (ils resteront sans client).` : ''}`)) {
      db.quotes.forEach(q => { if (q.clientId === c.id) q.clientId = ''; });
      db.clients = db.clients.filter(x => x !== c); save(); render();
    }
  },
  'new-item': () => itemModal(null),
  'edit-item': t => itemModal(t.dataset.id),
  'del-item'(t) { if (confirm('Supprimer cette prestation ?')) { db.catalog = db.catalog.filter(x => x.id !== t.dataset.id); save(); render(); } },
  'close-modal': () => $('#modal').close(),
  'rm-logo'() { db.company.logo = ''; save(); render(); },
  export() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sauvegarde-devis-${today()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  },
  import: () => $('#fileImport').click()
};

function moveLine(i, d) {
  const q = getQuote(editingId), j = i + d;
  if (j < 0 || j >= q.lines.length) return;
  [q.lines[i], q.lines[j]] = [q.lines[j], q.lines[i]];
  save(); refreshLines();
}

/* ---------- Événements ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (t && actions[t.dataset.act]) { e.preventDefault(); actions[t.dataset.act](t); }
  const nav = e.target.closest('#nav button');
  if (nav) go(nav.dataset.view);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') { filter.q = t.value; const pos = t.selectionStart; render(); const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos); return; }
  if (t.id === 'statusFilter') { filter.status = t.value; render(); return; }

  if (view === 'editor') {
    const q = getQuote(editingId); if (!q) return;
    if (t.dataset.f) {
      const f = t.dataset.f;
      q[f] = t.type === 'number' ? num(t.value) : t.value;
      if (f === 'date' && t.value) { q.validUntil = addDays(t.value, num(db.settings.validityDays)); const v = $('[data-f=validUntil]'); if (v) v.value = q.validUntil; }
      save(); refreshPreview();
    } else if (t.dataset.l) {
      const l = q.lines[t.closest('tr').dataset.i];
      l[t.dataset.l] = t.type === 'number' ? num(t.value) : (t.dataset.l === 'vat' ? num(t.value) : t.value);
      save(); refreshPreview();
    }
  } else if (view === 'company') {
    if (t.dataset.c) { db.company[t.dataset.c] = t.type === 'checkbox' ? t.checked : t.value; save(); }
    if (t.dataset.s) { db.settings[t.dataset.s] = t.type === 'number' || t.dataset.s === 'defaultVat' ? num(t.value) : t.value; save(); }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'catalogPick' && t.value) {
    const it = db.catalog.find(c => c.id === t.value), q = getQuote(editingId);
    const empty = q.lines.length === 1 && !q.lines[0].desc && !num(q.lines[0].price);
    const line = { desc: it.desc, qty: 1, unit: it.unit, price: it.price, vat: it.vat };
    if (empty) q.lines[0] = line; else q.lines.push(line);
    save(); refreshLines(); t.value = '';
  }
  if (t.id === 'logoFile' && t.files[0]) {
    const file = t.files[0];
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 400, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      db.company.logo = cv.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9);
      URL.revokeObjectURL(url); save(); render();
    };
    img.onerror = () => toast('Image illisible');
    img.src = url;
  }
  if (t.id === 'fileImport' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d.quotes || !d.clients) throw new Error();
        if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
        const base = defaults();
        db = { ...base, ...d, company: { ...base.company, ...d.company }, settings: { ...base.settings, ...d.settings } };
        save(); go('quotes'); toast('Sauvegarde importée');
      } catch (err) { alert('Fichier de sauvegarde invalide.'); }
    };
    r.readAsText(t.files[0]); t.value = '';
  }
  // Changement de statut / TVA exonérée : rafraîchir l'écran si nécessaire
  if (view === 'editor' && t.dataset.f === 'status') save();
});

document.body.insertAdjacentHTML('beforeend', `<datalist id="units">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist>`);
render();
