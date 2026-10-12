'use strict';
/* Relecture gratuite : correction des fautes avec LanguageTool (API publique, sans clé) + conseils par règles simples.
   Même format de réponse que la relecture par IA : suggestions que l'utilisateur accepte ou ignore une par une. */
const ai = require('./ai');

let fetchImpl = (...a) => fetch(...a);
const useFetch = f => { fetchImpl = f; };
const URL = process.env.LANGUAGETOOL_URL || 'https://api.languagetool.org/v2/check';
const SKIP_CATS = new Set(['STYLE', 'REDUNDANCY', 'PLAIN_ENGLISH', 'COLLOQUIALISMS', 'REGIONALISMS', 'SEMANTICS', 'WIKIPEDIA']);
const digits = s => (String(s).match(/\d/g) || []).join('');

/* Champs relus : titre, désignations, notes, libellés d'échéances, pied de page */
function fields(doc) {
  const f = [];
  const add = (target, index, text) => { if (text && String(text).trim().length > 2) f.push({ target, index, text: String(text) }); };
  add('title', -1, doc.title);
  doc.lines.forEach((l, i) => { if (l.type !== 'spacer') add('line', i, l.desc); });
  add('notes', -1, doc.notes);
  doc.payment_schedule.forEach((p, i) => add('payment', i, p.label));
  add('footer', -1, doc.footer);
  return f;
}

async function check(text) {
  const r = await fetchImpl(URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ text, language: 'fr', enabledOnly: 'false' }).toString(), signal: AbortSignal.timeout(15000)
  });
  if (r.status === 429) { const e = new Error('Le correcteur gratuit est très sollicité, réessayez dans une minute.'); e.status = 429; throw e; }
  if (!r.ok) { const e = new Error('Le correcteur est momentanément indisponible.'); e.status = 502; throw e; }
  return (await r.json()).matches || [];
}

/* Règles simples, sans service externe */
function advice(doc) {
  const out = [], push = (category, severity, target, index, message) => out.push({ category, severity, target, index, message });
  const isInv = doc.kind === 'facture';
  doc.lines.forEach((l, i) => {
    if (l.type !== 'item') return;
    if (!String(l.desc).trim()) push('oubli', 'important', 'line', i, 'Cette ligne n\'a pas de désignation.');
    else if (String(l.desc).trim().length < 4) push('clarte', 'info', 'line', i, 'Désignation très courte : précisez la prestation ou le matériau.');
    if (!(l.qty > 0)) push('oubli', 'important', 'line', i, 'Quantité absente ou nulle.');
    if (!(l.unit_price > 0)) push('oubli', 'important', 'line', i, 'Prix unitaire absent ou nul.');
    if (!String(l.unit).trim()) push('oubli', 'info', 'line', i, 'Unité manquante (m², h, forfait…).');
    if (doc.vat_exempt_company && l.vat_percent > 0) push('coherence', 'important', 'line', i, 'Un taux de TVA est indiqué alors que l\'entreprise est non assujettie à la TVA.');
  });
  const seen = new Map();
  doc.lines.forEach((l, i) => { if (l.type !== 'item') return; const k = String(l.desc).trim().toLowerCase(); if (!k) return; if (seen.has(k)) push('coherence', 'info', 'line', i, `Même désignation que la ligne ${seen.get(k) + 1} : doublon ?`); else seen.set(k, i); });
  if (!isInv && doc.payment_schedule.length) {
    const sum = doc.payment_schedule.reduce((s, p) => s + p.percent, 0);
    if (Math.abs(sum - 100) > 0.001) push('coherence', 'important', 'general', -1, `L'échéancier totalise ${sum.toLocaleString('fr-FR')} % au lieu de 100 %.`);
  }
  if (!isInv && !doc.valid_until) push('oubli', 'info', 'general', -1, 'Aucune durée de validité du devis n\'est indiquée.');
  if (isInv && !doc.due_date) push('oubli', 'info', 'general', -1, 'Aucune date d\'échéance de paiement n\'est indiquée.');
  if (!doc.title.trim()) push('oubli', 'info', 'general', -1, 'Le titre du document (objet des travaux) est vide.');
  return out;
}

async function review(data) {
  const doc = ai.sanitize(data), fl = fields(doc);
  const SEP = '\n\n';
  let text = '', pos = [];
  for (const f of fl) { if (text.length + f.text.length > 19000) break; pos.push({ ...f, start: text.length, end: text.length + f.text.length }); text += f.text + SEP; }
  const matches = text.trim() ? await check(text) : [];
  const raw = [];
  for (const f of pos) {
    const ms = matches.filter(m => m.offset >= f.start && m.offset + m.length <= f.end && m.replacements && m.replacements.length &&
      !SKIP_CATS.has(m.rule && m.rule.category && m.rule.category.id)).sort((a, b) => b.offset - a.offset);
    let out = f.text; const notes = [];
    for (const m of ms) {
      const old = text.substr(m.offset, m.length), rep = m.replacements[0].value;
      if (digits(old) !== digits(rep) || old === rep) continue;
      const a = m.offset - f.start;
      out = out.slice(0, a) + rep + out.slice(a + m.length); notes.unshift(`« ${old.trim() || old} » → « ${rep.trim() || rep} »`);
    }
    if (out !== f.text) raw.push({ category: 'faute', severity: 'important', target: f.target, index: f.index, message: (notes.slice(0, 4).join(' ; ') + (notes.length > 4 ? ' …' : '')).slice(0, 480), suggested: out });
  }
  const tips = advice(doc);
  const res = ai.finalize({ summary: '', suggestions: [...raw, ...tips.map(t => ({ ...t, suggested: '' }))] }, doc);
  const nf = res.suggestions.filter(s => s.suggested).length, nt = res.suggestions.length - nf;
  res.summary = res.suggestions.length ? `${nf} correction${nf > 1 ? 's' : ''} d'orthographe ou de grammaire proposée${nf > 1 ? 's' : ''}, ${nt} remarque${nt > 1 ? 's' : ''}.` : 'Aucune faute ni oubli détecté. Votre document semble en ordre.';
  return res;
}

module.exports = { review, advice, useFetch, fields };
