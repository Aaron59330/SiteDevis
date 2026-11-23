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
router.patch('/requests/:id', async (req, res) => {
  const list = readJSON('requests.json', []);
  const r = list.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Introuvable' });
  const before = r.status;
  if (['nouveau', 'traite', 'archive'].includes(req.body.status)) r.status = req.body.status;
  if ('note' in req.body) r.note = clip(req.body.note, 1000);
  writeJSON('requests.json', list);
  // le client est prévenu de l'avancement de sa demande
  let mailed = false;
  if (r.status !== before && r.email && mailer.configured()) {
    const s = settings.get(), what = r.source === 'contact' ? 'message' : 'demande de devis';
    const M = {
      traite: { eyebrow: 'Demande traitée', title: `Votre ${what} a été traitée`, intro: r.source === 'contact' ? 'Nous avons bien pris en compte votre message.' : "Nous avons étudié votre demande. Si nous ne vous avons pas encore contacté pour convenir d'une visite ou vous transmettre votre devis, nous le faisons très rapidement.", status: 'Traitée' },
      archive: { eyebrow: 'Demande clôturée', title: `Votre ${what} est clôturée`, intro: "Votre demande est maintenant clôturée. Merci de votre confiance ! Pour un nouveau projet ou une question, n'hésitez pas à nous recontacter.", status: 'Clôturée' },
      nouveau: { eyebrow: 'Demande en cours', title: `Votre ${what} est de nouveau en cours`, intro: 'Nous avons rouvert votre demande et nous la traitons à nouveau. Nous revenons vers vous rapidement.', status: 'En cours de traitement' },
    }[r.status];
    const sent = await mailer.send({ to: r.email, replyTo: s.notifyEmail, subject: `${M.title} – PA Rénovation`,
      mail: { eyebrow: M.eyebrow, title: M.title, intro: `Bonjour ${r.nom},\n\n${M.intro}`, rows: [['Statut', M.status], ['Travaux', r.travaux], ['Commune', r.commune], ['Demande du', new Date(r.created).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })]],
        button: r.status === 'archive' ? { label: 'Faire une nouvelle demande', url: siteBase(req, s) + '/devis.html' } : null,
        note: `Une question ? Appelez-nous au ${mailer.PHONE} ou répondez simplement à cet e-mail.` } });
    mailed = sent.sent;
  }
  res.json({ ok: true, mailed });
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
router.post('/rdv/:id/status', async (req, res) => {
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
    confirme: { subject: 'Rendez-vous confirmé', eyebrow: 'Rendez-vous confirmé', title: `C'est confirmé, ${a.nom} !`, intro: `Nous avons le plaisir de vous confirmer votre rendez-vous. Vous recevrez un rappel la veille.`, note: `Le fichier joint ajoute le rendez-vous à votre agenda. En cas d'empêchement, merci de nous prévenir au ${mailer.PHONE} ou en répondant à cet e-mail.` },
    refuse: { subject: 'Votre demande de rendez-vous', eyebrow: 'Créneau indisponible', title: `Bonjour ${a.nom}`, intro: `Nous ne pouvons malheureusement pas honorer ce créneau. Choisissez-en un autre sur notre site, ou appelez-nous au ${mailer.PHONE} : nous trouverons un moment qui vous convient.` },
    en_attente: { subject: 'Votre rendez-vous', eyebrow: 'Rendez-vous en attente', title: `Bonjour ${a.nom}`, intro: 'Votre demande de rendez-vous est de nouveau en attente de confirmation. Nous revenons vers vous rapidement.' },
    annule: { subject: 'Rendez-vous annulé', eyebrow: 'Rendez-vous annulé', title: `Bonjour ${a.nom}`, intro: `Votre rendez-vous est annulé. Pour en fixer un nouveau, appelez-nous au ${mailer.PHONE} ou réservez un autre créneau sur notre site.` },
  }[st];
  let mailed = false;
  if (st === 'confirme') delete a.reminderSent, writeJSON('appointments.json', list);
  if (M && a.email) mailed = (await mailer.send({ to: a.email, replyTo: s.notifyEmail, subject: M.subject + ' – PA Rénovation', attachments: st === 'confirme' ? [require('./reminders').icsAttachment(a)] : [],
    mail: { ...M, rows: [['Statut', { confirme: 'Confirmé', refuse: 'Créneau indisponible', annule: 'Annulé', en_attente: 'En attente de confirmation' }[st]], ['Date', when], ['Type', a.kind], ['Adresse', a.adresse]], button: ['confirme', 'en_attente'].includes(st) ? null : { label: 'Choisir un autre créneau', url: siteBase(req, s) + '/rendez-vous.html' } } })).sent;
  return res.json({ ok: true, mailed });
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
  const text = clip(req.body.message, 5000), subject = clip(req.body.subject, 150) || `Réponse à votre ${label} – PA Rénovation`;
  if (text.length < 2) return res.status(400).json({ error: 'Écrivez votre réponse.' });
  const s = settings.get();
  const recap = file === 'appointments.json' ? [['Rendez-vous', `${frDate(it.date)} à ${it.time}`], ['Type', it.kind]] : [['Travaux', it.travaux], ['Commune', it.commune]];
  const r = await mailer.send({ to: it.email, replyTo: s.notifyEmail, subject,
    mail: { eyebrow: `Réponse à votre ${label}`, title: subject.replace(/ – PA Rénovation$/, ''), intro: '', body: text, rows: recap,
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
  const r = await mailer.send({ to: s.notifyEmail, subject: 'E-mail d\'essai – PA Rénovation', mail: { eyebrow: 'Essai', title: 'Tout fonctionne !', intro: 'Les e-mails du site sont bien configurés : vous recevrez les demandes de devis et de rendez-vous, et vos clients recevront vos réponses avec cette mise en page.', button: { label: 'Ouvrir le tableau de bord', url: siteBase(req, s) + '/admin/tableau-de-bord' } } });
  if (!r.sent) return res.status(502).json({ error: 'Échec : ' + (r.error || 'service indisponible') });
  res.json({ ok: true, to: s.notifyEmail });
});

// ---------- agenda personnel (rendez-vous posés par l'artisan)
const events = require('./events');
router.get('/events', (req, res) => res.json({ events: events.list(), appointments: readJSON('appointments.json', []).filter(a => a.status !== 'refuse' && a.status !== 'annule'), before: events.BEFORE }));
router.post('/events', (req, res) => {
  try { const e = events.clean(req.body || {}); const l = events.list(); l.push(e); events.save(l); res.json({ ok: true, event: e }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.put('/events/:id', (req, res) => {
  const l = events.list(), i = l.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Introuvable' });
  try { l[i] = events.clean(req.body || {}, l[i]); events.save(l); res.json({ ok: true, event: l[i] }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete('/events/:id', (req, res) => { events.save(events.list().filter(x => x.id !== req.params.id)); res.json({ ok: true }); });

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
    if (req.query.download) res.setHeader('Content-Disposition', 'attachment; filename="qr-pa-renovation.png"');
    return res.send(buf);
  }
  const svg = await QRCode.toString(url, { ...opt, type: 'svg' });
  res.type('image/svg+xml');
  if (req.query.download) res.setHeader('Content-Disposition', 'attachment; filename="qr-pa-renovation.svg"');
  res.send(svg);
});
module.exports = { router, qrTarget };
