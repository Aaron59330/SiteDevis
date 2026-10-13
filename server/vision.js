'use strict';
/* Lecture gratuite d'un devis photographié.
   1) Google Gemini (clé gratuite GEMINI_API_KEY, aucun paiement) : comprend aussi l'écriture manuscrite ;
   2) à défaut, Tesseract installé sur le serveur : lit le texte imprimé (pas l'écriture à la main). */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ai = require('./ai');
const importer = require('./importer');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/';
let autoModel = '';
/* Modèle choisi : GEMINI_MODEL si défini, sinon le plus récent modèle « flash » que la clé peut utiliser (les noms changent avec le temps) */
async function pickModel(force) {
  if (process.env.GEMINI_MODEL && !force) return process.env.GEMINI_MODEL;
  if (autoModel && !force) return autoModel;
  const r = await fetch(GEMINI_BASE + 'models?pageSize=200', { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) { const er = new Error(r.status === 400 || r.status === 403 ? 'Clé Gemini refusée ou invalide (erreur ' + r.status + '). Vérifiez GEMINI_API_KEY.' : 'Impossible de lister les modèles Gemini (erreur ' + r.status + ').'); er.status = 502; er.expose = true; throw er; }
  const list = ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name || '').replace(/^models\//, '')).filter(n => /flash/.test(n) && !/(lite|tts|image|live|audio|embed|exp|8b|thinking)/.test(n));
  const ver = n => { const m = /gemini-(\d+(?:\.\d+)?)/.exec(n); return m ? parseFloat(m[1]) : 0; };
  list.sort((a, b) => ver(b) - ver(a) || (/preview/.test(a) ? 1 : 0) - (/preview/.test(b) ? 1 : 0) || a.length - b.length);
  if (!list.length) { const er = new Error('Aucun modèle Gemini utilisable avec cette clé. Vérifiez qu\'elle vient de aistudio.google.com/apikey.'); er.status = 502; er.expose = true; throw er; }
  autoModel = list[0]; return autoModel;
}
/* Modèles de secours (quand le premier est surchargé) : les autres « flash », puis les « flash-lite » */
let backupModels = null;
async function modelsInOrder() {
  const first = await pickModel(false);
  if (!backupModels) {
    try {
      const r = await fetch(GEMINI_BASE + 'models?pageSize=200', { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(20000) });
      const ver = n => { const m = /gemini-(\d+(?:\.\d+)?)/.exec(n); return m ? parseFloat(m[1]) : 0; };
      backupModels = r.ok ? ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => String(m.name || '').replace(/^models\//, '')).filter(n => /flash/.test(n) && !/(tts|image|live|audio|embed|exp|8b|thinking)/.test(n) && ver(n) >= 2)
        .sort((a, b) => (/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0) || ver(b) - ver(a) || (/preview/.test(a) ? 1 : 0) - (/preview/.test(b) ? 1 : 0)) : [];
    } catch (e) { backupModels = []; }
  }
  return [first, ...backupModels.filter(m => m !== first)].slice(0, 4);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const geminiOk = () => !!process.env.GEMINI_API_KEY;
let tessOk = false;
try { const p = spawn('tesseract', ['--version'], { stdio: 'ignore' }); p.on('error', () => { tessOk = false; }); p.on('close', c => { tessOk = c === 0; }); } catch (e) { tessOk = false; }
const available = () => geminiOk() || tessOk;
const kind = () => (geminiOk() ? 'gemini' : tessOk ? 'tesseract' : '');

const SHAPE = `Réponds uniquement par un objet JSON de cette forme exacte (aucun autre texte) :
{"kind":"devis"|"facture","number":"","date":"AAAA-MM-JJ","valid_until":"","due_date":"","title":"",
 "client":{"type":"particulier"|"pro","name":"","address":"","siret":"","vat_number":"","email":"","phone":"","contact":""},
 "lines":[{"type":"item"|"title"|"subtotal","ref":"","desc":"","qty":0,"unit":"","unit_price":0,"vat_percent":0}],
 "discount_percent":0,"payments":[{"percent":0,"label":""}],"notes":"","total_ht":0,"total_ttc":0}`;

async function gemini(imgs) {
  const parts = [...imgs.map(i => ({ inline_data: { mime_type: i.mime, data: i.buf.toString('base64') } })),
    { text: imgs.length > 1 ? 'Ces images sont les pages successives du document. Extrais son contenu.' : 'Extrais le contenu de ce document.' }];
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: ai.IMPORT_SYSTEM + ai.PHOTO_EXTRA + '\n\n' + SHAPE }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  const call = async model => {
    try {
      return await fetch(GEMINI_BASE + 'models/' + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body, signal: AbortSignal.timeout(90000) });
    } catch (e) { const er = new Error('Service de lecture injoignable.'); er.status = 502; er.expose = true; throw er; }
  };
  /* 503 / 500 / 504 (surcharge passagère de Google) ou 429 (limite par minute) : on réessaie, puis on passe à un autre modèle */
  const busy = st => st === 503 || st === 500 || st === 504 || st === 429;
  let model = await pickModel(false), r = await call(model);
  if (r.status === 404) { model = await pickModel(true); r = await call(model); }       // nom périmé : on choisit un modèle disponible
  if (busy(r.status)) {
    const order = await modelsInOrder();
    outer: for (const m of order) {
      for (const wait of m === model ? [1500, 4000] : [0, 2500]) {
        if (wait) await sleep(wait);
        const r2 = await call(m); console.error('Gemini', m, 'nouvel essai :', r2.status);
        if (!busy(r2.status) && r2.status !== 404) { r = r2; model = m; break outer; }
        r = r2;
      }
    }
  }
  if (busy(r.status)) { console.error('Gemini saturé', model, r.status); const er = new Error(r.status === 429 ? 'La limite gratuite de lecture est atteinte pour le moment. Réessayez dans une minute.' : 'Le service gratuit de lecture de Google est momentanément surchargé. Réessayez dans quelques minutes.'); er.status = 503; er.expose = true; throw er; }
  if (!r.ok) { const txt = (await r.text()).slice(0, 300); console.error('Gemini', model, r.status, txt); const er = new Error(r.status === 400 || r.status === 403 ? 'Clé Gemini refusée ou invalide (erreur ' + r.status + '). Vérifiez GEMINI_API_KEY.' : 'Le service de lecture a refusé la requête (erreur ' + r.status + ').'); er.status = 502; er.expose = true; throw er; }
  const j = await r.json();
  const txt = (((j.candidates || [])[0] || {}).content || {}).parts;
  const out = Array.isArray(txt) ? txt.map(p => p.text || '').join('') : '';
  try { return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { const er = new Error('Réponse illisible, réessayez avec une photo plus nette.'); er.status = 502; er.expose = true; throw er; }
}

function ocr(buf, mime) {
  return new Promise((resolve, reject) => {
    const f = path.join(os.tmpdir(), 'ocr-' + crypto.randomBytes(8).toString('hex') + (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg'));
    fs.writeFile(f, buf, werr => {
      if (werr) return reject(werr);
      const done = fn => v => { fs.unlink(f, () => {}); fn(v); };
      let out = '', p; try { p = spawn('tesseract', [f, 'stdout', '-l', 'fra', '--psm', '6'], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return done(reject)(e); }
      const t = setTimeout(() => { try { p.kill(); } catch (e) { /* ignore */ } }, 60000);
      p.stdout.on('data', d => { out += d; }); p.on('error', e => { clearTimeout(t); done(reject)(e); });
      p.on('close', () => { clearTimeout(t); done(resolve)(out); });
    });
  });
}

const numFr = x => parseFloat(String(x).replace(/[\s\u00a0]/g, '').replace(',', '.'));
/* Lecture souple d'un texte de devis tapé : une ligne = désignation, quantité, unité, prix unitaire, total */
function looseLines(text) {
  const skip = /^(total|sous.?total|tva|net|remise|acompte|date|devis|facture|client|adresse|siret|tel|t[ée]l[ée]phone|email|validit|paiement|conditions)/i;
  const unitRe = '(m2|m²|m3|ml|m|u|pce|pièces?|pieces?|forfait|h|j|kg|l|lot|jour|heure)';
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim(); if (line.length < 6 || skip.test(line)) continue;
    const nums = [...line.matchAll(/(?<![\w.,])(\d[\d\s]*[,.]\d{1,2}|\d+)(?=\s|€|$)/g)].map(m => ({ v: numFr(m[1]), i: m.index, e: m.index + m[1].length }));
    if (nums.length < 2) continue;
    const total = nums[nums.length - 1].v, pu = nums[nums.length - 2].v;
    let qty = 1, cut = nums[nums.length - 2].i, between = '';
    if (nums.length >= 3) { const q = nums[nums.length - 3]; if (Math.abs(q.v * pu - total) < Math.max(0.05, total * 0.02) || nums.length === 3) { qty = q.v; cut = q.i; between = line.slice(q.e, nums[nums.length - 2].i).replace(/[x×*]/gi, ' ').trim(); } }
    else if (pu > 0 && Math.abs(pu - total) > 0.02) continue;
    let desc = line.slice(0, cut).replace(/[€\s]+$/, '').trim(), unit = 'u';
    const um = new RegExp('^' + unitRe + '$', 'i').exec(between) || new RegExp('\\s' + unitRe + '\\s*$', 'i').exec(desc); if (um) { unit = um[1].toLowerCase().replace('m²', 'm2'); if (um.index) desc = desc.slice(0, um.index).trim(); }
    if (desc.length < 2 || !(pu > 0)) continue;
    out.push({ type: 'item', ref: '', desc, qty, unit: unit === 'u' ? 'pièce(s)' : unit, price: pu, vat: 0 });
  }
  return out;
}

/* Renvoie { doc, source, warnings } comme importer.normalizeDoc */
async function read(imgs) {
  if (geminiOk()) {
    const raw = await gemini(imgs); const r = importer.normalizeDoc(raw, 'ia');
    if (raw && raw.notes) r.warnings = [...(r.warnings || []), 'À vérifier : ' + String(raw.notes).slice(0, 400)];
    return r;
  }
  if (!tessOk) { const e = new Error('La lecture de photos n\'est pas disponible sur ce serveur.'); e.status = 501; throw e; }
  let text = ''; for (const i of imgs) text += (await ocr(i.buf, i.mime)) + '\n';
  if (text.replace(/\s/g, '').length < 40) { const e = new Error('Aucun texte lisible sur cette photo. Cette lecture gratuite ne comprend que le texte imprimé : pour un devis écrit à la main, activez la lecture par IA gratuite (clé Google Gemini).'); e.status = 422; throw e; }
  const p = importer.parseText(text);
  if (!p.doc.lines.some(l => l.type === 'item')) {
    const loose = looseLines(text); p.doc.lines = loose; p.warnings = (p.warnings || []).filter(w => !/introuvable|Aucune ligne/.test(w));
    const cm = /client\s*:?\s*(.+)/i.exec(text); if (cm) p.doc.client.name = cm[1].trim().slice(0, 100);
    if (loose.length) p.warnings.push('Taux de TVA non lus : réglez-les ligne par ligne.');
  }
  return importer.normalizeDoc(p.doc, 'texte', [...(p.warnings || []), 'Lecture automatique du texte imprimé : l\'écriture manuscrite n\'est pas comprise. Vérifiez chaque ligne.']);
}

module.exports = { available, kind, read, ocr };
