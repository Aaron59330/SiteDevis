'use strict';
/* Rappel quotidien par email (si l'utilisateur l'a activé dans la cloche « Rappels ») :
   factures envoyées non payées dont l'échéance est dépassée ou proche, devis expirés sans réponse. Un envoi par jour max. */
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const fr = d => d.split('-').reverse().join('/');
const eur = n => r2(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const day = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const diff = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5);

const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
/* même calcul que totals() côté application : reste dû = TTC (part d'échéance, total saisi) − déjà payé */
function due(q, exempt) {
  const it = (q.lines || []).filter(l => l.t === 'item'), sub = it.reduce((s, l) => s + num(l.qty) * num(l.price), 0);
  const ratio = 1 - num(q.discount) / 100;
  let t = it.reduce((s, l) => s + num(l.qty) * num(l.price) * ratio * (1 + (exempt ? 0 : num(l.vat)) / 100), 0);
  if (num(q.stepPct) > 0) t *= num(q.stepPct) / 100;
  if (q.totalOverride !== '' && q.totalOverride != null && Number.isFinite(Number(q.totalOverride))) t = Number(q.totalOverride);
  return sub || t ? r2(t - num(q.alreadyPaid)) : 0;
}
function items(data, now) {
  const out = [];
  for (const q of data.quotes || []) {
    if (q.status !== 'envoye') continue;
    const who = (q.clientText || '').split('\n')[0] || 'votre client';
    if (q.kind === 'facture') {
      if (!q.dueDate) continue; const n = diff(q.dueDate, now), d = due(q, data.company && data.company.vatExempt); if (!(d > 0.004)) continue;
      if (n < 0) out.push(`• Facture ${q.number} — ${who} n'a pas encore payé ${eur(d)} (échéance du ${fr(q.dueDate)}, ${-n} j de retard)`);
      else if (n <= 3) out.push(`• Facture ${q.number} — ${eur(d)} attendus de ${who} avant le ${fr(q.dueDate)}`);
    } else if (q.validUntil) { const n = diff(q.validUntil, now); if (n < 0 && n >= -30) out.push(`• Devis ${q.number} — expiré le ${fr(q.validUntil)} sans réponse de ${who} : pensez à le relancer`); }
  }
  return out;
}
function run({ db, store, mail, siteName, url }) {
  if (!mail.configured()) return;
  const now = day();
  if (new Date().getHours() < 7) return;            // le matin, pas en pleine nuit
  for (const u of db.users) {
    if (u.suspended || db.reminders['n:' + u.id] === now) continue;
    const data = store.getUserData(u.id);
    if (!data || !data.settings || !data.settings.notifEmail) continue;
    db.reminders['n:' + u.id] = now; store.save();
    const list = items(data, now); if (!list.length) continue;
    mail.send(u.email, `🔔 ${list.length} rappel${list.length > 1 ? 's' : ''} aujourd'hui — ${siteName}`,
      `Bonjour ${u.name || ''},\n\nVoici vos rappels du ${fr(now)} :\n\n${list.join('\n')}\n\nLes déclarations (URSSAF, TVA, CFE…) sont dans la cloche de l'application.\n\n${url}/\n\nPour ne plus recevoir ces emails : cloche 🔔 > décochez « Recevoir les rappels par email ».`);
  }
}
module.exports = { run, items };
