'use strict';
/* Justificatifs d'achat (tickets de caisse, factures fournisseurs, carburant…) : fichiers rangés par utilisateur
   dans DATA_DIR/receipts/<id utilisateur>/, et lecture automatique (Gemini, sinon texte du PDF / Tesseract). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const vision = require('./vision');
const importer = require('./importer');

const CATS = ['Achats de matériaux et fournitures', 'Achats de marchandises (revente)', 'Sous-traitance', 'Carburant et déplacements', 'Véhicule (entretien, assurance, leasing)', 'Outillage et matériel', 'Loyer et locaux',
  'Assurances (décennale, RC pro)', 'Téléphone et internet', 'Logiciels et abonnements', 'Banque et frais bancaires', 'Comptable et juridique', 'Publicité et marketing',
  'Cotisations sociales (URSSAF)', 'Impôts et taxes (CFE…)', 'Salaires et charges', 'Repas et réceptions', 'Formation', 'Autres'];
const PAY = ['Carte bancaire', 'Virement', 'Prélèvement', 'Chèque', 'Espèces'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_FILES = 5000, MAX_BYTES = 1.5e9;

const dir = uid => path.join(store.DIR, 'receipts', String(uid).replace(/[^\w-]/g, ''));
const validId = id => /^[a-f0-9]{32}$/.test(String(id || ''));
function sniff(buf) {
  const h = buf.slice(0, 12);
  if (h[0] === 0xff && h[1] === 0xd8) return 'image/jpeg';
  if (h.slice(0, 4).toString('latin1') === '\x89PNG') return 'image/png';
  if (h.slice(0, 4).toString('latin1') === 'RIFF' && h.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (h.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return '';
}
function usage(uid) {
  let n = 0, bytes = 0;
  try { for (const f of fs.readdirSync(dir(uid))) { n++; bytes += fs.statSync(path.join(dir(uid), f)).size; } } catch (e) { /* aucun dossier */ }
  return { n, bytes };
}
function find(uid, id) {
  if (!validId(id)) return null;
  for (const [mime, ext] of Object.entries(EXT)) { const f = path.join(dir(uid), id + '.' + ext); if (fs.existsSync(f)) return { file: f, mime, ext }; }
  return null;
}
function save(uid, buf) {
  const mime = sniff(buf); if (!mime) return { error: 'Format non pris en charge (photo JPEG, PNG, WebP ou PDF).' };
  const u = usage(uid); if (u.n >= MAX_FILES || u.bytes + buf.length > MAX_BYTES) return { error: 'Espace de stockage des justificatifs plein : supprimez d\'anciens justificatifs.' };
  const id = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(dir(uid), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir(uid), id + '.' + EXT[mime]), buf, { mode: 0o600 });
  return { id, mime };
}
const remove = (uid, id) => { const f = find(uid, id); if (f) fs.unlinkSync(f.file); return !!f; };
const removeAll = uid => { try { fs.rmSync(dir(uid), { recursive: true, force: true }); } catch (e) { /* ignore */ } };

/* ---------- Lecture ---------- */
const SYSTEM = `Tu lis un justificatif d'achat d'un artisan ou d'une petite entreprise française : ticket de caisse, facture fournisseur, ticket de carburant, note de restaurant, péage, abonnement…
Extrais les informations utiles à sa comptabilité. Montants en euros, nombres décimaux avec un point. Si une information est absente, laisse "" ou 0, n'invente rien.
- supplier : nom du magasin ou de l'entreprise qui a vendu (ex. "Leroy Merlin", "TotalEnergies", "Point.P").
- label : description courte de l'achat en français (ex. "Plein de gazole 52 L", "Plaques BA13 et rails", "Repas chantier").
- category : choisis exactement une valeur de cette liste : ${CATS.map(c => JSON.stringify(c)).join(', ')}.
  Carburant, péage, parking, train → "Carburant et déplacements". Matériaux, quincaillerie, fournitures de chantier → "Achats de matériaux et fournitures". Outils, machines → "Outillage et matériel". Restaurant, boulangerie → "Repas et réceptions".
- total_ttc : montant total payé TTC. total_ht et vat_amount : si indiqués. vat_rate : taux principal de TVA en % (20, 10, 5.5 ou 0).
- payment : un de ${PAY.map(c => JSON.stringify(c)).join(', ')}, ou "" si inconnu.
- number : numéro de facture ou de ticket. date : date d'achat au format AAAA-MM-JJ.
Réponds uniquement par un objet JSON de cette forme exacte (aucun autre texte) :
{"supplier":"","label":"","category":"","date":"","number":"","total_ttc":0,"total_ht":0,"vat_amount":0,"vat_rate":0,"payment":""}`;

