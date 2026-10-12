'use strict';
/* Import d'un devis ou d'une facture au format PDF réalisé sur un autre site.
   Deux méthodes : l'IA Claude (si une clé est configurée : lit aussi les PDF scannés) ou, gratuitement, une lecture du texte du PDF (pdftotext). */
const { spawn } = require('child_process');

const clip = (s, n) => String(s == null ? '' : s).replace(/\u0000/g, '').trim().slice(0, n);
const toNum = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const n = parseFloat(String(v || '').replace(/[\s  €%]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const MONTHS = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
const iso = (y, m, d) => { y = +y; if (y < 100) y += 2000; if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y < 2100)) return ''; return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
function findDate(s) {
  let m = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})\b/.exec(s); if (m) return iso(m[3], +m[2], +m[1]);
  m = /(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/i.exec(s);
  return m ? iso(m[3], MONTHS[m[2].toLowerCase()], +m[1]) : '';
}

/* ---------- Texte du PDF ---------- */
function pdfText(buf) {
  return new Promise((resolve, reject) => {
    let p; try { p = spawn('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { return reject(Object.assign(new Error('Lecture de PDF indisponible sur ce serveur.'), { status: 501 })); }
    const out = []; let size = 0, done = false;
    const end = (err, v) => { if (done) return; done = true; clearTimeout(timer); err ? reject(err) : resolve(v); };
    const timer = setTimeout(() => { p.kill('SIGKILL'); end(Object.assign(new Error('Lecture du PDF trop longue.'), { status: 422 })); }, 20000);
    p.on('error', () => end(Object.assign(new Error('Lecture de PDF indisponible sur ce serveur.'), { status: 501 })));
    p.stdout.on('data', c => { size += c.length; if (size < 3e6) out.push(c); });
    p.on('close', () => end(null, Buffer.concat(out).toString('utf8')));
    p.stdin.on('error', () => {}); p.stdin.end(buf);
  });
}
const available = () => new Promise(res => { try { const p = spawn('pdftotext', ['-v'], { stdio: 'ignore' }); p.on('error', () => res(false)); p.on('close', () => res(true)); } catch (e) { res(false); } });

/* ---------- Lecture « gratuite » du texte ---------- */
const NUMC = /^-?\d[\d\s ]*(?:[,.]\d+)?\s*(?:€|eur|euros?|%)?$/i;
const isNum = c => NUMC.test(c.trim());
const cellsOf = l => l.trim().split(/\s{2,}/).map(c => c.trim()).filter(Boolean);

/* Ligne chiffrée d'un tableau : quantité, unité, prix unitaire, TVA, montant lus depuis la droite (espaces simples ou multiples) */
function numericRow(line, hasVat) {
  const tok = line.trim().split(/\s+/), items = []; let i = tok.length - 1, eur = false;
  const isN = t => /^-?\d+(?:[,.]\d+)?$/.test(t);
  while (i >= 0) {
    const t = tok[i];
    if (t === '€' || t === 'EUR' || t === '%') { eur = t !== '%'; i--; continue; }
    const tm = /^(-?\d+(?:[,.]\d+)?)(€|%)$/.exec(t);
    if (isN(t) || tm) {
      let v = tm ? tm[1] : t, e = eur || (tm && tm[2] === '€'); i--;
      if (i >= 0 && /^\d{1,3}$/.test(tok[i]) && /^\d{3}(?:[,.]\d+)?$/.test(v)) { v = tok[i] + v; i--; }
      items.unshift({ v, eur: !!e }); eur = false; continue;
    }
    if (!eur && /^[^\d€%\s][^€%\s]{0,13}$/.test(t) && i >= 1 && isN(tok[i - 1]) && !items.some(x => x.u)) { items.unshift({ u: t }); i--; continue; }
    if (!eur && /^(?:m[2²3³]?|ml|u|h|j|kg|l|ens\.?|forfait|lot|jour(?:s)?|pce|pièce\(s\)|piece\(s\))$/i.test(t) && i >= 1 && isN(tok[i - 1]) && !items.some(x => x.u)) { items.unshift({ u: t }); i--; continue; }
    break;
  }
  const nums = items.filter(x => x.v != null); if (nums.length < 2) return null;
  const raw = line.trim(), pos = []; { const re = /\S+/g; let m; while ((m = re.exec(raw))) pos.push(m.index); }
  const lead = i + 1 < pos.length ? raw.slice(0, pos[i + 1]).trim() : raw;
  const unit = (items.find(x => x.u) || {}).u || '';
  let amount = toNum(nums[nums.length - 1].v), price = 0, vat = 0, qty = 0;
  if (nums.length >= 4 || (hasVat && nums.length === 3 && nums[nums.length - 2].eur === false && nums[nums.length - 3].eur)) { vat = toNum(nums[nums.length - 2].v); price = toNum(nums[nums.length - 3].v); qty = nums.length >= 4 ? toNum(nums[nums.length - 4].v) : 0; }
  else { price = toNum(nums[nums.length - 2].v); qty = nums.length >= 3 ? toNum(nums[nums.length - 3].v) : 0; }
  if (!(qty > 0) && price > 0 && amount > 0) qty = Math.round(amount / price * 100) / 100;
  return { lead, qty, unit, price, vat, amount };
}

function parseText(text) {
  const lines = text.split('\n').map(l => l.replace(/\s+$/, ''));
  const warnings = []; const doc = { kind: 'devis', number: '', date: '', validUntil: '', dueDate: '', title: '', client: { type: 'particulier', name: '', address: '', siret: '', vatNumber: '', email: '', phone: '', contact: '' }, lines: [], discount: 0, payments: [], notes: '', bank: '', totalHt: 0, totalTtc: 0 };
  // en-tête du tableau
  const COLS = /quantit|qt[ée]|montant|prix|\bp\.?u\b|tva/i;
  const hi = lines.findIndex(l => /d[ée]signation|description|libell[ée]/i.test(l) && COLS.test(l));
  const top = hi > 0 ? lines.slice(0, hi) : lines.slice(0, 30);
  // type, numéro, date
  const mk = /(devis|facture)\s*(?:n[°o]|num[ée]ro)?\s*:?\s*([A-Z0-9][\w\-\/.]*)/i.exec(top.join('\n')) || /(devis|facture)\b/i.exec(top.join('\n'));
  if (mk) { doc.kind = /facture/i.test(mk[1]) ? 'facture' : 'devis'; doc.number = mk[2] && !/^(du|le|date)$/i.test(mk[2]) ? mk[2].replace(/[.,;:]+$/, '') : ''; }
  const dl = top.map(l => l.split(/valable|[ée]ch[ée]ance/i)[0]).find(l => findDate(l)); if (dl) doc.date = findDate(dl);
  const vu = /valable\s+jusqu['’]?\s*au\s*:?\s*([^\n]+)/i.exec(top.join('\n')); if (vu) doc.validUntil = findDate(vu[1]);
  const eu = /[ée]ch[ée]ance[^\n:]*:?\s*([^\n]+)/i.exec(top.join('\n')); if (eu) doc.dueDate = findDate(eu[1]);
  // blocs haut de page : titre et client à droite
  const nl = top.findIndex(l => /(devis|facture)\s*(?:n[°o])/i.test(l)); const head = (nl > 0 ? top.slice(0, nl) : top).filter(l => l.trim());
  const width = Math.max(60, ...head.map(l => l.length)), cut = width * 0.45;
  const right = head.map(l => { const m = /\S/.exec(l.slice(Math.floor(cut))); return m ? { col: Math.floor(cut) + m.index, txt: l.slice(Math.floor(cut) + m.index).trim() } : null; }).filter(Boolean)
    .filter(r => r.col >= cut);
  if (right.length) {
    const freq = {}; right.forEach(r => { freq[r.col] = (freq[r.col] || 0) + 1; });
    const mode = +Object.keys(freq).sort((a, b) => freq[b] - freq[a] || a - b)[0];
    const first = right.findIndex(r => r.col === mode);
    const titleL = first > 0 ? right.slice(0, first) : (right.length > 3 && freq[mode] < right.length && right[0].col !== mode ? right.slice(0, 1) : []);
    doc.title = titleL.map(r => r.txt).join(' ').replace(/\s+/g, ' ').trim();
    const cl = right.slice(titleL.length).map(r => r.txt);
    if (cl.length) {
      const blob = cl.join('\n');
      doc.client.name = cl[0];
      const rest = cl.slice(1); if (rest.length >= 2 && !/\d/.test(rest[0]) && /\d/.test(rest[1]) && !/^(port|tel|t[ée]l|email|siret|tva|n°)/i.test(rest[0])) doc.client.contact = rest.shift();
      const addr = []; rest.forEach(l => { if (/^(port|tel|t[ée]l|email|e-mail|mail|n°|siret|siren|tva|[àa] l'attention)/i.test(l) || /@/.test(l)) return; if (/^\d{9,}$/.test(l.replace(/\s/g, ''))) return; addr.push(l); });
      doc.client.address = addr.slice(0, 3).join('\n');
      const sm = /(?:siret|siren)\s*:?\s*([\d\s]{9,17})/i.exec(blob); if (sm) doc.client.siret = sm[1].replace(/\s+/g, ' ').trim();
      const tm = /tva[^:\n]*:[ \t]*([A-Z]{2}[ \t]?[\d \t]{8,14})/i.exec(blob.replace(/\n(\d{6,})/g, ' $1')); if (tm) doc.client.vatNumber = tm[1].trim();
      const em = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(blob); if (em) doc.client.email = em[0];
      const pm = /(?:port|tel|t[ée]l)[^:\n]*:\s*(\+?[\d\s.]{9,18})/i.exec(blob); if (pm) doc.client.phone = pm[1].trim();
      const am = /[àa] l['’]attention de\s*:?\s*(.+)/i.exec(blob); if (am) doc.client.contact = am[1].trim();
      doc.client.type = doc.client.siret ? 'pro' : 'particulier';
    }
  }
  // tableau (sur toutes les pages : en-tête répété, pieds de page, numéros de page)
  if (hi < 0) warnings.push('Tableau des prestations introuvable : ajoutez les lignes à la main.');
  else {
    const hasVat = /tva/i.test(lines[hi]);
    const END = /(total\s+h\.?t|net\s+[àa]\s+payer|conditions\s+de\s+paiement|coordonn[ée]es\s+bancaires|bon\s+pour\s+accord|^\s*iban\b)/i;
    const FOOT = /(clause\s+de\s+r[ée]serve|p[ée]nalit[ée]s\s+de\s+retard|indemnit[ée]\s+forfaitaire|tva\s+non\s+applicable|fait\s+avec\b|^\s*page\s+\d+\s*(\/|sur)\s*\d+|mentions\s+l[ée]gales)/i;
    const HEAD = /d[ée]signation|description|libell[ée]/i;
    const pages = text.split('\f').map(p => p.split('\n').map(l => l.replace(/\s+$/, '')));
    // page 1 : après la ligne d'en-tête ; pages suivantes : après l'en-tête répété s'il existe, sinon depuis le haut
    const pageStart = lines.slice(0, hi).join('\n').split('\f').length - 1;
    let ended = false;
    for (let pg = pageStart; pg < pages.length && !ended; pg++) {
      const L = pages[pg]; let start = 0;
      const hl = L.findIndex(l => HEAD.test(l) && COLS.test(l));
      if (pg === pageStart) { const first = L.findIndex(l => l === lines[hi]); start = first >= 0 ? first + 1 : (hl >= 0 ? hl + 1 : 0); } else if (hl >= 0) start = hl + 1;
      // lignes du tableau de cette page, regroupées en blocs (séparés par des lignes vides)
      const blocks = []; let blk = [];
      for (let i = start; i < L.length; i++) {
        const l = L[i];
        if (END.test(l)) { ended = true; break; }
        if (FOOT.test(l)) break;
        if (!l.trim()) { if (blk.length) blocks.push(blk); blk = []; continue; }
        if (pg > pageStart && hl < 0 && (/(devis|facture)\s*(?:n[°o])/i.test(l) || (cellsOf(l).length <= 2 && findDate(l) && !/\d{2,}[,.]\d{2}/.test(l)))) continue;
        blk.push(l);
      }
      if (blk.length) blocks.push(blk);
      let cur = null;
      const addRow = (nr, extra) => {
        const lead = cellsOf(nr.lead); let ref = '', d = lead;
        if (lead.length >= 2 && lead[0].length <= 16) { ref = lead[0]; d = lead.slice(1); }
        else if (lead.length === 1 && (extra.before.length + extra.after.length) && lead[0].length <= 12 && /[\d\-]/.test(lead[0])) { ref = lead[0]; d = []; }
        const row = { type: 'item', ref, desc: [...extra.before, d.join(' '), ...extra.after].map(x => x.trim()).filter(Boolean).join('\n'), qty: nr.qty, unit: nr.unit, price: nr.price, vat: nr.vat };
        doc.lines.push(row); cur = row;
      };
      for (const bl of blocks) {
        const parsed = bl.map(l => (/^\s*sous[\s-]*total/i.test(l) && /\d/.test(l)) ? { sub: l.trim().split(/\s{2,}/)[0] } : numericRow(l, hasVat));
        const idx = parsed.map((r, i) => (r && (r.sub || r.qty !== undefined) ? i : -1)).filter(i => i >= 0);
        if (!idx.length) { if (cur) cur.desc += '\n' + bl.map(l => l.trim()).join('\n'); continue; }
        if (idx.length === 1 && !parsed[idx[0]].sub) {            // un seul prix dans le bloc : le reste est la désignation (au-dessus et/ou en dessous)
          addRow(parsed[idx[0]], { before: bl.slice(0, idx[0]).map(l => l.trim()), after: bl.slice(idx[0] + 1).map(l => l.trim()) });
        } else {                                                   // plusieurs lignes chiffrées dans le bloc : une ligne = une prestation
          let last = null;
          bl.forEach((l, i) => {
            const r = parsed[i];
            if (r && r.sub) { doc.lines.push({ type: 'subtotal', ref: '', desc: r.sub, qty: 0, unit: '', price: 0, vat: 0 }); last = null; }
            else if (r && r.qty !== undefined) { addRow(r, { before: [], after: [] }); last = cur; }
            else if (last) last.desc += '\n' + l.trim();
          });
        }
      }
    }
  }
  const tx = text.split('\n');
  const grab = re => { for (const l of tx) { const m = re.exec(l); if (m) return toNum(m[1]); } return 0; };
  doc.totalHt = grab(/total\s+h\.?t\.?[^\d-]*(-?\d[\d\s]*[,.]\d{2})/i); doc.totalTtc = grab(/total\s+ttc[^\d-]*(-?\d[\d\s]*[,.]\d{2})/i);
  // échéancier
  const pi = lines.findIndex(l => /conditions\s+de\s+paiement/i.test(l));
  if (pi >= 0) for (let i = pi + 1; i < Math.min(lines.length, pi + 8); i++) {
    const m = /(\d+(?:[,.]\d+)?)\s*%\s*(?:soit\s*[\d\s,.]+\s*€?)?\s*[:\-–]?\s*(.*)$/i.exec(cellsOf(lines[i])[0] || ''); if (!m) { if (doc.payments.length) break; else continue; }
    doc.payments.push({ pct: toNum(m[1]), label: m[2].replace(/[,;.\s]+$/, '').replace(/^[:\-–\s]+/, '').trim() });
  }
  const bi = lines.findIndex(l => /coordonn[ée]es\s+bancaires|^\s*iban\b/i.test(l));
  if (bi >= 0) doc.bank = lines.slice(bi, bi + 4).map(l => cellsOf(l)[0] || '').filter(l => /bancaire|iban|bic|swift|banque|cr[ée]dit/i.test(l)).join('\n');
  if (!doc.lines.some(l => l.type === 'item')) warnings.push('Aucune ligne de prestation reconnue : ajoutez-les à la main.');
  return { doc, warnings };
}

/* ---------- Nettoyage commun (IA ou texte) ---------- */
function normalizeDoc(raw, source, warnings = []) {
  raw = raw || {}; const c = raw.client || {};
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 300).map(l => {
    const type = ['title', 'subtotal'].includes(l && l.type) ? l.type : 'item';
    return { type, ref: clip(l && l.ref, 40), desc: clip(l && l.desc, 800), qty: toNum(l && (l.qty != null ? l.qty : 1)), unit: clip(l && l.unit, 20), price: toNum(l && (l.price != null ? l.price : l.unit_price)), vat: Math.min(100, Math.max(0, toNum(l && (l.vat != null ? l.vat : l.vat_percent)))) };
  }).filter(l => l.type !== 'item' || l.desc || l.price || l.qty);
  const D = s => { s = clip(s, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  const doc = {
    kind: raw.kind === 'facture' ? 'facture' : 'devis', number: clip(raw.number, 40), date: D(raw.date), validUntil: D(raw.validUntil != null ? raw.validUntil : raw.valid_until), dueDate: D(raw.dueDate != null ? raw.dueDate : raw.due_date),
    title: clip(raw.title, 400), discount: Math.min(100, Math.max(0, toNum(raw.discount != null ? raw.discount : raw.discount_percent))),
    client: { type: c.type === 'pro' ? 'pro' : 'particulier', name: clip(c.name, 120), address: clip(c.address, 300), siret: clip(c.siret, 20), vatNumber: clip(c.vatNumber != null ? c.vatNumber : c.vat_number, 30), email: clip(c.email, 120), phone: clip(c.phone, 30), contact: clip(c.contact, 100) },
    lines, notes: clip(raw.notes, 1500), bank: clip(raw.bank, 400),
    payments: (Array.isArray(raw.payments) ? raw.payments : []).slice(0, 12).map(p => ({ pct: Math.min(100, Math.max(0, toNum(p && (p.pct != null ? p.pct : p.percent)))), label: clip(p && p.label, 120) })).filter(p => p.pct > 0),
    totalHt: toNum(raw.totalHt != null ? raw.totalHt : raw.total_ht), totalTtc: toNum(raw.totalTtc != null ? raw.totalTtc : raw.total_ttc)
  };
  return { doc, source, warnings };
}

module.exports = { pdfText, parseText, normalizeDoc, available, findDate };
