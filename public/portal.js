'use strict';
/* Espace client.
   1) Côté artisan : ouvrir à un client (par son email) le suivi de ses devis et factures, l'inviter par email,
      retirer l'accès ; reporter dans les devis les réponses données en ligne (accepté / refusé).
   2) Côté client : connexion sans mot de passe (lien reçu par email), liste de ses documents chez chaque
      artisan, statut et montants, consultation, PDF, acceptation ou refus d'un devis en ligne. */
(function () {
  const fd = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';
  const fdt = d => d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const todayIso = () => new Date().toISOString().slice(0, 10);

  /* ================= Côté artisan ================= */
  let grants = null;
  async function loadGrants() { try { grants = (await api('GET', '/api/portal/grants')).rows; } catch (e) { grants = grants || []; } return grants; }
  async function clientPortalModal(clientId) {
    const c = getClient(clientId); if (!c) return;
    await loadGrants();
    const g = grants.find(x => x.clientId === c.id);
    const docs = db.quotes.filter(q => q.clientId === c.id && q.status !== 'brouillon').length;
    const m = openModal(`<form id="ptForm"><div class="row between"><h2 style="margin:0">Espace client</h2><button type="button" class="btn small" data-act="close-modal">Fermer</button></div>
      <p class="muted" style="margin:8px 0 14px"><b>${esc(c.name)}</b> pourra consulter en ligne ses devis et factures (${docs} document${docs > 1 ? 's' : ''} envoyé${docs > 1 ? 's' : ''} pour l’instant), suivre leur statut, les télécharger en PDF et <b>accepter un devis en ligne</b>. Sans compte ni mot de passe : il se connecte avec son adresse email. Les brouillons ne sont jamais visibles.</p>
      ${g ? `<div class="notice ok" style="margin-bottom:12px">Accès ouvert pour <b>${esc(g.email)}</b> depuis le ${fd(g.createdAt)} · ${g.lastAt ? 'dernière visite le ' + fd(g.lastAt) : 'pas encore de visite'}</div>` : ''}
      <div class="field"><label>Email du client</label><input name="email" type="email" required value="${esc((g && g.email) || c.email || '')}" placeholder="client@exemple.fr"></div>
      ${session.config.mailConfigured ? `<label class="check"><input type="checkbox" name="send" checked> ${g ? 'Renvoyer' : 'Envoyer'} l’invitation par email</label>` : ''}
      <div class="form-err" hidden></div>
      <div class="row" style="justify-content:space-between;margin-top:14px">${g ? `<button type="button" class="btn danger" id="ptDel">Retirer l’accès</button>` : '<span></span>'}<button class="btn primary">${g ? 'Mettre à jour' : 'Ouvrir l’espace client'}</button></div></form>`);
    const f = m.querySelector('#ptForm'), er = f.querySelector('.form-err');
    f.onsubmit = async ev => {
      ev.preventDefault(); er.hidden = true;
      const email = f.elements.email.value.trim();
      if (!email) { er.textContent = 'Indiquez l’email du client.'; er.hidden = false; return; }
      try {
        await flushSave();
        const r = await api('POST', '/api/portal/grants', { clientId: c.id, email, name: c.contact || c.name, send: !!(f.elements.send && f.elements.send.checked) });
        if (!c.email) { c.email = email; save(); }
        grants = null; showGrantLink(c, r);
      } catch (e2) { er.textContent = e2.message; er.hidden = false; }
    };
    const del = m.querySelector('#ptDel');
    if (del) del.onclick = async () => {
      if (!confirm(`Retirer l’accès de ${c.name} ? Son lien ne fonctionnera plus.`)) return;
      try { await api('DELETE', '/api/portal/grants/' + g.id); grants = null; m.close(); toast('Accès retiré'); if (view === 'clients') render(); } catch (e) { toast(e.message); }
    };
  }
  function showGrantLink(c, r) {
    openModal(`<div><h2>Espace client ouvert ✓</h2>
      <p>${r.sent ? `L’invitation a été envoyée à <b>${esc(r.grant.email)}</b>. Vous pouvez aussi transmettre ce lien vous-même :` : `Transmettez ce lien personnel à ${esc(c.name)} (email, SMS, WhatsApp…) :`}</p>
      <div class="sh-link"><input readonly value="${esc(r.link)}" id="ptLink"><button class="btn small" id="ptCopy">Copier</button></div>
      <p class="muted" style="font-size:.8rem">Lien valable 60 jours. Ensuite, votre client se reconnecte à tout moment sur <b>${esc(location.host)}/?espace</b> avec son email. Astuce : en envoyant un devis par email, cochez « lien vers l’espace client ».</p>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-act="close-modal">Terminé</button></div></div>`);
    $('#ptCopy').onclick = async () => { try { await navigator.clipboard.writeText(r.link); } catch (e) { $('#ptLink').select(); document.execCommand('copy'); } toast('Lien copié'); };
    if (view === 'clients') render();
  }
  /* enregistre tout de suite (le serveur vérifie que le client existe) */
  async function flushSave() { try { await api('PUT', '/api/data', db); } catch (e) { /* l'enregistrement normal réessaiera */ } }

  /* réponses données en ligne par les clients → statut des devis */
  let syncing = false;
  window.portalSync = async function () {
    if (syncing || session.viewer || session.portal || !session.user) return;
    syncing = true;
    try {
      const rows = (await api('GET', '/api/portal/events')).rows; if (!rows.length) return;
      const done = [];
      for (const e of rows) {
        const q = getQuote(e.quoteId);
        if (q) {
          q.online = { type: e.type, name: e.name, at: e.at, reason: e.reason || '', email: e.email };
          if (['brouillon', 'envoye'].includes(q.status)) q.status = e.type === 'accept' ? 'accepte' : 'refuse';
          toast(e.type === 'accept' ? `✅ Devis ${q.number} accepté en ligne par ${e.name}` : `Devis ${q.number} refusé en ligne par le client`);
          if (e.type === 'accept' && window.celebrate) celebrate();
        }
        done.push(e.id);
      }
      save(); await api('POST', '/api/portal/events/ack', { ids: done });
      if (['quotes', 'editor', 'clients'].includes(view)) render();
    } catch (e) { /* hors ligne : on réessaiera */ }
    finally { syncing = false; }
  };
  setInterval(() => { if (document.visibilityState === 'visible') window.portalSync(); }, 120e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') window.portalSync(); });
  window.onlineAnswer = q => !q.online ? '' : `<div class="pt-answer ${q.online.type}">${q.online.type === 'accept'
    ? `✅ Accepté en ligne par <b>${esc(q.online.name)}</b> le ${fdt(q.online.at)}`
    : `✕ Refusé en ligne le ${fdt(q.online.at)}${q.online.reason ? ` — « ${esc(q.online.reason)} »` : ''}`}</div>`;

  /* ================= Côté client ================= */
  const P = { accounts: [], email: '', acc: null, qid: null, filter: 'all' };
  const accOf = id => P.accounts.find(a => a.id === id);
  /* les fonctions de rendu du site travaillent sur « db » : on y place l'artisan consulté */
  function useAccount(a) {
    db = normalize({ company: a.company, settings: a.settings, clients: [{ ...a.client }], sites: a.sites || [], quotes: a.quotes.map(q => ({ ...q })) });
  }
  function docState(q, a) {
    const inv = isInv(q), t = totals(q), late = inv && q.status === 'envoye' && q.dueDate && q.dueDate < todayIso();
    const expired = !inv && q.status === 'envoye' && q.validUntil && q.validUntil < todayIso();
    const label = inv ? ({ envoye: late ? 'En retard' : 'À régler', payee: 'Payée', annulee: 'Annulée' }[q.status] || q.status)
      : ({ envoye: expired ? 'Expiré' : 'En attente de votre réponse', accepte: 'Accepté', refuse: 'Refusé' }[q.status] || q.status);
    const cls = inv ? ({ envoye: late ? 'retard' : 'envoye', payee: 'payee', annulee: 'annulee' }[q.status]) : expired ? 'brouillon' : q.status;
    const steps = inv ? [['Facture émise', true], ['Payée', q.status === 'payee']] : [['Devis reçu', true], [q.status === 'refuse' ? 'Refusé' : 'Accepté', ['accepte', 'refuse'].includes(q.status)], ['Travaux facturés', ['accepte'].includes(q.status) && a.quotes.some(x => x.kind === 'facture' && x.fromQuoteId === q.id)]];
    return { inv, t, late, expired, label, cls, steps, canAnswer: !inv && q.status === 'envoye' && !expired };
  }
  const stepsHtml = s => `<ol class="pt-steps">${s.steps.map(([l, on]) => `<li class="${on ? 'on' : ''}"><i></i><span>${l}</span></li>`).join('')}</ol>`;

  function portalList() {
    const all = P.accounts.flatMap(a => { useAccount(a); return db.quotes.map(q => ({ a, q, s: docState(q, a) })); });
    const todo = all.filter(x => x.s.canAnswer || (x.s.inv && x.q.status === 'envoye'));
    const F = { all: () => true, devis: x => !x.s.inv, factures: x => x.s.inv, todo: x => todo.includes(x) };
    const rows = all.filter(F[P.filter]).sort((x, y) => String(y.q.date).localeCompare(String(x.q.date)));
    const first = P.accounts[0];
    return `<div class="pt-wrap">
      <div class="pt-hero"><div><div class="pt-eyebrow">ESPACE CLIENT</div><h1>Bonjour${first && (first.client.contact || first.client.name) ? ' ' + esc(first.client.contact || first.client.name) : ''}</h1>
        <p class="muted">Vos devis et factures${P.accounts.length === 1 ? ` de <b>${esc(first.owner)}</b>` : ''}, toujours à jour. ${todo.length ? `<b>${todo.length} document${todo.length > 1 ? 's' : ''} attend${todo.length > 1 ? 'ent' : ''} une action de votre part.</b>` : 'Tout est en ordre.'}</p></div></div>
      ${P.accounts.length ? '' : '<div class="card"><p>Aucun document pour le moment.</p></div>'}
      <div class="pt-tabs">${[['all', 'Tout', all.length], ['todo', 'À traiter', todo.length], ['devis', 'Devis', all.filter(x => !x.s.inv).length], ['factures', 'Factures', all.filter(x => x.s.inv).length]].map(([k, l, n]) => `<button class="${P.filter === k ? 'on' : ''}" data-act="pt-filter" data-k="${k}">${l} <span>${n}</span></button>`).join('')}</div>
      <div class="pt-list">${rows.map(({ a, q, s }) => `<button class="pt-doc" data-act="pt-open" data-a="${a.id}" data-id="${esc(q.id)}">
          <div class="pt-doc-k ${s.inv ? 'inv' : ''}">${s.inv ? 'Facture' : 'Devis'}</div>
          <div class="pt-doc-main"><b>${esc(q.title || (s.inv ? 'Facture' : 'Devis') + ' ' + q.number)}</b><small>N° ${esc(q.number)} · ${fd(q.date)}${P.accounts.length > 1 ? ' · ' + esc(a.owner) : ''}${!s.inv && q.validUntil && q.status === 'envoye' ? ' · valable jusqu’au ' + fd(q.validUntil) : ''}${s.inv && q.dueDate && q.status === 'envoye' ? ' · à régler avant le ' + fd(q.dueDate) : ''}</small></div>
          <div class="pt-doc-side"><b>${money(s.inv && q.status === 'envoye' ? s.t.due : s.t.ttc)}</b><span class="badge ${s.cls}">${s.label}</span></div></button>`).join('') || '<div class="empty" style="padding:30px 0">Aucun document dans cette catégorie.</div>'}</div>
      ${P.accounts.map(a => `<div class="pt-contact"><b>${esc(a.owner)}</b>${[a.company.phone && `☎ <a href="tel:${esc(a.company.phone.replace(/\s/g, ''))}">${esc(a.company.phone)}</a>`, a.company.email && `✉ <a href="mailto:${esc(a.company.email)}">${esc(a.company.email)}</a>`].filter(Boolean).map(x => `<span>${x}</span>`).join('')}</div>`).join('')}
    </div>`;
  }
  function portalDoc() {
    const a = P.acc; useAccount(a);
    const q = getQuote(P.qid); if (!q) { P.qid = null; return portalList(); }
    editingId = q.id;
    const s = docState(q, a), co = a.company;
    return `<div class="pt-wrap">
      <div class="row between no-print" style="margin-bottom:14px;flex-wrap:wrap;gap:10px"><button class="btn" data-act="pt-back">← Mes documents</button>
        <div class="row">${session.config.pdf ? '<button class="btn primary" data-act="pdf">⬇ Télécharger le PDF</button>' : ''}<button class="btn" data-act="print">🖨 Imprimer</button></div></div>
      <div class="pt-status card no-print"><div class="pt-status-top"><div><div class="pt-eyebrow">${s.inv ? 'FACTURE' : 'DEVIS'} N° ${esc(q.number)} · ${esc(a.owner)}</div><h2>${esc(q.title || (s.inv ? 'Facture' : 'Devis'))}</h2></div>
        <div class="pt-amount"><small>${s.inv && q.status === 'envoye' ? 'Reste à régler' : 'Montant TTC'}</small><b>${money(s.inv && q.status === 'envoye' ? s.t.due : s.t.ttc)}</b><span class="badge ${s.cls}">${s.label}</span></div></div>
        ${stepsHtml(s)}
        ${q.online ? window.onlineAnswer(q) : ''}
        ${s.canAnswer ? `<div class="pt-answer-box"><p><b>Ce devis vous convient ?</b> Vous pouvez l’accepter en ligne : ${esc(a.owner)} est prévenu immédiatement. ${q.validUntil ? `Offre valable jusqu’au ${fd(q.validUntil)}.` : ''}</p>
          <div class="row"><button class="btn primary" data-act="pt-accept">✓ Accepter le devis</button><button class="btn" data-act="pt-refuse">Refuser</button></div></div>` : ''}
        ${s.expired ? `<p class="muted" style="margin:10px 0 0">Ce devis n’est plus valable. Contactez ${esc(a.owner)} pour le mettre à jour.</p>` : ''}
        ${s.inv && q.status === 'envoye' && q.bank ? `<div class="pt-pay"><b>Pour régler par virement</b><pre>${esc(q.bank)}</pre><small class="muted">Indiquez la référence <b>${esc(q.number)}</b> dans le libellé du virement.</small></div>` : ''}
        ${co.phone || co.email ? `<p class="muted" style="margin:12px 0 0;font-size:.85rem">Une question ? ${[co.phone && `<a href="tel:${esc(co.phone.replace(/\s/g, ''))}">${esc(co.phone)}</a>`, co.email && `<a href="mailto:${esc(co.email)}?subject=${encodeURIComponent((s.inv ? 'Facture ' : 'Devis ') + q.number)}">${esc(co.email)}</a>`].filter(Boolean).join(' · ')}</p>` : ''}
      </div>
      <div class="viewer-doc"><div class="preview-wrap"><div class="doc" id="doc" style="--accent:${esc(accentOf())}">${renderDoc(q)}</div></div></div></div>`;
  }
  function renderPortal() {
    $('#app').innerHTML = P.qid ? portalDoc() : portalList();
    if (P.qid && typeof fitDoc === 'function') { try { fitDoc(); } catch (e) { /* ignore */ } }
    window.scrollTo(0, 0);
  }
  function answerModal(type) {
    const a = P.acc, q = getQuote(P.qid); if (!q) return;
    const t = totals(q), who = a.client.contact || (a.client.type === 'pro' ? '' : a.client.name) || '';
    const m = openModal(type === 'accept'
      ? `<form id="ptAns"><h2>Accepter le devis N° ${esc(q.number)}</h2>
        <p class="muted">Montant : <b>${money(t.ttc)} TTC</b> · ${esc(a.owner)}</p>
        <div class="field"><label>Vos nom et prénom (signature)</label><input name="name" required maxlength="100" value="${esc(who)}" autocomplete="name"></div>
        <label class="check"><input type="checkbox" name="agree"> J’accepte ce devis, son montant et ses conditions (« ${esc(q.opts.agreeLabel || 'Bon pour accord')} »).</label>
        <p class="muted" style="font-size:.78rem;margin:6px 0 0">Votre acceptation est datée et enregistrée avec votre adresse email (${esc(P.email)}). ${esc(a.owner)} en est informé immédiatement.</p>
        <div class="form-err" hidden></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">✓ Signer et accepter</button></div></form>`
      : `<form id="ptAns"><h2>Refuser le devis N° ${esc(q.number)}</h2>
        <div class="field"><label>Motif (facultatif, transmis à ${esc(a.owner)})</label><textarea name="reason" rows="3" maxlength="600" placeholder="Prix, délais, autre choix…"></textarea></div>
        <div class="form-err" hidden></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn danger">Refuser le devis</button></div></form>`);
    const f = m.querySelector('#ptAns'), er = f.querySelector('.form-err');
    f.onsubmit = async ev => {
      ev.preventDefault(); er.hidden = true;
      const E = f.elements;
      if (type === 'accept' && !E.agree.checked) { er.textContent = 'Cochez la case pour confirmer votre accord.'; er.hidden = false; return; }
      const btn = f.querySelector('button.primary, button.danger'); btn.disabled = true;
      try {
        const r = await api('POST', `/api/portal/doc/${encodeURIComponent(a.id)}/${encodeURIComponent(q.id)}/answer`, { type, name: E.name ? E.name.value.trim() : '', agree: !!(E.agree && E.agree.checked), reason: E.reason ? E.reason.value : '' });
        const i = a.quotes.findIndex(x => x.id === q.id); if (i >= 0) a.quotes[i] = r.quote;
        m.close(); toast(type === 'accept' ? 'Devis accepté ✓ — l’entreprise est prévenue' : 'Votre réponse a été transmise'); if (type === 'accept' && window.celebrate) celebrate();
        renderPortal();
      } catch (e2) { er.textContent = e2.message; er.hidden = false; btn.disabled = false; }
    };
  }
  Object.assign(actions, {
    'portal-client'(t) { clientPortalModal(t.dataset.id); },
    'pt-filter'(t) { P.filter = t.dataset.k; renderPortal(); },
    'pt-open'(t) { P.acc = accOf(t.dataset.a); P.qid = t.dataset.id; history.pushState({ pt: P.qid }, '', location.pathname + '?doc=' + encodeURIComponent(P.qid)); renderPortal(); },
    'pt-back'() { P.qid = null; history.pushState({}, '', location.pathname); renderPortal(); },
    'pt-accept'() { answerModal('accept'); },
    'pt-refuse'() { answerModal('refuse'); },
    async 'pt-quit'() { document.cookie = 'od-pt=; Path=/; Max-Age=0'; try { await api('POST', '/api/portal/quit'); } catch (e) { /* ignore */ } location.href = '/?espace'; },
    'portal-login'() { portalLogin(); }
  });
  window.addEventListener('popstate', () => { if (!session.portal) return; P.qid = null; renderPortal(); });

  window.startPortal = function (r) {
    session.portal = true; session.user = null;
    document.cookie = 'od-pt=1; Path=/; Max-Age=2592000; SameSite=Lax'; P.accounts = r.accounts || []; P.email = r.email;
    document.body.classList.remove('auth-mode'); document.body.classList.add('portal'); $('#topbar').hidden = false;
    const bd = $('#topbar .brand'); if (bd) bd.innerHTML = brandHtml(session.config.siteName);
    $('#nav').innerHTML = ''; $('#saved').textContent = ''; $('#notifbox').innerHTML = '';
    $('#accessPill').innerHTML = `<span class="pill ok"><span class="lg">Espace client</span><span class="sh">Client</span></span>`;
    $('#userbox').innerHTML = `<span class="pt-mail">${esc(P.email)}</span><button class="btn small" data-act="pt-quit">Se déconnecter</button>`;
    const bn = $('#bottomnav'); if (bn) bn.innerHTML = '';
    const want = new URLSearchParams(location.search).get('doc');
    const a = want && P.accounts.find(x => x.quotes.some(q => q.id === want));
    if (a) { P.acc = a; P.qid = want; }
    if (typeof syncThemeBtn === 'function') syncThemeBtn();
    renderPortal();
  };

  /* connexion du client : son email → lien de connexion */
  window.portalLogin = function (opts = {}) {
    document.body.classList.add('auth-mode'); $('#topbar').hidden = true;
    const cfg = session.config;
    const card = opts.sent
      ? `<div class="big-ico">📬</div><h2>Vérifiez votre boîte mail</h2><p class="muted">Si des documents vous ont été adressés avec <b>${esc(opts.email)}</b>, un lien de connexion vient d’être envoyé (valable 30 minutes). Pensez aux courriers indésirables.</p>
         ${opts.devLink ? `<div class="devbox"><b>Mode démo</b> — aucun email réel n'est envoyé.<br><a href="${esc(opts.devLink)}">Ouvrir le lien reçu par email →</a></div>` : ''}
         <p class="auth-alt"><a href="#" data-act="portal-login">← Utiliser une autre adresse</a></p>`
      : `<h2>Espace client</h2><p class="muted">Consultez les devis et factures que vos artisans et prestataires vous ont adressés avec ${esc(cfg.siteName)}, suivez-les et acceptez un devis en ligne.</p>
        ${opts.banner ? `<div class="notice ${opts.banner.ok ? 'ok' : 'bad'}">${esc(opts.banner.text)}</div>` : ''}
        <form id="ptLogin" novalidate><div class="field"><label>Votre adresse email</label><input type="email" name="email" autocomplete="email" required autofocus value="${esc(opts.email || '')}"></div>
          <div class="form-err" hidden></div><button class="btn primary block">Recevoir mon lien de connexion</button></form>
        <p class="muted" style="font-size:.8rem;margin-top:12px">Pas de mot de passe : un lien personnel vous est envoyé par email. Utilisez l’adresse à laquelle vous recevez vos devis.</p>
        <p class="auth-alt">Vous êtes une entreprise ? <a href="/">Connexion professionnelle</a></p>`;
    $('#app').innerHTML = `<div class="auth solo"><section class="auth-card"><button class="theme-btn auth-theme" id="themeBtn" title="Mode clair / sombre">🌙</button><div class="brand big auth-brand-m" style="display:flex">${brandHtml(cfg.siteName)}</div>${card}</section></div>`;
    if (typeof syncThemeBtn === 'function') syncThemeBtn();
    const f = $('#ptLogin'); if (!f) return;
    f.onsubmit = async ev => {
      ev.preventDefault(); const er = f.querySelector('.form-err'); er.hidden = true;
      const email = f.elements.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { er.textContent = 'Adresse email invalide.'; er.hidden = false; return; }
      const b = f.querySelector('button'); b.disabled = true;
      try { const r = await api('POST', '/api/portal/login', { email }); portalLogin({ sent: true, email, devLink: r.devLink }); }
      catch (e) { er.textContent = e.message; er.hidden = false; b.disabled = false; }
    };
  };
})();