const numFr = x => { const v = parseFloat(String(x).replace(/[\s ]/g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const KEYS = [
  [/(carburant|gazole|gasoil|diesel|sp ?95|sp ?98|e10|e85|essence|station|total ?energies|esso|shell|\bbp\b|avia|intermarch[ée] carbu|p[ée]age|autoroute|vinci|sanef|aprr|parking|sncf)/i, 'Carburant et déplacements'],
  [/(restaurant|brasserie|boulangerie|pizz|kebab|burger|mcdo|caf[ée]\b|traiteur|snack)/i, 'Repas et réceptions'],
  [/(perceuse|visseuse|meuleuse|scie|makita|bosch pro|dewalt|milwaukee|hilti|festool|outillage|outil)/i, 'Outillage et matériel'],
  [/(leroy|castorama|brico|point\.?\s?p|cedeo|gedimat|big mat|bigmat|weldom|mr\.? ?bricolage|tout faire|chausson|placo|ba13|ciment|parpaing|plâtre|platre|enduit|vis\b|cheville|rail|tasseau|carrelage|peinture|mat[ée]riaux|quincaillerie|rexel|sonepar|yesss|richardson|brossette|frans bonhomme)/i, 'Achats de matériaux et fournitures'],
  [/(orange|sfr|bouygues|free mobile|free\b|sosh|red by)/i, 'Téléphone et internet'],
  [/(assurance|axa|maaf|macif|allianz|smabtp|groupama|mma)/i, 'Assurances (décennale, RC pro)'],
  [/(garage|pneu|norauto|feu vert|midas|speedy|vidange|contr[ôo]le technique)/i, 'Véhicule (entretien, assurance, leasing)']
];
const guessCat = t => { for (const [re, c] of KEYS) if (re.test(t)) return c; return ''; };

/* lecture sans IA : texte du PDF ou reconnaissance des caractères (Tesseract) */
function parseText(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const amounts = l => [...l.matchAll(/(\d{1,3}(?:[  ]\d{3})*[,.]\d{2})(?!\d)/g)].map(m => numFr(m[1]));
  let ttc = 0, ht = 0, vatAmount = 0;
  for (const l of lines) {
    const a = amounts(l); if (!a.length) continue;
    const v = a[a.length - 1];
    if (/(total|net)\s*h\.?t|montant\s*h\.?t|base\s*h\.?t/i.test(l)) ht = ht || v;
    else if (/^(total\s*)?t\.?v\.?a|montant\s*tva/i.test(l)) vatAmount = vatAmount || v;
    else if (/(total\s*t\.?t\.?c|net\s*[àa]\s*payer|montant\s*t\.?t\.?c|[àa]\s*payer|total\b|montant\s*(cb|carte|pay[ée])|carte\s*bancaire|esp[èe]ces)/i.test(l)) ttc = Math.max(ttc, v);
  }
  if (!ttc) { const all = lines.flatMap(amounts).filter(v => v < 100000); ttc = all.length ? Math.max(...all) : 0; }
  const rm = /(?:tva|t\.v\.a\.?)[^\d]{0,12}(20|10|5[,.]5|2[,.]1)\s*%/i.exec(text) || /\b(20|10|5[,.]5)\s*%/.exec(text);
  const supplier = (lines.find(l => /[a-zà-ÿ]{3}/i.test(l) && !/(ticket|facture|bienvenue|merci|date|tel|t[ée]l[ée]phone|siret|tva)/i.test(l)) || '').slice(0, 80);
  const pay = /(\bcb\b|carte|visa|mastercard|sans contact)/i.test(text) ? 'Carte bancaire' : /esp[èe]ces/i.test(text) ? 'Espèces' : /ch[èe]que/i.test(text) ? 'Chèque' : /virement/i.test(text) ? 'Virement' : '';
  const nm = /(?:facture|ticket|n[°o]\s*de\s*ticket)\s*(?:n[°o]|num[ée]ro)?\s*:?\s*([A-Z0-9][\w\-\/]{2,})/i.exec(text);
  return { supplier, label: '', category: guessCat(text), date: importer.findDate(text) || '', number: nm ? nm[1] : '', total_ttc: ttc, total_ht: ht, vat_amount: vatAmount, vat_rate: rm ? numFr(rm[1]) : 0, payment: pay };
}

function clean(r, text) {
  r = r && typeof r === 'object' ? r : {};
  const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const out = { supplier: s(r.supplier, 80), label: s(r.label, 140), category: CATS.includes(r.category) ? r.category : '', date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '',
    number: s(r.number, 40), ttc: Math.max(0, numFr(r.total_ttc)), ht: Math.max(0, numFr(r.total_ht)), vatAmount: Math.max(0, numFr(r.vat_amount)), vatRate: numFr(r.vat_rate), pay: PAY.includes(r.payment) ? r.payment : '' };
  if (![0, 2.1, 5.5, 10, 20].includes(out.vatRate)) out.vatRate = 0;
  if (!out.category) out.category = guessCat([out.supplier, out.label, text || ''].join(' '));
  if (out.ttc && !out.ht && out.vatAmount && out.vatAmount < out.ttc) out.ht = Math.round((out.ttc - out.vatAmount) * 100) / 100;
  if (out.ttc && out.ht && !out.vatRate) { const rr = (out.ttc / out.ht - 1) * 100; out.vatRate = [20, 10, 5.5, 2.1, 0].reduce((a, b) => Math.abs(b - rr) < Math.abs(a - rr) ? b : a); }
  if (out.date && (out.date > new Date(Date.now() + 864e5).toISOString().slice(0, 10) || out.date < '2000-01-01')) out.date = '';
  return out;
}

async function read(buf, mime) {
  if (vision.geminiOk()) return { source: 'ia', data: clean(await vision.gemini([{ buf, mime }], SYSTEM)) };
  let text = '';
  if (mime === 'application/pdf') { try { text = await importer.pdfText(buf); } catch (e) { text = ''; } }
  else if (vision.tessOk()) text = await vision.ocr(buf, mime);
  if (text.replace(/\s/g, '').length < 15) {
    const e = new Error(mime === 'application/pdf' ? 'Ce PDF ne contient pas de texte lisible : complétez les montants à la main.' : 'Lecture automatique indisponible pour cette photo : complétez les montants à la main.'); e.status = 422; e.expose = true; throw e;
  }
  return { source: 'texte', data: clean(parseText(text), text) };
}

module.exports = { save, find, remove, removeAll, read, sniff, parseText, clean, CATS };
