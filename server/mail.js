'use strict';
/* Envoi d'emails via l'API Resend (RESEND_API_KEY + MAIL_FROM).
   Sans configuration : mode démo, les emails sont conservés dans la boîte d'envoi de l'admin et affichés en console. */
const store = require('./store');

const configured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toHtml = text => '<div style="font:15px/1.6 system-ui,sans-serif;color:#111;max-width:560px">' +
  escHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>') + '</div>';

async function send(to, subject, text) {
  const entry = { id: store.uuid(), to, subject, text, at: new Date().toISOString(), status: 'démo (non envoyé)' };
  if (configured()) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html: toHtml(text) })
      });
      entry.status = r.ok ? 'envoyé' : 'erreur';
      if (!r.ok) entry.error = (await r.text()).slice(0, 300);
    } catch (e) { entry.status = 'erreur'; entry.error = e.message; }
  } else {
    console.log(`\n[email non envoyé – mode démo] à ${to} — ${subject}\n${text}\n`);
  }
  store.db.outbox.unshift(entry);
  store.db.outbox.length = Math.min(store.db.outbox.length, 300);
  store.save();
  return entry;
}

module.exports = { send, configured };
