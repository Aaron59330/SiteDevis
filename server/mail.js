'use strict';
/* Envoi d'emails via l'API Resend (RESEND_API_KEY + MAIL_FROM).
   Sans configuration : mode démo, les emails sont conservés dans la boîte d'envoi de l'admin et affichés en console. */
const store = require('./store');

const configured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* ---------- Mise en page HTML des emails (sobre, compatible Gmail / Outlook / Apple Mail : tableaux + styles en ligne) ---------- */
const APP = () => (process.env.APP_URL || 'https://optidevis.pro').replace(/\/$/, '');
const GOLD = '#e3a04b';
const BTN = [[/\/api\/auth\/verify/, 'Confirmer mon adresse email'], [/reset=|\/reset/, 'Choisir un nouveau mot de passe'], [/\/receipt\//, 'Voir mon reçu'], [/./, 'Ouvrir OptiDevis']];
const linkify = s => s.replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${GOLD};text-decoration:underline;word-break:break-all">$1</a>`);
function button(url, label) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 10px"><tr><td style="border-radius:10px;background:${GOLD}">
    <a href="${url}" style="display:inline-block;padding:14px 26px;font:600 15px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1208;text-decoration:none;border-radius:10px">${escHtml(label)}</a></td></tr></table>
    <p style="margin:0 0 22px;font-size:12px;color:#8a8a8a">Le bouton ne fonctionne pas ? Copiez ce lien :<br><a href="${url}" style="color:#8a8a8a;word-break:break-all">${url}</a></p>`;
}
function toHtml(text, subject, opts = {}) {
  const brand = opts.fromName ? escHtml(opts.fromName) : 'Opti<span style="color:' + GOLD + '">Devis</span><span style="color:' + GOLD + '">.</span>';
  const title = escHtml(String(subject || '').replace(/\s+—\s+OptiDevis$/i, '').replace(/^[^\p{L}\p{N}]+/u, ''));
  let used = false, inList = false; const out = [];
  const blocks = String(text).split(/\n{2,}/);
  for (const b of blocks) {
    const t = b.trim(); if (!t) continue;
    if (/^https?:\/\/\S+$/.test(t) && !used) { const lab = (opts.button || (BTN.find(([r]) => r.test(t)) || [])[1]); out.push(button(escHtml(t), lab)); used = true; continue; }
    const lines = t.split('\n');
    if (lines.every(l => /^>\s?/.test(l))) { out.push(`<div style="margin:16px 0;padding:12px 16px;border-left:3px solid ${GOLD};background:#faf7f2;border-radius:6px;color:#555;font-size:14px">${lines.map(l => linkify(escHtml(l.replace(/^>\s?/, '')))).join('<br>')}</div>`); continue; }
    if (lines.every(l => /^\s*[•\-–]\s/.test(l))) { out.push(`<ul style="margin:12px 0;padding-left:20px">${lines.map(l => `<li style="margin:6px 0">${linkify(escHtml(l.replace(/^\s*[•\-–]\s/, '')))}</li>`).join('')}</ul>`); continue; }
    out.push(`<p style="margin:0 0 14px">${lines.map(l => linkify(escHtml(l))).join('<br>')}</p>`);
  }
  const foot = opts.fromName
    ? `Document envoyé par ${escHtml(opts.fromName)} avec <a href="${APP()}" style="color:#9a9a9a">OptiDevis</a>.${opts.replyTo ? ' Pour répondre, utilisez simplement « Répondre ».' : ''}`
    : `<a href="${APP()}" style="color:#9a9a9a;text-decoration:none"><b style="color:#6b6b6b">OptiDevis</b></a> — devis et factures en quelques minutes.<br>Vous recevez cet email suite à une action sur votre compte.`;
  const logo = opts.fromName ? '' : `<img src="${APP()}/icon-192.png" width="34" height="34" alt="" style="display:block;border:0;border-radius:9px">`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f1ed">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(String(text).split('\n').find(l => l.trim() && !/^bonjour/i.test(l)) || '').slice(0, 140)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f1ed"><tr><td align="center" style="padding:32px 14px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
    <tr><td style="padding:0 6px 18px"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
      ${logo ? `<td style="padding-right:10px">${logo}</td>` : ''}<td style="font:700 20px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#141414;letter-spacing:-.3px">${brand}</td></tr></table></td></tr>
    <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e9e4dc;padding:34px 34px 28px;font:15px/1.65 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2a2a2a">
      <div style="height:4px;width:44px;background:${GOLD};border-radius:4px;margin:0 0 20px"></div>
      ${title ? `<h1 style="margin:0 0 18px;font:700 22px/1.3 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#141414;letter-spacing:-.3px">${title}</h1>` : ''}
      ${out.join('\n')}
    </td></tr>
    <tr><td style="padding:18px 10px 0;font:12px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9a9a9a;text-align:center">${foot}</td></tr>
  </table></td></tr></table></body></html>`;
}
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
        body: JSON.stringify({ from: opts.fromName ? fromWith(opts.fromName) : process.env.MAIL_FROM, to: [to], subject, text, html: toHtml(text, subject, opts), ...(opts.replyTo ? { reply_to: opts.replyTo } : {}), ...(opts.bcc ? { bcc: [opts.bcc] } : {}), ...(opts.attachments ? { attachments: opts.attachments } : {}) })
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

module.exports = { send, configured, toHtml };
