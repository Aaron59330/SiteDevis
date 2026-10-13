'use strict';
/* Écrans de connexion / inscription, barre du haut, menu utilisateur */

const forms = {};   // formulaires [data-form] -> gestionnaire async

function renderAuth(mode, opts = {}) {
  document.body.classList.add('auth-mode'); $('#topbar').hidden = true;
  const cfg = session.config, name = esc(cfg.siteName);
  const banner = opts.banner ? `<div class="notice ${opts.banner.ok ? 'ok' : 'bad'}">${esc(opts.banner.text)}</div>` : '';
  const dev = link => link ? `<div class="devbox"><b>Mode démo</b> — aucun email réel n'est envoyé (service email non configuré).<br><a href="${esc(link)}">Ouvrir le lien reçu par email →</a></div>` : '';
  let card = '';
  if (mode === 'login') card = `
    <h2>Connexion</h2><p class="muted">Content de vous revoir.</p>${banner}
    <form data-form="login" novalidate>
      <div class="field"><label>Adresse email</label><input type="email" name="email" autocomplete="email" required value="${esc(opts.email || '')}" autofocus></div>
      <div class="field"><label>Mot de passe <a href="#" data-act="auth-go" data-mode="forgot" class="fr">Mot de passe oublié ?</a></label>
        <input type="password" name="password" autocomplete="current-password" required></div>
      <div class="form-err" hidden></div>
      <button class="btn primary block">Se connecter</button>
    </form>
    <p class="auth-video-link"><a href="#" data-act="hero-open">Voir la vidéo de présentation (1 min 30)</a></p>
    ${cfg.registrationOpen ? `<p class="auth-alt">Pas encore de compte ? <a href="#" data-act="auth-go" data-mode="register">Créer un compte</a></p>` : '<p class="auth-alt muted">Les inscriptions sont fermées.</p>'}`;
  else if (mode === 'register') card = `
    <h2>Créer un compte</h2><p class="muted">Un email de confirmation vous sera envoyé.</p>
    <form data-form="register" novalidate>
      <div class="field"><label>Nom ou entreprise</label><input name="name" autocomplete="name" required autofocus></div>
      <div class="field"><label>Adresse email</label><input type="email" name="email" autocomplete="email" required></div>
      <div class="grid2">
        <div class="field"><label>Mot de passe</label><input type="password" name="password" autocomplete="new-password" required></div>
        <div class="field"><label>Confirmation</label><input type="password" name="password2" autocomplete="new-password" required></div>
      </div>
      <p class="muted" style="margin:-4px 0 12px;font-size:.8rem">8 caractères minimum, avec des lettres et des chiffres.</p>
      <label class="check"><input type="checkbox" name="terms" required> J'accepte les conditions d'utilisation et la politique de confidentialité.</label>
      <div class="form-err" hidden></div>
      <button class="btn primary block">Créer mon compte</button>
    </form>
    <p class="auth-alt">Déjà inscrit ? <a href="#" data-act="auth-go" data-mode="login">Se connecter</a></p>`;
  else if (mode === 'forgot') card = `
    <h2>Mot de passe oublié</h2><p class="muted">Indiquez votre email : nous vous enverrons un lien pour en choisir un nouveau.</p>
    <form data-form="forgot" novalidate>
      <div class="field"><label>Adresse email</label><input type="email" name="email" required autofocus value="${esc(opts.email || '')}"></div>
      <div class="form-err" hidden></div>
      <button class="btn primary block">Envoyer le lien</button>
    </form>
    <p class="auth-alt"><a href="#" data-act="auth-go" data-mode="login">← Retour à la connexion</a></p>`;
  else if (mode === 'forgot-sent') card = `
    <div class="big-ico">📬</div><h2>Vérifiez votre boîte mail</h2>
    <p class="muted">Si un compte existe pour <b>${esc(opts.email)}</b>, un lien de réinitialisation vient d'être envoyé (valable 1 heure).</p>${dev(opts.devLink)}
    <p class="auth-alt"><a href="#" data-act="auth-go" data-mode="login">← Retour à la connexion</a></p>`;
  else if (mode === 'reset') card = `
    <h2>Nouveau mot de passe</h2><p class="muted">Choisissez un mot de passe sécurisé.</p>
    <form data-form="reset" novalidate>
      <input type="hidden" name="token" value="${esc(opts.token)}">
      <div class="field"><label>Nouveau mot de passe</label><input type="password" name="password" autocomplete="new-password" required autofocus></div>
      <div class="field"><label>Confirmation</label><input type="password" name="password2" autocomplete="new-password" required></div>
      <div class="form-err" hidden></div>
      <button class="btn primary block">Enregistrer</button>
    </form>`;
  else if (mode === 'verify') card = `
    <div class="big-ico">✉️</div><h2>Confirmez votre email</h2>
    <p class="muted">Un lien de confirmation a été envoyé à <b>${esc(opts.email)}</b>. Cliquez dessus pour activer votre compte (valable 24 heures).</p>${dev(opts.devLink)}
    <div class="row" style="justify-content:center;margin-top:16px">
      <button class="btn" data-act="resend" data-email="${esc(opts.email)}">Renvoyer l'email</button>
      <button class="btn" data-act="auth-go" data-mode="login">J'ai confirmé, me connecter</button>
    </div>`;

  const landing = mode === 'login' || mode === 'register';
  const open = landing && (mode === 'register' || !!opts.banner || !!opts.email || window.__authOpen);
  if (!landing) {
    $('#app').innerHTML = `<div class="auth solo"><section class="auth-card"><button class="theme-btn auth-theme" id="themeBtn" title="Mode clair / sombre">🌙</button><div class="brand big auth-brand-m" style="display:flex">${brandHtml(cfg.siteName)}</div>${card}</section></div>`;
    syncThemeBtn(); return;
  }
  $('#app').innerHTML = `
  <div class="landing">
    <div class="ld-bg" aria-hidden="true"><div class="orb o1"></div><div class="orb o2"></div></div>
    <header class="ld-nav">
      <div class="ld-nav-in">
        <div class="brand big">${brandHtml(cfg.siteName)}</div>
        <nav class="ld-links" aria-label="Sommaire"><a href="#d-start">Démarrer</a><a href="#d-features">Fonctionnalités</a><a href="#d-faq">Questions</a><a href="#" data-act="hero-open">Vidéo</a></nav>
        <label class="docs-search"><span class="ld-ico" aria-hidden="true">${icon('search')}</span><input type="search" id="docsQ" placeholder="Rechercher : facture, PDF, catalogue…" autocomplete="off" aria-label="Rechercher dans la présentation"><kbd>/</kbd></label>
        <button class="theme-btn" id="themeBtn" title="Mode clair / sombre">🌙</button>
        <button type="button" class="ld-login" data-act="auth-open">${icon('user')}Se connecter</button>
      </div>
    </header>
    <div class="ld-main">
      <section id="d-intro" class="ld-hero">
        <div class="ld-copy">
          <span class="eyebrow rise" style="--d:.08s">Devis &amp; factures pour tous les métiers</span>
          <h1 class="rise" style="--d:.16s">Des devis qui <em>font signer</em>,<br>en quelques minutes.</h1>
          <p class="hero-sub rise" style="--d:.24s">Créez un devis complet, facturez chaque paiement, téléchargez le PDF : tout est prêt à envoyer à votre client.</p>
          <div class="ld-cta rise" style="--d:.32s">
            <button type="button" class="ld-btn main" data-act="auth-open">Se connecter<i aria-hidden="true">${icon('right')}</i></button>
            ${cfg.registrationOpen ? `<button type="button" class="ld-btn ghost" data-act="auth-go" data-mode="register">Créer un compte</button>` : ''}
          </div>
          <div class="chips rise" style="--d:.4s"><span>PDF en un clic</span><span>Clients remplis par SIRET</span><span>Une facture par paiement</span><span>Catalogue &amp; matériaux</span></div>
        </div>
        <div class="ld-win rise" style="--d:.28s">
          <div class="ld-win-bar"><i></i><i></i><i></i><span>Présentation ${name}</span></div>
          <div class="hero-video" id="heroVideoBox">
            <video id="heroVideo" muted loop playsinline preload="metadata" poster="/media/optidevis-poster.jpg"></video>
            <div class="hv-bar">
              <button type="button" class="hv-btn" data-act="hero-play" id="hvPlay" aria-label="Lecture / pause">Pause</button>
              <button type="button" class="hv-btn" data-act="hero-sound" id="hvSound" aria-label="Activer le son">Activer le son</button>
              <button type="button" class="hv-btn" data-act="hero-full" aria-label="Plein écran">Plein écran</button>
            </div>
          </div>
        </div>
      </section>
      <section id="d-start" class="docs-sec" data-doc>
        <h2>Démarrer en 3 étapes</h2>
        <ol class="docs-steps">
          <li data-doc-item><span class="ld-tile">1</span><div><b>Créez votre compte</b><p>Nom, email, mot de passe : c'est tout. Ajoutez ensuite votre entreprise (SIRET, logo, mentions légales) une seule fois.</p></div></li>
          <li data-doc-item><span class="ld-tile">2</span><div><b>Faites votre premier devis</b><p>Choisissez un client, ajoutez vos lignes depuis votre catalogue ou en saisie libre, et suivez le total en direct.</p></div></li>
          <li data-doc-item><span class="ld-tile">3</span><div><b>Envoyez et facturez</b><p>Téléchargez le PDF, puis générez une facture par échéance de paiement, reliée au devis.</p></div></li>
        </ol>
      </section>
      <section id="d-features" class="docs-sec" data-doc>
        <h2>Fonctionnalités</h2>
        <div class="docs-grid">${DOC_FEATURES.map(f => `<details class="docs-card" data-doc-item><summary><i class="ld-tile" aria-hidden="true">${f[0]}</i><div><b>${f[1]}</b><span>${f[2]}</span></div></summary><div class="docs-more">${f[3]}</div></details>`).join('')}</div>
      </section>
      <section id="d-trades" class="docs-sec" data-doc>
        <h2>Pour tous les métiers</h2>
        <p class="muted" style="margin:0">Bâtiment, commerce, services, conseil, restauration, beauté, transport, auto… des devis de départ prêts à adapter, avec des prix indicatifs.</p>
        <div class="chips trades" data-doc-item>${(typeof TRADES !== 'undefined' ? TRADES : []).map(t => `<span>${t.name}</span>`).join('')}</div>
      </section>
      <section id="d-faq" class="docs-sec" data-doc>
        <h2>Questions fréquentes</h2>
        <div class="docs-faq">${DOC_FAQ.map(f => `<details data-doc-item><summary>${f[0]}</summary><p>${f[1]}</p></details>`).join('')}</div>
      </section>
      <p class="docs-empty" id="docsEmpty" hidden>Aucun résultat. Essayez un autre mot, par exemple « facture » ou « PDF ».</p>
    </div>
    <div class="ld-modal" id="authModal" ${open ? '' : 'hidden'} role="dialog" aria-modal="true" aria-label="Connexion">
      <section class="auth-card ld-card"><button type="button" class="ld-x" data-act="auth-close" aria-label="Fermer">×</button><div class="brand big auth-brand-m" style="display:flex">${brandHtml(cfg.siteName)}</div>${card}</section>
    </div>
  </div>`;
  syncThemeBtn();
  initHeroVideo(); initDocs();
  if (open) setTimeout(() => { const f = document.querySelector('#authModal input:not([type=hidden])'); if (f) f.focus(); }, 30);
}

