// SMS envoyés à l'artisan (rappels d'agenda, programme du lendemain, nouvelles demandes).
// Deux services possibles (configurés sur le serveur par deploy/aptoiture-sms.sh) :
//  - Free Mobile « Notifications par SMS » : gratuit, uniquement vers sa propre ligne Free
//      SMS_PROVIDER=free  FREE_SMS_USER=identifiant  FREE_SMS_PASS=clé
//  - Brevo (tous opérateurs, payant au SMS) :
//      SMS_PROVIDER=brevo  BREVO_API_KEY=clé  SMS_TO=+33612345678  SMS_SENDER=PACouvert
const provider = () => (process.env.SMS_PROVIDER || '').toLowerCase();
function configured() {
  if (provider() === 'free') return Boolean(process.env.FREE_SMS_USER && process.env.FREE_SMS_PASS);
  if (provider() === 'brevo') return Boolean(process.env.BREVO_API_KEY && process.env.SMS_TO);
  return false;
}
// texte court, sans caractères qui coûtent cher (emoji) ; 320 caractères au plus (2 SMS)
const tidy = t => String(t || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').replace(/[’]/g, "'").replace(/[–—]/g, '-').replace(/\s+\n/g, '\n').trim().slice(0, 320);

async function send(text) {
  if (!configured()) return { sent: false };
  const msg = tidy(text);
  try {
    if (provider() === 'free') {
      const u = new URL('https://smsapi.free-mobile.fr/sendmsg');
      u.searchParams.set('user', process.env.FREE_SMS_USER); u.searchParams.set('pass', process.env.FREE_SMS_PASS); u.searchParams.set('msg', msg);
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (r.status !== 200) throw new Error({ 400: 'paramètre manquant', 402: 'trop de SMS envoyés, réessayez plus tard', 403: 'service non activé ou identifiants faux', 500: 'service Free indisponible' }[r.status] || 'erreur ' + r.status);
    } else {
      const r = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ type: 'transactional', sender: (process.env.SMS_SENDER || 'PACouvert').replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'PACouvert', recipient: process.env.SMS_TO.replace(/[^\d+]/g, '').replace(/^\+/, ''), content: msg }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || 'erreur ' + r.status); }
    }
    return { sent: true };
  } catch (e) {
    console.error('SMS non envoyé :', e.message);
    return { sent: false, error: e.message };
  }
}
module.exports = { send, configured, provider };
