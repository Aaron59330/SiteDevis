'use strict';
/* Abonnement, paiement, factures, compte */
const eur = c => money(c / 100);
const dt = iso => iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';
const PAY_STATUS = { paid: ['accepte', 'Payé'], refunded: ['refuse', 'Remboursé'], pending: ['brouillon', 'En attente'], failed: ['refuse', 'Échoué'] };

EXTRA.billing = () => `<div id="billingRoot"><p class="muted">Chargement…</p></div>`;
AFTER.billing = async () => {
  try {
    const d = await api('GET', '/api/billing');
    session.access = d.access; updateTopbar();
    const root = $('#billingRoot'); if (root && view === 'billing') root.innerHTML = billingHtml(d);
  } catch (e) { toast(e.message); }
};

function accessCard(a) {
  if (session.user.role === 'admin') return `<div class="card"><h2>Compte administrateur</h2><p class="muted">Accès illimité, aucun abonnement nécessaire.</p></div>`;
  if (a.active) return `<div class="card status ok"><div><h2>Votre accès est actif ✓</h2>
    <p class="muted">${a.source === 'trial' ? 'Période d\'essai' : a.source === 'gift' ? 'Accès offert' : 'Abonnement'} — jusqu'au <b>${dt(a.until)}</b>. Vous pouvez prolonger à tout moment : la durée s'ajoute à celle restante.</p></div></div>`;
  return `<div class="card status bad"><div><h2>${a.reason === 'expired' ? 'Votre accès a expiré' : 'Un abonnement est nécessaire'}</h2>
    <p class="muted">Choisissez une offre pour créer et modifier vos devis. ${a.reason === 'expired' ? 'Vos données sont conservées et seront de nouveau accessibles dès le paiement.' : ''}</p></div></div>`;
}

function billingHtml(d) {
  const plans = d.plans.map(p => {
    const monthly = p.interval === 'year' ? `<div class="muted">soit ${eur(p.priceCents / 12)} / mois</div>` : '';
    const hot = planHot(p, d.plans);
    return `<div class="plan ${hot ? 'hot' : ''}">
      ${hot ? `<span class="ribbon">${esc(planRibbon(p, d.plans))}</span>` : ''}
      <h3>${esc(p.name)}</h3><div class="price">${eur(p.priceCents)}<small> / ${p.interval === 'year' ? 'an' : 'mois'}</small></div>${monthly}
      <p class="muted">${esc(p.description)}</p>
      <ul>${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <button class="btn primary block" data-act="subscribe" data-plan="${p.id}">${d.access.active && session.user.role !== 'admin' ? 'Prolonger' : 'Choisir cette offre'}</button></div>`;
  }).join('');
  const rows = d.payments.map(p => `<tr><td>${dt(p.paidAt || p.createdAt)}</td><td>${esc(p.receiptNo || '—')}</td><td>${esc(p.planName)}</td>
    <td class="right">${eur(p.amountCents)}</td><td><span class="badge ${PAY_STATUS[p.status][0]}">${PAY_STATUS[p.status][1]}</span></td>
    <td class="right">${p.status !== 'pending' ? `<a href="/receipt/${p.id}" target="_blank" class="btn small">Reçu</a>` : ''}</td></tr>`).join('');
  return `<h1>Abonnement</h1>${accessCard(d.access)}
    ${!d.stripe && d.simulated ? '<div class="devbox">Mode démonstration : le paiement est simulé, aucun débit réel n\'est effectué.</div>' : ''}
    ${d.stripe || d.simulated ? `<div class="plans">${plans}</div>` : '<div class="card muted">Les paiements ne sont pas disponibles pour le moment. Contactez le support.</div>'}
    <div class="card"><h2>Historique des paiements</h2>${rows ? `<table class="list"><thead><tr><th>Date</th><th>N° reçu</th><th>Offre</th><th class="right">Montant</th><th>Statut</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Aucun paiement pour le moment.</div>'}</div>`;
}

