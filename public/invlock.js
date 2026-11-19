'use strict';
/* Factures émises : non modifiables (obligation légale).
   Une facture est émise dès qu'elle n'est plus en brouillon (envoyée, payée, annulée) : son contenu, son numéro
   et sa date sont figés, elle ne peut plus être supprimée ni revenir en brouillon. Seul le suivi du paiement
   change (payée, date de paiement). Pour corriger une erreur ou annuler : un avoir (facture négative).
   Le serveur applique la même règle (une facture émise modifiée est rétablie). */
(function () {
  const isLocked = q => !!q && LOCKED_INV(q);
  const ALLOWED_F = new Set(['status', 'paidAt']);
  const BLOCK = ['add-line', 'add-title', 'add-subtotal', 'add-spacer', 'line-del', 'line-up', 'line-down', 'add-pay', 'del-pay',
    'catalog-open', 'co-sync', 'reset-issuer', 'reset-client', 'new-client-inline', 'ai-review'];
  const LAW = 'Une facture émise ne peut plus être modifiée ni supprimée (numérotation continue et conservation obligatoires). Pour corriger une erreur ou l’annuler, créez un avoir.';
  const blocked = () => toast('🔒 Facture émise : elle ne peut plus être modifiée. Créez un avoir pour la corriger.');
  const creditOf = q => db.quotes.find(c => c.isCredit && c.creditOf === q.id);

  BLOCK.forEach(name => {
    const orig = actions[name]; if (!orig) return;
    actions[name] = function (t) { if (view === 'editor' && isLocked(getQuote(editingId))) return blocked(); return orig.apply(this, arguments); };
  });

  /* suppression : interdite pour une facture émise */
  const del = actions['del-quote'];
  actions['del-quote'] = function (t) {
    const q = getQuote(t.dataset.id);
    if (!isLocked(q)) return del.apply(this, arguments);
    const m = openModal(`<div><h2>🔒 Suppression impossible</h2><p>La facture <b>${esc(q.number)}</b> a été émise. ${LAW}</p>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-act="close-modal">Fermer</button>${!q.isCredit && !creditOf(q) ? `<button class="btn primary" id="ilCredit">Créer un avoir</button>` : ''}</div></div>`);
    const b = m.querySelector('#ilCredit'); if (b) b.onclick = () => { m.close(); makeCredit(q); };
  };

  /* saisie : on bloque tout sauf le suivi du paiement */
  document.addEventListener('input', e => {
    if (view !== 'editor') return;
    const t = e.target, q = getQuote(editingId); if (!isLocked(q)) return;
    if (!t.closest || !t.closest('#editor')) return;
    if (!(t.dataset.f || t.dataset.o || t.dataset.l || t.dataset.p)) return;
    if (t.dataset.f === 'status') {
      if (t.value === 'brouillon') { e.stopImmediatePropagation(); t.value = q.status; return blocked(); }
      if (t.value === 'annulee' && q.status !== 'annulee') {
        e.stopImmediatePropagation(); t.value = q.status;
        if (creditOf(q)) return toast(`Un avoir existe déjà pour cette facture (${creditOf(q).number}).`);
        if (confirm(`Pour annuler une facture émise, la loi impose un avoir.\nCréer l’avoir de la facture ${q.number} maintenant ?`)) makeCredit(q);
        return;
      }
      return;
    }
    if (t.dataset.f && ALLOWED_F.has(t.dataset.f)) return;
    e.stopImmediatePropagation(); render(); blocked();
  }, true);

  /* avoir : reprend la facture en montants négatifs ; brouillon modifiable (avoir partiel possible) jusqu'à son émission */
  function makeCredit(q) {
    if (!requireAccess()) return;
    const c = JSON.parse(JSON.stringify(q));
    Object.assign(c, { id: uid(), number: makeNumber('facture'), date: today(), status: 'brouillon', paidAt: '', alreadyPaid: 0, payments: [],
      isCredit: true, creditOf: q.id, creditOfNumber: q.number,
      title: `Avoir sur la facture N° ${q.number}${q.title ? ' – ' + q.title : ''}`,
      notes: `Avoir annulant la facture N° ${q.number} du ${fdate(q.date)}.`,
      totalOverride: q.totalOverride === '' || q.totalOverride == null ? '' : -num(q.totalOverride) });
    c.dueDate = c.date; c.opts = { ...c.opts, docLabel: 'AVOIR' };
    c.lines = c.lines.map(l => l.t === 'item' ? { ...l, price: -num(l.price) } : l);
    ['stepId', 'stepLabel', 'online', 'creditId', 'companyIgnore'].forEach(k => delete c[k]);
    bumpNumber('facture');
    db.quotes.push(normQuote(c)); save();
    toast(`Avoir ${c.number} créé : vérifiez-le puis émettez-le (envoi au client).`);
    go('editor', c.id);
  }
  window.makeCredit = makeCredit;
  actions['make-credit'] = () => { const q = getQuote(editingId); if (!q) return; if (creditOf(q)) return go('editor', creditOf(q).id); makeCredit(q); };
  actions['issue-invoice'] = () => {
    const q = getQuote(editingId); if (!q || isLocked(q)) return;
    if (!confirm(`Émettre ${q.isCredit ? 'l’avoir' : 'la facture'} ${q.number} ?\n\nUne fois émis${q.isCredit ? '' : 'e'}, ${q.isCredit ? 'il' : 'elle'} ne pourra plus être modifié${q.isCredit ? '' : 'e'} ni supprimé${q.isCredit ? '' : 'e'} (obligation légale). Vérifiez le numéro, la date, le client et les montants.`)) return;
    q.status = 'envoye'; save(); render(); toast(`🔒 ${q.isCredit ? 'Avoir émis' : 'Facture émise'} : ${q.number}`);
  };

  /* un avoir émis qui reprend toute la facture l'annule */
  function reconcile() {
    let changed = false;
    db.quotes.forEach(c => {
      if (!c.isCredit || c.status === 'brouillon') return;
      const q = getQuote(c.creditOf); if (!q || q.status !== 'envoye') return;
      if (Math.abs(totals(c).ttc + totals(q).ttc) < 0.01) { q.status = 'annulee'; changed = true; }
    });
    if (changed) save();
  }

  /* éditeur : champs grisés, boutons d'édition masqués, bandeau explicatif */
  function decorate() {
    const q = getQuote(editingId), ed = $('#editor'); if (!q || !ed || !isInv(q)) return;
    reconcile();
    const bar = document.createElement('div'); bar.className = 'notice no-print il-bar ' + (isLocked(q) ? 'locked' : 'draft');
    if (isLocked(q)) {
      const cr = creditOf(q), orig = q.isCredit && getQuote(q.creditOf);
      bar.innerHTML = `<div><b>🔒 ${q.isCredit ? 'Avoir émis' : 'Facture émise'} — non modifiable.</b> <span class="muted">${LAW} Seul le suivi du paiement reste modifiable.</span>
        ${orig ? `<br><span class="muted">Avoir de la facture <a href="#" data-act="edit" data-id="${orig.id}">${esc(orig.number)}</a>.</span>` : ''}</div>
        <div class="row" style="flex-wrap:nowrap">${q.isCredit ? '' : cr ? `<button class="btn small" data-act="make-credit">Voir l’avoir ${esc(cr.number)}</button>` : '<button class="btn small primary" data-act="make-credit">Créer un avoir</button>'}<button class="btn small" data-act="dup" data-id="${q.id}" title="Nouvelle facture (brouillon) reprenant celle-ci">⧉ Dupliquer</button></div>`;
      ed.querySelectorAll('.form input, .form textarea, .form select').forEach(el => { if (!(el.dataset.f && ALLOWED_F.has(el.dataset.f))) el.disabled = true; });
      ed.querySelectorAll('.form [data-act]').forEach(el => { if (BLOCK.includes(el.dataset.act)) el.hidden = true; });
      const st = ed.querySelector('[data-f=status]'); if (st) [...st.options].forEach(o => { if (o.value === 'brouillon') o.remove(); });
      document.querySelectorAll('#app .co-sync').forEach(el => el.remove());
      document.querySelectorAll('#app [data-act="ai-review"]').forEach(el => { el.hidden = true; });
      ed.classList.add('il-locked');
    } else {
      bar.innerHTML = `<div><b>Brouillon${q.isCredit ? ' d’avoir' : ''}</b> <span class="muted">— modifiable. Dès ${q.isCredit ? 'son' : 'son'} émission (envoi au client ou bouton « Émettre »), ${q.isCredit ? 'l’avoir' : 'la facture'} sera verrouillé${q.isCredit ? '' : 'e'} définitivement.</span></div>
        <button class="btn small primary" data-act="issue-invoice">🔒 Émettre ${q.isCredit ? 'l’avoir' : 'la facture'}</button>`;
    }
    const sw = $('#app .pane-switch'); if (sw) sw.before(bar);
  }
  const prevEd = AFTER.editor;
  AFTER.editor = function () { if (prevEd) prevEd.apply(this, arguments); decorate(); };
  const prevInv = AFTER.invoices;
  AFTER.invoices = function () { if (prevInv) prevInv.apply(this, arguments); reconcile(); };

  /* PDF / impression / partage d'une facture brouillon : proposer de l'émettre */
  ['pdf', 'print', 'share-pdf'].forEach(name => {
    const orig = actions[name]; if (!orig) return;
    actions[name] = function (t) {
      const q = view === 'editor' && getQuote(editingId), args = arguments, self = this;
      if (session.viewer || session.portal || !q || !isInv(q) || q.status !== 'brouillon') return orig.apply(self, args);
      const m = openModal(`<div><h2>${q.isCredit ? 'Avoir' : 'Facture'} encore en brouillon</h2>
        <p>Si vous l’envoyez à votre client, émettez-${q.isCredit ? 'le' : 'la'} d’abord : ${q.isCredit ? 'il' : 'elle'} sera verrouillé${q.isCredit ? '' : 'e'} (plus de modification possible, obligation légale).</p>
        <div class="row" style="justify-content:flex-end;margin-top:14px;flex-wrap:wrap"><button class="btn" data-act="close-modal">Annuler</button><button class="btn" id="ilDraft">Continuer en brouillon</button><button class="btn primary" id="ilIssue">🔒 Émettre et continuer</button></div></div>`);
      m.querySelector('#ilDraft').onclick = () => { m.close(); orig.apply(self, args); };
      m.querySelector('#ilIssue').onclick = () => { m.close(); q.status = 'envoye'; save(); render(); toast(`🔒 Émise : ${q.number}`); const b = $(`[data-act="${name}"]`); orig.call(self, b || t); };
    };
  });
})();
