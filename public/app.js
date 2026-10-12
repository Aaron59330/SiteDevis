'use strict';

/* ---------- Données ---------- */
const LEGACY_KEY = 'sitedevis.v1';
const session = { user: null, access: { active: false }, config: {} };
const EXTRA = {}, AFTER = {};
const STATUS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé' };
const INV_STATUS = { brouillon: 'Brouillon', envoye: 'Envoyée', payee: 'Payée', annulee: 'Annulée' };
const isInv = q => q && q.kind === 'facture';
const statusOf = q => (isInv(q) ? INV_STATUS : STATUS);
const UNITS = ['u', 'pièce(s)', 'h', 'jour', 'forfait', 'm2', 'm²', 'ml', 'm', 'kg', 'mois'];
const VATS = [0, 5.5, 10, 20];
const VAT_MENTION = 'TVA non applicable – article 293 B du Code général des impôts.';
const DEFAULT_FOOTER =
  'Clause de réserve de propriété : les matériaux et marchandises fournis demeurent la propriété de {entreprise} jusqu\'au paiement intégral de leur prix.\n' +
  'Pénalités de retard : 3 fois le taux d\'intérêt légal en vigueur à compter de la date d\'échéance. Aucun escompte n\'est accordé pour paiement anticipé.\n' +
  'Une indemnité forfaitaire de 40 € pour frais de recouvrement est due en cas de retard de paiement par un client professionnel, conformément à l\'article L441-10 du Code de commerce.';

const defaults = () => ({
  company: { name: '', legalLine: '', address: '', phone: '', email: '', siret: '', vatNumber: '', bank: '', logo: '', vatExempt: false, accent: '#26323f' },
  settings: { numberPattern: 'DEV-{YYYY}-{N}', next: 1, invoicePattern: 'FAC-{YYYY}-{N}', invoiceNext: 1, dueDays: 30, defaultVat: 20, validityDays: 30,
    defaultPayments: '30 | Acompte à la commande\n70 | Solde à la fin des travaux',
    defaultFooter: DEFAULT_FOOTER },
  clients: [],
  catalog: [],
  quotes: []
});

let db = defaults();
let view = 'quotes';
let editingId = null;
let wide = false;
let filter = { q: '', status: '' };

function normalize(raw) {
  const d = defaults();
  raw = raw || {};
  const s = { ...(raw.settings || {}) };
  if (s.prefix && !s.numberPattern) s.numberPattern = `${s.prefix}-{YYYY}-{N}`;
  const c = { ...(raw.company || {}) };
  if (!c.bank && c.iban) c.bank = 'IBAN : ' + c.iban;
  const out = { ...d, ...raw, company: { ...d.company, ...c }, settings: { ...d.settings, ...s } };
  out.clients = out.clients || []; out.catalog = out.catalog || [];
  out.quotes = (out.quotes || []).map(q => normQuote(q, out));
  return out;
}
function normQuote(q, base) {
  base = base || db;
  q.kind = q.kind === 'facture' ? 'facture' : 'devis';
  q.lines = (q.lines && q.lines.length ? q.lines : [newItem(base)]).map(l => ({ t: 'item', ref: '', ...l }));
  q.opts = { showRef: true, showVat: true, docLabel: q.kind === 'facture' ? 'FACTURE' : 'DEVIS', agreeLabel: q.kind === 'facture' ? '' : 'Bon pour Accord', ...(q.opts || {}) };
  if (q.kind === 'facture') { q.dueDate = q.dueDate || ''; q.serviceDate = q.serviceDate || ''; q.alreadyPaid = num(q.alreadyPaid); q.payMethod = q.payMethod ?? 'Virement bancaire'; q.paidAt = q.paidAt || ''; }
  if (q.issuerText == null) q.issuerText = issuerBlock(base.company);
  if (q.clientText == null) q.clientText = clientBlock((base.clients || []).find(c => c.id === q.clientId));
  if (q.footer == null) q.footer = makeFooter(base);
  if (q.bank == null) q.bank = base.company.bank || '';
  if (!q.payments) q.payments = q.kind === 'facture' ? [] : q.deposit ? [{ pct: num(q.deposit), label: 'Acompte' }, { pct: 100 - num(q.deposit), label: 'Solde' }] : parsePayments(base.settings.defaultPayments);
  q.notes = q.notes || ''; q.discount = num(q.discount); q.status = q.status || 'brouillon';
  return q;
}
let pushTimer, pushing = false, dirty = false, savedTimer;
function setSaved(txt, fade) {
  const el = document.getElementById('saved'); if (!el) return;
  el.textContent = txt; clearTimeout(savedTimer);
  if (fade) savedTimer = setTimeout(() => { el.textContent = ''; }, 1800);
}
function save() {
  if (!session.user) return;
  dirty = true; setSaved('Enregistrement…');
  clearTimeout(pushTimer); pushTimer = setTimeout(push, 500);
}
async function push() {
  if (pushing) { pushTimer = setTimeout(push, 300); return; }
  pushing = true; dirty = false;
  try { await api('PUT', '/api/data', db); if (!dirty) setSaved('✓ Enregistré', true); }
  catch (e) {
    if (e.status === 402) { session.access = { active: false, reason: 'expired' }; updateTopbar(); toast('Abonnement requis pour enregistrer'); go('billing'); }
    else if (e.status === 401) { location.reload(); }
    else { setSaved('⚠ Non enregistré'); toast(e.message); }
  } finally { pushing = false; }
}
window.addEventListener('beforeunload', e => { if (dirty || pushing) { e.preventDefault(); e.returnValue = ''; } });

/* Accès : la création et la modification de devis nécessitent un abonnement actif */
function requireAccess() {
  if (session.access.active) return true;
  toast('Abonnement requis pour créer des devis'); go('billing'); return false;
}

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMoney = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtNum = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = n => fmtMoney.format(n || 0);
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (iso, d) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
const fdate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '';
const flongdate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const getClient = id => db.clients.find(c => c.id === id);
const getQuote = id => db.quotes.find(q => q.id === id);
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

function makeNumber(kind) {
  const d = new Date(), y = String(d.getFullYear()), inv = kind === 'facture';
  return ((inv ? db.settings.invoicePattern : db.settings.numberPattern) || (inv ? 'FAC-{YYYY}-{N}' : 'DEV-{YYYY}-{N}'))
    .replace('{YYYY}', y).replace('{YY}', y.slice(2))
    .replace('{MM}', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('{N}', String(inv ? db.settings.invoiceNext : db.settings.next).padStart(3, '0'));
}
function bumpNumber(kind) {
  if (kind === 'facture') db.settings.invoiceNext = num(db.settings.invoiceNext) + 1;
  else db.settings.next = num(db.settings.next) + 1;
}
function issuerBlock(co) {
  return [co.name, co.legalLine, co.address, co.phone && `Port. : ${co.phone}`, co.email, co.siret && `N° SIRET : ${co.siret}`,
    co.vatNumber && `N° TVA : ${co.vatNumber}`].filter(Boolean).join('\n');
}
function clientBlock(c) {
  if (!c) return '';
  const pro = c.type === 'pro';
  return [c.name, c.address, pro && c.contact && `À l'attention de : ${c.contact}`, pro && c.siret && `N° SIRET : ${c.siret}`,
    pro && c.vatNumber && `N° TVA : ${c.vatNumber}`, c.phone && `Port. : ${c.phone}`, c.email].filter(Boolean).join('\n');
}
function makeFooter(base) {
  base = base || db;
  let f = (base.settings.defaultFooter || '').replace(/\{entreprise\}/g, base.company.name || 'l\'entreprise');
  if (base.company.vatExempt && !f.includes('293 B')) f += (f ? '\n' : '') + VAT_MENTION;
  return f;
}
function parsePayments(text) {
  const list = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [p, ...rest] = l.split('|');
    return { pct: num(p), label: rest.join('|').trim() };
  }).filter(p => p.pct > 0);
  return list.length ? list : [{ pct: 100, label: 'Paiement à la réception' }];
}
function newItem(base) { base = base || db; return { t: 'item', ref: '', desc: '', qty: 1, unit: 'u', price: 0, vat: base.settings.defaultVat }; }