const DOC_FEATURES = [
  [icon('file'), 'Devis professionnels', 'Mise en page soignée, plusieurs pages, TVA multi-taux', 'Lignes libres ou issues du catalogue, remises, acomptes, conditions de paiement et signature. Le devis se met en page automatiquement sur plusieurs pages, avec votre logo et vos mentions légales.'],
  [icon('receipt'), 'Une facture par paiement', 'Chaque échéance a sa facture, reliée au devis', 'Acompte, situation, solde : chaque facture reprend le détail du devis, affiche le montant de l\'échéance et le « reste à payer ». Vous retrouvez toutes les factures liées depuis le devis.'],
  [icon('download'), 'PDF en un clic', 'Téléchargement direct, sans passer par l\'impression', 'Un vrai fichier PDF, prêt à envoyer à votre client par email ou messagerie.'],
  [icon('inbox'), 'Import de devis existants', 'Un devis fait ailleurs ? Transférez le PDF', 'Toutes les pages sont lues et le devis est refait à l\'identique dans OptiDevis, que vous pouvez ensuite modifier et facturer.'],
  [icon('layers'), 'Catalogue, matériaux, fournisseurs', 'Vos prix, vos marges, vos références', 'Saisissez une référence fournisseur : le site cherche la fiche exacte et reprend le prix quand elle est trouvée. Marge par fournisseur, prix de vente calculé.'],
  [icon('clipboard'), 'Modèles par métier', 'Bâtiment, commerce, services, conseil, événementiel… un devis de départ', 'Choisissez votre métier : un devis complet et réaliste est créé en un clic, avec ses lignes, ses prix indicatifs et ses conditions. Vous adaptez, et vous pouvez ajouter les prestations à votre catalogue.'],
  [icon('chart'), 'Statistiques', 'CA du mois, facturé, encaissé, impayé', 'Comparaison avec les mois précédents et courbe sur 12 mois, pour savoir où vous en êtes en un coup d\'œil.'],
  [icon('hardhat'), 'Chantiers et projets', 'Regroupez devis et factures par chantier ou par projet', 'Optionnel : suivez les heures et rattachez les documents à un chantier, avec un récapitulatif sur le document.'],
  [icon('tool'), 'Boîte à outils', 'Clients par SIRET, correcteur, calculs', 'Les informations de l\'entreprise de votre client se remplissent depuis son SIRET. Un correcteur d\'orthographe gratuit relit vos documents.']
];
const DOC_FAQ = [
  ['Mes clients ont-ils besoin d\'un compte ?', 'Non. Vous créez le document et vous leur envoyez le PDF : ils n\'ont rien à installer.'],
  ['Puis-je modifier le total d\'une facture ?', 'Oui. Vous pouvez ajuster le total d\'une facture sans que le devis ni les autres documents changent.'],
  ['Mes données sont-elles privées ?', 'Chaque compte a ses propres données, protégées par votre mot de passe. Les sauvegardes sont faites chaque jour.'],
  ['Comment fonctionne l\'abonnement ?', 'Vous démarrez par un essai. Le paiement en ligne est sécurisé et vous pouvez l\'arrêter à tout moment depuis la page Abonnement.']
];

