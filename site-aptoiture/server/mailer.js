// Envoi d'e-mails (facultatif) : configurez SMTP_URL ou SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
// Chaque e-mail part en deux versions : texte simple et mise en page HTML aux couleurs du site.
const nodemailer = require('nodemailer');
const path = require('path');
let tx = null;

function transport() {
  if (tx !== null) return tx;
  if (process.env.SMTP_URL) tx = nodemailer.createTransport(process.env.SMTP_URL);
  else if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 587;
    tx = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else tx = false;
  return tx;
}
const configured = () => Boolean(transport());
const oneLine = s => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
const from = () => process.env.MAIL_FROM || (process.env.SMTP_USER ? `"P.A Couverture" <${process.env.SMTP_USER}>` : 'P.A Couverture <no-reply@localhost>');

const LOGO = path.join(__dirname, '..', 'public', 'images', 'mascotte.png');
const BLUE = '#386db9', DARK = '#16191f', INK = '#1d2633', MUTED = '#5d6878', LINE = '#e3e8ef';
const PHONE = '06 03 50 82 30', PHONE_TEL = '+33603508230';
const h = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const paras = t => String(t || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${INK}">${h(p).replace(/\n/g, '<br>')}</p>`).join('');

/* Mise en page commune :
   { preheader, eyebrow, title, intro (texte), rows: [[libellé, valeur]], quote: {label, text}, body (texte), button: {label, url}, note } */
function layout(o) {
  const rows = (o.rows || []).filter(r => r && r[1]).map(([k, v], i) => `<tr><td style="padding:11px 14px;font-size:13px;color:${MUTED};width:38%;vertical-align:top;${i ? `border-top:1px solid ${LINE};` : ''}">${h(k)}</td><td style="padding:11px 14px;font-size:14px;color:${INK};font-weight:600;vertical-align:top;${i ? `border-top:1px solid ${LINE};` : ''}">${String(v).startsWith('<') ? v : h(v)}</td></tr>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${h(o.title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${h(o.preheader || o.title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE}">
  <tr><td style="background:${DARK};padding:22px 28px;border-bottom:4px solid ${BLUE}">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:12px"><img src="cid:logo@pa" width="52" height="30" alt="" style="display:block;border:0"></td>
      <td style="vertical-align:middle;font:700 17px/1 Arial,sans-serif;letter-spacing:3px;color:#ffffff">P.A <span style="color:#5b92dc">COUVERTURE</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px 28px 8px">
    ${o.eyebrow ? `<div style="font:700 11px/1 Arial,sans-serif;letter-spacing:2.5px;text-transform:uppercase;color:${BLUE};margin-bottom:12px">${h(o.eyebrow)}</div>` : ''}
    <h1 style="margin:0 0 18px;font:700 22px/1.3 Arial,sans-serif;color:${DARK}">${h(o.title)}</h1>
    ${paras(o.intro)}
    ${o.body ? paras(o.body) : ''}
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-left:4px solid ${BLUE};margin:6px 0 20px;background:#f8fafc">${rows}</table>` : ''}
    ${o.quote && o.quote.text ? `<div style="margin:0 0 20px"><div style="font:700 11px/1 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin-bottom:8px">${h(o.quote.label)}</div><div style="border-left:3px solid ${LINE};padding:4px 0 4px 14px;font-size:14px;line-height:1.6;color:${MUTED}">${h(o.quote.text).replace(/\n/g, '<br>')}</div></div>` : ''}
    ${o.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 24px"><tr><td style="background:${BLUE}"><a href="${h(o.button.url)}" style="display:inline-block;padding:14px 26px;font:700 13px/1 Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;text-decoration:none">${h(o.button.label)}</a></td></tr></table>` : ''}
    ${o.note ? `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:${MUTED}">${h(o.note)}</p>` : ''}
  </td></tr>
  <tr><td style="padding:20px 28px;background:#f4f6f9;border-top:1px solid ${LINE};font-size:13px;line-height:1.6;color:${MUTED}">
    <b style="color:${DARK}">P.A Couverture</b> · Couverture, zinguerie, velux, entretien · Hautmont (59330)<br>
    <a href="tel:${PHONE_TEL}" style="color:${BLUE};text-decoration:none;font-weight:600">${PHONE}</a>
  </td></tr>
</table>
<p style="margin:14px 0 0;font-size:11px;color:#98a1ae">Cet e-mail fait suite à une demande sur notre site.</p>
</td></tr></table></body></html>`;
}
/* version texte du même contenu (lue par les messageries qui n'affichent pas le HTML) */
function plain(o) {
  const parts = [o.title, '', o.intro || ''];
  if (o.body) parts.push('', o.body);
  const rows = (o.rows || []).filter(r => r && r[1]).map(([k, v]) => `${k} : ${String(v).replace(/<[^>]+>/g, '')}`);
  if (rows.length) parts.push('', ...rows);
  if (o.quote && o.quote.text) parts.push('', o.quote.label + ' :', o.quote.text);
  if (o.button) parts.push('', `${o.button.label} : ${o.button.url}`);
  if (o.note) parts.push('', o.note);
  parts.push('', '--', 'P.A Couverture', PHONE);
  return parts.join('\n');
}

async function send({ to, subject, text, html, replyTo, attachments, mail }) {
  const t = transport();
  if (!t || !to) return { sent: false };
  const att = (attachments || []).slice();
  if (mail) { html = layout(mail); text = plain(mail); att.push({ filename: 'logo.png', path: LOGO, cid: 'logo@pa' }); }
  try {
    await t.sendMail({ from: from(), to, subject: oneLine(subject), text, html, replyTo: replyTo ? oneLine(replyTo) : undefined, attachments: att });
    return { sent: true };
  } catch (e) {
    console.error('E-mail non envoyé :', e.message);
    return { sent: false, error: e.message };
  }
}
module.exports = { send, configured, layout, plain, PHONE };
