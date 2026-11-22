const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PRIVATE, DOCS, readJSON, writeJSON } = require('./store');
const settings = require('./settings');
const mailer = require('./mailer');
const stats = require('./stats');
const { availability, addDays } = require('./booking');

const router = express.Router();
const WORK = ['Couverture', 'Zinguerie', 'Pignon', 'Velux', 'Entretien de toiture', "Travaux d'intérieur", 'Petite maçonnerie', 'Réparation de fuite', 'Autre'];
const KINDS = ['Visite sur place pour devis', 'Contrôle / diagnostic de toiture', 'Échange téléphonique'];

const hits = new Map();
const limiter = (name, max, ms) => (req, res, next) => {
  const k = name + req.ip, now = Date.now();
  const rec = (hits.get(k) || []).filter(t => now - t < ms);
  if (rec.length >= max) return res.status(429).json({ error: 'Trop de demandes. Réessayez un peu plus tard ou appelez-nous.' });
  rec.push(now); hits.set(k, rec); next();
};
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const okEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e);
const okPhone = p => { const d = p.replace(/[^\d]/g, ''); return d.length >= 8 && d.length <= 15 && /^[\d\s+().-]+$/.test(p); };
const yes = v => ['1', 'on', 'true', 'yes'].includes(String(v));
const newId = () => crypto.randomBytes(6).toString('hex');
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* adresse du site pour les liens des e-mails (réglage « Adresse officielle », sinon l'adresse utilisée) */
const siteBase = (req, s) => (s.siteUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
const frDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 6, fields: 30 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
const photos = (req, res, next) => upload.array('photos', 6)(req, res, err => err ? res.status(400).json({ error: 'Photos refusées : 6 maximum, 15 Mo chacune.' }) : next());

// ---------- demande de devis (avec photos) ou message de contact
router.post('/devis', limiter('devis', 6, 3600e3), photos, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // champ piège pour les robots
  const contact = b.source === 'contact';
  const r = {
    id: newId(), created: new Date().toISOString(), status: 'nouveau', source: contact ? 'contact' : 'devis',
    nom: clean(b.nom, 80), tel: clean(b.tel, 30), email: clean(b.email, 120),
    travaux: WORK.includes(b.travaux) ? b.travaux : (b.travaux ? clean(b.travaux, 40) : 'Autre'),
    commune: clean(b.commune, 80), batiment: clean(b.batiment, 40), surface: clean(b.surface, 20), delai: clean(b.delai, 40),
    message: clean(b.message, 2000), photos: [], note: '',
  };
  if (r.nom.length < 2) return res.status(400).json({ error: 'Indiquez votre nom.' });
  if (!okPhone(r.tel)) return res.status(400).json({ error: 'Indiquez un numéro de téléphone valide.' });
  if (!okEmail(r.email)) return res.status(400).json({ error: 'Indiquez une adresse e-mail valide.' });
  if (!contact && r.commune.length < 2) return res.status(400).json({ error: 'Indiquez votre commune.' });
  if (!yes(b.consent)) return res.status(400).json({ error: 'Merci de cocher la case d\'acceptation.' });

  const attachments = [];
  let i = 0;
  for (const f of req.files || []) {
    try {
      const buf = await sharp(f.buffer, { failOn: 'error' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      const name = `${r.id}-${i++}.webp`;
      fs.writeFileSync(path.join(PRIVATE, name), buf);
      r.photos.push(name);
      attachments.push({ filename: `photo-${i}.webp`, content: buf });
    } catch { /* image illisible : ignorée */ }
  }
  const list = readJSON('requests.json', []);
  list.unshift(r);
  writeJSON('requests.json', list);
  stats.event('form');

  const s = settings.get(), base = siteBase(req, s), kind = contact ? 'message de contact' : 'demande de devis';
  mailer.send({
    to: s.notifyEmail, replyTo: r.email, attachments,
    subject: `Nouvelle ${kind} : ${r.nom}${r.commune ? ' (' + r.commune + ')' : ''}`,
    mail: {
      eyebrow: contact ? 'Message de contact' : 'Demande de devis', title: `Nouvelle ${kind} de ${r.nom}`,
      intro: `Une nouvelle ${kind} vient d'arriver sur le site.${r.photos.length ? ` ${r.photos.length} photo${r.photos.length > 1 ? 's' : ''} en pièce jointe.` : ''} Répondez directement à cet e-mail pour écrire au client, ou depuis le tableau de bord.`,
      rows: [['Nom', r.nom], ['Téléphone', `<a href="tel:${r.tel.replace(/[^\d+]/g, '')}" style="color:#386db9;text-decoration:none">${esc(r.tel)}</a>`], ['E-mail', `<a href="mailto:${esc(r.email)}" style="color:#386db9;text-decoration:none">${esc(r.email)}</a>`],
        ['Travaux', r.travaux], ['Commune', r.commune], ['Bâtiment', r.batiment], ['Surface', r.surface], ['Délai souhaité', r.delai]],
      quote: { label: 'Message du client', text: r.message },
      button: { label: 'Ouvrir le tableau de bord', url: base + '/admin/tableau-de-bord' },
    },
  });
  mailer.send({
    to: r.email, replyTo: s.notifyEmail, subject: 'Votre demande a bien été reçue – P.A Couverture',
    mail: {
      eyebrow: 'Demande reçue', title: `Merci ${r.nom}, votre demande est bien arrivée`,
      intro: contact ? 'Nous avons bien reçu votre message et nous vous répondons au plus vite.'
        : "Nous avons bien reçu votre demande de devis. Pour vous proposer un prix juste, nous préférons venir voir votre toiture sur place : nous vous contactons rapidement pour convenir d'une visite.",
      rows: contact ? [] : [['Travaux', r.travaux], ['Commune', r.commune], ['Photos envoyées', r.photos.length ? String(r.photos.length) : '']],
      quote: { label: 'Votre message', text: r.message },
      note: `Pour être sûr de recevoir nos réponses, ajoutez ${mailer.sender() || 'notre adresse'} à vos contacts. Une question en attendant ? Appelez-nous au ${mailer.PHONE} ou répondez simplement à cet e-mail.`,
    },
  });
  res.json({ ok: true });
});

// ---------- rendez-vous
router.get('/slots', (req, res) => {
  const s = settings.get();
  res.json({ enabled: s.booking.enabled, confirmDaysBefore: s.booking.confirmDaysBefore, kinds: KINDS, days: availability(s, readJSON('appointments.json', [])) });
});
router.post('/rdv', limiter('rdv', 6, 3600e3), async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true });
  const s = settings.get();
  const a = {
    id: newId(), created: new Date().toISOString(), status: 'en_attente',
    kind: KINDS.includes(b.kind) ? b.kind : KINDS[0], date: clean(b.date, 10), time: clean(b.time, 5),
    duration: s.booking.slotMinutes, nom: clean(b.nom, 80), tel: clean(b.tel, 30), email: clean(b.email, 120),
    adresse: clean(b.adresse, 160), note: clean(b.note, 1000),
  };
  a.confirmBy = addDays(a.date || '2000-01-01', -s.booking.confirmDaysBefore);
  if (a.nom.length < 2) return res.status(400).json({ error: 'Indiquez votre nom.' });
  if (!okPhone(a.tel)) return res.status(400).json({ error: 'Indiquez un numéro de téléphone valide.' });
  if (!okEmail(a.email)) return res.status(400).json({ error: 'Indiquez une adresse e-mail valide.' });
  if (!yes(b.consent)) return res.status(400).json({ error: 'Merci de cocher la case d\'acceptation.' });
  const list = readJSON('appointments.json', []);
  const day = availability(s, list).find(d => d.date === a.date);
  if (!day || !day.times.includes(a.time)) return res.status(409).json({ error: 'Ce créneau n\'est plus disponible. Choisissez-en un autre.' });
  list.unshift(a);
  writeJSON('appointments.json', list);
  stats.event('form');
  const base = siteBase(req, s);
  mailer.send({
    to: s.notifyEmail, replyTo: a.email, subject: `Demande de rendez-vous : ${a.nom}, ${frDate(a.date)} à ${a.time}`,
    mail: {
      eyebrow: 'Rendez-vous à confirmer', title: `Demande de rendez-vous de ${a.nom}`,
      intro: `À confirmer au plus tard le ${frDate(a.confirmBy)}. Le client est prévenu par e-mail dès que vous confirmez ou refusez depuis le tableau de bord.`,
      rows: [['Date', `${frDate(a.date)} à ${a.time}`], ['Type', a.kind], ['Nom', a.nom], ['Téléphone', `<a href="tel:${a.tel.replace(/[^\d+]/g, '')}" style="color:#386db9;text-decoration:none">${esc(a.tel)}</a>`], ['E-mail', a.email], ['Adresse', a.adresse]],
      quote: { label: 'Précisions du client', text: a.note },
      button: { label: 'Confirmer dans le tableau de bord', url: base + '/admin/tableau-de-bord#rdv' },
    },
  });
  mailer.send({
    to: a.email, replyTo: s.notifyEmail, subject: 'Demande de rendez-vous reçue – P.A Couverture',
    mail: {
      eyebrow: 'Rendez-vous demandé', title: `Merci ${a.nom}, votre demande de rendez-vous est enregistrée`,
      intro: `Nous vous confirmerons ce rendez-vous par e-mail au plus tard ${s.booking.confirmDaysBefore} jours avant la date prévue.`,
      rows: [['Date souhaitée', `${frDate(a.date)} à ${a.time}`], ['Type', a.kind], ['Adresse', a.adresse]],
      note: `Pour être sûr de recevoir la confirmation, ajoutez ${mailer.sender() || 'notre adresse'} à vos contacts. Un empêchement ou une question ? Appelez-nous au ${mailer.PHONE} ou répondez à cet e-mail.`,
    },
  });
  res.json({ ok: true, confirmDaysBefore: s.booking.confirmDaysBefore });
});

// ---------- statistiques : clics sur « Appeler » / e-mail
router.post('/hit', limiter('hit', 60, 60e3), (req, res) => {
  const t = req.body && req.body.type;
  if (t === 'call' || t === 'mail') stats.event(t);
  res.status(204).end();
});

// ---------- document public (attestation décennale)
const DOC = path.join(DOCS, 'attestation-decennale.pdf');
router.get('/attestation', (req, res) => res.json({ available: fs.existsSync(DOC) }));
function docRoute(req, res) {
  if (!fs.existsSync(DOC)) return res.status(404).type('text').send('Document indisponible');
  res.setHeader('Content-Disposition', 'inline; filename="attestation-garantie-decennale.pdf"');
  res.sendFile(DOC);
}
module.exports = { router, docRoute, DOC, KINDS, frDate, siteBase };