function initDocs() {
  const q = document.getElementById('docsQ'); if (!q) return;
  const links = [...document.querySelectorAll('.ld-links a[href^="#d-"]')];
  const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  q.addEventListener('input', () => {
    const k = norm(q.value.trim()); let shown = 0;
    document.querySelectorAll('[data-doc-item]').forEach(el => { const ok = !k || norm(el.textContent).includes(k); el.hidden = !ok; if (ok) shown++; if (el.tagName === 'DETAILS') el.open = !!k && ok; });
    document.querySelectorAll('[data-doc]').forEach(sec => { sec.hidden = !!k && !sec.querySelector('[data-doc-item]:not([hidden])'); });
    document.getElementById('docsEmpty').hidden = !k || shown > 0;
    if (k) { const f = document.querySelector('[data-doc]:not([hidden])'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  const onKey = e => {
    if (!document.getElementById('docsQ')) return document.removeEventListener('keydown', onKey);
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    if (e.key === 'Escape') { const m = document.getElementById('authModal'); if (m && !m.hidden) { m.hidden = true; window.__authOpen = false; } }
  };
  document.addEventListener('keydown', onKey);
  const modal = document.getElementById('authModal'); if (modal) modal.addEventListener('mousedown', e => { if (e.target === modal) { modal.hidden = true; window.__authOpen = false; } });
  links.forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = document.querySelector(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}

function formMsg(form, text, good) {
  const el = form.querySelector('.form-err'); if (!el) return toast(text);
  el.hidden = !text; el.textContent = text || ''; el.className = 'form-err' + (good ? ' good' : '');
}
async function withBusy(form, fn) {
  const btn = form.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
  formMsg(form, '');
  try { await fn(); } catch (e) { formMsg(form, e.message); } finally { if (btn) btn.disabled = false; }
}
const val = (f, k) => (f.elements[k] ? f.elements[k].value : '').trim();

forms.login = f => withBusy(f, async () => {
  const email = val(f, 'email');
  try {
    const r = await api('POST', '/api/auth/login', { email, password: f.elements.password.value });
    await startApp(r);
  } catch (e) {
    if (e.code === 'unverified') { renderAuth('verify', { email }); throw new Error(''); }
    throw e;
  }
});
forms.register = f => withBusy(f, async () => {
  if (f.elements.password.value !== f.elements.password2.value) throw new Error('Les mots de passe ne correspondent pas.');
  if (!f.elements.terms.checked) throw new Error('Veuillez accepter les conditions d\'utilisation.');
  const email = val(f, 'email');
  const r = await api('POST', '/api/auth/register', { name: val(f, 'name'), email, password: f.elements.password.value });
  if (r.needsVerification) renderAuth('verify', { email, devLink: r.devLink });
  else await startApp(await api('GET', '/api/me'));
});
forms.forgot = f => withBusy(f, async () => {
  const email = val(f, 'email'), r = await api('POST', '/api/auth/forgot', { email });
  renderAuth('forgot-sent', { email, devLink: r.devLink });
});
forms.reset = f => withBusy(f, async () => {
  if (f.elements.password.value !== f.elements.password2.value) throw new Error('Les mots de passe ne correspondent pas.');
  await api('POST', '/api/auth/reset', { token: val(f, 'token'), password: f.elements.password.value });
  renderAuth('login', { banner: { ok: true, text: 'Mot de passe modifié ✓ Connectez-vous avec le nouveau.' } });
});

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f || !forms[f.dataset.form]) return;
  e.preventDefault(); forms[f.dataset.form](f);
});

Object.assign(actions, {
  'auth-go': t => { window.__authOpen = true; renderAuth(t.dataset.mode); },
  'auth-open'() { const m = $('#authModal'); if (!m) return; window.__authOpen = true; m.hidden = false; const f = m.querySelector('input:not([type=hidden])'); if (f) f.focus(); },
  'auth-close'() { const m = $('#authModal'); if (m) m.hidden = true; window.__authOpen = false; },
  async resend(t) {
    try { const r = await api('POST', '/api/auth/resend', { email: t.dataset.email }); renderAuth('verify', { email: t.dataset.email, devLink: r.devLink }); toast('Email renvoyé'); }
    catch (e) { toast(e.message); }
  },
  async logout() { try { await api('POST', '/api/auth/logout'); } catch (e) { /* ignore */ } location.href = '/'; },
  'user-menu': () => $('#userbox').classList.toggle('open'),
  'goto-billing': () => go('billing'),
  'goto-custom': () => { $('#userbox').classList.remove('open'); go('custom'); },
  'goto-account': () => { $('#userbox').classList.remove('open'); go('account'); },
  'goto-admin': () => { $('#userbox').classList.remove('open'); go('admin'); }
});
document.addEventListener('click', e => { if (!e.target.closest('#userbox')) $('#userbox') && $('#userbox').classList.remove('open'); });

/* ---------- Barre du haut ---------- */
function updateTopbar() {
  const u = session.user, a = session.access;
  if (!u) return;
  const bd = $('#topbar .brand'); if (bd) bd.innerHTML = brandHtml(session.config.siteName);
  /* Ordre du travail au quotidien (devis → factures → clients → chantiers → catalogue → chiffres → outils),
     puis, séparés, les réglages ; Personnalisation / Abonnement / Administration restent aussi dans le menu du compte (avatar)
     et ne s'affichent dans la barre que sur les grands écrans, pour que rien ne soit coupé */
  const items = [['quotes', 'Devis'], ['invoices', 'Factures'], ['clients', 'Clients'], ['catalog', 'Catalogue'], ['stats', 'Statistiques', 'Stats'], ['tools', 'Boîte à outils', 'Outils'], ['company', 'Mon entreprise', 'Entreprise'], ['custom', 'Personnalisation', 'Style'], ['billing', 'Abonnement']];
  if (db.settings.useSites) items.splice(3, 0, ['sites', 'Chantiers']);
  if (u.role === 'admin') items.push(['admin', 'Administration', 'Admin']);
  $('#nav').innerHTML = items.map(([v, l, s]) => `<button data-view="${v}" class="${v === 'company' ? 'nav-sep' : ''}${['custom', 'billing', 'admin'].includes(v) ? ' nav-acct' : ''}"><span class="lg">${l}</span><span class="sh">${s || l}</span></button>`).join('');
  document.querySelectorAll('#nav button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === navFor()));
  const pill = $('#accessPill');
  if (u.role === 'admin') pill.innerHTML = '<span class="pill ok">Administrateur</span>';
  else if (a.active) pill.innerHTML = `<span class="pill ok"><span class="lg">${a.source === 'trial' ? 'Essai' : '✓ Actif'} jusqu'au ${new Date(a.until).toLocaleDateString('fr-FR')}</span><span class="sh">${a.source === 'trial' ? 'Essai' : '✓ Actif'} · ${new Date(a.until).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span></span>`;
  else pill.innerHTML = '<button class="pill bad" data-act="goto-billing">Abonnement requis</button>';
  renderBottomNav(u);
  const initials = u.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $('#userbox').innerHTML = `<button class="avatar" data-act="user-menu" title="${esc(u.email)}">${esc(initials)}</button>
    <div class="pop"><div class="pop-head"><b>${esc(u.name)}</b><span class="muted">${esc(u.email)}</span></div>
      <button data-act="goto-custom">Personnalisation</button><button data-act="goto-account">Mon compte</button><button data-act="goto-billing">Abonnement &amp; factures</button>
      ${u.role === 'admin' ? '<button data-act="goto-admin">Administration</button>' : ''}<button data-act="logout" class="danger">Déconnexion</button></div>`;
}

/* ---------- Navigation mobile (barre du bas + menu « Plus ») ---------- */
function renderBottomNav(u) {
  const main = [['quotes', 'Devis', 'file'], ['invoices', 'Factures', 'clipboard'], ['clients', 'Clients', 'user'], ['catalog', 'Catalogue', 'book']];
  const bn = $('#bottomnav'); if (!bn) return;
  bn.innerHTML = main.map(([v, l, ic]) => `<button data-view="${v}" class="${navFor() === v ? 'active' : ''}">${icon(ic)}<span>${l}</span></button>`).join('') +
    `<button data-act="more-menu">${icon('menu')}<span>Plus</span></button>`;
  const more = [['stats', 'Statistiques'], ['tools', 'Boîte à outils'], ['company', 'Mon entreprise'], ['custom', 'Personnalisation'], ['billing', 'Abonnement & factures'], ['account', 'Mon compte']];
  if (db.settings.useSites) more.unshift(['sites', 'Chantiers']);
  if (u.role === 'admin') more.push(['admin', 'Administration']);
  $('#moreSheet').innerHTML = `<div class="sheet-bg" data-act="more-menu"></div><div class="sheet"><div class="pop-head"><b>${esc(u.name)}</b><span class="muted">${esc(u.email)}</span></div>` +
    more.map(([v, l]) => `<button data-view="${v}"${v === 'company' ? ' class="nav-sep"' : ''}>${l}</button>`).join('') + '<button data-act="logout" class="danger">Déconnexion</button></div>';
}
actions['more-menu'] = () => { const s = $('#moreSheet'); s.hidden = !s.hidden; };
document.addEventListener('click', e => {
  const b = e.target.closest('#bottomnav button[data-view], #moreSheet button[data-view]');
  if (b) { $('#moreSheet').hidden = true; go(b.dataset.view); }
});

/* Logo + nom du site (« OptiDevis » en deux graisses) */
const LOGO_MARK = '<img class="logo-mark" src="/logo.svg" alt="" width="30" height="30">';
function brandHtml(name) {
  const n = String(name || 'OptiDevis'), m = /^(opti)(devis)$/i.exec(n);
  return LOGO_MARK + '<span class="nm">' + (m ? esc(m[1]) + '<b>' + esc(m[2]) + '</b><i class="dot">.</i>' : esc(n)) + '</span>';
}

/* ---------- Vidéo de présentation de l'écran de connexion ---------- */
const HERO_MP4 = '/media/optidevis-film.mp4', HERO_WEBM = '/media/optidevis-film.webm';
const heroSources = () => `<source src="${HERO_MP4}" type="video/mp4"><source src="${HERO_WEBM}" type="video/webm">`;
function loadHero(v) { if (v.dataset.ready) return; v.dataset.ready = '1'; v.innerHTML = heroSources(); v.load(); }
function initHeroVideo() {
  const v = document.getElementById('heroVideo'); if (!v) return;
  const conn = navigator.connection || {};
  const wide = window.matchMedia('(min-width: 901px)').matches;
  if (!wide || conn.saveData) { const box = document.getElementById('heroVideoBox'); if (box) box.classList.add('idle'); return; }
  loadHero(v); v.muted = true;
  v.play().catch(() => { document.getElementById('heroVideoBox').classList.add('idle'); });
  v.onplay = () => { const b = document.getElementById('hvPlay'); if (b) b.textContent = 'Pause'; };
  v.onpause = () => { const b = document.getElementById('hvPlay'); if (b) b.textContent = 'Lecture'; };
}
Object.assign(actions, {
  'hero-play'() { const v = $('#heroVideo'); if (!v) return; loadHero(v); if (v.paused) v.play().catch(() => {}); else v.pause(); $('#heroVideoBox').classList.remove('idle'); },
  'hero-sound'() { const v = $('#heroVideo'); if (!v) return; loadHero(v); v.muted = !v.muted; if (!v.muted && v.paused) v.play().catch(() => {}); $('#hvSound').textContent = v.muted ? 'Activer le son' : 'Couper le son'; $('#heroVideoBox').classList.remove('idle'); },
  'hero-full'() { const v = $('#heroVideo'); if (!v) return; loadHero(v); v.play().catch(() => {}); (v.requestFullscreen || v.webkitEnterFullscreen || (() => {})).call(v); },
  'hero-open'() {
    openModal(`<div class="modal-wide"><div class="row between"><h2 style="margin:0">Découvrir OptiDevis</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
      <video id="modalVideo" controls playsinline autoplay poster="/media/optidevis-poster.jpg" style="width:100%;border-radius:12px;margin-top:12px;background:#000">${heroSources()}</video></div>`);
  }
});
