'use strict';
/* Panneau d'administration */
let adminTab = 'dashboard';
const adminState = { q: '', filter: '', page: 1, pq: '', pstatus: '' };
const ADMIN_TABS = [['dashboard', 'Tableau de bord'], ['users', 'Utilisateurs'], ['payments', 'Paiements'], ['plans', 'Offres'], ['messages', 'Questions'], ['settings', 'Réglages'], ['audit', 'Journal'], ['outbox', 'Emails']];
const dtt = iso => iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const root = () => $('#adminRoot');
const loading = '<p class="muted">Chargement…</p>';

EXTRA.admin = () => `<h1>🛡 Administration</h1>
  <div class="tabs">${ADMIN_TABS.map(([k, l]) => `<button data-act="admin-tab" data-tab="${k}" class="${k === adminTab ? 'on' : ''}">${l}${k === 'messages' && window.__adminUnread ? ` <b class="tab-count">${window.__adminUnread}</b>` : ''}</button>`).join('')}</div>
  <div id="adminRoot">${loading}</div>`;
AFTER.admin = () => { adminLoad(); };
actions['admin-tab'] = t => { adminTab = t.dataset.tab; render(); };

async function adminLoad() {
  try {
    const fn = { dashboard: adminDashboard, users: adminUsers, payments: adminPayments, plans: adminPlans, messages: adminMessages, settings: adminSettings, audit: adminAudit, outbox: adminOutbox }[adminTab];
    await fn();
  } catch (e) { if (root()) root().innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; }
}

const accessBadge = u => u.role === 'admin' ? '<span class="badge accepte">Admin ∞</span>'
  : u.access.active ? `<span class="badge accepte">Actif jusqu\x27au ${dt(u.accessUntil)}</span>`
  : u.accessUntil ? `<span class="badge refuse">Expiré ${dt(u.accessUntil)}</span>` : '<span class="badge brouillon">Aucun accès</span>';

/* ----- Tableau de bord ----- */
async function adminDashboard() {
  const s = await api('GET', '/api/admin/stats');
  if (!root()) return;
  const bars = (key, fmt) => {
    const max = Math.max(1, ...s.series.map(x => x[key]));
    return `<div class="bars">${s.series.map(x => `<div class="bar"><span class="v">${fmt(x[key])}</span><i style="height:${Math.max(3, x[key] / max * 100)}%"></i><span class="l">${x.month.slice(5)}/${x.month.slice(2, 4)}</span></div>`).join('')}</div>`;
  };
  const card = (n, l) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  root().innerHTML = `
    <div class="stats">${card(s.users, 'Utilisateurs')}${card(s.activeSubs, 'Abonnés actifs')}${card(eur(s.mrr), 'MRR estimé')}${card(eur(s.revenue30), 'Revenus (30 jours)')}</div>
    <div class="stats">${card(eur(s.revenueTotal), 'Revenus totaux')}${card(s.newWeek, 'Inscrits (7 jours)')}${card(s.quotes, 'Devis créés')}${card(s.suspended, 'Comptes suspendus')}</div>
    <div class="grid2"><div class="card"><h2>Revenus par mois</h2>${bars('revenue', v => v ? eur(v) : '')}</div>
    <div class="card"><h2>Inscriptions par mois</h2>${bars('signups', v => v || '')}</div></div>
    <div class="card"><h2>Derniers inscrits</h2>${usersTable(s.recent, false)}</div>`;
}

