'use strict';
/* Vérifie la connexion à Enable Banking avec la configuration du serveur (identifiant + clé privée).
   Utilisé par deploy/banque.sh ; à lancer seul :  bash deploy/banque.sh --test */
const fs = require('fs');
const crypto = require('crypto');
const id = process.env.ENABLEBANKING_APP_ID, file = process.env.ENABLEBANKING_KEY_FILE;
const api = (process.env.ENABLEBANKING_API || 'https://api.enablebanking.com').replace(/\/$/, '');
const fail = m => { console.log('✗ ' + m); process.exit(1); };
if (!id) fail('ENABLEBANKING_APP_ID est vide dans /etc/sitedevis.env');
if (!file) fail('ENABLEBANKING_KEY_FILE est vide dans /etc/sitedevis.env');
let key;
try { key = crypto.createPrivateKey(fs.readFileSync(file)); } catch (e) { fail('clé illisible (' + file + ') : ' + (e.code || e.message)); }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), iat = Math.floor(Date.now() / 1000);
const head = b64({ typ: 'JWT', alg: 'RS256', kid: id }), body = b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 600 });
const jwt = head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), key).toString('base64url');
(async () => {
  try {
    const app = await fetch(api + '/application', { headers: { Authorization: 'Bearer ' + jwt }, signal: AbortSignal.timeout(20000) });
    const at = await app.text();
    if (app.status === 401 || app.status === 403) fail('Enable Banking refuse la clé (' + app.status + ') : vérifiez que l\'identifiant et le fichier .pem viennent de la même application. ' + at.slice(0, 200));
    let a = {}; try { a = JSON.parse(at); } catch (e) { /* ignore */ }
    if (app.ok) console.log('✓ Application reconnue' + (a.name ? ' : ' + a.name : '') + (a.environment ? ' (' + a.environment + ')' : '') + (a.active === false ? ' — pas encore activée : liez votre compte (« Link accounts »)' : ''));
    if (a.redirect_urls && !a.redirect_urls.some(u => /\/api\/bank\/callback$/.test(u))) console.log('⚠ Adresse de retour à ajouter dans l\'application : ' + (process.env.APP_URL || 'https://votre-domaine') + '/api/bank/callback (actuelles : ' + a.redirect_urls.join(', ') + ')');
    const r = await fetch(api + '/aspsps?country=FR', { headers: { Authorization: 'Bearer ' + jwt }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    if (!r.ok) fail('Enable Banking répond ' + r.status + ' : ' + t.slice(0, 200));
    const n = (JSON.parse(t).aspsps || []).length;
    console.log('✓ Connexion à Enable Banking opérationnelle : ' + n + ' banques françaises disponibles.');
  } catch (e) { fail('Enable Banking injoignable depuis le serveur : ' + e.message); }
})();
