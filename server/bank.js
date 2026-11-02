'use strict';
/* Trésorerie : comptes bancaires et opérations de chaque utilisateur (DATA_DIR/bank/<id>.json).
   Deux sources :
   1) connexion bancaire automatique (DSP2) via Enable Banking — ENABLEBANKING_APP_ID + ENABLEBANKING_KEY_FILE
      (clé privée de l'application, fichier .pem) ; l'adresse de retour à déclarer est APP_URL/api/bank/callback ;
   2) import d'un relevé (CSV ou OFX) exporté depuis l'espace en ligne de la banque, toujours disponible. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const API = (process.env.ENABLEBANKING_API || 'https://api.enablebanking.com').replace(/\/$/, '');
const MAX_TX = 20000;
const dir = () => path.join(store.DIR, 'bank');
const file = uid => path.join(dir(), String(uid).replace(/[^\w-]/g, '') + '.json');
const r2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

/* ---------- Fichier de l'utilisateur ---------- */
function load(uid) {
  try { const d = JSON.parse(fs.readFileSync(file(uid), 'utf8')); return { accounts: d.accounts || [], tx: d.tx || [], pending: d.pending || [] }; }
  catch (e) { return { accounts: [], tx: [], pending: [] }; }
}
function save(uid, d) {
  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
  d.tx.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  if (d.tx.length > MAX_TX) d.tx.length = MAX_TX;
  const tmp = file(uid) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 }); fs.renameSync(tmp, file(uid));
}
const removeAll = uid => { try { fs.unlinkSync(file(uid)); } catch (e) { /* ignore */ } };
/* vue envoyée au navigateur (sans identifiants de session bancaire) */
const view = d => ({
  accounts: d.accounts.map(a => ({ id: a.id, provider: a.provider, name: a.name, bank: a.bank || '', iban: a.iban ? a.iban.replace(/^(.{4}).*(.{4})$/, '$1 •••• $2') : '', currency: a.currency || 'EUR',
    balance: a.balance, balanceAt: a.balanceAt || '', lastSync: a.lastSync || '', validUntil: a.validUntil || '', error: a.error || '' })),
  tx: d.tx
});

/* ajoute des opérations sans doublon ; renvoie le nombre de nouvelles */
function merge(d, accId, list) {
  const have = new Set(d.tx.filter(t => t.acc === accId).map(t => t.id)); let n = 0;
  for (const t of list) {
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Number(t.amount)) || Number(t.amount) === 0) continue;
    const id = String(t.id || ('h' + crypto.createHash('sha1').update([accId, t.date, r2(t.amount), t.label].join('|')).digest('hex').slice(0, 16))).slice(0, 80);
    if (have.has(id)) continue; have.add(id); n++;
    d.tx.push({ id, acc: accId, date: t.date, amount: r2(t.amount), label: String(t.label || '').replace(/\s+/g, ' ').trim().slice(0, 200), who: String(t.who || '').slice(0, 100), pending: !!t.pending });
  }
  return n;
}

/* ---------- Import d'un relevé (déjà analysé dans le navigateur) ---------- */
function importStatement(uid, b) {
  const d = load(uid);
  let acc = b.accountId && d.accounts.find(a => a.id === b.accountId);
  if (!acc) {
    if (d.accounts.length >= 10) throw Object.assign(new Error('10 comptes au maximum.'), { status: 400 });
    acc = { id: crypto.randomBytes(6).toString('hex'), provider: b.demo ? 'demo' : 'import', name: String(b.name || 'Compte professionnel').slice(0, 60), bank: String(b.bank || '').slice(0, 60), currency: 'EUR', balance: null, balanceAt: '' };
    d.accounts.push(acc);
  }
  const list = Array.isArray(b.tx) ? b.tx.slice(0, 10000) : [];
  const added = merge(d, acc.id, list);
  if (b.balance != null && Number.isFinite(Number(b.balance))) { acc.balance = r2(b.balance); acc.balanceAt = /^\d{4}-\d{2}-\d{2}$/.test(b.balanceAt) ? b.balanceAt : new Date().toISOString().slice(0, 10); }
  acc.lastSync = new Date().toISOString();
  save(uid, d);
  return { added, account: acc.id };
}