/* ----- Utilisateurs ----- */
function usersTable(rows, actionsCol = true) {
  if (!rows.length) return '<div class="empty">Aucun utilisateur.</div>';
  return `<table class="list"><thead><tr><th>Utilisateur</th><th>Statut</th><th>Accès</th><th>Devis</th><th class="right">Payé</th><th>Inscrit</th>${actionsCol ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(u => `<tr>
    <td><b>${esc(u.name)}</b><div class="muted" style="font-size:.82rem">${esc(u.email)}</div></td>
    <td>${u.role === 'admin' ? '<span class="badge envoye">Admin</span> ' : ''}${u.suspended ? '<span class="badge refuse">Suspendu</span> ' : ''}${u.verified ? '' : '<span class="badge brouillon">Email non vérifié</span>'}</td>
    <td>${accessBadge(u)}</td><td>${u.quotesCount}</td><td class="right">${eur(u.paidCents)}</td><td>${dt(u.createdAt)}</td>
    ${actionsCol ? `<td class="right"><button class="btn small" data-act="admin-user" data-id="${u.id}">Gérer</button></td>` : ''}</tr>`).join('')}</tbody></table>`;
}
async function adminUsers() {
  root().innerHTML = `<div class="card"><div class="row" style="margin-bottom:12px">
    <input id="uSearch" class="grow" style="max-width:340px" placeholder="🔍 Nom ou email…" value="${esc(adminState.q)}">
    <select id="uFilter" style="width:200px">${[['', 'Tous les comptes'], ['active', 'Accès actif'], ['inactive', 'Sans accès'], ['suspended', 'Suspendus'], ['unverified', 'Email non vérifié'], ['admin', 'Administrateurs']].map(([v, l]) => `<option value="${v}" ${adminState.filter === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn primary" style="margin-left:auto" data-act="admin-new-user">＋ Créer un utilisateur</button></div>
    <div id="uTable">${loading}</div></div>`;
  await usersReload();
}
async function usersReload() {
  const r = await api('GET', `/api/admin/users?q=${encodeURIComponent(adminState.q)}&filter=${adminState.filter}&page=${adminState.page}`);
  const el = $('#uTable'); if (!el) return;
  const pages = Math.max(1, Math.ceil(r.total / r.size));
  el.innerHTML = usersTable(r.rows) + `<div class="row between" style="margin-top:12px"><span class="muted">${r.total} utilisateur(s)</span>
    <div class="row"><button class="btn small" data-act="u-page" data-d="-1" ${r.page <= 1 ? 'disabled' : ''}>←</button><span class="muted">Page ${r.page} / ${pages}</span>
    <button class="btn small" data-act="u-page" data-d="1" ${r.page >= pages ? 'disabled' : ''}>→</button></div></div>`;
}
let uTimer;
document.addEventListener('input', e => {
  if (e.target.id === 'uSearch') { clearTimeout(uTimer); uTimer = setTimeout(() => { adminState.q = e.target.value; adminState.page = 1; usersReload().catch(x => toast(x.message)); }, 300); }
  if (e.target.id === 'pSearch') { clearTimeout(uTimer); uTimer = setTimeout(() => { adminState.pq = e.target.value; paymentsReload().catch(x => toast(x.message)); }, 300); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'uFilter') { adminState.filter = e.target.value; adminState.page = 1; usersReload().catch(x => toast(x.message)); }
  if (e.target.id === 'pStatus') { adminState.pstatus = e.target.value; paymentsReload().catch(x => toast(x.message)); }
});
actions['u-page'] = t => { adminState.page += +t.dataset.d; usersReload().catch(x => toast(x.message)); };

function modalForm(html) { const m = $('#modal'); m.innerHTML = html; m.showModal(); return m; }

actions['admin-new-user'] = () => {
  const m = modalForm(`<form id="nuForm"><h2>Créer un utilisateur</h2>
    <div class="field"><label>Nom</label><input name="name" required></div><div class="field"><label>Email</label><input type="email" name="email" required></div>
    <div class="grid3"><div class="field"><label>Mot de passe</label><input name="password" required></div>
    <div class="field"><label>Rôle</label><select name="role"><option value="user">Utilisateur</option><option value="admin">Administrateur</option></select></div>
    <div class="field"><label>Jours offerts</label><input type="number" name="days" min="0" value="0"></div></div>
    <p class="muted" style="font-size:.8rem">Le compte est créé directement vérifié. Mot de passe : 8 caractères min., lettres et chiffres.</p>
    <div class="form-err" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Créer</button></div></form>`);
  $('#nuForm').onsubmit = e => { e.preventDefault(); const f = e.target;
    withBusy(f, async () => {
      await api('POST', '/api/admin/users', { name: val(f, 'name'), email: val(f, 'email'), password: val(f, 'password'), role: val(f, 'role'), days: val(f, 'days') });
      m.close(); toast('Utilisateur créé'); adminLoad();
    }); };
};

actions['admin-user'] = async t => {
  const id = t.dataset.id;
  let d; try { d = await api('GET', '/api/admin/users/' + id); } catch (e) { return toast(e.message); }
  const u = d.user, self = u.id === session.user.id;
  const m = modalForm(`<div class="modal-wide"><div class="row between"><h2 style="margin:0">${esc(u.name)}</h2><button class="btn small" data-act="close-modal">✕</button></div>
    <p class="muted" style="margin-top:2px">${esc(u.email)} · inscrit le ${dt(u.createdAt)} · dernière connexion ${dtt(u.lastLoginAt)}</p>
    <div class="row" style="margin-bottom:14px">${accessBadge(u)} ${u.suspended ? '<span class="badge refuse">Suspendu</span>' : ''} ${u.verified ? '<span class="badge accepte">Email vérifié</span>' : '<span class="badge brouillon">Email non vérifié</span>'}
      <span class="muted">· ${u.quotesCount} devis · ${eur(u.paidCents)} payés</span></div>
    <form id="euForm"><div class="grid3"><div class="field"><label>Nom</label><input name="name" value="${esc(u.name)}"></div>
      <div class="field"><label>Email</label><input name="email" value="${esc(u.email)}"></div>
      <div class="field"><label>Rôle</label><select name="role" ${self ? 'disabled' : ''}><option value="user" ${u.role === 'user' ? 'selected' : ''}>Utilisateur</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrateur</option></select></div></div>
      <div class="form-err" hidden></div><button class="btn primary small">Enregistrer les modifications</button></form>
    <h3 style="margin-top:18px">Accès</h3>
    <form id="grantForm" class="row" style="flex-wrap:nowrap"><input name="days" type="number" min="1" value="30" style="width:90px"><span>jours</span>
      <input name="note" placeholder="Motif (facultatif)" class="grow"><button class="btn small">Offrir l'accès</button>
      <button type="button" class="btn small danger" id="revokeBtn">Révoquer</button></form>
    <h3 style="margin-top:18px">Actions</h3>
    <div class="row">
      ${self ? '' : `<button class="btn small" id="suspBtn">${u.suspended ? 'Réactiver le compte' : 'Suspendre le compte'}</button>`}
      ${u.verified ? '' : '<button class="btn small" id="verBtn">Marquer l\'email comme vérifié</button>'}
      <button class="btn small" id="resetBtn">Envoyer un lien de mot de passe</button>
      <button class="btn small" id="outBtn">Fermer ses sessions (${d.sessions.length})</button>
      ${self ? '' : '<button class="btn small danger" id="delBtn">Supprimer le compte</button>'}</div>
    <div id="uMsg"></div>
    <h3 style="margin-top:18px">Paiements</h3>${d.payments.length ? `<table class="list"><tbody>${d.payments.map(p => `<tr><td>${dt(p.paidAt || p.createdAt)}</td><td>${esc(p.planName)}</td><td>${eur(p.amountCents)}</td><td><span class="badge ${PAY_STATUS[p.status][0]}">${PAY_STATUS[p.status][1]}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun paiement.</p>'}
    <h3 style="margin-top:18px">Historique</h3>${d.history.length ? d.history.map(h => `<div class="muted" style="font-size:.85rem">${dtt(h.at)} — ${esc(h.action)} <i>${esc(h.detail)}</i> (par ${esc(h.actor)})</div>`).join('') : '<p class="muted">Rien.</p>'}</div>`);
  const done = msg => { if (msg) toast(msg); m.close(); adminLoad(); };
  const run = (fn, msg) => async () => { try { await fn(); done(msg); } catch (e) { toast(e.message); } };
  $('#euForm').onsubmit = e => { e.preventDefault(); const f = e.target; withBusy(f, async () => {
    await api('PATCH', '/api/admin/users/' + id, { name: val(f, 'name'), email: val(f, 'email'), ...(self ? {} : { role: val(f, 'role') }) }); done('Modifications enregistrées'); }); };
  $('#grantForm').onsubmit = e => { e.preventDefault(); const f = e.target; run(() => api('POST', `/api/admin/users/${id}/grant`, { days: val(f, 'days'), note: val(f, 'note') }), 'Accès offert')(); };
  $('#revokeBtn').onclick = () => confirm('Révoquer l\'accès de cet utilisateur ?') && run(() => api('POST', `/api/admin/users/${id}/revoke`), 'Accès révoqué')();
  if ($('#suspBtn')) $('#suspBtn').onclick = run(() => api('PATCH', '/api/admin/users/' + id, { suspended: !u.suspended }), u.suspended ? 'Compte réactivé' : 'Compte suspendu');
  if ($('#verBtn')) $('#verBtn').onclick = run(() => api('PATCH', '/api/admin/users/' + id, { verified: true }), 'Email vérifié');
  $('#outBtn').onclick = run(() => api('POST', `/api/admin/users/${id}/logout`), 'Sessions fermées');
  $('#resetBtn').onclick = async () => {
    try { const r = await api('POST', `/api/admin/users/${id}/reset-link`);
      $('#uMsg').innerHTML = `<div class="notice ok" style="margin-top:10px">Email envoyé.${r.devLink ? ` <div class="devbox">Mode démo — lien : <a href="${esc(r.devLink)}">${esc(r.devLink)}</a></div>` : ''}</div>`; }
    catch (e) { toast(e.message); } };
  if ($('#delBtn')) $('#delBtn').onclick = () => confirm(`Supprimer définitivement ${u.email} et toutes ses données ?`) && run(() => api('DELETE', '/api/admin/users/' + id), 'Utilisateur supprimé')();
};

/* ----- Paiements ----- */
let payRows = [];
async function adminPayments() {
  root().innerHTML = `<div class="card"><div class="row" style="margin-bottom:12px">
    <input id="pSearch" class="grow" style="max-width:300px" placeholder="🔍 Email ou n° de reçu…" value="${esc(adminState.pq)}">
    <select id="pStatus" style="width:170px">${[['', 'Tous'], ['paid', 'Payés'], ['refunded', 'Remboursés'], ['pending', 'En attente']].map(([v, l]) => `<option value="${v}" ${adminState.pstatus === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="row" style="margin-left:auto"><button class="btn" data-act="pay-csv">⬇ Export CSV</button><button class="btn primary" data-act="admin-new-pay">＋ Paiement manuel</button></div></div>
    <div id="pTable">${loading}</div></div>`;
  await paymentsReload();
}
async function paymentsReload() {
  const r = await api('GET', `/api/admin/payments?q=${encodeURIComponent(adminState.pq)}&status=${adminState.pstatus}`);
  payRows = r.rows;
  const el = $('#pTable'); if (!el) return;
  const total = r.rows.filter(p => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);
  el.innerHTML = r.rows.length ? `<table class="list"><thead><tr><th>Date</th><th>Reçu</th><th>Client</th><th>Offre</th><th>Moyen</th><th class="right">Montant</th><th>Statut</th><th></th></tr></thead><tbody>${r.rows.map(p => `<tr>
    <td>${dt(p.paidAt || p.createdAt)}</td><td>${esc(p.receiptNo || '—')}</td><td>${esc(p.userEmail)}</td><td>${esc(p.planName)}</td>
    <td>${{ stripe: 'Stripe', simulated: 'Démo', manual: 'Manuel' }[p.provider]}</td><td class="right">${eur(p.amountCents)}</td>
    <td><span class="badge ${PAY_STATUS[p.status][0]}">${PAY_STATUS[p.status][1]}</span></td>
    <td class="right" style="white-space:nowrap">${p.status !== 'pending' ? `<a class="btn small" target="_blank" href="/receipt/${p.id}">Reçu</a> ` : ''}${p.status === 'paid' ? `<button class="btn small danger" data-act="refund" data-id="${p.id}">Rembourser</button>` : ''}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin-top:10px">Total encaissé sur cette liste : <b>${eur(total)}</b></p>` : '<div class="empty">Aucun paiement.</div>';
}
actions['pay-csv'] = () => {
  const lines = [['Date', 'Reçu', 'Email', 'Offre', 'Moyen', 'Montant EUR', 'Statut']].concat(payRows.map(p => [dt(p.paidAt || p.createdAt), p.receiptNo || '', p.userEmail, p.planName, p.provider, (p.amountCents / 100).toFixed(2).replace('.', ','), p.status]));
  const blob = new Blob(['﻿' + lines.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'paiements.csv'; a.click(); URL.revokeObjectURL(a.href);
};
actions.refund = async t => {
  const revoke = confirm('Rembourser ce paiement ?\n\nOK = continuer. L\'étape suivante vous demandera si l\'accès doit aussi être retiré.');
  if (!revoke) return;
  try { await api('POST', `/api/admin/payments/${t.dataset.id}/refund`, { revoke: confirm('Retirer aussi l\'accès de cet utilisateur ?') }); toast('Paiement remboursé'); paymentsReload(); }
  catch (e) { toast(e.message); }
};
actions['admin-new-pay'] = async () => {
  const plans = (await api('GET', '/api/admin/plans')).plans;
  const m = modalForm(`<form id="mpForm"><h2>Enregistrer un paiement manuel</h2>
    <p class="muted">Pour un virement, un chèque ou un paiement en espèces. L'accès de l'utilisateur est prolongé.</p>
    <div class="field"><label>Email de l'utilisateur</label><input name="email" type="email" required></div>
    <div class="grid2"><div class="field"><label>Offre</label><select name="planId">${plans.map(p => `<option value="${p.id}" data-price="${p.priceCents / 100}">${esc(p.name)} — ${eur(p.priceCents)}</option>`).join('')}<option value="">Autre (30 jours)</option></select></div>
    <div class="field"><label>Montant reçu (€)</label><input name="amount" type="number" step="0.01" min="0" value="${plans[0] ? plans[0].priceCents / 100 : 0}" required></div></div>
    <div class="field"><label>Note</label><input name="note" placeholder="Ex : virement du 12/10"></div>
    <div class="form-err" hidden></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
  const f = $('#mpForm');
  f.elements.planId.onchange = () => { const o = f.elements.planId.selectedOptions[0]; if (o.dataset.price) f.elements.amount.value = o.dataset.price; };
  f.onsubmit = e => { e.preventDefault(); withBusy(f, async () => {
    const r = await api('GET', '/api/admin/users?q=' + encodeURIComponent(val(f, 'email')));
    const u = r.rows.find(x => x.email === val(f, 'email').toLowerCase());
    if (!u) throw new Error('Aucun utilisateur avec cet email.');
    await api('POST', '/api/admin/payments', { userId: u.id, planId: val(f, 'planId'), amount: val(f, 'amount'), note: val(f, 'note') });
    m.close(); toast('Paiement enregistré'); adminLoad(); }); };
};

/* ----- Offres ----- */
async function adminPlans() {
  const [{ plans }, { settings }] = await Promise.all([api('GET', '/api/admin/plans'), api('GET', '/api/admin/settings')]);
  if (!root()) return;
  const td = Number(settings.trialDays) || 0;
  window._plans = plans;
  root().innerHTML = `<div class="row between" style="margin-bottom:12px"><p class="muted" style="margin:0">Les offres actives sont proposées sur la page d’accueil (Tarifs) et la page Abonnement, <b>dans cet ordre</b> : utilisez ← → pour les déplacer.</p><button class="btn primary" data-act="plan-edit">＋ Nouvelle offre</button></div>
  <div class="plans"><div class="plan plan-trial ${td ? '' : 'off'}"><div class="row plan-move"><span class="muted">Toujours en premier</span></div>
    <h3>Essai gratuit ${td ? '' : '<span class="badge brouillon">Désactivé</span>'}</h3><div class="price">0 €<small> / ${td || 0} jours</small></div>
    <p class="muted">Donné automatiquement à chaque nouveau compte, dès la confirmation de son email. Affiché en premier sur la page Tarifs de l’accueil.</p>
    <form id="trialForm" class="row" style="align-items:flex-end;gap:8px"><div class="field" style="margin:0;flex:1"><label>Durée (jours, 0 = pas d’essai)</label><input type="number" name="trialDays" min="0" max="365" value="${td}"></div><button class="btn small primary">Enregistrer</button></form></div>
  ${plans.map((p, i) => `<div class="plan ${p.active ? '' : 'off'} ${planHot(p, plans) ? 'hot' : ''}">${planHot(p, plans) ? `<span class="ribbon">${esc(planRibbon(p, plans))}</span>` : ''}
    <div class="row plan-move"><button class="btn small" data-act="plan-move" data-id="${p.id}" data-dir="-1" ${i ? '' : 'disabled'} title="Placer avant">←</button><span class="muted">Position ${i + 1}</span><button class="btn small" data-act="plan-move" data-id="${p.id}" data-dir="1" ${i < plans.length - 1 ? '' : 'disabled'} title="Placer après">→</button></div>
    <h3>${esc(p.name)} ${p.active ? '' : '<span class="badge brouillon">Désactivée</span>'}</h3>
    <div class="price">${eur(p.priceCents)}<small> / ${planPer(p)}</small></div><p class="muted">${esc(p.description)}</p>
    <ul>${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <div class="row"><button class="btn small" data-act="plan-edit" data-id="${p.id}">Modifier</button><button class="btn small danger" data-act="plan-del" data-id="${p.id}">Supprimer</button></div></div>`).join('')}</div>`;
  const tf = $('#trialForm');
  tf.onsubmit = async e => { e.preventDefault(); try { await api('PATCH', '/api/admin/settings', { trialDays: tf.elements.trialDays.value }); session.config.trialDays = Math.max(0, parseInt(tf.elements.trialDays.value, 10) || 0); toast('Essai gratuit enregistré'); adminLoad(); } catch (err) { toast(err.message); } };
}
actions['plan-edit'] = t => {
  const p = (window._plans || []).find(x => x.id === t.dataset.id) || { name: '', priceCents: 990, interval: 'month', description: '', features: [], active: true };
  const m = modalForm(`<form id="plForm"><h2>${t.dataset.id ? 'Modifier' : 'Nouvelle'} offre</h2>
    <div class="field"><label>Nom</label><input name="name" value="${esc(p.name)}" required></div>
    <div class="grid2"><div class="field"><label>Prix (€)</label><input name="price" type="number" step="0.01" min="0.5" value="${p.priceCents / 100}" required></div>
    <div class="field"><label>Durée d'accès par paiement</label><select name="interval"><option value="month" ${p.interval === 'month' ? 'selected' : ''}>1 mois</option><option value="quarter" ${p.interval === 'quarter' ? 'selected' : ''}>3 mois (trimestre)</option><option value="year" ${p.interval === 'year' ? 'selected' : ''}>1 an</option></select></div></div>
    <div class="field"><label>Description</label><input name="description" value="${esc(p.description)}"></div>
    <div class="field"><label>Avantages (un par ligne)</label><textarea name="features" rows="5">${esc(p.features.join('\n'))}</textarea></div>
    <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Offre active (visible par les utilisateurs)</label>
    <label class="check"><input type="checkbox" name="featured" ${planHot(p, window._plans || []) ? 'checked' : ''}> Mettre cette offre en avant (cadre et bandeau)</label>
    <div class="field"><label>Texte du bandeau (facultatif)</label><input name="badge" maxlength="40" value="${esc(p.badge || '')}" placeholder="Ex : Le plus choisi — vide = « Le plus avantageux »"></div>
    <div class="form-err" hidden></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
  const f = $('#plForm');
  f.onsubmit = e => { e.preventDefault(); withBusy(f, async () => {
    const body = { name: val(f, 'name'), price: val(f, 'price'), interval: val(f, 'interval'), description: val(f, 'description'), features: f.elements.features.value, active: f.elements.active.checked, featured: f.elements.featured.checked, badge: val(f, 'badge') };
    await api(t.dataset.id ? 'PATCH' : 'POST', '/api/admin/plans' + (t.dataset.id ? '/' + t.dataset.id : ''), body);
    m.close(); toast('Offre enregistrée'); adminLoad(); }); };
};
actions['plan-move'] = async t => {
  const ids = (window._plans || []).map(p => p.id), i = ids.indexOf(t.dataset.id), j = i + Number(t.dataset.dir);
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  try { await api('POST', '/api/admin/plans/order', { ids }); adminLoad(); toast('Ordre des offres enregistré'); } catch (e) { toast(e.message); }
};
actions['plan-del'] = async t => {
  if (!confirm('Supprimer cette offre ? (les paiements passés sont conservés)')) return;
  try { await api('DELETE', '/api/admin/plans/' + t.dataset.id); adminLoad(); } catch (e) { toast(e.message); }
};

/* ----- Réglages ----- */
async function adminSettings() {
  const { settings: s, env } = await api('GET', '/api/admin/settings');
  if (!root()) return;
  const st = (okv, label, hint) => `<div class="env ${okv ? 'on' : 'off'}"><b>${okv ? '✓' : '○'} ${label}</b><span class="muted">${hint}</span></div>`;
  root().innerHTML = `<div class="editor" style="grid-template-columns:1fr 1fr"><div class="card"><h2>Général</h2>
    <form data-form="settings" novalidate>
      <div class="field"><label>Nom du site</label><input name="siteName" value="${esc(s.siteName)}"></div>
      <div class="grid2"><div class="field"><label>Essai gratuit (jours)</label><input type="number" name="trialDays" min="0" max="365" value="${s.trialDays}"></div>
      <div class="field"><label>Email de support</label><input name="supportEmail" value="${esc(s.supportEmail)}"></div></div>
      <label class="check"><input type="checkbox" name="aiEnabled" ${s.aiEnabled !== false ? 'checked' : ''}> Assistant IA de relecture des devis activé</label>
      <label class="check"><input type="checkbox" name="registrationOpen" ${s.registrationOpen ? 'checked' : ''}> Inscriptions ouvertes</label>
      <label class="check"><input type="checkbox" name="requireVerification" ${s.requireVerification ? 'checked' : ''}> Exiger la confirmation de l'email</label>
      <p class="muted" style="font-size:.8rem">L'essai gratuit est accordé à la confirmation de l'email (une seule fois par compte).</p>
      <div class="form-err" hidden></div><button class="btn primary">Enregistrer</button></form></div>
    <div class="card"><h2>Intégrations</h2>
      ${st(env.ai, 'Assistant IA (Claude)', env.ai ? `Actif — modèle ${esc(env.aiModel)}, ${env.aiTotal} analyse(s) effectuée(s). Chaque analyse est facturée par Anthropic.` : 'Non configuré : renseignez ANTHROPIC_API_KEY dans .env (et lancez npm install).')}
      ${st(env.mail, 'Envoi d\'emails (Resend)', env.mail ? 'Les emails sont réellement envoyés.' : 'Non configuré : emails visibles dans l\'onglet « Emails » (mode démo). Renseignez RESEND_API_KEY et MAIL_FROM dans .env.')}
      ${st(env.stripe, 'Paiement par carte (Stripe)', env.stripe ? 'Paiements réels activés.' : 'Non configuré : paiements simulés. Renseignez STRIPE_SECRET_KEY dans .env.')}
      ${st(env.webhook, 'Webhook Stripe', env.webhook ? 'Signature vérifiée.' : 'Optionnel : STRIPE_WEBHOOK_SECRET (endpoint /api/stripe/webhook).')}
      ${env.simulated ? st(false, 'Paiements de démonstration ACTIFS', 'Tout utilisateur peut obtenir un accès gratuit. En production : ALLOW_SIMULATED_PAYMENTS=false.') : ''}
      <p class="muted" style="margin-top:12px">URL publique : <code>${esc(env.appUrl)}</code></p></div></div>`;
}
forms.settings = f => withBusy(f, async () => {
  const r = await api('PATCH', '/api/admin/settings', { siteName: val(f, 'siteName'), trialDays: val(f, 'trialDays'), supportEmail: val(f, 'supportEmail'),
    registrationOpen: f.elements.registrationOpen.checked, aiEnabled: f.elements.aiEnabled.checked, requireVerification: f.elements.requireVerification.checked });
  session.config.siteName = r.settings.siteName; session.config.registrationOpen = r.settings.registrationOpen; formMsg(f, 'Réglages enregistrés ✓', true);
});

/* ----- Journal & emails ----- */
async function adminAudit() {
  const { rows } = await api('GET', '/api/admin/audit');
  if (!root()) return;
  root().innerHTML = `<div class="card"><h2>Journal d'activité</h2>${rows.length ? `<table class="list"><thead><tr><th>Date</th><th>Par</th><th>Action</th><th>Cible</th><th>Détail</th></tr></thead><tbody>${rows.map(r => `<tr><td>${dtt(r.at)}</td><td>${esc(r.actor)}</td><td>${esc(r.action)}</td><td>${esc(r.target)}</td><td class="muted">${esc(r.detail)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune activité.</div>'}</div>`;
}
async function adminOutbox() {
  const { rows, configured } = await api('GET', '/api/admin/outbox');
  if (!root()) return;
  const link = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  root().innerHTML = `<div class="card"><h2>Emails envoyés</h2>${configured ? '' : '<div class="devbox" style="margin-top:0">Mode démo : ces emails n\'ont pas été réellement envoyés. Configurez Resend pour les envoyer.</div>'}
    ${rows.length ? rows.map(r => `<details class="mail"><summary><b>${esc(r.subject)}</b> <span class="muted">→ ${esc(r.to)} · ${dtt(r.at)} · ${esc(r.status)}</span></summary><pre>${link(r.text)}${r.error ? '\n\nErreur : ' + esc(r.error) : ''}</pre></details>`).join('') : '<div class="empty">Aucun email.</div>'}</div>`;
}

/* ----- Questions des visiteurs (page Questions de l'accueil) ----- */
const MSG_ST = { new: ['envoye', 'Nouvelle'], read: ['brouillon', 'Lue'], done: ['accepte', 'Répondue'] };
async function adminMessages() {
  const { rows, unread } = await api('GET', '/api/admin/messages');
  if (!root()) return;
  window.__adminUnread = unread; if (window.notifRefresh) window.notifRefresh();
  root().innerHTML = `<p class="muted" style="margin-top:0">Questions posées depuis la page <b>Questions</b> de l'accueil. Vous recevez aussi chaque question par email : vous pouvez y répondre directement depuis votre messagerie.</p>
  ${rows.length ? rows.map(m => `<div class="card msg ${m.status === 'new' ? 'unread' : ''}" id="m-${m.id}">
    <div class="row between" style="align-items:flex-start"><div><b>${esc(m.name)}</b> <a class="muted" href="mailto:${esc(m.email)}">${esc(m.email)}</a><div class="muted" style="font-size:.8rem">${dtt(m.at)}</div></div>
      <span class="badge ${MSG_ST[m.status][0]}">${MSG_ST[m.status][1]}</span></div>
    <p class="msg-text">${esc(m.text)}</p>
    ${(m.replies || []).map(r => `<div class="msg-reply"><div class="muted" style="font-size:.78rem">Votre réponse · ${dtt(r.at)}</div>${esc(r.text)}</div>`).join('')}
    <div class="row" style="flex-wrap:wrap"><button class="btn small primary" data-act="msg-reply" data-id="${m.id}">✉ Répondre</button>
      ${m.status === 'new' ? `<button class="btn small" data-act="msg-st" data-id="${m.id}" data-st="read">Marquer comme lue</button>` : m.status === 'read' ? `<button class="btn small" data-act="msg-st" data-id="${m.id}" data-st="done">Marquer comme traitée</button>` : `<button class="btn small" data-act="msg-st" data-id="${m.id}" data-st="new">Marquer non lue</button>`}
      <button class="btn small danger" data-act="msg-del" data-id="${m.id}">Supprimer</button></div></div>`).join('')
  : '<div class="card empty">Aucune question pour le moment.</div>'}`;
}
actions['msg-st'] = async t => { try { await api('PATCH', '/api/admin/messages/' + t.dataset.id, { status: t.dataset.st }); adminLoad(); } catch (e) { toast(e.message); } };
actions['msg-del'] = async t => { if (!confirm('Supprimer cette question ?')) return; try { await api('DELETE', '/api/admin/messages/' + t.dataset.id); adminLoad(); } catch (e) { toast(e.message); } };
actions['msg-reply'] = t => {
  const m = modalForm(`<form id="mrForm"><h2>Répondre</h2><p class="muted" style="margin-top:0">La réponse est envoyée par email ; la question est rappelée en dessous.</p>
    <div class="field"><label>Votre réponse</label><textarea name="text" rows="7" required></textarea></div>
    <div class="form-err" hidden></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Envoyer</button></div></form>`);
  const f = $('#mrForm'); f.elements.text.focus();
  f.onsubmit = e => { e.preventDefault(); withBusy(f, async () => { await api('POST', '/api/admin/messages/' + t.dataset.id + '/reply', { text: f.elements.text.value }); m.close(); toast('Réponse envoyée'); adminLoad(); }); };
};
