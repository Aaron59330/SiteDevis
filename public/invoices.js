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
