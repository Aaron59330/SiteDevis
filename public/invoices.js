'use strict';
/* Factures : création à partir d'un devis, liste, suivi des règlements.
   Une facture est un document au même format qu'un devis (db.quotes, kind = 'facture'),
   ce qui permet de réutiliser l'éditeur, l'aperçu et l'impression PDF. */

const invFilter = { q: '', status: '', quote: '' };
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
    return (!invFilter.q || hay.includes(invFilter.q.toLowerCase())) && (!invFilter.status || invState(q) === invFilter.status) && (!invFilter.quote || q.fromQuoteId === invFilter.quote);
  }).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));

  return `
  <div class="row between" style="margin-bottom:16px">
    <h1>Factures</h1>
    <div class="row"><button class="btn" data-act="goto-quotes">← Voir les devis</button><button class="btn" data-act="import-pdf">Importer un PDF</button><button class="btn primary" data-act="new-invoice">＋ Facture vierge</button></div>
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
      <select id="invQuote" style="width:230px"><option value="">Tous les devis</option>${db.quotes.filter(d => !isInv(d) && all.some(i => i.fromQuoteId === d.id)).map(d => `<option value="${d.id}" ${invFilter.quote === d.id ? 'selected' : ''}>${esc(d.number)}${d.title ? ' — ' + esc(d.title.slice(0, 28)) : ''}</option>`).join('')}</select>
    </div>
    ${list.length ? `<table class="list">
      <thead><tr><th>Numéro</th><th>Client</th><th>Devis</th><th>Émise le</th><th>Échéance</th><th>Statut</th><th class="right">Total TTC</th><th class="right">Reste dû</th><th></th></tr></thead>
      <tbody>${list.map(q => {
        const c = getClient(q.clientId), st = invState(q), t = totals(q);
        return `<tr>
          <td><a href="#" data-act="edit" data-id="${q.id}"><b>${esc(q.number)}</b></a></td>
          <td>${esc(c ? c.name : '—')}</td>
          <td>${q.fromQuoteId && getQuote(q.fromQuoteId) ? `<a href="#" data-act="billing-view" data-id="${q.fromQuoteId}" title="Voir toutes les factures de ce devis">${esc(q.fromNumber)}</a>` : esc(q.fromNumber || '—')}${q.stepLabel ? `<div class="muted" style="font-size:.78rem">${esc(q.stepLabel)}${q.stepPct ? ' · ' + fmtNum.format(num(q.stepPct)) + ' %' : ''}</div>` : ''}</td>
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
    serviceDate: '', validUntil: '', status: 'brouillon', payments: src ? (src.payments || []).map(x => ({ id: uid(), pct: x.pct, label: x.label, invoiceId: '' })) : [], alreadyPaid: 0, payMethod: 'Virement bancaire', paidAt: '',
    fromQuoteId: src ? src.id : '', fromNumber: src ? src.number : ''
  });
  inv.opts = { ...inv.opts, docLabel: 'FACTURE', agreeLabel: '' };
  bumpNumber('facture');
  db.quotes.push(inv);
  return inv;
}

/* ---------- Une facture par échéance de paiement du devis ---------- */
const hasSteps = q => (q.payments || []).some(p => num(p.pct) > 0);
const nextStep = q => (q.payments || []).findIndex(p => num(p.pct) > 0 && !(p.invoiceId && getQuote(p.invoiceId)));
const shortDate = (iso, ref) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}${ref && ref.slice(0, 4) !== y ? '/' + y : ''}`; };

/* Récapitulatif « Conditions de paiement » d'une facture d'échéance : les échéances déjà réglées sont notées « payé le … » */
function stepRecap(inv) {
  const src = getQuote(inv.fromQuoteId); if (!src || !inv.stepId) return null;
  const t = totals(src), pays = src.payments.filter(p => num(p.pct) > 0);
  if (!pays.length) return null;
  return `<div class="pay-title">Conditions de paiement :</div>` + pays.map((p, i) => {
    const pi = p.invoiceId ? getQuote(p.invoiceId) : null;
    const paid = pi && pi.status === 'payee' ? ` (payé${pi.paidAt ? ' le ' + shortDate(pi.paidAt, inv.date) : ''})` : '';
    return `<div>• ${fmtNum.format(num(p.pct))} % soit ${money(t.ttc * num(p.pct) / 100)}${p.label ? ' : ' + esc(String(p.label).trim()) : ''}${paid}${i === pays.length - 1 ? ' .' : ''}</div>`;
  }).join('');
}

function createStepInvoice(src, idx) {
  const p = src.payments[idx], pct = num(p.pct), name = (p.label || 'Paiement').trim();
  const inv = createInvoice(src);              // reprend le détail complet du devis (lignes, remise, notes…)
  inv.payments = [];
  inv.title = `Facture ${name}`;
  inv.stepId = p.id; inv.stepLabel = p.label || ''; inv.stepPct = pct;   // les totaux ne comptent que cette part
  p.invoiceId = inv.id;
  if (src.status === 'brouillon' || src.status === 'envoye') src.status = 'accepte';
  return inv;
}

Object.assign(actions, {
  'open-step': t => go('editor', t.dataset.id),
  'pay-invoice'(t) {
    if (!requireAccess()) return;
    const src = getQuote(editingId), i = +t.closest('.pay').dataset.i;
    if (!src || isInv(src) || !src.payments[i]) return;
    if (src.payments.reduce((s, x) => s + num(x.pct), 0) > 100.001 && !confirm('Le total des échéances dépasse 100 %. Créer quand même cette facture ?')) return;
    const inv = createStepInvoice(src, i);
    save(); toast(`Facture ${inv.number} créée pour l'échéance « ${src.payments[i].label || 'Paiement'} »`);
    go('editor', inv.id);
  },
  'goto-quotes': () => go('quotes'),
  'new-invoice'() { if (!requireAccess()) return; const inv = createInvoice(null); save(); go('editor', inv.id); },
  /* Devis avec échéancier : « Facturer » crée la facture de la prochaine échéance (pas celle du devis complet) */
  'make-invoice'(t) {
    if (!requireAccess()) return;
    const src = getQuote(t.dataset.id || editingId); if (!src || isInv(src)) return;
    const idx = nextStep(src);
    if (idx >= 0) {
      const inv = createStepInvoice(src, idx);
      save(); toast(`Facture ${inv.number} créée pour l'échéance « ${src.payments[idx].label || 'Paiement'} »`);
      return go('editor', inv.id);
    }
    if (hasSteps(src) && !confirm('Toutes les échéances de ce devis sont déjà facturées.\nCréer quand même une facture du devis complet ?')) return;
    actions['make-invoice-full'](t);
  },
  'make-invoice-full'(t) {
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
document.addEventListener('change', e => { if (e.target.id === 'invStatus') { invFilter.status = e.target.value; render(); } if (e.target.id === 'invQuote') { invFilter.quote = e.target.value; render(); } });

/* ---------- Factures reliées à un devis : bouton, badge et fenêtre de suivi ---------- */
const linkedInvoices = q => db.quotes.filter(i => isInv(i) && i.fromQuoteId === q.id).sort((a, b) => (a.date + a.number).localeCompare(b.date + b.number));
function linkedBtn(q) {
  const src = isInv(q) ? getQuote(q.fromQuoteId) : q; if (!src) return '';
  const n = linkedInvoices(src).length; if (!n && isInv(q)) return '';
  return n ? `<button class="btn" data-act="billing-view" data-id="${src.id}" title="Toutes les factures de ce devis, par échéance">Factures du devis (${n})</button>` : '';
}
function linkedBadge(q) {
  const l = linkedInvoices(q); if (!l.length) return '';
  const paid = l.filter(i => i.status === 'payee').length, steps = q.payments.filter(p => num(p.pct) > 0).length;
  const txt = steps > 1 ? `${l.length}/${steps} facturées` : (paid === l.length ? 'Payé' : 'Facturé');
  return ` <a href="#" class="badge info2" data-act="billing-view" data-id="${q.id}" title="Voir les factures de ce devis">${txt}${paid && steps > 1 ? ` · ${paid} payée${paid > 1 ? 's' : ''}` : ''}</a>`;
}
function billingModal(id, focus) {
  const q = getQuote(id); if (!q) return;
  const inv = linkedInvoices(q), t = totals(q), steps = q.payments.filter(p => num(p.pct) > 0);
  const live = inv.filter(i => i.status !== 'annulee');
  const billed = live.reduce((s, i) => s + totals(i).ttc, 0), paid = live.filter(i => i.status === 'payee').reduce((s, i) => s + totals(i).ttc, 0);
  const toBill = Math.max(0, t.ttc - billed), toCash = billed - paid;
  const pc = v => t.ttc > 0 ? Math.min(100, Math.max(0, v / t.ttc * 100)) : 0;
  const st = i => `<span class="badge ${invState(i)}">${INV_LABEL[invState(i)] || i.status}</span>`;
  const stepOf = new Map(); steps.forEach((p, k) => { const i = p.invoiceId && getQuote(p.invoiceId); if (i) stepOf.set(i.id, k); });
  const rows = steps.map((p, k) => {
    const i = p.invoiceId ? getQuote(p.invoiceId) : null, planned = t.ttc * num(p.pct) / 100;
    return `<tr class="${i && i.id === focus ? 'focus' : ''}"><td><b>${esc(p.label || 'Paiement ' + (k + 1))}</b><div class="muted" style="font-size:.78rem">${fmtNum.format(num(p.pct))} % · ${money(planned)}</div></td>
      <td>${i ? `<a href="#" data-act="billing-open" data-id="${i.id}"><b>${esc(i.number)}</b></a><div class="muted" style="font-size:.78rem">${fdate(i.date)}</div>` : '<span class="muted">pas encore facturée</span>'}</td>
      <td>${i ? st(i) : '—'}${i && i.status === 'payee' && i.paidAt ? `<div class="muted" style="font-size:.78rem">payée le ${fdate(i.paidAt)}</div>` : ''}${i && invState(i) === 'retard' ? `<div class="muted" style="font-size:.78rem;color:var(--danger)">échéance ${fdate(i.dueDate)}</div>` : ''}</td>
      <td class="right"><b>${money(i ? totals(i).ttc : planned)}</b></td>
      <td class="right" style="white-space:nowrap">${i ? `<button class="btn small" data-act="billing-open" data-id="${i.id}">Ouvrir</button>${i.status !== 'payee' && i.status !== 'annulee' ? ` <button class="btn small" data-act="billing-paid" data-id="${i.id}" data-q="${q.id}">✓ Payée</button>` : ''}` : `<button class="btn small primary" data-act="billing-make" data-id="${q.id}" data-i="${q.payments.indexOf(p)}">Facturer</button>`}</td></tr>`;
  }).join('');
  const others = inv.filter(i => !stepOf.has(i.id));
  const orows = others.map(i => `<tr class="${i.id === focus ? 'focus' : ''}"><td><b>${i.stepLabel ? esc(i.stepLabel) : 'Facture hors échéancier'}</b></td><td><a href="#" data-act="billing-open" data-id="${i.id}"><b>${esc(i.number)}</b></a><div class="muted" style="font-size:.78rem">${fdate(i.date)}</div></td><td>${st(i)}</td><td class="right"><b>${money(totals(i).ttc)}</b></td><td class="right"><button class="btn small" data-act="billing-open" data-id="${i.id}">Ouvrir</button></td></tr>`).join('');
  openModal(`<div class="modal-wide"><div class="row between"><h2 style="margin:0">Factures du devis ${esc(q.number)}</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
    <p class="muted" style="margin:6px 0 12px">${esc(q.title || '')}${(getClient(q.clientId) || {}).name ? ' — ' + esc(getClient(q.clientId).name) : ''}</p>
    <div class="stats" style="grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">
      <div class="stat" style="padding:12px"><div class="n" style="font-size:1.15rem">${money(t.ttc)}</div><div class="l">Total du devis</div></div>
      <div class="stat" style="padding:12px"><div class="n" style="font-size:1.15rem">${money(billed)}</div><div class="l">Facturé (${Math.round(pc(billed))} %)</div></div>
      <div class="stat" style="padding:12px"><div class="n" style="font-size:1.15rem;color:var(--ok)">${money(paid)}</div><div class="l">Payé (${Math.round(pc(paid))} %)</div></div>
      <div class="stat" style="padding:12px"><div class="n" style="font-size:1.15rem;color:${toCash > 0 ? 'var(--warn)' : 'inherit'}">${money(toCash)}</div><div class="l">Reste à encaisser</div></div></div>
    <div class="billbar"><i class="b1" style="width:${pc(billed)}%"></i><i class="b2" style="width:${pc(paid)}%"></i></div>
    <p class="muted" style="margin:6px 0 12px;font-size:.82rem">${toBill > 0.005 ? `Reste à facturer : <b>${money(toBill)}</b>.` : 'Le devis est entièrement facturé.'}</p>
    <table class="list"><thead><tr><th>Échéance</th><th>Facture</th><th>Statut</th><th class="right">Montant</th><th></th></tr></thead><tbody>${rows}${orows}</tbody></table>
    ${!steps.length && !inv.length ? '<div class="empty">Aucune facture pour ce devis.</div>' : ''}
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="edit" data-id="${q.id}" onclick="document.getElementById('modal').close()">Ouvrir le devis</button></div></div>`);
}
Object.assign(actions, {
  'billing-view'(t) { const q = getQuote(t.dataset.id); if (q) billingModal(q.id, isInv(getQuote(editingId) || {}) ? editingId : null); },
  'billing-open'(t) { $('#modal').close(); go('editor', t.dataset.id); },
  'billing-paid'(t) { const i = getQuote(t.dataset.id); if (!i) return; i.status = 'payee'; if (!i.paidAt) i.paidAt = today(); save(); billingModal(t.dataset.q, null); toast('Facture marquée comme payée'); },
  'billing-make'(t) {
    if (!requireAccess()) return; const src = getQuote(t.dataset.id), i = +t.dataset.i; if (!src || !src.payments[i]) return;
    const inv = createStepInvoice(src, i); save(); toast(`Facture ${inv.number} créée pour l'échéance « ${src.payments[i].label || 'Paiement'} »`); $('#modal').close(); go('editor', inv.id);
  }
});
