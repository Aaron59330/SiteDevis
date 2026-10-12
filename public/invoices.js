'use strict';
/* Factures : création à partir d'un devis, liste, suivi des règlements.
   Une facture est un document au même format qu'un devis (db.quotes, kind = 'facture'),
   ce qui permet de réutiliser l'éditeur, l'aperçu et l'impression PDF. */

const invFilter = { q: '', status: '' };
const INV_LABEL = { ...INV_STATUS, retard: 'En retard' };
const invState = q => (q.status === 'envoye' && q.dueDate && q.dueDate < today() ? 'retard' : q.status);
const invoices = () => db.quotes.filter(isInv);

EXTRA.invoices = function renderInvoices() {
  const all = invoices();
  const sumDue = l => l.reduce((s, q) => s + totals(q).due, 0);
  const pending = all.filter(q => q.status === 'envoye'), late = all.filter(q => invState(q) === 'retard');
  const paid = all.filter(q => q.status === 'payee');
  const list = all.filter(q => {
    const c = getClient(q.clientId);
    const hay = `${q.number} ${q.title} ${c ? c.name : ''} ${q.fromNumber || ''}`.toLowerCase();
    return (!invFilter.q || hay.includes(invFilter.q.toLowerCase())) && (!invFilter.status || invState(q) === invFilter.status);
  }).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));

  return `
  <div class="row between" style="margin-bottom:16px">
    <h1>Factures</h1>
    <div class="row"><button class="btn" data-act="goto-quotes">← Voir les devis</button><button class="btn primary" data-act="new-invoice">＋ Facture vierge</button></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="n">${all.length}</div><div class="l">Factures au total</div></div>
    <div class="stat"><div class="n">${money(sumDue(pending))}</div><div class="l">À encaisser (envoyées)</div></div>
    <div class="stat"><div class="n" style="color:${late.length ? 'var(--danger)' : 'inherit'}">${money(sumDue(late))}</div><div class="l">En retard (${late.length})</div></div>
    <div class="stat"><div class="n">${money(paid.reduce((s, q) => s + totals(q).ttc, 0))}</div><div class="l">Encaissé (${paid.length} payées)</div></div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:12px">
      <input class="grow" id="invSearch" placeholder="🔍 Rechercher (numéro, client, devis)…" value="${esc(invFilter.q)}" style="max-width:360px">
      <select id="invStatus" style="width:180px"><option value="">Tous les statuts</option>
        ${Object.entries(INV_LABEL).map(([k, v]) => `<option value="${k}" ${invFilter.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div>
    ${list.length ? `<table class="list">
      <thead><tr><th>Numéro</th><th>Client</th><th>Devis</th><th>Émise le</th><th>Échéance</th><th>Statut</th><th class="right">Total TTC</th><th class="right">Reste dû</th><th></th></tr></thead>
      <tbody>${list.map(q => {
        const c = getClient(q.clientId), st = invState(q), t = totals(q);
        return `<tr>
          <td><a href="#" data-act="edit" data-id="${q.id}"><b>${esc(q.number)}</b></a></td>
          <td>${esc(c ? c.name : '—')}</td>
          <td>${q.fromQuoteId && getQuote(q.fromQuoteId) ? `<a href="#" data-act="edit" data-id="${q.fromQuoteId}">${esc(q.fromNumber)}</a>` : esc(q.fromNumber || '—')}</td>
          <td>${fdate(q.date)}</td><td>${q.dueDate ? fdate(q.dueDate) : '—'}</td>
          <td><span class="badge ${st}">${INV_LABEL[st]}</span></td>
          <td class="right"><b>${money(t.ttc)}</b></td>
          <td class="right">${q.status === 'payee' || q.status === 'annulee' ? '—' : money(t.due)}</td>
          <td class="right" style="white-space:nowrap">
            <button class="btn small" data-act="edit" data-id="${q.id}">Ouvrir</button>
            ${q.status !== 'payee' && q.status !== 'annulee' ? `<button class="btn small" data-act="mark-paid" data-id="${q.id}" title="Marquer comme payée">✓ Payée</button>` : ''}
            <button class="btn small" data-act="dup" data-id="${q.id}" title="Dupliquer">⧉</button>
            <button class="btn small danger" data-act="del-quote" data-id="${q.id}" title="Supprimer">🗑</button>
          </td></tr>`;
      }).join('')}</tbody></table>`
      : `<div class="empty">${all.length ? 'Aucune facture ne correspond.' : 'Aucune facture pour le moment.<br><br>Ouvrez un devis et cliquez sur <b>🧾 Créer la facture</b>.'}</div>`}
  </div>`;
};

function createInvoice(src) {
  const date = today();
  const inv = src ? JSON.parse(JSON.stringify(src)) : normQuote({ id: '', kind: 'facture', title: '', clientId: '', notes: '', discount: 0 });
  Object.assign(inv, {
    id: uid(), kind: 'facture', number: makeNumber('facture'), date, dueDate: addDays(date, num(db.settings.dueDays)),
    serviceDate: '', validUntil: '', status: 'brouillon', payments: [], alreadyPaid: 0, payMethod: 'Virement bancaire', paidAt: '',
    fromQuoteId: src ? src.id : '', fromNumber: src ? src.number : ''
  });
  inv.opts = { ...inv.opts, docLabel: 'FACTURE', agreeLabel: '' };
  bumpNumber('facture');
  db.quotes.push(inv);
  return inv;
}

Object.assign(actions, {
  'goto-quotes': () => go('quotes'),
  'new-invoice'() { if (!requireAccess()) return; const inv = createInvoice(null); save(); go('editor', inv.id); },
  'make-invoice'(t) {
    if (!requireAccess()) return;
    const src = getQuote(t.dataset.id || editingId); if (!src || isInv(src)) return;
    const existing = invoices().filter(i => i.fromQuoteId === src.id);
    if (existing.length && !confirm(`Une facture existe déjà pour ce devis (${existing.map(i => i.number).join(', ')}).\nEn créer une nouvelle ?`)) return;
    const inv = createInvoice(src);
    if (src.status === 'brouillon' || src.status === 'envoye') src.status = 'accepte';
    save(); toast(`Facture ${inv.number} créée à partir du devis ${src.number}`);
    go('editor', inv.id);
  },
  'mark-paid'(t) {
    const q = getQuote(t.dataset.id || editingId); if (!q) return;
    q.status = 'payee'; if (!q.paidAt) q.paidAt = today();
    save(); toast('Facture marquée comme payée');
    if (view === 'editor') render(); else render();
  }
});

let invTimer;
document.addEventListener('input', e => {
  if (e.target.id !== 'invSearch') return;
  clearTimeout(invTimer);
  invTimer = setTimeout(() => {
    invFilter.q = e.target.value; const pos = e.target.selectionStart; render();
    const s = $('#invSearch'); s.focus(); s.setSelectionRange(pos, pos);
  }, 200);
});
document.addEventListener('change', e => { if (e.target.id === 'invStatus') { invFilter.status = e.target.value; render(); } });

/* ---------- Catalogue : sélecteur de prestations avec quantité et total automatique ---------- */
function catalogPicker(search) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-wide">
    <div class="row between"><h2 style="margin:0">Ajouter depuis le catalogue</h2><button class="btn small" data-act="close-modal">✕ Fermer</button></div>
    <p class="muted" style="margin:6px 0 12px">Indiquez la quantité (m², heures…) : le total est calculé automatiquement. Les prestations s'ajoutent au devis sans fermer cette fenêtre.</p>
    <div class="row" style="margin-bottom:12px"><input id="cpSearch" class="grow" placeholder="🔍 Rechercher (parquet, peinture…)" value="${esc(search || '')}" autofocus>
      <button class="btn" data-act="cp-new">＋ Nouvelle prestation</button></div>
    <div id="cpList"></div></div>`;
  if (!m.open) m.showModal();
  cpRender();
}
function cpRender() {
  const q = ($('#cpSearch').value || '').toLowerCase();
  const items = db.catalog.filter(c => `${c.ref} ${c.desc}`.toLowerCase().includes(q));
  $('#cpList').innerHTML = items.length ? items.map(c => `<div class="cp-row" data-id="${c.id}">
    <div class="cp-info"><b>${c.ref ? `<span class="tag">${esc(c.ref)}</span> ` : ''}${esc(c.desc)}</b><span class="muted">${money(c.price)} / ${esc(c.unit)}${db.company.vatExempt ? '' : ` · TVA ${String(c.vat).replace('.', ',')} %`}</span></div>
    <div class="cp-calc"><input type="number" class="cp-qty" step="any" min="0" value="1"><span class="muted">${esc(c.unit)}</span><b class="cp-tot">= ${money(c.price)}</b>
      <button class="btn small primary cp-add">＋ Ajouter</button></div></div>`).join('')
    : `<div class="empty">${db.catalog.length ? 'Aucune prestation ne correspond.' : 'Votre catalogue est vide. Créez votre première prestation (ex : Pose de parquet, m², 5,00 €).'}</div>`;
}
function cpAdd(row) {
  const c = db.catalog.find(x => x.id === row.dataset.id), q = getQuote(editingId);
  if (!c || !q) return;
  const qty = num(row.querySelector('.cp-qty').value) || 1;
  const line = { t: 'item', ref: c.ref || '', desc: c.desc, qty, unit: c.unit, price: c.price, vat: c.vat };
  const first = q.lines[0];
  if (q.lines.length === 1 && first.t === 'item' && !first.desc && !num(first.price)) q.lines[0] = line; else q.lines.push(line);
  save(); refreshLines();
  const b = row.querySelector('.cp-add'); b.textContent = '✓ Ajouté'; setTimeout(() => { b.textContent = '＋ Ajouter'; }, 1200);
  toast(`+ ${c.desc} : ${qty} ${c.unit} = ${money(qty * num(c.price))}`);
}
Object.assign(actions, {
  'catalog-open': () => catalogPicker(),
  'cp-new': () => itemModal(null, () => catalogPicker()),
  'line-save'(t) {
    const q = getQuote(editingId), l = q.lines[+t.closest('.line').dataset.i];
    if (!l || !String(l.desc).trim()) return toast('Renseignez d\'abord la désignation');
    const same = db.catalog.find(c => (l.ref && c.ref === l.ref) || c.desc.trim().toLowerCase() === String(l.desc).trim().toLowerCase());
    const data = { ref: l.ref || '', desc: String(l.desc).trim(), unit: l.unit, price: num(l.price), vat: num(l.vat) };
    if (same) { Object.assign(same, data); toast(`Prestation mise à jour dans le catalogue (${money(data.price)} / ${data.unit})`); }
    else { db.catalog.push({ id: uid(), ...data }); toast(`Enregistré dans le catalogue : ${data.desc} (${money(data.price)} / ${data.unit})`); }
    save();
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'cpSearch') cpRender();
  if (e.target.classList.contains('cp-qty')) {
    const row = e.target.closest('.cp-row'), c = db.catalog.find(x => x.id === row.dataset.id);
    row.querySelector('.cp-tot').textContent = '= ' + money(num(e.target.value) * num(c.price));
  }
  if (e.target.id === 'catSearch') {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#catTable tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); });
  }
});
document.addEventListener('click', e => { const b = e.target.closest('.cp-add'); if (b) cpAdd(b.closest('.cp-row')); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('cp-qty')) { e.preventDefault(); cpAdd(e.target.closest('.cp-row')); } });
