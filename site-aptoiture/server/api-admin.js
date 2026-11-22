const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PRIVATE, readJSON, writeJSON } = require('./store');
const settings = require('./settings');
const mailer = require('./mailer');
const stats = require('./stats');
const auth = require('./auth');
const { DOC, frDate, siteBase } = require('./api-public');

const router = express.Router();
router.use((req, res, next) => {
  if (!req.isAdmin) return res.status(401).json({ error: 'Non connecté' });
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'Requête refusée' });
  next();
});
const newId = () => crypto.randomBytes(6).toString('hex');
const clip = (v, n) => String(v == null ? '' : v).slice(0, n).trim();

router.get('/info', (req, res) => {
  const s = settings.get();
  res.json({ mail: mailer.configured(), notifyEmail: s.notifyEmail, siteUrl: s.siteUrl || `${req.protocol}://${req.get('host')}`, siteUrlSet: Boolean(s.siteUrl), doc: fs.existsSync(DOC) });
});

// ---------- demandes de devis
router.get('/requests', (req, res) => res.json(readJSON('requests.json', [])));
router.patch('/requests/:id', (req, res) => {
  const list = readJSON('requests.json', []);
  const r = list.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Introuvable' });
  if (['nouveau', 'traite', 'archive'].includes(req.body.status)) r.status = req.body.status;
  if ('note' in req.body) r.note = clip(req.body.note, 1000);
  writeJSON('requests.json', list);
  res.json({ ok: true });
});
router.delete('/requests/:id', (req, res) => {
  const list = readJSON('requests.json', []);
  const r = list.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Introuvable' });
  (r.photos || []).forEach(f => fs.rm(path.join(PRIVATE, path.basename(f)), { force: true }, () => {}));
  writeJSON('requests.json', list.filter(x => x !== r));
  res.json({ ok: true });
});
router.get('/private/:file', (req, res) => {
  const f = path.join(PRIVATE, path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(f);
});

// ---------- rendez-vous
router.get('/rdv', (req, res) => res.json({ list: readJSON('appointments.json', []), confirmDaysBefore: settings.get().booking.confirmDaysBefore }));
router.post('/rdv/:id/status', (req, res) => {
  const list = readJSON('appointments.json', []);
  const a = list.find(x => x.id === req.params.id);
  const st = req.body.status;
  if (!a) return res.status(404).json({ error: 'Introuvable' });
  if (!['confirme', 'refuse', 'annule', 'en_attente'].includes(st)) return res.status(400).json({ error: 'Statut invalide' });
  a.status = st;
  if (st === 'confirme') a.confirmedAt = new Date().toISOString();
  writeJSON('appointments.json', list);
  const s = settings.get();
  const when = `${frDate(a.date)} à ${a.time}`;
  const M = {
    confirme: { subject: 'Rendez-vous confirmé', eyebrow: 'Rendez-vous confirmé', title: `C'est confirmé, ${a.nom} !`, intro: `Nous avons le plaisir de vous confirmer votre rendez-vous.`, note: `En cas d'empêchement, merci de nous prévenir au ${mailer.PHONE} ou en répondant à cet e-mail.` },
    refuse: { subject: 'Votre demande de rendez-vous', eyebrow: 'Créneau indisponible', title: `Bonjour ${a.nom}`, intro: `Nous ne pouvons malheureusement pas honorer ce créneau. Choisissez-en un autre sur notre site, ou appelez-nous au ${mailer.PHONE} : nous trouverons un moment qui vous convient.` },
    annule: { subject: 'Rendez-vous annulé', eyebrow: 'Rendez-vous annulé', title: `Bonjour ${a.nom}`, intro: `Votre rendez-vous est annulé. Pour en fixer un nouveau, appelez-nous au ${mailer.PHONE} ou réservez un autre créneau sur notre site.` },
  }[st];
  if (M) mailer.send({ to: a.email, replyTo: s.notifyEmail, subject: M.subject + ' – P.A Couverture',
    mail: { ...M, rows: [['Date', when], ['Type', a.kind], ['Adresse', a.adresse]], button: st === 'confirme' ? null : { label: 'Choisir un autre créneau', url: siteBase(req, s) + '/rendez-vous.html' } } });
  res.json({ ok: true });
});
router.delete('/rdv/:id', (req, res) => {
  writeJSON('appointments.json', readJSON('appointments.json', []).filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---------- répondre au client par e-mail (demande de devis, message, rendez-vous)
async function reply(req, res, file, label) {
  if (!mailer.configured()) return res.status(503).json({ error: 'L\'envoi d\'e-mails n\'est pas encore configuré sur le serveur (voir l\'onglet Réglages).' });
  const list = readJSON(file, []);
  const it = list.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ error: 'Introuvable' });
  const text = clip(req.body.message, 5000), subject = clip(req.body.subject, 150) || `Réponse à votre ${label} – P.A Couverture`;
  if (text.length < 2) return res.status(400).json({ error: 'Écrivez votre réponse.' });
  const s = settings.get();
  const recap = file === 'appointments.json' ? [['Rendez-vous', `${frDate(it.date)} à ${it.time}`], ['Type', it.kind]] : [['Travaux', it.travaux], ['Commune', it.commune]];
  const r = await mailer.send({ to: it.email, replyTo: s.notifyEmail, subject,
    mail: { eyebrow: `Réponse à votre ${label}`, title: subject.replace(/ – P\.A Couverture$/, ''), intro: '', body: text, rows: recap,
      quote: { label: file === 'appointments.json' ? 'Vos précisions' : 'Votre message', text: it.message || it.note || '' },
      note: 'Pour nous répondre, répondez simplement à cet e-mail.' } });
  if (!r.sent) return res.status(502).json({ error: 'L\'e-mail n\'a pas pu partir : ' + (r.error || 'service indisponible') });
  it.replies = (it.replies || []).concat({ at: new Date().toISOString(), subject, text });
  if (file === 'requests.json' && it.status === 'nouveau') it.status = 'traite';
  writeJSON(file, list);
  res.json({ ok: true, replies: it.replies, status: it.status });
}
router.post('/requests/:id/reply', (req, res) => reply(req, res, 'requests.json', 'demande').catch(e => res.status(500).json({ error: e.message })));
router.post('/rdv/:id/reply', (req, res) => reply(req, res, 'appointments.json', 'demande de rendez-vous').catch(e => res.status(500).json({ error: e.message })));

// ---------- e-mail d'essai (Réglages)
router.post('/test-mail', async (req, res) => {
  if (!mailer.configured()) return res.status(503).json({ error: 'Envoi d\'e-mails non configuré.' });
  const s = settings.get();
  const r = await mailer.send({ to: s.notifyEmail, subject: 'E-mail d\'essai – P.A Couverture', mail: { eyebrow: 'Essai', title: 'Tout fonctionne !', intro: 'Les e-mails du site sont bien configurés : vous recevrez les demandes de devis et de rendez-vous, et vos clients recevront vos réponses avec cette mise en page.', button: { label: 'Ouvrir le tableau de bord', url: siteBase(req, s) + '/admin/tableau-de-bord' } } });
  if (!r.sent) return res.status(502).json({ error: 'Échec : ' + (r.error || 'service indisponible') });
  res.json({ ok: true, to: s.notifyEmail });
});

// ---------- réglages (annonce, horaires, avis Google, adresse du site)
router.get('/settings', (req, res) => res.json(settings.get()));
router.put('/settings', (req, res) => res.json(settings.save(req.body || {})));

// ---------- avis
router.get('/reviews', (req, res) => res.json(readJSON('reviews.json', [])));
router.post('/reviews', (req, res) => {
  const b = req.body || {};
  const rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 5));
  const r = { id: newId(), author: clip(b.author, 60), rating, text: clip(b.text, 800), date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : '' };
  if (!r.author || !r.text) return res.status(400).json({ error: 'Nom et texte obligatoires.' });
  const list = readJSON('reviews.json', []); list.unshift(r); writeJSON('reviews.json', list);
  res.json({ ok: true });
});
router.delete('/reviews/:id', (req, res) => {
  writeJSON('reviews.json', readJSON('reviews.json', []).filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---------- attestation décennale (PDF)
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.post('/document', up.single('file'), (req, res) => {
  const f = req.file;
  if (!f || f.buffer.slice(0, 5).toString() !== '%PDF-') return res.status(400).json({ error: 'Envoyez un fichier PDF (10 Mo maximum).' });
  fs.writeFileSync(DOC, f.buffer);
  res.json({ ok: true });
});
router.delete('/document', (req, res) => { fs.rmSync(DOC, { force: true }); res.json({ ok: true }); });

// ---------- statistiques
router.get('/stats', (req, res) => res.json(stats.summary(req.query.days)));

// ---------- QR code
const TARGETS = { accueil: '/', devis: '/devis.html', rdv: '/rendez-vous.html' };
function qrTarget(req) {
  const s = settings.get();
  const base = s.siteUrl || `${req.protocol}://${req.get('host')}`;
  if (req.query.target === 'avis') return s.reviews.googleUrl || '';
  const p = TARGETS[req.query.target] || '/';
  return base + p + '?src=qr';
}
router.get('/qr', async (req, res) => {
  const url = qrTarget(req);
  if (!url) return res.status(400).json({ error: 'Renseignez d\'abord le lien de vos avis Google.' });
  const opt = { margin: 2, errorCorrectionLevel: 'M', color: { dark: '#10151d', light: '#ffffff' } };
  if (req.query.format === 'png') {
    const buf = await QRCode.toBuffer(url, { ...opt, width: 1200 });
    res.type('png');
    if (req.query.download) res.setHeader('Content-Disposition', 'attachment; filename="qr-pa-couverture.png"');
    return res.send(buf);
  }
  const svg = await QRCode.toString(url, { ...opt, type: 'svg' });
  res.type('image/svg+xml');
  if (req.query.download) res.setHeader('Content-Disposition', 'attachment; filename="qr-pa-couverture.svg"');
  res.send(svg);
});
module.exports = { router, qrTarget };