function docLines(q) {
  let run = 0;
  return q.lines.map(l => {
    if (l.t === 'subtotal') { const r = { ...l, amount: run }; run = 0; return r; }
    if (l.t === 'item') { const total = num(l.qty) * num(l.price); run += total; return { ...l, total }; }
    return { ...l };
  });
}

function totals(q) {
  const exempt = db.company.vatExempt;
  const items = q.lines.filter(l => l.t === 'item').map(l => ({ ...l, total: num(l.qty) * num(l.price) }));
  const subtotal = items.reduce((s, l) => s + l.total, 0);
  const discountAmt = subtotal * num(q.discount) / 100;
  const ratio = subtotal ? (subtotal - discountAmt) / subtotal : 1;
  const byRate = {};
  items.forEach(l => {
    const r = exempt ? 0 : num(l.vat);
    byRate[r] = (byRate[r] || 0) + l.total * ratio * r / 100;
  });
  const ht = subtotal - discountAmt;
  const vat = Object.values(byRate).reduce((s, v) => s + v, 0);
  const ttc = ht + vat, paid = isInv(q) ? num(q.alreadyPaid) : 0;
  return { subtotal, discountAmt, ht, vat, byRate, ttc, paid, due: ttc - paid };
}

/* ---------- Rendu principal ---------- */
function render() {
  document.querySelectorAll('#nav button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === navFor()));
  const app = $('#app');
  if (view === 'quotes') app.innerHTML = renderQuotes();
  else if (view === 'editor') app.innerHTML = renderEditor();
  else if (view === 'clients') app.innerHTML = renderClients();
  else if (view === 'catalog') app.innerHTML = renderCatalog();
  else if (view === 'company') app.innerHTML = renderCompany();
  else if (EXTRA[view]) app.innerHTML = EXTRA[view]();
  if (AFTER[view]) AFTER[view]();
  if (view === 'editor') { fitDoc(); updatePrintStyle(); autosize(); } else updatePrintStyle(true);
  window.scrollTo(0, 0);
}
function navFor() {
  if (view === 'editor') return isInv(getQuote(editingId)) ? 'invoices' : 'quotes';
  return view === 'account' ? 'billing' : view;
}
function go(v, id = null) {
  if (v === 'editor' && !requireAccess()) return;
  view = v; editingId = id; render();
}

function fitDoc() {
  const wrap = $('.preview-wrap'), doc = $('#doc');
  if (!wrap || !doc) return;
  doc.style.zoom = Math.min(1, (wrap.clientWidth - 4) / 794);
}
function autosize() {
  document.querySelectorAll('textarea[data-l=desc], textarea.auto').forEach(t => { t.style.height = 'auto'; t.style.height = Math.max(34, t.scrollHeight + 2) + 'px'; });
}
function updatePrintStyle(clear) {
  const el = $('#printStyle');
  const q = !clear && getQuote(editingId);
  const s = x => '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
  el.textContent = q
    ? `@page { size: A4; margin: 14mm 10mm 14mm;
        @top-left { content: ${s(`${q.opts.docLabel} N° ${q.number}`)}; font: 9pt sans-serif; color: #6b7488; }
        @top-right { content: ${s(flongdate(q.date))}; font: 9pt sans-serif; color: #6b7488; }
        @bottom-right { content: "Page " counter(page) " / " counter(pages); font: bold 9pt sans-serif; } }
       @page :first { @top-left { content: none; } @top-right { content: none; } }`
    : '@page { size: A4; margin: 14mm 10mm; }';
}

/* ---------- Liste des devis ---------- */
function renderQuotes() {
  const all = db.quotes.filter(q => !isInv(q));
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
  ${!db.company.name ? `<div class="card" style="border-color:var(--warn)">👋 Commencez par renseigner <a href="#" data-act="goto-company">votre entreprise</a> (logo, coordonnées, IBAN, mentions légales) : tout sera repris automatiquement sur vos devis. Vous pouvez aussi <a href="#" data-act="demo">charger un exemple</a> pour voir le résultat.</div>` : ''}
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
          <td><span class="badge ${q.status}">${STATUS[q.status]}</span>${db.quotes.some(i => i.fromQuoteId === q.id) ? ' <span class="badge info2" title="Une facture existe">🧾 Facturé</span>' : ''}</td>
          <td class="right"><b>${money(totals(q).ttc)}</b></td>
          <td class="right" style="white-space:nowrap">
            <button class="btn small" data-act="edit" data-id="${q.id}">Ouvrir</button>
            <button class="btn small" data-act="make-invoice" data-id="${q.id}" title="Créer la facture à partir de ce devis">🧾 Facturer</button>
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
    <div class="row"><button class="btn" data-act="back">← Retour</button><h1 style="margin:0">${esc(q.opts.docLabel)} ${esc(q.number)}</h1></div>
    <div class="row">
      <button class="btn" data-act="toggle-wide">👁 Aperçu large / ✎ Édition</button>
      ${isInv(q)
        ? `${q.fromQuoteId && getQuote(q.fromQuoteId) ? `<button class="btn" data-act="edit" data-id="${q.fromQuoteId}">← Voir le devis ${esc(q.fromNumber || '')}</button>` : ''}${q.status !== 'payee' ? '<button class="btn" data-act="mark-paid">✓ Marquer comme payée</button>' : ''}`
        : `<button class="btn" data-act="make-invoice" data-id="${q.id}">🧾 ${db.quotes.some(i => i.fromQuoteId === q.id) ? 'Créer une autre facture' : 'Créer la facture'}</button>`}
      <button class="btn" data-act="dup" data-id="${q.id}">⧉ Dupliquer</button>
      <button class="btn primary" data-act="print" title="Dans la fenêtre d'impression : destination « Enregistrer au format PDF », décochez « En-têtes et pieds de page »">🖨 Imprimer / PDF</button>
    </div>
  </div>
  <div class="editor ${wide ? 'wide' : ''}" id="editor">
    <div class="form no-print">
      <div class="card">
        <h2>Informations</h2>
        <div class="grid3">
          <div class="field"><label>Numéro</label><input data-f="number" value="${esc(q.number)}"></div>
          <div class="field"><label>Date</label><input type="date" data-f="date" value="${q.date}"></div>
          ${isInv(q)
            ? `<div class="field"><label>Échéance de paiement</label><input type="date" data-f="dueDate" value="${q.dueDate}"></div>`
            : `<div class="field"><label>Valable jusqu'au</label><input type="date" data-f="validUntil" value="${q.validUntil}"></div>`}
        </div>
        ${isInv(q) ? `<div class="grid2"><div class="field"><label>Date de la prestation / livraison</label><input type="date" data-f="serviceDate" value="${q.serviceDate}"></div>
          <div class="field"><label>Devis d'origine</label><input value="${esc(q.fromNumber ? 'Devis N° ' + q.fromNumber : '— aucun —')}" disabled></div></div>` : ''}
        <div class="field"><label>Titre en haut du document (objet des travaux)</label><textarea class="auto" rows="2" data-f="title" placeholder="Ex : TRAVAUX DE PLÂTRERIE LOGEMENT 12 RUE DES LILAS">${esc(q.title)}</textarea></div>
        <div class="grid2">
          <div class="field"><label>Client</label>
            <div class="row" style="flex-wrap:nowrap">
              <select data-f="clientId" id="clientSel">${clientOptions(q.clientId)}</select>
              <button class="btn" data-act="new-client-inline" title="Nouveau client">＋</button>
            </div></div>
          <div class="field"><label>Statut</label>
            <select data-f="status">${Object.entries(statusOf(q)).map(([k, v]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <details>
          <summary>Blocs « Émetteur » et « Client » affichés sur le document (modifiables)</summary>
          <div class="field" style="margin-top:10px"><label>Émetteur (première ligne en gras)
            <a href="#" data-act="reset-issuer" style="float:right;font-weight:400">↻ recopier depuis Mon entreprise</a></label>
            <textarea class="auto" data-f="issuerText">${esc(q.issuerText)}</textarea></div>
          <div class="field"><label>Client
            <a href="#" data-act="reset-client" style="float:right;font-weight:400">↻ recopier depuis la fiche client</a></label>
            <textarea class="auto" data-f="clientText">${esc(q.clientText)}</textarea></div>
        </details>
      </div>

      <div class="card">
        <div class="row between"><h2>Prestations</h2>
          ${db.catalog.length ? `<select id="catalogPick" style="width:auto;max-width:260px"><option value="">+ Ajouter depuis le catalogue…</option>${db.catalog.map(c => `<option value="${c.id}">${esc(c.ref ? c.ref + ' – ' : '')}${esc(c.desc)} — ${money(c.price)}</option>`).join('')}</select>` : ''}
        </div>
        <div id="linesBody">${linesHtml(q)}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="add-line">＋ Ligne</button>
          <button class="btn" data-act="add-title">＋ Titre de section</button>
          <button class="btn" data-act="add-subtotal">＋ Sous-total</button>
          <button class="btn" data-act="add-spacer">＋ Espace</button>
        </div>
        <div class="grid2" style="margin-top:14px">
          <div class="field"><label>Remise globale (%)</label><input type="number" min="0" max="100" step="0.5" data-f="discount" value="${q.discount}"></div>
        </div>
      </div>

      <div class="card">
        <h2>${isInv(q) ? 'Règlement' : 'Paiement'}</h2>
        ${isInv(q) ? `<div class="grid3">
          <div class="field"><label>Déjà réglé / acompte versé (€ TTC)</label><input type="number" step="0.01" min="0" data-f="alreadyPaid" value="${q.alreadyPaid}"></div>
          <div class="field"><label>Mode de règlement</label><input data-f="payMethod" value="${esc(q.payMethod)}" placeholder="Virement bancaire"></div>
          <div class="field"><label>Payée le</label><input type="date" data-f="paidAt" value="${q.paidAt}"></div></div>
          <p class="muted" style="margin:-4px 0 12px;font-size:.82rem">Si un acompte a déjà été payé sur le devis, indiquez-le : la facture affichera « Déjà réglé » et le « Net à payer ».</p>` : `
        <label>Conditions de paiement (échéancier)</label>
        <div id="payBody">${paymentsHtml(q)}</div>
        <div class="row between" style="margin:6px 0 14px"><button class="btn small" data-act="add-pay">＋ Échéance</button><span id="paySum" class="muted"></span></div>`}
        <div class="field"><label>Coordonnées bancaires</label><textarea class="auto" data-f="bank" placeholder="Coordonnées bancaires : …&#10;IBAN : …&#10;BIC/SWIFT : …">${esc(q.bank)}</textarea></div>
        <div class="field"><label>Notes / remarques (affichées sur le document)</label><textarea class="auto" data-f="notes" placeholder="Délais, matériel fourni, précisions…">${esc(q.notes)}</textarea></div>
      </div>

      <div class="card">
        <h2>Mentions légales &amp; présentation</h2>
        <div class="field"><label>Pied de page (répété sur chaque page)</label><textarea class="auto" data-f="footer">${esc(q.footer)}</textarea></div>
        <div class="grid2">
          <div class="field"><label>Intitulé du document</label><input data-o="docLabel" value="${esc(q.opts.docLabel)}"></div>
          ${isInv(q) ? '<div></div>' : `<div class="field"><label>Texte de signature</label><input data-o="agreeLabel" value="${esc(q.opts.agreeLabel)}"></div>`}
        </div>
        <div class="row">
          <label style="margin:0"><input type="checkbox" data-o="showRef" ${q.opts.showRef ? 'checked' : ''} style="width:auto"> Colonne Référence</label>
          <label style="margin:0"><input type="checkbox" data-o="showVat" ${q.opts.showVat ? 'checked' : ''} style="width:auto"> Colonne TVA</label>
        </div>
      </div>
    </div>
    <div class="preview-wrap"><div class="doc" id="doc">${renderDoc(q)}</div></div>
  </div>`;
}

function clientOptions(sel) {
  return `<option value="">— Choisir un client —</option>` +
    db.clients.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function linesHtml(q) {
  const n = q.lines.length;
  const rows = docLines(q);
  return q.lines.map((l, i) => {
    const acts = `<div class="acts">
      <button class="btn small icon" data-act="line-up" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
      <button class="btn small icon" data-act="line-down" ${i === n - 1 ? 'disabled' : ''} title="Descendre">↓</button>
      <button class="btn small icon danger" data-act="line-del" title="Supprimer">✕</button></div>`;
    if (l.t === 'title') return `<div class="line kind" data-i="${i}"><span class="tag">Titre</span><input data-l="desc" value="${esc(l.desc)}" placeholder="Titre de section">${acts}</div>`;
    if (l.t === 'subtotal') return `<div class="line kind" data-i="${i}"><span class="tag">Sous-total</span><input data-l="label" value="${esc(l.label ?? 'Sous Total')}"><b data-sub style="white-space:nowrap">${money(rows[i].amount)}</b>${acts}</div>`;
    if (l.t === 'spacer') return `<div class="line kind" data-i="${i}"><span class="tag">Espace</span><span class="muted grow">Ligne vide</span>${acts}</div>`;
    return `<div class="line" data-i="${i}">
      <div class="r1"><input data-l="ref" value="${esc(l.ref)}" placeholder="Réf."><textarea rows="1" data-l="desc" placeholder="Désignation">${esc(l.desc)}</textarea></div>
      <div class="r2">
        <div><label>Qté</label><input type="number" step="any" min="0" data-l="qty" value="${l.qty}"></div>
        <div><label>Unité</label><input data-l="unit" list="units" value="${esc(l.unit)}"></div>
        <div><label>PU HT</label><input type="number" step="any" min="0" data-l="price" value="${l.price}"></div>
        <div><label>TVA</label><select data-l="vat">${VATS.map(v => `<option value="${v}" ${num(l.vat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></div>
        <div class="tot"><label>Total HT</label><b data-total>${money(rows[i].total)}</b></div>
        ${acts}
      </div></div>`;
  }).join('');
}

function paymentsHtml(q) {
  const t = totals(q);
  return q.payments.map((p, i) => `<div class="pay" data-i="${i}">
    <input type="number" step="any" min="0" max="100" data-p="pct" value="${p.pct}" style="width:80px"> <span>%</span>
    <input data-p="label" value="${esc(p.label)}" placeholder="Libellé (Acompte, Solde…)">
    <b data-amount>${money(t.ttc * num(p.pct) / 100)}</b>
    <button class="btn small icon danger" data-act="del-pay" title="Supprimer">✕</button></div>`).join('');
}

function renderDoc(q) {
  const co = db.company, t = totals(q), o = q.opts;
  const rows = docLines(q);
  const widths = { ref: 15, qty: 10, unit: 11, price: 12, vat: 7, amount: 14 };
  const cols = [o.showRef && 'ref', 'desc', 'qty', 'unit', 'price', o.showVat && 'vat', 'amount'].filter(Boolean);
  const used = cols.filter(c => c !== 'desc').reduce((s, c) => s + widths[c], 0);
  const N = cols.length;
  const head = { ref: 'Référence', desc: 'Désignation', qty: 'Quantité', unit: 'Unité', price: 'PU Vente', vat: 'TVA', amount: 'Montant' };
  const cell = (c, l) => ({
    ref: `<td>${esc(l.ref)}</td>`, desc: `<td class="desc">${esc(l.desc)}</td>`,
    qty: `<td class="r">${fmtNum.format(num(l.qty))}</td>`, unit: `<td>${esc(l.unit)}</td>`,
    price: `<td class="r">${money(num(l.price))}</td>`,
    vat: `<td class="r">${fmtNum.format(db.company.vatExempt ? 0 : num(l.vat))}</td>`, amount: `<td class="r">${money(l.total)}</td>`
  }[c]);
  const issuer = (q.issuerText || '').split('\n');
  const body = rows.map(l => {
    if (l.t === 'title') return `<tr class="ttl"><td colspan="${N}">${esc(l.desc)}</td></tr>`;
    if (l.t === 'subtotal') return `<tr class="sub"><td colspan="${N - 1}">${esc(l.label ?? 'Sous Total')}</td><td class="r">${money(l.amount)}</td></tr>`;
    if (l.t === 'spacer') return `<tr class="spc"><td colspan="${N}"></td></tr>`;
    return `<tr class="item">${cols.map(c => cell(c, l)).join('')}</tr>`;
  }).join('') || `<tr><td colspan="${N}" class="r" style="text-align:center;color:#999">Aucune prestation</td></tr>`;

  const pays = q.payments.filter(p => num(p.pct) > 0);
  const payHtml = pays.length ? `<div class="pay-title">Conditions de paiement :</div>` + pays.map((p, i) =>
    `<div>• ${fmtNum.format(num(p.pct))} % soit ${money(t.ttc * num(p.pct) / 100)}${p.label ? ' : ' + esc(p.label) : ''}${i === pays.length - 1 ? '.' : ','}</div>`).join('') : '';

  const rates = Object.entries(t.byRate).sort((a, b) => a[0] - b[0]);
  const vatRows = (rates.length ? rates : [[0, 0]]).map(([r, v]) => `<div class="tr"><span>TVA ( ${String(r).replace('.', ',')} % )</span><span>${money(v)}</span></div>`).join('');

  return `
  <div class="head">
    <div class="logo-box">${co.logo ? `<img class="logo" src="${co.logo}" alt="">` : ''}</div>
    <h1 class="dtitle">${esc(q.title)}</h1>
  </div>
  <div class="parties">
    <div class="issuer"><b>${esc(issuer[0] || '')}</b>${issuer.length > 1 ? '\n' + esc(issuer.slice(1).join('\n')) : ''}</div>
    <div class="client">${esc(q.clientText)}</div>
  </div>
  <div class="dnum">${esc(o.docLabel)} N° ${esc(q.number)}</div>
  <div class="ddate">Le ${flongdate(q.date)}${!isInv(q) && q.validUntil ? ` — valable jusqu'au ${fdate(q.validUntil)}` : ''}</div>
  ${isInv(q) ? `<div class="dmeta">${q.fromNumber ? `<span>Suite au devis N° ${esc(q.fromNumber)}</span>` : ''}${q.serviceDate ? `<span>Prestation réalisée le ${fdate(q.serviceDate)}</span>` : ''}${q.dueDate ? `<span><b>Échéance de paiement : ${fdate(q.dueDate)}</b></span>` : ''}</div>` : ''}
  <table class="items">
    <colgroup>${cols.map(c => `<col style="width:${c === 'desc' ? 100 - used : widths[c]}%">`).join('')}</colgroup>
    <thead><tr>${cols.map(c => `<th class="${['qty', 'price', 'vat', 'amount'].includes(c) ? 'r' : ''}">${head[c]}</th>`).join('')}</tr></thead>
    <tbody>${body}
      <tr class="final"><td colspan="${N}"><div class="fwrap">
        <div class="fleft">
          ${q.notes ? `<div class="fnotes">${esc(q.notes)}</div>` : ''}
          ${isInv(q) ? (q.payMethod ? `<div class="bank" style="margin-top:10px">Mode de règlement : ${esc(q.payMethod)}</div>` : '') : `<div class="agree">${esc(o.agreeLabel)}</div>`}
          ${q.bank ? `<div class="bank">${esc(q.bank)}</div>` : ''}
          <div class="pays">${payHtml}</div>
        </div>
        <div class="totbox">
          ${t.discountAmt ? `<div class="tr"><span>Sous-total HT</span><span>${money(t.subtotal)}</span></div><div class="tr"><span>Remise (${fmtNum.format(num(q.discount))} %)</span><span>− ${money(t.discountAmt)}</span></div>` : ''}
          <div class="tr b"><span>Total HT</span><span>${money(t.ht)}</span></div>
          ${vatRows}
          <div class="tr ${t.paid ? 'b' : 'grand'}"><span>Total TTC</span><span>${money(t.ttc)}</span></div>
          ${t.paid ? `<div class="tr"><span>Déjà réglé</span><span>− ${money(t.paid)}</span></div><div class="tr grand"><span>Net à payer</span><span>${money(t.due)}</span></div>` : ''}
          ${isInv(q) && q.status === 'payee' ? `<div class="stamp">✓ Facture acquittée${q.paidAt ? ' le ' + fdate(q.paidAt) : ''}</div>` : ''}
        </div>
      </div></td></tr>
    </tbody>
    <tfoot><tr><td colspan="${N}" class="legal">${esc(q.footer)}</td></tr></tfoot>
  </table>`;
}

function refreshPreview() {
  const q = getQuote(editingId); if (!q) return;
  $('#doc').innerHTML = renderDoc(q);
  const rows = docLines(q);
  document.querySelectorAll('#linesBody .line').forEach(el => {
    const r = rows[el.dataset.i]; if (!r) return;
    const tot = el.querySelector('[data-total]'); if (tot) tot.textContent = money(r.total);
    const sub = el.querySelector('[data-sub]'); if (sub) sub.textContent = money(r.amount);
  });
  const t = totals(q);
  document.querySelectorAll('#payBody .pay').forEach(el => {
    el.querySelector('[data-amount]').textContent = money(t.ttc * num(q.payments[el.dataset.i].pct) / 100);
  });
  const sum = q.payments.reduce((s, p) => s + num(p.pct), 0);
  const ps = $('#paySum');
  if (ps) { ps.textContent = `Total : ${fmtNum.format(sum)} %`; ps.style.color = Math.abs(sum - 100) > 0.001 ? 'var(--danger)' : 'var(--ok)'; }
  updatePrintStyle();
}
function refreshLines() {
  const q = getQuote(editingId);
  $('#linesBody').innerHTML = linesHtml(q);
  refreshPreview(); autosize();
}
function refreshPayments() {
  const q = getQuote(editingId);
  $('#payBody').innerHTML = paymentsHtml(q);
  refreshPreview();
}

/* ---------- Clients ---------- */
function renderClients() {
  return `
  <div class="row between" style="margin-bottom:16px"><h1>Clients</h1><button class="btn primary" data-act="new-client">＋ Nouveau client</button></div>
  <div class="card">${db.clients.length ? `<table class="list">
    <thead><tr><th>Nom</th><th>Type</th><th>Email</th><th>Téléphone</th><th>Devis</th><th></th></tr></thead>
    <tbody>${db.clients.map(c => `<tr>
      <td><b>${esc(c.name)}</b><div class="muted" style="white-space:pre-line">${esc(c.address)}</div></td>
      <td><span class="badge ${c.type === 'pro' ? 'envoye' : 'brouillon'}">${c.type === 'pro' ? 'Pro' : 'Particulier'}</span>${c.siret ? `<div class="muted" style="font-size:.78rem">${esc(c.siret)}</div>` : ''}</td>
      <td>${esc(c.email)}</td><td>${esc(c.phone)}</td>
      <td>${db.quotes.filter(q => q.clientId === c.id).length}</td>
      <td class="right"><button class="btn small" data-act="edit-client" data-id="${c.id}">Modifier</button>
      <button class="btn small danger" data-act="del-client" data-id="${c.id}">🗑</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">Aucun client enregistré.</div>`}</div>`;
}

/* Recherche d'entreprise par SIRET (API publique « Recherche d'entreprises », data.gouv.fr) */
async function lookupSiret(raw) {
  const siret = String(raw).replace(/\D/g, '');
  if (siret.length !== 14) throw new Error('Le SIRET doit contenir 14 chiffres.');
  let r;
  try { r = await fetch('https://recherche-entreprises.api.gouv.fr/search?q=' + siret + '&per_page=1'); }
  catch (e) { throw new Error('Impossible de joindre le service de recherche (vérifiez votre connexion internet).'); }
  if (!r.ok) throw new Error('Service de recherche indisponible, réessayez dans un instant.');
  const d = await r.json();
  const e = d.results && d.results[0];
  const et = e && ((e.matching_etablissements || []).find(x => x.siret === siret) || (e.siege && e.siege.siret === siret ? e.siege : null));
  if (!et) throw new Error('Aucune entreprise trouvée pour ce SIRET.');
  const cp = et.code_postal || '', ville = et.libelle_commune || '';
  let street = et.adresse || '';
  const tail = `${cp} ${ville}`.trim();
  if (tail && street.endsWith(tail)) street = street.slice(0, -tail.length).trim();
  else street = [et.numero_voie, et.indice_repetition, et.type_voie, et.libelle_voie].filter(Boolean).join(' ');
  const siren = siret.slice(0, 9);
  const key = (12 + 3 * (parseInt(siren, 10) % 97)) % 97;
  const dir = (e.dirigeants || []).find(x => x.type_dirigeant === 'personne physique');
  const ei = e.complements && e.complements.est_entrepreneur_individuel;
  const cap = s => String(s || '').toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase());
  return {
    name: e.nom_raison_sociale || e.nom_complet || '',
    address: [street, tail].filter(Boolean).join('\n'),
    vatNumber: 'FR' + String(key).padStart(2, '0') + siren,
    contact: dir ? `${cap(dir.prenoms ? dir.prenoms.split(',')[0] : '')} ${String(dir.nom || '').toUpperCase()}`.trim() : '',
    ei, closed: et.etat_administratif === 'F'
  };
}

async function searchCompanies(q) {
  let r;
  try { r = await fetch('https://recherche-entreprises.api.gouv.fr/search?per_page=6&q=' + encodeURIComponent(q)); }
  catch (e) { throw new Error('Impossible de joindre le service de recherche (vérifiez votre connexion internet).'); }
  if (!r.ok) throw new Error('Service de recherche indisponible, réessayez dans un instant.');
  const d = await r.json();
  return (d.results || []).filter(e => e.siege && e.siege.siret).map(e => ({
    name: e.nom_complet, siret: e.siege.siret, city: [e.siege.code_postal, e.siege.libelle_commune].filter(Boolean).join(' '),
    closed: e.etat_administratif === 'C'
  }));
}

function clientModal(id, afterSave) {
  const old = db.clients.find(x => x.id === id);
  const c = old ? { ...old } : { type: 'particulier' };
  if (!c.type) { c.type = 'particulier'; c.lastName = c.name; }
  const v = k => esc(c[k] || '');
  const m = $('#modal');
  m.innerHTML = `<form method="dialog" id="clientForm">
    <h2>${id ? 'Modifier le client' : 'Nouveau client'}</h2>
    <div class="seg" style="margin-bottom:16px">
      <label><input type="radio" name="type" value="particulier" ${c.type === 'particulier' ? 'checked' : ''}><span>👤 Particulier</span></label>
      <label><input type="radio" name="type" value="pro" ${c.type === 'pro' ? 'checked' : ''}><span>🏢 Professionnel</span></label>
    </div>

    <div id="boxPart">
      <div class="grid3">
        <div class="field"><label>Civilité</label><select name="civ">${['M', 'Mme', 'Mlle', ''].map(x => `<option value="${x}" ${(c.civ ?? 'M') === x ? 'selected' : ''}>${x || '—'}</option>`).join('')}</select></div>
        <div class="field"><label>Prénom</label><input name="firstName" value="${v('firstName')}"></div>
        <div class="field"><label>Nom *</label><input name="lastName" value="${v('lastName')}"></div>
      </div>
    </div>

    <div id="boxPro">
      <div class="field" style="position:relative"><label>Rechercher une entreprise par son nom (raison sociale)</label>
        <input id="coSearch" autocomplete="off" placeholder="Ex : L.H Rénovation, Boulangerie Dupont…">
        <div id="sugg" class="sugg" hidden></div>
      </div>
      <div class="field"><label>… ou par N° SIRET (14 chiffres) — les informations se remplissent toutes seules</label>
        <div class="row" style="flex-wrap:nowrap">
          <input name="siret" id="siretIn" inputmode="numeric" placeholder="123 456 789 00012" value="${v('siret')}">
          <button type="button" class="btn" id="siretBtn">🔍 Rechercher</button>
        </div>
        <div id="siretMsg" class="muted" style="margin-top:6px;font-size:.85rem"></div>
      </div>
      <div class="field"><label>Raison sociale *</label><input name="name" value="${v('name')}"></div>
      <div class="grid2">
        <div class="field"><label>Contact / dirigeant</label><input name="contact" value="${v('contact')}"></div>
        <div class="field"><label>N° TVA intracommunautaire</label><input name="vatNumber" value="${v('vatNumber')}"></div>
      </div>
    </div>

    <div class="field"><label>Adresse</label><textarea name="address" rows="2">${v('address')}</textarea></div>
    <div class="grid2">
      <div class="field"><label>Email</label><input name="email" type="email" value="${v('email')}"></div>
      <div class="field"><label>Téléphone</label><input name="phone" value="${v('phone')}"></div>
    </div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div>
  </form>`;
  m.showModal();

  const form = $('#clientForm'), msg = $('#siretMsg');
  const typeNow = () => form.elements.type.value;
  const sync = () => {
    const pro = typeNow() === 'pro';
    $('#boxPro').hidden = !pro; $('#boxPart').hidden = pro;
    form.elements.name.required = pro; form.elements.lastName.required = !pro;
  };
  form.querySelectorAll('[name=type]').forEach(r => r.onchange = sync);
  sync();

  let seq = 0;
  async function search() {
    const my = ++seq;
    msg.style.color = ''; msg.textContent = 'Recherche en cours…';
    try {
      const r = await lookupSiret(form.elements.siret.value);
      if (my !== seq) return;
      const f = form.elements;
      f.name.value = r.name; f.address.value = r.address; f.vatNumber.value = r.vatNumber;
      if (r.contact && !f.contact.value) f.contact.value = r.contact;
      msg.style.color = r.closed ? 'var(--warn)' : 'var(--ok)';
      msg.textContent = (r.closed ? '⚠ Établissement fermé — ' : '✓ ') + 'Informations récupérées' + (r.ei ? ' (entrepreneur individuel)' : '') + '. Vérifiez-les puis enregistrez.';
    } catch (err) {
      if (my !== seq) return;
      msg.style.color = 'var(--danger)'; msg.textContent = err.message;
    }
  }
  $('#siretBtn').onclick = search;
  const sugg = $('#sugg');
  let timer, seq2 = 0;
  $('#coSearch').addEventListener('input', e => {
    const q = e.target.value.trim(), digits = q.replace(/\D/g, '');
    clearTimeout(timer); sugg.hidden = true;
    if (digits.length === 14 && /^[\d\s]+$/.test(q)) { form.elements.siret.value = digits; search(); return; }
    if (q.length < 3) return;
    timer = setTimeout(async () => {
      const my = ++seq2;
      sugg.hidden = false; sugg.innerHTML = '<div class="muted" style="padding:10px">Recherche…</div>';
      try {
        const list = await searchCompanies(q);
        if (my !== seq2) return;
        sugg.innerHTML = list.length ? list.map(x => `<button type="button" class="sg" data-siret="${x.siret}">
          <b>${esc(x.name)}</b><span class="muted">${esc(x.city)} · ${x.siret}${x.closed ? ' · fermée' : ''}</span></button>`).join('')
          : '<div class="muted" style="padding:10px">Aucun résultat.</div>';
      } catch (err) { if (my === seq2) sugg.innerHTML = `<div style="padding:10px;color:var(--danger)">${esc(err.message)}</div>`; }
    }, 400);
  });
  sugg.addEventListener('click', e => {
    const b = e.target.closest('.sg'); if (!b) return;
    form.elements.siret.value = b.dataset.siret; sugg.hidden = true; $('#coSearch').value = ''; search();
  });
  $('#siretIn').addEventListener('input', e => {
    if (e.target.value.replace(/\D/g, '').length === 14) search(); else { seq++; msg.textContent = ''; }
  });

  form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target), g = k => (f.get(k) || '').toString().trim();
    const type = g('type');
    const data = { type, address: f.get('address'), email: g('email'), phone: g('phone') };
    if (type === 'pro') {
      Object.assign(data, { name: g('name'), siret: g('siret').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4'),
        contact: g('contact'), vatNumber: g('vatNumber'), civ: '', firstName: '', lastName: '' });
    } else {
      const first = g('firstName'), last = g('lastName');
      Object.assign(data, { civ: g('civ'), firstName: first, lastName: last, siret: '', contact: '', vatNumber: '',
        name: [g('civ'), first, last.toUpperCase()].filter(Boolean).join(' ') });
    }
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
  <p class="muted">Enregistrez vos prestations et fournitures habituelles pour les ajouter en un clic dans un devis.</p>
  <div class="card">${db.catalog.length ? `<table class="list">
    <thead><tr><th>Réf.</th><th>Désignation</th><th>Unité</th><th class="right">Prix HT</th><th>TVA</th><th></th></tr></thead>
    <tbody>${db.catalog.map(c => `<tr><td>${esc(c.ref)}</td><td style="white-space:pre-line">${esc(c.desc)}</td><td>${esc(c.unit)}</td><td class="right">${money(c.price)}</td><td>${String(c.vat).replace('.', ',')} %</td>
      <td class="right"><button class="btn small" data-act="edit-item" data-id="${c.id}">Modifier</button>
      <button class="btn small danger" data-act="del-item" data-id="${c.id}">🗑</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">Le catalogue est vide.</div>`}</div>`;
}

function itemModal(id) {
  const c = db.catalog.find(x => x.id === id) || { ref: '', desc: '', unit: 'u', price: 0, vat: db.settings.defaultVat };
  const m = $('#modal');
  m.innerHTML = `<form method="dialog" id="itemForm">
    <h2>${id ? 'Modifier la prestation' : 'Nouvelle prestation'}</h2>
    <div class="grid2"><div class="field"><label>Référence</label><input name="ref" value="${esc(c.ref)}"></div><div></div></div>
    <div class="field"><label>Désignation *</label><textarea name="desc" required>${esc(c.desc)}</textarea></div>
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
    const data = { ref: f.get('ref').trim(), desc: f.get('desc').trim(), unit: f.get('unit'), price: num(f.get('price')), vat: num(f.get('vat')) };
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
  <p class="muted">Ces informations sont recopiées dans chaque <b>nouveau</b> devis, où vous pouvez ensuite tout modifier.</p>
  <div class="editor" style="grid-template-columns:1fr 1fr">
    <div>
      <div class="card"><h2>Coordonnées</h2>
        <div class="field"><label>Nom de l'entreprise (en gras sur le devis)</label><input data-c="name" value="${esc(co.name)}"></div>
        <div class="field"><label>Ligne complémentaire (dirigeant, forme juridique…)</label><input data-c="legalLine" value="${esc(co.legalLine)}" placeholder="Ex : PRÉNOM NOM – ENTREPRENEUR INDIVIDUEL (EI)"></div>
        <div class="field"><label>Adresse</label><textarea data-c="address">${esc(co.address)}</textarea></div>
        <div class="grid2">
          <div class="field"><label>Téléphone</label><input data-c="phone" value="${esc(co.phone)}"></div>
          <div class="field"><label>Email</label><input data-c="email" value="${esc(co.email)}"></div>
          <div class="field"><label>SIRET</label><input data-c="siret" value="${esc(co.siret)}"></div>
          <div class="field"><label>N° TVA intracommunautaire</label><input data-c="vatNumber" value="${esc(co.vatNumber)}"></div>
        </div>
        <div class="field"><label>Coordonnées bancaires</label><textarea data-c="bank" placeholder="Coordonnées bancaires : …&#10;IBAN : …&#10;BIC/SWIFT : …">${esc(co.bank)}</textarea></div>
        <div class="field"><label><input type="checkbox" data-c="vatExempt" ${co.vatExempt ? 'checked' : ''} style="width:auto"> Non assujetti à la TVA (micro-entreprise, art. 293 B du CGI)</label></div>
      </div>
    </div>
    <div>
      <div class="card"><h2>Logo &amp; couleur</h2>
        ${co.logo ? `<img class="logo-prev" src="${co.logo}" alt="">` : '<p class="muted">Aucun logo</p>'}
        <div class="row"><input type="file" id="logoFile" accept="image/*" style="max-width:260px">${co.logo ? '<button class="btn danger" data-act="rm-logo">Retirer</button>' : ''}</div>
        <div class="field" style="margin-top:12px"><label>Couleur des titres</label><input type="color" data-c="accent" value="${esc(co.accent)}" style="width:80px;padding:2px;height:36px"></div>
      </div>
      <div class="card"><h2>Réglages des devis</h2>
        <div class="grid2">
          <div class="field"><label>Modèle de numérotation</label><input data-s="numberPattern" value="${esc(s.numberPattern)}"></div>
          <div class="field"><label>Prochain numéro de devis ({N})</label><input type="number" min="1" data-s="next" value="${s.next}"></div>
          <div class="field"><label>Modèle de numérotation des factures</label><input data-s="invoicePattern" value="${esc(s.invoicePattern)}"></div>
          <div class="field"><label>Prochain numéro de facture ({N})</label><input type="number" min="1" data-s="invoiceNext" value="${s.invoiceNext}"></div>
          <div class="field"><label>Délai de paiement des factures (jours)</label><input type="number" min="0" data-s="dueDays" value="${s.dueDays}"></div>
        </div>
        <p class="muted" style="margin-top:-4px;font-size:.8rem">Variables : {YYYY} année, {YY} année courte, {MM} mois, {N} compteur. Ex : <code>I-{YY}-{MM}-{N}</code></p>
        <div class="grid2">
          <div class="field"><label>Validité par défaut (jours)</label><input type="number" min="1" data-s="validityDays" value="${s.validityDays}"></div>
          <div class="field"><label>TVA par défaut</label><select data-s="defaultVat">${VATS.map(v => `<option value="${v}" ${num(s.defaultVat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Échéancier par défaut (une ligne = « pourcentage | libellé »)</label><textarea data-s="defaultPayments" rows="4">${esc(s.defaultPayments)}</textarea></div>
        <div class="field"><label>Mentions légales de pied de page ({entreprise} = votre nom)</label><textarea data-s="defaultFooter" rows="6">${esc(s.defaultFooter)}</textarea></div>
      </div>
    </div>
  </div>`;
}

/* ---------- Actions ---------- */
function newQuote() {
  const date = today();
  const q = normQuote({
    id: uid(), number: makeNumber(), date, validUntil: addDays(date, num(db.settings.validityDays)),
    clientId: '', title: '', status: 'brouillon', notes: '', discount: 0
  });
  db.settings.next = num(db.settings.next) + 1;
  db.quotes.push(q); save(); go('editor', q.id);
}

function loadDemo() {
  const co = db.company;
  if (!co.name) Object.assign(co, { name: 'ENTREPRISE EXEMPLE', legalLine: 'JEAN MARTIN – ENTREPRENEUR INDIVIDUEL (EI)', address: '12 rue des Lilas\n59000 LILLE\nFRANCE',
    phone: '+33 6 00 00 00 00', email: 'contact@exemple.fr', siret: '123 456 789 00012', vatExempt: true,
    bank: 'Coordonnées bancaires : Ma Banque\nIBAN : FR76 0000 0000 0000 0000 0000 000\nBIC/SWIFT : XXXXFRPP' });
  const cl = { id: uid(), name: 'M Paul DUPONT', address: '8 rue de la Gare\n59100 ROUBAIX', phone: '+33 6 11 22 33 44', email: '' };
  db.clients.push(cl);
  const q = normQuote({
    id: uid(), number: makeNumber(), date: today(), validUntil: addDays(today(), 30), clientId: cl.id, clientText: clientBlock(cl),
    title: 'TRAVAUX DE PLÂTRERIE LOGEMENT 8 RUE DE LA GARE', status: 'brouillon', notes: '', discount: 0,
    lines: [
      { t: 'item', ref: 'CLOI-1', desc: 'Cloison de distribution en plaques de plâtre BA13 sur ossature métallique', qty: 30, unit: 'm2', price: 16, vat: 0 },
      { t: 'item', ref: 'DO', desc: 'Doublage sur optima', qty: 86, unit: 'm2', price: 14, vat: 0 },
      { t: 'item', ref: 'PLAF-2', desc: 'Plafond auto portée BA13 sur rail/montant 48/70, isolation', qty: 83, unit: 'm2', price: 18, vat: 0 },
      { t: 'subtotal', label: 'Sous Total' },
      { t: 'spacer' },
      { t: 'item', ref: 'BA-13', desc: 'Plaque de plâtre BA13', qty: 70, unit: 'pièce(s)', price: 8.79, vat: 0 },
      { t: 'item', ref: 'R48', desc: 'Rail R48', qty: 30, unit: 'pièce(s)', price: 2.69, vat: 0 },
      { t: 'item', ref: 'M48', desc: 'Montant M48', qty: 100, unit: 'pièce(s)', price: 2.24, vat: 0 },
      { t: 'subtotal', label: 'Sous Total' }
    ],
    payments: [{ pct: 10, label: 'Acompte' }, { pct: 40, label: 'Début travaux' }, { pct: 30, label: 'Paiement intermédiaire' }, { pct: 20, label: 'Paiement solde' }]
  });
  db.settings.next = num(db.settings.next) + 1;
  db.quotes.push(q); save(); go('editor', q.id);
}

const actions = {
  'new-quote'() { if (requireAccess()) newQuote(); },
  demo() { if (requireAccess()) loadDemo(); },
  'goto-company': () => go('company'),
  edit: t => go('editor', t.dataset.id),
  back() { go(isInv(getQuote(editingId)) ? 'invoices' : 'quotes'); },
  print() { fitDoc(); window.print(); },
  'toggle-wide'() { wide = !wide; $('#editor').classList.toggle('wide', wide); fitDoc(); },
  dup(t) {
    if (!requireAccess()) return;
    const src = getQuote(t.dataset.id); if (!src) return;
    const q = JSON.parse(JSON.stringify(src));
    q.id = uid(); q.number = makeNumber(src.kind); q.date = today(); q.status = 'brouillon';
    if (isInv(q)) { q.dueDate = addDays(q.date, num(db.settings.dueDays)); q.paidAt = ''; q.alreadyPaid = 0; delete q.fromQuoteId; delete q.fromNumber; }
    else q.validUntil = addDays(q.date, num(db.settings.validityDays));
    bumpNumber(src.kind);
    db.quotes.push(q); save(); toast(isInv(q) ? 'Facture dupliquée' : 'Devis dupliqué'); go('editor', q.id);
  },
  'del-quote'(t) {
    const q = getQuote(t.dataset.id);
    if (q && confirm(`Supprimer ${isInv(q) ? 'la facture' : 'le devis'} ${q.number} ?`)) { db.quotes = db.quotes.filter(x => x !== q); save(); render(); }
  },
  'add-line'() { getQuote(editingId).lines.push(newItem()); save(); refreshLines(); },
  'add-title'() { getQuote(editingId).lines.push({ t: 'title', desc: '' }); save(); refreshLines(); },
  'add-subtotal'() { getQuote(editingId).lines.push({ t: 'subtotal', label: 'Sous Total' }); save(); refreshLines(); },
  'add-spacer'() { getQuote(editingId).lines.push({ t: 'spacer' }); save(); refreshLines(); },
  'line-del'(t) {
    const q = getQuote(editingId);
    q.lines.splice(+t.closest('.line').dataset.i, 1);
    if (!q.lines.length) q.lines.push(newItem());
    save(); refreshLines();
  },
  'line-up'(t) { moveLine(+t.closest('.line').dataset.i, -1); },
  'line-down'(t) { moveLine(+t.closest('.line').dataset.i, 1); },
  'add-pay'() { getQuote(editingId).payments.push({ pct: 0, label: '' }); save(); refreshPayments(); },
  'del-pay'(t) { getQuote(editingId).payments.splice(+t.closest('.pay').dataset.i, 1); save(); refreshPayments(); },
  'reset-issuer'() { const q = getQuote(editingId); q.issuerText = issuerBlock(db.company); $('[data-f=issuerText]').value = q.issuerText; save(); refreshPreview(); autosize(); },
  'reset-client'() { const q = getQuote(editingId); q.clientText = clientBlock(getClient(q.clientId)); $('[data-f=clientText]').value = q.clientText; save(); refreshPreview(); autosize(); },
  'new-client': () => clientModal(null, () => render()),
  'new-client-inline': () => clientModal(null, cl => {
    const q = getQuote(editingId);
    q.clientId = cl.id; q.clientText = clientBlock(cl); save();
    $('#clientSel').innerHTML = clientOptions(cl.id); $('[data-f=clientText]').value = q.clientText;
    refreshPreview(); autosize();
  }),
  'edit-client': t => clientModal(t.dataset.id, () => render()),
  'del-client'(t) {
    const c = getClient(t.dataset.id);
    const used = db.quotes.filter(q => q.clientId === c.id).length;
    if (confirm(`Supprimer ${c.name} ?${used ? `\n${used} devis lui sont rattachés (ils conserveront le texte du client).` : ''}`)) {
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
  import() { if (requireAccess()) $('#fileImport').click(); }
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

window.addEventListener('resize', fitDoc);

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') { filter.q = t.value; const pos = t.selectionStart; render(); const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos); return; }
  if (t.id === 'statusFilter') { filter.status = t.value; render(); return; }
  if (t.tagName === 'TEXTAREA' && (t.dataset.l === 'desc' || t.classList.contains('auto'))) { t.style.height = 'auto'; t.style.height = Math.max(34, t.scrollHeight + 2) + 'px'; }

  if (view === 'editor') {
    const q = getQuote(editingId); if (!q) return;
    if (t.dataset.f) {
      const f = t.dataset.f;
      q[f] = t.type === 'number' ? num(t.value) : t.value;
      if (f === 'date' && t.value) { const k = isInv(q) ? 'dueDate' : 'validUntil'; q[k] = addDays(t.value, num(isInv(q) ? db.settings.dueDays : db.settings.validityDays)); const v = $(`[data-f=${k}]`); if (v) v.value = q[k]; }
      if (f === 'status' && isInv(q) && t.value === 'payee' && !q.paidAt) { q.paidAt = today(); const v = $('[data-f=paidAt]'); if (v) v.value = q.paidAt; }
      if (f === 'clientId') { q.clientText = clientBlock(getClient(t.value)); const ct = $('[data-f=clientText]'); ct.value = q.clientText; autosize(); }
      save(); refreshPreview();
    } else if (t.dataset.o) {
      q.opts[t.dataset.o] = t.type === 'checkbox' ? t.checked : t.value;
      save(); refreshPreview();
    } else if (t.dataset.l) {
      const l = q.lines[t.closest('.line').dataset.i], k = t.dataset.l;
      l[k] = (t.type === 'number' || k === 'vat') ? num(t.value) : t.value;
      save(); refreshPreview();
    } else if (t.dataset.p) {
      const p = q.payments[t.closest('.pay').dataset.i];
      p[t.dataset.p] = t.dataset.p === 'pct' ? num(t.value) : t.value;
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
    const line = { t: 'item', ref: it.ref || '', desc: it.desc, qty: 1, unit: it.unit, price: it.price, vat: it.vat };
    const first = q.lines[0];
    if (q.lines.length === 1 && first.t === 'item' && !first.desc && !num(first.price)) q.lines[0] = line; else q.lines.push(line);
    save(); refreshLines(); t.value = '';
  }
  if (t.id === 'logoFile' && t.files[0]) {
    const file = t.files[0];
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 500, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      db.company.logo = cv.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
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
        db = normalize(d);
        save(); go('quotes'); toast('Sauvegarde importée');
      } catch (err) { alert('Fichier de sauvegarde invalide.'); }
    };
    r.readAsText(t.files[0]); t.value = '';
  }
});

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('sitedevis.theme', t); } catch (e) { /* ignore */ }
  const b = document.getElementById('themeBtn'); if (b) b.textContent = t === 'light' ? '☀️' : '🌙';
}
setTheme(document.documentElement.dataset.theme || 'dark');
document.addEventListener('click', e => { if (e.target.closest('#themeBtn')) setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); });

document.head.insertAdjacentHTML('beforeend', '<style id="printStyle"></style>');
document.body.insertAdjacentHTML('beforeend', `<datalist id="units">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist>`);