/* ---------- Enable Banking ---------- */
let keyCache = null;
const ebConfigured = () => !!(process.env.ENABLEBANKING_APP_ID && process.env.ENABLEBANKING_KEY_FILE && fs.existsSync(process.env.ENABLEBANKING_KEY_FILE));
function jwt() {
  if (!keyCache) keyCache = crypto.createPrivateKey(fs.readFileSync(process.env.ENABLEBANKING_KEY_FILE));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), iat = Math.floor(Date.now() / 1000);
  const head = b64({ typ: 'JWT', alg: 'RS256', kid: process.env.ENABLEBANKING_APP_ID }), body = b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 });
  return head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), keyCache).toString('base64url');
}
async function eb(method, p, body) {
  const r = await fetch(API + p, { method, headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = {}; }
  if (!r.ok) {
    console.error('Enable Banking', method, p.replace(/\/accounts\/[^/]+/, '/accounts/…'), r.status, txt.slice(0, 300));
    const e = new Error(r.status === 401 || r.status === 403 ? 'Accès à la banque refusé ou expiré : reconnectez le compte.' : r.status === 429 ? 'La banque limite le nombre d\'actualisations : réessayez plus tard.' : 'La banque ne répond pas correctement (erreur ' + r.status + ').');
    e.status = r.status === 429 ? 429 : 502; e.code = r.status; throw e;
  }
  return j;
}
let banksCache = { at: 0, list: [] };
async function banks(country = 'FR') {
  if (Date.now() - banksCache.at < 864e5 && banksCache.list.length) return banksCache.list;
  const j = await eb('GET', '/aspsps?country=' + encodeURIComponent(country));
  banksCache = { at: Date.now(), list: (j.aspsps || []).map(a => ({ name: a.name, country: a.country, logo: a.logo || '', business: !Array.isArray(a.psu_types) || a.psu_types.includes('business') })).sort((a, b) => a.name.localeCompare(b.name, 'fr')) };
  return banksCache.list;
}
async function startAuth(uid, bankName, redirectUrl, psuType) {
  const d = load(uid), state = crypto.randomBytes(16).toString('hex');
  const validUntil = new Date(Date.now() + 179 * 864e5).toISOString();
  const j = await eb('POST', '/auth', { access: { valid_until: validUntil }, aspsp: { name: bankName, country: 'FR' }, state, redirect_url: redirectUrl, psu_type: psuType === 'personal' ? 'personal' : 'business' });
  d.pending = (d.pending || []).filter(p => p.exp > Date.now()).concat({ state, bank: bankName, exp: Date.now() + 30 * 60e3 });
  save(uid, d);
  return j.url;
}
async function finishAuth(uid, code, state) {
  const d = load(uid), p = (d.pending || []).find(x => x.state === state && x.exp > Date.now());
  if (!p) throw Object.assign(new Error('Connexion expirée : recommencez.'), { status: 400 });
  d.pending = d.pending.filter(x => x !== p);
  const s = await eb('POST', '/sessions', { code });
  const validUntil = (s.access && s.access.valid_until) || '';
  for (const a of s.accounts || []) {
    const uidA = typeof a === 'string' ? a : a.uid; if (!uidA) continue;
    let acc = d.accounts.find(x => x.provider === 'enablebanking' && x.uid === uidA);
    const iban = (a.account_id && a.account_id.iban) || '';
    if (!acc) {
      if (d.accounts.length >= 10) break;
      acc = { id: crypto.randomBytes(6).toString('hex'), provider: 'enablebanking', uid: uidA, currency: a.currency || 'EUR', balance: null };
      d.accounts.push(acc);
    }
    Object.assign(acc, { session: s.session_id, bank: p.bank, name: a.name || a.product || (iban ? 'Compte ' + iban.slice(-4) : p.bank), iban, validUntil, error: '' });
  }
  save(uid, d);
  await sync(uid, true);
}
const pickBalance = list => {
  const order = ['ITAV', 'CLAV', 'ITBD', 'XPCD', 'CLBD', 'OTHR'];
  const rank = x => { const i = order.indexOf(x.balance_type); return i < 0 ? 99 : i; };
  const b = (list || []).slice().sort((x, y) => rank(x) - rank(y))[0];
  return b && b.balance_amount ? Number(b.balance_amount.amount) : null;
};
function ebTx(t) {
  const amt = Number(t.transaction_amount && t.transaction_amount.amount) * (t.credit_debit_indicator === 'DBIT' ? -1 : 1);
  const who = t.credit_debit_indicator === 'DBIT' ? t.creditor && t.creditor.name : t.debtor && t.debtor.name;
  const info = Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : String(t.remittance_information || '');
  return { id: t.entry_reference || t.transaction_id || '', date: (t.booking_date || t.value_date || t.transaction_date || '').slice(0, 10), amount: amt, label: [who, info].filter(Boolean).join(' — ') || t.bank_transaction_code && t.bank_transaction_code.description || 'Opération', who: who || '', pending: t.status === 'PDNG' };
}
/* actualise les comptes connectés ; force = demande de l'utilisateur */
async function sync(uid, force) {
  const d = load(uid); let added = 0; const errors = [];
  for (const acc of d.accounts.filter(a => a.provider === 'enablebanking')) {
    if (!force && acc.lastSync && Date.now() - new Date(acc.lastSync) < 7.5 * 3600e3) continue;
    if (acc.validUntil && acc.validUntil < new Date().toISOString()) { acc.error = 'Autorisation de la banque expirée : reconnectez le compte.'; continue; }
    try {
      const bal = await eb('GET', `/accounts/${encodeURIComponent(acc.uid)}/balances`);
      const b = pickBalance(bal.balances); if (b != null) { acc.balance = r2(b); acc.balanceAt = new Date().toISOString().slice(0, 10); }
      const last = d.tx.filter(t => t.acc === acc.id && !t.pending).map(t => t.date).sort().pop();
      const from = last ? new Date(new Date(last) - 10 * 864e5).toISOString().slice(0, 10) : new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      d.tx = d.tx.filter(t => !(t.acc === acc.id && t.pending));   // les opérations « en cours » sont remplacées à chaque fois
      let key = '', pages = 0, list = [];
      do {
        const j = await eb('GET', `/accounts/${encodeURIComponent(acc.uid)}/transactions?date_from=${from}${key ? '&continuation_key=' + encodeURIComponent(key) : ''}`);
        list = list.concat((j.transactions || []).map(ebTx)); key = j.continuation_key || ''; pages++;
      } while (key && pages < 30);
      added += merge(d, acc.id, list);
      acc.lastSync = new Date().toISOString(); acc.error = '';
    } catch (e) { acc.error = e.message; errors.push(e.message); }
  }
  save(uid, d);
  return { added, errors };
}
async function removeAccount(uid, id) {
  const d = load(uid), acc = d.accounts.find(a => a.id === id); if (!acc) return;
  d.accounts = d.accounts.filter(a => a !== acc); d.tx = d.tx.filter(t => t.acc !== id);
  if (acc.session && !d.accounts.some(a => a.session === acc.session) && ebConfigured()) { try { await eb('DELETE', '/sessions/' + encodeURIComponent(acc.session)); } catch (e) { /* déjà expirée */ } }
  save(uid, d);
}
function updateAccount(uid, id, b) {
  const d = load(uid), a = d.accounts.find(x => x.id === id); if (!a) return null;
  if (b.name != null) a.name = String(b.name).trim().slice(0, 60) || a.name;
  if (b.balance != null && b.balance !== '' && Number.isFinite(Number(b.balance))) { a.balance = r2(b.balance); a.balanceAt = new Date().toISOString().slice(0, 10); }
  save(uid, d); return d;
}
/* catégorie / note / lien d'une opération */
function patchTx(uid, ids, data) {
  const d = load(uid), set = new Set(ids); let n = 0;
  for (const t of d.tx) if (set.has(t.id)) {
    if ('cat' in data) t.cat = String(data.cat || '').slice(0, 40);
    if ('note' in data) t.note = String(data.note || '').slice(0, 200);
    if ('link' in data) t.link = String(data.link || '').slice(0, 40);
    n++;
  }
  save(uid, d); return n;
}
/* actualisation automatique, environ 3 fois par jour (limite DSP2 : 4 accès sans l'utilisateur par jour) */
function startAutoSync() {
  if (!ebConfigured()) return;
  const tick = async () => {
    let files = []; try { files = fs.readdirSync(dir()).filter(f => f.endsWith('.json')); } catch (e) { return; }
    for (const f of files) {
      const uid = f.slice(0, -5), d = load(uid);
      if (!d.accounts.some(a => a.provider === 'enablebanking')) continue;
      try { await sync(uid, false); } catch (e) { console.error('Synchro banque', e.message); }
    }
  };
  setTimeout(tick, 60e3); setInterval(tick, 3600e3).unref();
}

module.exports = { load, view, importStatement, updateAccount, ebConfigured, banks, startAuth, finishAuth, sync, removeAccount, patchTx, removeAll, startAutoSync };
