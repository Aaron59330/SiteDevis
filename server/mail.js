'use strict';
/* Envoi d'emails via l'API Resend (RESEND_API_KEY + MAIL_FROM).
   Sans configuration : mode démo, les emails sont conservés dans la boîte d'envoi de l'admin et affichés en console. */
const store = require('./store');

const configured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toHtml = text => '<div style="font:15px/1.6 system-ui,sans-serif;color:#111;max-width:560px">' +
  escHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>') + '</div>';

// expéditeur : adresse de MAIL_FROM, avec le nom de l'entreprise de l'utilisateur affiché (« Entreprise via OptiDevis »)
function fromWith(name) {
  const m = /<([^>]+)>/.exec(process.env.MAIL_FROM || ''), addr = m ? m[1] : process.env.MAIL_FROM;
  const clean = String(name || '').replace(/[<>"\r\n,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean ? `"${clean} via OptiDevis" <${addr}>` : process.env.MAIL_FROM;
}

async function send(to, subject, text, opts = {}) {
  const entry = { id: store.uuid(), to, subject, text: opts.attachments ? text + '\n[pièce jointe : ' + opts.attachments.map(a => a.filename).join(', ') + ']' : text, at: new Date().toISOString(), status: 'démo (non envoyé)' };
  if (configured()) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: opts.fromName ? fromWith(opts.fromName) : process.env.MAIL_FROM, to: [to], subject, text, html: toHtml(text), ...(opts.replyTo ? { reply_to: opts.replyTo } : {}), ...(opts.bcc ? { bcc: [opts.bcc] } : {}), ...(opts.attachments ? { attachments: opts.attachments } : {}) })
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
