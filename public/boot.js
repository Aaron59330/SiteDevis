'use strict';
/* Démarrage : config → session → données du compte */
async function startApp(me, params) {
  session.user = me.user; session.access = me.access;
  initPrefs(me.user.prefs);
  document.body.classList.remove('auth-mode'); $('#topbar').hidden = false;
  let d = null, legacy = false;
  try { d = (await api('GET', '/api/data')).data; } catch (e) { toast(e.message); }
  if (!d) {
    try { const raw = JSON.parse(localStorage.getItem(LEGACY_KEY)); if (raw && raw.quotes) { d = raw; legacy = true; } } catch (e) { /* ignore */ }
  }
  db = d ? normalize(d) : defaults();
  if (!d) db.company.email = session.user.email;
  view = 'quotes'; editingId = null;
  updateTopbar();
  if (params && params.get('checkout') === 'success' && params.get('session_id')) {
    view = 'billing';
    try {
      const r = await api('GET', '/api/billing/confirm?session_id=' + encodeURIComponent(params.get('session_id')));
      session.access = r.access; updateTopbar();
      toast(r.status === 'paid' ? '✓ Paiement confirmé, merci !' : 'Paiement en attente de confirmation…');
    } catch (e) { toast(e.message); }
  } else if (params && params.get('checkout') === 'cancel') { view = 'billing'; toast('Paiement annulé'); }
  render();
  if (legacy && session.access.active) { save(); toast('Vos devis locaux ont été importés dans votre compte'); }
}

(async function boot() {
  const p = new URLSearchParams(location.search);
  try { session.config = await api('GET', '/api/config'); }
  catch (e) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Serveur injoignable. Lancez-le avec <b>node server.js</b> puis ouvrez <b>http://localhost:3000</b>.</p>'; return; }
  document.title = session.config.siteName;
  let mode = 'login', banner = null, token = '';
  if (p.get('verified') === '1') banner = { ok: true, text: 'Adresse email confirmée ✓ Vous pouvez vous connecter.' };
  if (p.get('verified') === '0') banner = { ok: false, text: 'Lien de confirmation invalide ou expiré. Reconnectez-vous pour en recevoir un nouveau.' };
  if (p.get('reset')) { mode = 'reset'; token = p.get('reset'); }
  let me = null;
  try { me = await api('GET', '/api/me'); } catch (e) { /* non connecté */ }
  history.replaceState({}, '', location.pathname);
  if (!me || mode === 'reset') return renderAuth(mode, { banner, token });
  await startApp(me, p);
})();
