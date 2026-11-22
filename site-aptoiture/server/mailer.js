// Envoi d'e-mails (facultatif) : configurez SMTP_URL ou SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
const nodemailer = require('nodemailer');
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

async function send({ to, subject, text, replyTo, attachments }) {
  const t = transport();
  if (!t || !to) return { sent: false };
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER || 'P.A Couverture <no-reply@localhost>',
      to, subject: oneLine(subject), text, replyTo: replyTo ? oneLine(replyTo) : undefined, attachments,
    });
    return { sent: true };
  } catch (e) {
    console.error('E-mail non envoyé :', e.message);
    return { sent: false, error: e.message };
  }
}
module.exports = { send, configured };
