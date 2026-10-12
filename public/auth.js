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

  $('#app').innerHTML = `
  <div class="auth">
    <section class="auth-hero">
      <div class="brand big">${brandHtml(cfg.siteName)}</div>
      <h1>Des devis professionnels,<br>en quelques minutes.</h1>
      <ul>
        <li>📄 Devis multi-pages prêts à imprimer en PDF</li>
        <li>🏢 Clients pros remplis automatiquement avec leur SIRET</li>
        <li>🧮 Sous-totaux, remises, TVA, échéancier de paiement</li>
        <li>🔒 Vos données sont privées et sauvegardées dans votre compte</li>
      </ul>
      <div class="hero-card"><div class="hc-row"><span>Cloison BA13</span><b>480,00 €</b></div><div class="hc-row"><span>Doublage</span><b>1 204,00 €</b></div><div class="hc-row tot"><span>Total TTC</span><b>1 684,00 €</b></div></div>
    </section>
    <section class="auth-card"><button class="theme-btn auth-theme" id="themeBtn" title="Mode clair / sombre">🌙</button>${card}</section>
  </div>`;
  syncThemeBtn();
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
  'auth-go': t => renderAuth(t.dataset.mode),
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
  const items = [['quotes', 'Devis'], ['invoices', 'Factures'], ['clients', 'Clients'], ['catalog', 'Catalogue'], ['tools', 'Boîte à outils', 'Outils'], ['company', 'Mon entreprise', 'Entreprise'], ['custom', 'Personnalisation', 'Style'], ['billing', 'Abonnement']];
  if (db.settings.useSites) items.splice(3, 0, ['sites', 'Chantiers']);
  if (u.role === 'admin') items.push(['admin', 'Administration', 'Admin']);
  $('#nav').innerHTML = items.map(([v, l, s]) => `<button data-view="${v}"><span class="lg">${l}</span><span class="sh">${s || l}</span></button>`).join('');
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
  const more = [['tools', 'Boîte à outils'], ['company', 'Mon entreprise'], ['custom', 'Personnalisation'], ['billing', 'Abonnement & factures'], ['account', 'Mon compte']];
  if (db.settings.useSites) more.unshift(['sites', 'Chantiers']);
  if (u.role === 'admin') more.push(['admin', 'Administration']);
  $('#moreSheet').innerHTML = `<div class="sheet-bg" data-act="more-menu"></div><div class="sheet"><div class="pop-head"><b>${esc(u.name)}</b><span class="muted">${esc(u.email)}</span></div>` +
    more.map(([v, l]) => `<button data-view="${v}">${l}</button>`).join('') + '<button data-act="logout" class="danger">Déconnexion</button></div>';
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