function payModal(s) {
  const m = $('#modal');
  m.innerHTML = `<form method="dialog" id="payForm">
    <h2>Paiement — ${esc(s.planName)}</h2>
    <div class="devbox" style="margin-top:0"><b>Mode démo</b> — carte de test, aucun débit réel. Ne saisissez jamais de vraie carte ici.</div>
    <div class="field"><label>Numéro de carte</label><input value="4242 4242 4242 4242" readonly></div>
    <div class="grid2"><div class="field"><label>Expiration</label><input value="12 / 34" readonly></div><div class="field"><label>CVC</label><input value="123" readonly></div></div>
    <div class="row between" style="margin-top:8px"><b style="font-size:1.2rem">${eur(s.amountCents)}</b>
      <div class="row"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary" id="payBtn">Payer ${eur(s.amountCents)}</button></div></div>
  </form>`;
  m.showModal();
  $('#payForm').onsubmit = async e => {
    e.preventDefault(); $('#payBtn').disabled = true;
    try {
      const r = await api('POST', '/api/billing/simulate', { paymentId: s.paymentId });
      session.access = r.access; updateTopbar(); m.close(); toast('✓ Paiement confirmé, merci !');
      if (view === 'billing') render();
    } catch (err) { toast(err.message); $('#payBtn').disabled = false; }
  };
}

actions.subscribe = async t => {
  t.disabled = true;
  try {
    const r = await api('POST', '/api/billing/checkout', { planId: t.dataset.plan });
    if (r.url) location.href = r.url; else if (r.simulate) payModal(r.simulate);
  } catch (e) { toast(e.message); }
  t.disabled = false;
};

/* ---------- Mon compte ---------- */
EXTRA.account = () => {
  const u = session.user;
  return `<h1>Mon compte</h1>
  <div class="editor" style="grid-template-columns:1fr 1fr">
    <div>
      <div class="card"><h2>Profil</h2>
        <form data-form="profile" novalidate>
          <div class="field"><label>Nom</label><input name="name" value="${esc(u.name)}" required></div>
          <div class="field"><label>Email (identifiant de connexion)</label><input value="${esc(u.email)}" disabled></div>
          <div class="form-err" hidden></div><button class="btn primary">Enregistrer</button>
        </form></div>
    </div>
    <div>
      <div class="card"><h2>Mot de passe</h2>
        <form data-form="password" novalidate>
          <div class="field"><label>Mot de passe actuel</label><input type="password" name="current" autocomplete="current-password" required></div>
          <div class="grid2"><div class="field"><label>Nouveau</label><input type="password" name="password" autocomplete="new-password" required></div>
          <div class="field"><label>Confirmation</label><input type="password" name="password2" autocomplete="new-password" required></div></div>
          <div class="form-err" hidden></div><button class="btn primary">Modifier le mot de passe</button>
        </form></div>
      ${u.role === 'admin' ? '' : `<div class="card"><h2>Supprimer mon compte</h2>
        <p class="muted">Action définitive : vos devis, clients et réglages seront effacés.</p>
        <form data-form="delete" novalidate><div class="field"><label>Confirmez avec votre mot de passe</label><input type="password" name="password" required></div>
        <div class="form-err" hidden></div><button class="btn danger">Supprimer définitivement mon compte</button></form></div>`}
    </div>
  </div>`;
};
forms.profile = f => withBusy(f, async () => {
  const r = await api('PATCH', '/api/me', { name: val(f, 'name') });
  session.user = r.user; updateTopbar(); formMsg(f, 'Profil enregistré ✓', true);
});
forms.password = f => withBusy(f, async () => {
  if (f.elements.password.value !== f.elements.password2.value) throw new Error('Les mots de passe ne correspondent pas.');
  await api('POST', '/api/me/password', { current: f.elements.current.value, password: f.elements.password.value });
  f.reset(); formMsg(f, 'Mot de passe modifié ✓', true);
});
forms.delete = f => withBusy(f, async () => {
  if (!confirm('Supprimer définitivement votre compte et toutes vos données ?')) return;
  await api('DELETE', '/api/me', { password: f.elements.password.value });
  location.href = '/';
});
