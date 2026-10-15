'use strict';
/* Accès comptable.
   1) Côté artisan : donner à son comptable un lien personnel, en lecture seule, limité à ce qu'il choisit
      (factures, devis, clients, comptabilité, justificatifs), avec une durée, et le retirer à tout moment.
   2) Côté comptable : le même site, en lecture seule, réduit à ce qui lui a été ouvert. */
(function () {
  const PERMS = [
    ['factures', 'Factures', 'Consulter et télécharger vos factures en PDF'],
    ['compta', 'Comptabilité', 'Recettes, charges, cotisations, bilan de l’année et exports (livre des recettes, registre des charges)'],
    ['justificatifs', 'Justificatifs d’achat', 'Photos et PDF de vos tickets et factures fournisseurs'],
    ['devis', 'Devis', 'Consulter vos devis'],
    ['clients', 'Clients', 'La liste de vos clients et leurs coordonnées']
  ];
  const LABEL = Object.fromEntries(PERMS.map(p => [p[0], p[1]]));
  const DUR = [['', 'Sans limite (jusqu’à ce que vous le retiriez)'], ['1', '1 mois'], ['3', '3 mois'], ['6', '6 mois'], ['12', '1 an']];
  const fd = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';

  /* ================= Côté artisan ================= */
  async function shareModal() {
    let rows = [];
    try { rows = (await api('GET', '/api/shares')).rows; } catch (e) { return toast(e.message); }
    openModal(`<div class="sh-modal"><div class="row between"><h2 style="margin:0">Accès comptable</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
      <p class="muted" style="margin:8px 0 16px">Votre comptable reçoit un lien personnel. Il n'a pas besoin de compte et ne voit que ce que vous cochez, <b>sans pouvoir rien modifier</b>. Vous pouvez changer ou retirer l'accès à tout moment.</p>
      ${rows.length ? `<div class="sh-list">${rows.map(r => `<div class="sh-row">
        <div class="grow"><b>${esc(r.name || r.email || 'Comptable')}</b>${r.name && r.email ? ` <span class="muted">${esc(r.email)}</span>` : ''}
          <div class="sh-chips">${r.perms.map(k => `<span class="sh-chip">${LABEL[k]}</span>`).join('')}</div>
          <div class="muted" style="font-size:.78rem">${r.opened ? 'Dernière visite le ' + fd(r.lastAt) : 'Lien pas encore ouvert'}${r.expiresAt ? ' · valable jusqu’au ' + fd(r.expiresAt) : ''}${r.expiresAt && r.expiresAt < new Date().toISOString() ? ' <b style="color:var(--danger)">(expiré)</b>' : ''}</div></div>
        <div class="sh-acts"><button class="btn small" data-act="share-edit" data-id="${r.id}">Modifier</button><button class="btn small" data-act="share-link" data-id="${r.id}" title="Crée un nouveau lien ; l'ancien ne fonctionne plus">Nouveau lien</button><button class="btn small danger" data-act="share-del" data-id="${r.id}">Retirer</button></div></div>`).join('')}</div>` : ''}
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="share-new">＋ Donner un accès</button></div></div>`);
    shareModal.rows = rows;
  }
  function shareForm(r) {
    const perms = r ? r.perms : ['factures', 'compta', 'justificatifs'];
    const m = openModal(`<form id="shForm"><h2>${r ? 'Modifier l’accès' : 'Donner un accès à votre comptable'}</h2>
      <div class="grid2"><div class="field"><label>Nom</label><input name="name" value="${esc(r ? r.name : '')}" placeholder="Ex : Cabinet Martin" maxlength="80"></div>
        <div class="field"><label>Email${r ? '' : ' (pour lui envoyer le lien)'}</label><input name="email" type="email" value="${esc(r ? r.email : '')}" ${r ? 'disabled' : ''} placeholder="comptable@cabinet.fr"></div></div>
      <div class="field"><label>Ce que votre comptable peut voir</label>
        <div class="sh-perms">${PERMS.map(([k, l, d]) => `<label class="sh-perm"><input type="checkbox" name="p" value="${k}" ${perms.includes(k) ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div></div>
      <div class="field"><label>Durée de l’accès</label><select name="months">${DUR.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      ${!r && session.config.mailConfigured ? '<label class="check"><input type="checkbox" name="send" checked> Envoyer le lien par email à cette adresse</label>' : ''}
      <p class="muted" style="font-size:.8rem;margin:6px 0 0">Avec « Comptabilité », votre comptable voit aussi les montants de vos factures (nécessaires aux calculs).</p>
      <div class="form-err" hidden></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn" data-act="share-open">Retour</button><button class="btn primary">${r ? 'Enregistrer' : 'Créer l’accès'}</button></div></form>`);
    const f = m.querySelector('#shForm'), E = f.elements;
    if (r) E.months.value = '';   // la durée n'est changée que si l'on choisit une nouvelle valeur
    if (r && r.expiresAt) E.months.insertAdjacentHTML('afterbegin', `<option value="keep" selected>Inchangée (jusqu’au ${fd(r.expiresAt)})</option>`);
    f.onsubmit = async ev => {
      ev.preventDefault();
      const er = f.querySelector('.form-err'); er.hidden = true;
      const p = [...f.querySelectorAll('[name=p]:checked')].map(x => x.value);
      if (!p.length) { er.textContent = 'Cochez au moins une chose à partager.'; er.hidden = false; return; }
      const body = { name: E.name.value, perms: p, ...(E.months.value === 'keep' ? {} : { months: E.months.value }) };
      try {
        if (r) { await api('PATCH', '/api/shares/' + r.id, body); toast('Accès modifié'); shareModal(); return; }
        if (!E.email.value.trim() && !E.name.value.trim()) { er.textContent = 'Indiquez au moins le nom ou l’email de votre comptable.'; er.hidden = false; return; }
        const res = await api('POST', '/api/shares', { ...body, email: E.email.value.trim(), send: !!(E.send && E.send.checked && E.email.value.trim()) });
        showLink(res.link, res.sent, res.share);
      } catch (e2) { er.textContent = e2.message; er.hidden = false; }
    };
  }
  function showLink(link, sent, sh) {
    openModal(`<div><h2>Lien d’accès prêt ✓</h2>
      <p>${sent ? `Le lien a été envoyé à <b>${esc(sh.email)}</b>. Vous pouvez aussi le transmettre vous-même :` : 'Transmettez ce lien personnel à votre comptable (email, SMS, WhatsApp…) :'}</p>
      <div class="sh-link"><input readonly value="${esc(link)}" id="shLink"><button class="btn small" id="shCopy">Copier</button></div>
      <p class="muted" style="font-size:.8rem">Ce lien donne accès à ce que vous avez coché, sans mot de passe : ne le publiez pas. Pour le désactiver, utilisez « Retirer » ou « Nouveau lien ».</p>
      <div class="row" style="justify-content:flex-end;margin-top:12px">${navigator.share ? '<button class="btn" id="shShare">📤 Partager</button>' : ''}<button class="btn primary" data-act="share-open">Terminé</button></div></div>`);
    $('#shCopy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Lien copié'); } catch (e) { $('#shLink').select(); document.execCommand('copy'); toast('Lien copié'); } };
    const s = $('#shShare'); if (s) s.onclick = () => navigator.share({ title: 'Accès à mon espace ' + session.config.siteName, text: 'Voici ton accès à ma comptabilité sur ' + session.config.siteName + ' :', url: link }).catch(() => {});
  }
  Object.assign(actions, {
    'share-open'() { if (document.querySelector('#userbox .pop')) document.querySelector('#userbox').classList.remove('open'); shareModal(); },
    'share-new'() { shareForm(null); },
    'share-edit'(t) { const r = (shareModal.rows || []).find(x => x.id === t.dataset.id); if (r) shareForm(r); },
    async 'share-link'(t) {
      const r = (shareModal.rows || []).find(x => x.id === t.dataset.id); if (!r) return;
      if (!confirm('Créer un nouveau lien pour ' + (r.name || r.email) + ' ? L’ancien lien ne fonctionnera plus.')) return;
      try { const res = await api('POST', `/api/shares/${r.id}/link`, { send: !!(r.email && session.config.mailConfigured) }); showLink(res.link, res.sent, r); } catch (e) { toast(e.message); }
    },
    async 'share-del'(t) {
      const r = (shareModal.rows || []).find(x => x.id === t.dataset.id); if (!r) return;
      if (!confirm('Retirer l’accès de ' + (r.name || r.email) + ' ? Son lien ne fonctionnera plus immédiatement.')) return;
      try { await api('DELETE', '/api/shares/' + r.id); toast('Accès retiré'); shareModal(); } catch (e) { toast(e.message); }
    }
  });

  /* ================= Côté comptable (lecture seule) ================= */
  const VIEWS = [['invoices', 'Factures', 'factures', 'clipboard'], ['stats', 'Comptabilité', 'compta', 'chart'], ['quotes', 'Devis', 'devis', 'file'], ['clients', 'Clients', 'clients', 'user']];
  const views = () => VIEWS.filter(v => session.viewer.perms.includes(v[2]));
  window.viewerCan = v => v === 'editor' || views().some(x => x[0] === v);
  /* actions permises : consulter, filtrer, télécharger */
  const OK = new Set(['edit', 'back', 'pdf', 'print', 'close-modal', 'client-tab', 'stat-tab', 'cp-period', 'cp-move', 'cp-export', 'bilan-open', 'bilan-pdf', 'bilan-all', 'rc-zip', 'exp-cat',
    'user-menu', 'viewer-quit', 'more-menu', 'legal-open', 'theme-toggle', 'toggle-theme', 'notif-open']);
  window.viewerAct = a => OK.has(a) || /^(filter|tab|sort|month|inv-filter|q-filter|page|stat-|cp-)/.test(a);

  window.viewerDoc = function () {
    const q = getQuote(editingId); if (!q) return '';
    return `<div class="row between no-print" style="margin-bottom:16px">
      <div class="row"><button class="btn" data-act="back">← Retour</button><h1 style="margin:0">${esc(q.opts.docLabel)} ${esc(q.number)}</h1></div>
      <div class="row">${session.config.pdf ? '<button class="btn primary" data-act="pdf">⬇ Télécharger le PDF</button>' : ''}<button class="btn" data-act="print">🖨 Imprimer</button></div></div>
      <div class="viewer-doc"><div class="preview-wrap"><div class="doc" id="doc" style="--accent:${esc(accentOf())}">${renderDoc(q)}</div></div></div>`;
  };

  window.viewerTopbar = function () {
    const v = session.viewer, items = views();
    const bd = $('#topbar .brand'); if (bd) bd.innerHTML = brandHtml(session.config.siteName);
    $('#nav').innerHTML = items.map(([k, l]) => `<button data-view="${k}"><span class="lg">${l}</span><span class="sh">${l}</span></button>`).join('');
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === navFor()));
    $('#accessPill').innerHTML = `<span class="pill ok" title="Accès comptable en lecture seule"><span class="lg">👁 ${esc(v.owner || 'Espace partagé')} · lecture seule</span><span class="sh">Lecture seule</span></span>`;
    const name = v.name || 'Comptable', initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    $('#userbox').innerHTML = `<button class="avatar" data-act="user-menu" title="${esc(v.email || name)}">${esc(initials)}</button>
      <div class="pop"><div class="pop-head"><b>${esc(name)}</b><span class="muted">Accès comptable à l’espace de ${esc(v.owner || '')}${v.expiresAt ? '<br>valable jusqu’au ' + fd(v.expiresAt) : ''}</span></div>
        <button data-act="viewer-quit" class="danger">Quitter l’espace</button></div>`;
    const bn = $('#bottomnav');
    if (bn) bn.innerHTML = items.map(([k, l, , ic]) => `<button data-view="${k}" class="${navFor() === k ? 'active' : ''}">${icon(ic)}<span>${l}</span></button>`).join('') + `<button data-act="viewer-quit">${icon('x')}<span>Quitter</span></button>`;
    const af = $('#appFoot'); if (af && window.appLegalFooter) { af.innerHTML = appLegalFooter(); af.hidden = false; }
  };
  actions['viewer-quit'] = async () => { try { await api('POST', '/api/share/quit'); } catch (e) { /* ignore */ } location.href = '/'; };

  window.startViewer = function (r) {
    session.viewer = r.share; session.user = { name: r.share.name || 'Comptable', email: r.share.email || '', role: 'viewer', prefs: null };
    session.access = { active: false };
    try { initPrefs(null); } catch (e) { /* préférences par défaut */ }
    document.body.classList.remove('auth-mode'); document.body.classList.add('viewer'); document.body.classList.toggle('v-rc', r.share.perms.includes('justificatifs')); $('#topbar').hidden = false;
    db = normalize(r.data);
    if (typeof statUI !== 'undefined') statUI.tab = 'compta';
    const first = views()[0]; view = first ? first[0] : 'invoices'; editingId = null;
    updateTopbar(); render();
  };
  /* la page Statistiques n'affiche que l'onglet Comptabilité pour le comptable */
  const mo = new MutationObserver(() => { if (session.viewer) document.body.classList.toggle('v-stats', view === 'stats'); });
  mo.observe(document.getElementById('app') || document.body, { childList: true });
})();
