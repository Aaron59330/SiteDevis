'use strict';
const crypto = require('crypto');
const store = require('./store');
const mail = require('./mail');
const ai = require('./ai');
const pdf = require('./pdf');
const spell = require('./spell');
const importer = require('./importer');
const stores = require('./stores');
const storefetch = require('./storefetch');
const storefetchLookup = (...a) => storefetch.lookup(...a);
let importFreeOk = false; importer.available().then(v => { importFreeOk = v; });
const { db } = store;

/* ---------- Utilitaires ---------- */
class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; } }
const err = (s, m, e) => new HttpError(s, m, e);
const now = () => new Date().toISOString();
const APP_URL = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rnd = (n = 32) => crypto.randomBytes(n).toString('hex');
const isEmail = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const money = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripeKey = () => process.env.STRIPE_SECRET_KEY || '';
const simulatedAllowed = () => !stripeKey() && process.env.ALLOW_SIMULATED_PAYMENTS !== 'false';

function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPw(pw, stored) {
  const [t, s, h] = String(stored).split('$');
  if (t !== 'scrypt' || !s || !h) return false;
  const a = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const pwOk = p => typeof p === 'string' && p.length >= 8 && p.length <= 200 && /[A-Za-z]/.test(p) && /\d/.test(p);
const PW_MSG = 'Le mot de passe doit contenir au moins 8 caractères, avec des lettres et des chiffres.';

const hits = new Map();
function limit(key, max, ms) {
  const t = Date.now(), a = (hits.get(key) || []).filter(x => t - x < ms);
  a.push(t); hits.set(key, a);
  if (a.length > max) throw err(429, 'Trop de tentatives, réessayez dans quelques minutes.');
}
setInterval(() => { const t = Date.now(); for (const [k, a] of hits) if (!a.some(x => t - x < 3600e3)) hits.delete(k); }, 600e3).unref();

const findUser = id => db.users.find(u => u.id === id);
const findByEmail = e => db.users.find(u => u.email === String(e).toLowerCase());
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, verified: u.verified, createdAt: u.createdAt, prefs: u.prefs || null });

function access(u) {
  if (u.suspended) return { active: false, reason: 'suspended' };
  if (u.role === 'admin') return { active: true, source: 'admin', until: null };
  const until = u.accessUntil;
  if (until && new Date(until) > new Date()) return { active: true, until, source: u.accessSource || 'subscription' };
  return { active: false, reason: until ? 'expired' : 'none', until: until || null };
}
function extendAccess(u, { months = 0, days = 0 }, source) {
  const base = Math.max(Date.now(), u.accessUntil ? new Date(u.accessUntil).getTime() : 0);
  const d = new Date(base);
  if (months) d.setMonth(d.getMonth() + months);
  if (days) d.setDate(d.getDate() + days);
  u.accessUntil = d.toISOString(); u.accessSource = source;
  return u.accessUntil;
}
function audit(actor, action, target, detail) {
  db.audit.unshift({ id: store.uuid(), at: now(), actor: actor ? actor.email : 'système', action, target: target || '', detail: detail || '' });
  db.audit.length = Math.min(db.audit.length, 2000);
  store.save();
}
function onVerified(u) {
  u.verified = true;
  if (!u.trialGiven && db.settings.trialDays > 0 && u.role !== 'admin') {
    extendAccess(u, { days: db.settings.trialDays }, 'trial'); u.trialGiven = true;
  }
}
function newToken(userId, type, ttlMs) {
  const t = rnd(32);
  db.tokens = db.tokens.filter(x => !(x.userId === userId && x.type === type));
  db.tokens.push({ h: sha(t), userId, type, exp: Date.now() + ttlMs });
  store.save();
  return t;
}
function useToken(t, type) {
  const h = sha(String(t || '')), i = db.tokens.findIndex(x => x.h === h && x.type === type && x.exp > Date.now());
  if (i < 0) return null;
  const tok = db.tokens[i]; db.tokens.splice(i, 1); store.save();
  return findUser(tok.userId) || null;
}

/* ---------- Sessions ---------- */
function cookieHeader(value, maxAge) {
  return `sid=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`;
}
function startSession(ctx, u) {
  const tok = rnd(32);
  db.sessions.push({ h: sha(tok), userId: u.id, exp: Date.now() + 30 * 864e5, at: now(), ip: ctx.ip, ua: str(ctx.req.headers['user-agent'], 120) });
  u.lastLoginAt = now(); store.save();
  ctx.setCookie = cookieHeader(tok, 30 * 86400);
}
function sessionUser(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const h = sha(m[1]), s = db.sessions.find(x => x.h === h);
  if (!s || s.exp < Date.now()) return null;
  const u = findUser(s.userId);
  if (!u || u.suspended) return null;
  if (!u.lastSeenAt || Date.now() - new Date(u.lastSeenAt) > 600e3) { u.lastSeenAt = now(); store.save(); }
  return u;
}

/* ---------- Paiements ---------- */
function nextReceipt() {
  db.settings.receiptCounter += 1;
  return `R-${new Date().getFullYear()}-${String(db.settings.receiptCounter).padStart(4, '0')}`;
}
const planPeriod = plan => plan ? (plan.interval === 'year' ? { months: 12 } : { months: 1 }) : { days: 30 };

function completePayment(p, extra = {}) {
  if (p.status === 'paid') return p;
  const u = findUser(p.userId), plan = db.plans.find(x => x.id === p.planId);
  Object.assign(p, extra, { status: 'paid', paidAt: now(), receiptNo: nextReceipt() });
  if (u) {
    p.periodEnd = extendAccess(u, p.days ? { days: p.days } : planPeriod(plan), 'subscription');
    mail.send(u.email, `Reçu de paiement ${p.receiptNo}`,
      `Bonjour ${u.name},\n\nNous avons bien reçu votre paiement de ${money(p.amountCents)} (${p.planName}).\nVotre accès est actif jusqu'au ${new Date(p.periodEnd).toLocaleDateString('fr-FR')}.\n\nVotre reçu : ${APP_URL()}/receipt/${p.id}\n\nMerci de votre confiance,\n${db.settings.siteName}`);
  }
  audit(u, 'paiement', u ? u.email : p.userEmail, `${money(p.amountCents)} — ${p.planName} (${p.provider})`);
  store.save();
  return p;
}

async function stripe(method, p, params) {
  const r = await fetch('https://api.stripe.com/v1' + p, {
    method, headers: { Authorization: 'Bearer ' + stripeKey(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params).toString() : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw err(502, 'Stripe : ' + ((j.error && j.error.message) || r.status));
  return j;
}

/* ---------- Routeur ---------- */
const routes = [];
function route(method, pattern, auth, fn) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth, fn });
}
const ok = (o = {}) => ({ ok: true, ...o });

async function readBody(req, max) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw err(413, 'Requête trop volumineuse.');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handle(req, res, url) {
  const ctx = { req, res, url, query: Object.fromEntries(url.searchParams), ip: req.socket.remoteAddress || '', body: {}, params: {} };
  const send = (status, headers, body) => { res.writeHead(status, headers); res.end(body); };
  try {
    const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw err(404, 'Introuvable.');
    const m = r.re.exec(url.pathname);
    r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });

    if (req.method !== 'GET' && req.method !== 'HEAD' && r.auth !== 'webhook') {
      if (req.headers['x-requested-with'] !== 'sitedevis') throw err(403, 'Requête refusée.');
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw err(403, 'Origine refusée.');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      ctx.raw = await readBody(req, url.pathname === '/api/data' ? 12e6 : url.pathname === '/api/pdf' ? 6e6 : url.pathname === '/api/import/pdf' ? 12e6 : 1e6);
      if (r.auth !== 'webhook' && ctx.raw) { try { ctx.body = JSON.parse(ctx.raw); } catch (e) { throw err(400, 'JSON invalide.'); } }
    }
    if (r.auth !== 'none' && r.auth !== 'webhook') {
      ctx.user = sessionUser(req);
      if (!ctx.user) throw err(401, 'Connexion requise.', { code: 'auth' });
      if (r.auth === 'admin' && ctx.user.role !== 'admin') throw err(403, 'Accès réservé aux administrateurs.');
    }
    const out = await r.fn(ctx);
    if (out && Buffer.isBuffer(out.pdfFile)) return send(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Cache-Control': 'no-store' }, out.pdfFile);
    const h = { 'Cache-Control': 'no-store' };
    if (ctx.setCookie) h['Set-Cookie'] = ctx.setCookie;
    if (out && out.redirect) return send(302, { ...h, Location: out.redirect }, '');
    if (out && out.html) return send(200, { ...h, 'Content-Type': 'text/html; charset=utf-8' }, out.html);
    return send(200, { ...h, 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(out || ok()));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (res.headersSent) return res.end();
    send(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      JSON.stringify({ error: status === 500 ? 'Erreur interne du serveur.' : e.message, ...(e.extra || {}) }));
  }
}

/* ---------- Config publique ---------- */
route('GET', '/api/config', 'none', () => ({
  siteName: db.settings.siteName, registrationOpen: db.settings.registrationOpen, trialDays: db.settings.trialDays,
  mailConfigured: mail.configured(), pdf: pdf.available(), importFree: importFreeOk, importAi: ai.available() && db.settings.aiEnabled !== false, priceSearch: true, ai: db.settings.aiEnabled !== false, aiKind: ai.available() ? 'claude' : 'free', stripe: !!stripeKey(), simulated: simulatedAllowed(),
  plans: db.plans.filter(p => p.active)
}));

/* ---------- Recherche de prix en ligne (Google Shopping via SerpApi, clé SERPAPI_KEY) ---------- */
function shoppingOffers(j) {
  return ((j && j.shopping_results) || []).slice(0, 15).map(r => ({
    title: str(r.title, 200), store: str(r.source, 80), priceText: str(r.price, 40),
    price: Number.isFinite(Number(r.extracted_price)) ? Number(r.extracted_price) : null,
    link: /^https?:\/\//.test(r.product_link || r.link || '') ? (r.product_link || r.link) : '', thumbnail: /^https?:\/\//.test(r.thumbnail || '') ? r.thumbnail : ''
  })).filter(o => o.title && o.price != null);
}
route('GET', '/api/prices/search', 'user', async ctx => {
  const key = process.env.SERPAPI_KEY;
  limit('prices:' + ctx.user.id, 40, 3600e3);
  const q = str(ctx.query.q, 200);
  if (q.length < 3) throw err(400, 'Saisissez au moins 3 caractères.');
  const store = stores.matchStore(str(ctx.query.s, 80), str(ctx.query.w, 120));       // fournisseur reconnu même mal écrit (« pointp », « leroy merlain »…)
  const extra = [store && store.domain, stores.domainOf(str(ctx.query.w, 120))].filter(Boolean);
  const isUrl = /^https:\/\//i.test(q), ref = isUrl ? '' : q, rk = stores.key(ref);
  // la référence doit apparaître dans le titre, le code ou l'adresse de la fiche (hors liens Google, qui répètent la recherche, et hors paramètres d'URL)
  const linkPath = l => { try { const u = new URL(l); return /(^|\.)google\./i.test(u.hostname) ? '' : u.hostname + u.pathname; } catch (e) { return ''; } };
  const exactOf = o => !!(rk && rk.length >= 4 && (stores.key(o.title + ' ' + linkPath(o.link) + ' ' + (o.sku || '') + ' ' + (o.ean || '')).includes(rk)));
  const serp = async params => {
    if (!key) return null;
    let r; try { r = await fetch('https://serpapi.com/search.json?' + new URLSearchParams({ gl: 'fr', hl: 'fr', google_domain: 'google.fr', api_key: key, ...params })); }
    catch (e) { throw err(502, 'Service de prix injoignable.'); }
    if (!r.ok) throw err(502, 'Le service de prix a refusé la requête (' + r.status + ').');
    return r.json();
  };
  const quoted = ref && /^[\w.\-\/ ]{4,40}$/.test(ref) ? '"' + ref + '"' : ref;
  // 1) lecture directe : adresse collée, ou recherche sur le site du magasin ; 2) Google Shopping ; 3) recherche limitée au site du magasin
  const direct = storefetchLookup(q, store, extra).catch(() => null);
  const shop = isUrl ? Promise.resolve(null) : serp({ engine: 'google_shopping', q: (store ? quoted + ' ' + store.name : quoted) }).catch(() => null);
  const site = !isUrl && store && store.domain ? serp({ engine: 'google', q: 'site:' + store.domain + ' ' + quoted, num: '10' }).catch(() => null) : Promise.resolve(null);
  const [d, j, js] = await Promise.all([direct, shop, site]);
  const offers = shoppingOffers(j), pages = [];
  if (d) offers.unshift({ title: d.title, store: d.store, priceText: d.priceText, price: d.price, link: d.link, thumbnail: d.thumbnail || '', direct: true, sku: d.sku, ean: d.ean });
  const cand = [];
  for (const r of ((js && js.organic_results) || []).slice(0, 8)) {
    let host = ''; try { host = new URL(r.link).hostname.replace(/^www\./, ''); } catch (e) { continue; }
    if (!(store && (host === store.domain || host.endsWith('.' + store.domain)))) continue;
    const ext = r.rich_snippet && r.rich_snippet.top && r.rich_snippet.top.detected_extensions;
    const m = /(\d{1,4}(?:[ \u00a0]\d{3})*(?:[,.]\d{1,2}))\s?€/.exec(String(r.snippet || '') + ' ' + String(r.title || ''));
    const price = ext && Number.isFinite(Number(ext.price)) ? Number(ext.price) : m ? parseFloat(m[1].replace(/[\s\u00a0]/g, '').replace(',', '.')) : null;
    cand.push({ title: str(r.title, 200), link: r.link, price, snippet: str(r.snippet, 200) });
  }
  // pour les fiches qui correspondent à la référence : on lit la page pour récupérer le prix exact
  const exactPages = cand.filter(c => exactOf(c)).slice(0, 2);
  const read = await Promise.all(exactPages.map(c => storefetchLookup(c.link, store, extra).catch(() => null)));
  exactPages.forEach((c, i) => { const rd = read[i]; if (rd && !offers.some(o => o.link === rd.link)) offers.unshift({ title: rd.title, store: rd.store, priceText: rd.priceText, price: rd.price, link: rd.link, thumbnail: rd.thumbnail || '', direct: true, sku: rd.sku, ean: rd.ean }); c.done = !!rd; });
  for (const c of cand) {
    if (c.done) continue;
    if (c.price > 0) offers.unshift({ title: c.title, store: store.name, priceText: c.price.toFixed(2).replace('.', ',') + ' €', price: c.price, link: c.link, thumbnail: '', site: true });
    else pages.push({ title: c.title, link: c.link, exact: exactOf(c) });
  }
  const same = n => { const k = stores.key(n), t = store ? stores.key(store.name) : ''; return !!(t && k && (k.includes(t) || t.includes(k) || (stores.matchStore(n, '') || {}).name === store.name)); };
  offers.forEach(o => { o.mine = same(o.store); o.exact = exactOf(o) || (o.direct && isUrl); });
  offers.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || a.price - b.price);
  pages.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));
  if (!key && !offers.length && !pages.length && !d) throw err(503, 'La recherche automatique n\'a rien trouvé et la recherche web (clé SERPAPI_KEY) n\'est pas activée. Collez l\'adresse de la fiche produit pour que le site la lise.');
  return ok({ offers, pages, store: store ? { name: store.name, domain: store.domain } : null, exact: offers.some(o => o.exact) });
});

/* ---------- Téléchargement PDF du devis ou de la facture ---------- */
route('POST', '/api/pdf', 'user', async ctx => {
  if (!pdf.available()) throw err(501, 'Le téléchargement PDF n\'est pas disponible sur ce serveur.', { code: 'no_pdf' });
  if (!access(ctx.user).active) throw err(402, 'Un abonnement actif est nécessaire.', { code: 'payment_required' });
  limit('pdf:' + ctx.user.id, 40, 3600e3);
  const b = ctx.body || {};
  if (typeof b.html !== 'string' || b.html.length < 50 || b.html.length > 5.5e6) throw err(400, 'Document invalide.');
  const name = String(b.filename || 'document').replace(/[^\w.\- ]+/g, '').trim().slice(0, 80) || 'document';
  let buf;
  try { buf = await pdf.toPdf({ html: b.html, label: str(b.label, 80), date: str(b.date, 60), accent: str(b.accent, 7) }); }
  catch (e) { console.error('PDF :', e.message); throw err(502, 'Impossible de créer le PDF pour le moment.'); }
  return { pdfFile: buf, filename: name.replace(/\.pdf$/i, '') + '.pdf' };
});

/* ---------- Import d'un devis ou d'une facture PDF réalisé sur un autre site ---------- */
route('POST', '/api/import/pdf', 'user', async ctx => {
  if (!access(ctx.user).active) throw err(402, 'Un abonnement actif est nécessaire.', { code: 'payment_required' });
  limit('imp:' + ctx.user.id, 12, 3600e3);
  const data = ctx.body && ctx.body.data;
  if (typeof data !== 'string' || data.length < 100 || data.length > 11.5e6) throw err(400, 'Fichier invalide.');
  const buf = Buffer.from(data, 'base64');
  if (buf.length < 100 || buf.length > 8.5e6 || buf.slice(0, 5).toString('latin1') !== '%PDF-') throw err(400, 'Ce fichier n\'est pas un PDF (8 Mo maximum).');
  const useAi = ctx.body.method === 'ai' && ai.available() && db.settings.aiEnabled !== false;
  try {
    if (useAi) {
      const r = importer.normalizeDoc(await ai.extractQuote(buf), 'ia');
      db.settings.aiTotal = (db.settings.aiTotal || 0) + 1; store.save();
      return ok(r);
    }
    if (!importFreeOk) throw err(501, 'La lecture de PDF n\'est pas disponible sur ce serveur.');
    const text = await importer.pdfText(buf);
    if (text.replace(/\s/g, '').length < 60) throw err(422, 'Ce PDF ne contient pas de texte lisible (document scanné ou image).');
    const p = importer.parseText(text);
    return ok(importer.normalizeDoc(p.doc, 'texte', p.warnings));
  } catch (e) {
    if (e.status && e.status < 500 && e.status !== 429) throw err(e.status, e.message);
    console.error('Import PDF :', e.status || '', e.message);
    throw err(502, e.status === 429 ? 'Le service IA est très sollicité, réessayez dans un instant.' : 'Impossible de lire ce PDF pour le moment.');
  }
});

/* ---------- Relecture IA des devis ---------- */
route('POST', '/api/ai/review', 'user', async ctx => {
  if (db.settings.aiEnabled === false) throw err(503, 'La relecture n\'est pas activée.');
  if (!access(ctx.user).active) throw err(402, 'Un abonnement actif est nécessaire.', { code: 'payment_required' });
  limit('ai:' + ctx.user.id, 15, 3600e3); limit('aiday:' + ctx.user.id, 60, 86400e3);
  if (!ctx.body || typeof ctx.body !== 'object' || !Array.isArray(ctx.body.lines)) throw err(400, 'Document invalide.');
  let r;
  try { r = ai.available() ? await ai.review(ctx.body) : await spell.review(ctx.body); }
  catch (e) {
    if (e.status && e.status < 500 && e.status !== 429) throw err(e.status, e.message);
    console.error('IA :', e.status || '', e.message);
    throw err(502, e.status === 429 ? 'Le service IA est très sollicité, réessayez dans un instant.' : 'Le service IA est momentanément indisponible.');
  }
  ctx.user.aiCalls = (ctx.user.aiCalls || 0) + 1; db.settings.aiTotal = (db.settings.aiTotal || 0) + 1; store.save();
  return ok(r);
});

/* ---------- Authentification ---------- */
route('POST', '/api/auth/register', 'none', async ctx => {
  limit('reg:' + ctx.ip, 10, 3600e3);
  if (!db.settings.registrationOpen) throw err(403, 'Les inscriptions sont fermées pour le moment.');
  const name = str(ctx.body.name, 80), email = str(ctx.body.email, 254).toLowerCase(), pw = ctx.body.password;
  if (name.length < 2) throw err(400, 'Indiquez votre nom.');
  if (!isEmail(email)) throw err(400, 'Adresse email invalide.');
  if (!pwOk(pw)) throw err(400, PW_MSG);
  if (findByEmail(email)) throw err(409, 'Un compte existe déjà avec cet email.');
  const u = { id: store.uuid(), name, email, pw: hashPw(pw), role: 'user', verified: false, suspended: false, createdAt: now(), accessUntil: null, quotesCount: 0 };
  db.users.push(u);
  audit(u, 'inscription', u.email);
  if (!db.settings.requireVerification) { onVerified(u); startSession(ctx, u); store.save(); return ok({ user: publicUser(u) }); }
  const link = `${APP_URL()}/api/auth/verify?token=${newToken(u.id, 'verify', 24 * 3600e3)}`;
  await mail.send(email, `Confirmez votre adresse email — ${db.settings.siteName}`,
    `Bonjour ${name},\n\nBienvenue sur ${db.settings.siteName} ! Confirmez votre adresse email en cliquant sur ce lien (valable 24 heures) :\n\n${link}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez simplement ce message.`);
  store.save();
  return ok({ needsVerification: true, devLink: mail.configured() ? undefined : link });
});

route('GET', '/api/auth/verify', 'none', ctx => {
  const u = useToken(ctx.query.token, 'verify');
  if (!u) return { redirect: '/?verified=0' };
  onVerified(u); audit(u, 'email vérifié', u.email); store.save();
  return { redirect: '/?verified=1' };
});

route('POST', '/api/auth/resend', 'none', async ctx => {
  limit('resend:' + ctx.ip, 5, 3600e3);
  const u = findByEmail(str(ctx.body.email, 254));
  if (u && !u.verified && !u.suspended) {
    const link = `${APP_URL()}/api/auth/verify?token=${newToken(u.id, 'verify', 24 * 3600e3)}`;
    await mail.send(u.email, `Confirmez votre adresse email — ${db.settings.siteName}`, `Bonjour ${u.name},\n\nVoici votre nouveau lien de confirmation (valable 24 heures) :\n\n${link}`);
    return ok({ devLink: mail.configured() ? undefined : link });
  }
  return ok();
});

route('POST', '/api/auth/login', 'none', ctx => {
  const email = str(ctx.body.email, 254).toLowerCase();
  limit(`login:${ctx.ip}:${email}`, 8, 600e3);
  const u = findByEmail(email);
  if (!u || !checkPw(ctx.body.password, u.pw)) throw err(401, 'Email ou mot de passe incorrect.');
  if (u.suspended) throw err(403, 'Ce compte est suspendu. Contactez le support.');
  if (!u.verified) throw err(403, 'Confirmez d\'abord votre adresse email (lien reçu par email).', { code: 'unverified' });
  startSession(ctx, u);
  return ok({ user: publicUser(u), access: access(u) });
});

route('POST', '/api/auth/logout', 'none', ctx => {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(ctx.req.headers.cookie || '');
  if (m) { const h = sha(m[1]); db.sessions = db.sessions.filter(s => s.h !== h); store.save(); }
  ctx.setCookie = cookieHeader('', 0);
  return ok();
});

route('POST', '/api/auth/forgot', 'none', async ctx => {
  limit('forgot:' + ctx.ip, 6, 3600e3);
  const u = findByEmail(str(ctx.body.email, 254));
  let devLink;
  if (u && !u.suspended) {
    const link = `${APP_URL()}/?reset=${newToken(u.id, 'reset', 3600e3)}`;
    await mail.send(u.email, `Réinitialisation de votre mot de passe — ${db.settings.siteName}`,
      `Bonjour ${u.name},\n\nPour choisir un nouveau mot de passe, cliquez sur ce lien (valable 1 heure) :\n\n${link}\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.`);
    if (!mail.configured()) devLink = link;
  }
  return ok({ devLink });
});

route('POST', '/api/auth/reset', 'none', ctx => {
  limit('reset:' + ctx.ip, 10, 3600e3);
  if (!pwOk(ctx.body.password)) throw err(400, PW_MSG);
  const u = useToken(ctx.body.token, 'reset');
  if (!u) throw err(400, 'Lien invalide ou expiré. Refaites une demande.');
  u.pw = hashPw(ctx.body.password);
  if (!u.verified) onVerified(u);
  db.sessions = db.sessions.filter(s => s.userId !== u.id);
  audit(u, 'mot de passe réinitialisé', u.email); store.save();
  return ok();
});

route('GET', '/api/me', 'user', ctx => ({ user: publicUser(ctx.user), access: access(ctx.user) }));

route('PATCH', '/api/me', 'user', ctx => {
  const name = str(ctx.body.name, 80);
  if (name.length < 2) throw err(400, 'Indiquez votre nom.');
  ctx.user.name = name; store.save();
  return ok({ user: publicUser(ctx.user) });
});

const PREF_ENUMS = { mode: ['dark', 'light', 'auto'], bg: ['bronze', 'black', 'graphite', 'navy', 'forest'], radius: ['sharp', 'normal', 'round'], size: ['normal', 'large', 'xl'], density: ['comfortable', 'compact'], sound: ['on', 'off'], sfx: ['soft', 'crystal', 'pop', 'retro'], vol: ['low', 'mid', 'high'] };
route('PATCH', '/api/me/prefs', 'user', ctx => {
  const b = ctx.body || {}, cur = { ...(ctx.user.prefs || {}) };
  if (b.accent !== undefined) { if (b.accent !== '' && !/^#[0-9a-fA-F]{6}$/.test(String(b.accent))) throw err(400, 'Couleur invalide.'); cur.accent = b.accent; }
  for (const [k, list] of Object.entries(PREF_ENUMS)) if (b[k] !== undefined) { if (!list.includes(b[k])) throw err(400, 'Réglage invalide.'); cur[k] = b[k]; }
  ctx.user.prefs = cur; store.save();
  return ok({ prefs: cur });
});

route('POST', '/api/me/password', 'user', ctx => {
  limit('pw:' + ctx.user.id, 8, 600e3);
  if (!checkPw(ctx.body.current, ctx.user.pw)) throw err(400, 'Mot de passe actuel incorrect.');
  if (!pwOk(ctx.body.password)) throw err(400, PW_MSG);
  ctx.user.pw = hashPw(ctx.body.password);
  const cur = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(ctx.req.headers.cookie || '');
  db.sessions = db.sessions.filter(s => s.userId !== ctx.user.id || (cur && s.h === sha(cur[1])));
  audit(ctx.user, 'mot de passe modifié', ctx.user.email); store.save();
  return ok();
});

function deleteUser(u) {
  db.users = db.users.filter(x => x !== u);
  db.sessions = db.sessions.filter(s => s.userId !== u.id);
  db.tokens = db.tokens.filter(t => t.userId !== u.id);
  db.payments.forEach(p => { if (p.userId === u.id) p.userEmail = p.userEmail || u.email; });
  store.delUserData(u.id); store.save();
}
route('DELETE', '/api/me', 'user', ctx => {
  if (ctx.user.role === 'admin') throw err(400, 'Un compte administrateur ne peut pas se supprimer lui-même.');
  if (!checkPw(ctx.body.password, ctx.user.pw)) throw err(400, 'Mot de passe incorrect.');
  audit(ctx.user, 'compte supprimé', ctx.user.email);
  deleteUser(ctx.user);
  ctx.setCookie = cookieHeader('', 0);
  return ok();
});

/* ---------- Données de l'utilisateur ---------- */
route('GET', '/api/data', 'user', ctx => ({ data: store.getUserData(ctx.user.id) }));
route('PUT', '/api/data', 'user', ctx => {
  const a = access(ctx.user);
  if (!a.active) throw err(402, 'Un abonnement actif est nécessaire pour créer ou modifier des devis.', { code: 'payment_required' });
  const d = ctx.body;
  if (!d || typeof d !== 'object' || !Array.isArray(d.quotes) || !Array.isArray(d.clients)) throw err(400, 'Données invalides.');
  store.setUserData(ctx.user.id, d);
  ctx.user.quotesCount = d.quotes.filter(q => q && q.kind !== 'facture').length; ctx.user.dataAt = now(); store.save();
  return ok();
});

/* ---------- Abonnement & paiement ---------- */
const myPayments = u => db.payments.filter(p => p.userId === u.id && p.status !== 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

route('GET', '/api/billing', 'user', ctx => ({
  plans: db.plans.filter(p => p.active), payments: myPayments(ctx.user), access: access(ctx.user),
  stripe: !!stripeKey(), simulated: simulatedAllowed()
}));

route('POST', '/api/billing/checkout', 'user', async ctx => {
  limit('co:' + ctx.user.id, 20, 3600e3);
  const plan = db.plans.find(p => p.id === ctx.body.planId && p.active);
  if (!plan) throw err(400, 'Offre introuvable.');
  const p = { id: store.uuid(), userId: ctx.user.id, userEmail: ctx.user.email, planId: plan.id, planName: plan.name, amountCents: plan.priceCents,
    currency: 'eur', status: 'pending', provider: stripeKey() ? 'stripe' : 'simulated', createdAt: now() };
  db.payments.push(p);
  if (stripeKey()) {
    const s = await stripe('POST', '/checkout/sessions', {
      mode: 'payment', customer_email: ctx.user.email, client_reference_id: p.id,
      success_url: `${APP_URL()}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${APP_URL()}/?checkout=cancel`,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'eur', 'line_items[0][price_data][unit_amount]': String(plan.priceCents),
      'line_items[0][price_data][product_data][name]': `${db.settings.siteName} — ${plan.name}`,
      'metadata[paymentId]': p.id, 'metadata[userId]': ctx.user.id
    });
    p.providerRef = s.id; store.save();
    return ok({ url: s.url });
  }
  if (!simulatedAllowed()) { db.payments.pop(); throw err(503, 'Les paiements ne sont pas disponibles pour le moment. Contactez le support.'); }
  store.save();
  return ok({ simulate: { paymentId: p.id, amountCents: p.amountCents, planName: plan.name } });
});

route('POST', '/api/billing/simulate', 'user', ctx => {
  if (!simulatedAllowed()) throw err(403, 'Mode démo désactivé.');
  const p = db.payments.find(x => x.id === ctx.body.paymentId && x.userId === ctx.user.id && x.provider === 'simulated');
  if (!p || p.status !== 'pending') throw err(400, 'Paiement introuvable.');
  completePayment(p, { providerRef: 'demo_' + rnd(6) });
  return ok({ access: access(ctx.user), payment: p });
});

async function confirmStripeSession(sessionId) {
  const s = await stripe('GET', '/checkout/sessions/' + encodeURIComponent(sessionId));
  const p = db.payments.find(x => x.id === (s.metadata && s.metadata.paymentId));
  if (!p) throw err(404, 'Paiement introuvable.');
  if (s.payment_status === 'paid') completePayment(p, { paymentIntent: s.payment_intent });
  return p;
}
route('GET', '/api/billing/confirm', 'user', async ctx => {
  if (!stripeKey()) throw err(400, 'Stripe non configuré.');
  const p = await confirmStripeSession(str(ctx.query.session_id, 200));
  if (p.userId !== ctx.user.id) throw err(403, 'Paiement introuvable.');
  return ok({ status: p.status, access: access(ctx.user) });
});

route('POST', '/api/stripe/webhook', 'webhook', async ctx => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw err(400, 'Webhook non configuré.');
  const sig = Object.fromEntries(String(ctx.req.headers['stripe-signature'] || '').split(',').map(x => x.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(`${sig.t}.${ctx.raw}`).digest('hex');
  const good = sig.v1 && sig.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig.v1), Buffer.from(expected));
  if (!good || Math.abs(Date.now() / 1000 - Number(sig.t)) > 300) throw err(400, 'Signature invalide.');
  const ev = JSON.parse(ctx.raw);
  if (ev.type === 'checkout.session.completed' && ev.data.object.payment_status === 'paid') {
    const o = ev.data.object, p = db.payments.find(x => x.id === (o.metadata && o.metadata.paymentId));
    if (p) completePayment(p, { paymentIntent: o.payment_intent });
  }
  return ok();
});

function receiptHtml(p, u) {
  const site = escHtml(db.settings.siteName);
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Reçu ${escHtml(p.receiptNo)}</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:1.6rem}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}td:last-child,th:last-child{text-align:right}.tot td{font-weight:700;font-size:1.1rem}button{padding:8px 16px;margin-top:10px}@media print{button{display:none}}</style>
<h1>${site} — Reçu de paiement</h1>
<p><b>N° ${escHtml(p.receiptNo)}</b><br>Date : ${new Date(p.paidAt).toLocaleDateString('fr-FR')}<br>Client : ${escHtml(u ? u.name : '')} (${escHtml(u ? u.email : p.userEmail)})</p>
<table><tr><th>Désignation</th><th>Montant</th></tr>
<tr><td>Abonnement ${escHtml(p.planName)}${p.periodEnd ? ` — accès jusqu'au ${new Date(p.periodEnd).toLocaleDateString('fr-FR')}` : ''}</td><td>${money(p.amountCents)}</td></tr>
<tr class="tot"><td>Total payé</td><td>${money(p.amountCents)}</td></tr></table>
${p.status === 'refunded' ? '<p><b>Ce paiement a été remboursé.</b></p>' : ''}
<p style="color:#666">Mode de paiement : ${p.provider === 'stripe' ? 'Carte bancaire (Stripe)' : p.provider === 'manual' ? 'Paiement enregistré manuellement' : 'Démonstration'}</p>
<button onclick="print()">Imprimer</button></html>`;
}
route('GET', '/receipt/:id', 'user', ctx => {
  const p = db.payments.find(x => x.id === ctx.params.id);
  if (!p || p.status === 'pending' || (p.userId !== ctx.user.id && ctx.user.role !== 'admin')) throw err(404, 'Reçu introuvable.');
  return { html: receiptHtml(p, findUser(p.userId)) };
});

/* ---------- Administration ---------- */
const A = 'admin';
const adminRow = u => ({
  id: u.id, name: u.name, email: u.email, role: u.role, verified: u.verified, suspended: !!u.suspended, createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt || null, lastSeenAt: u.lastSeenAt || null, accessUntil: u.accessUntil || null, access: access(u),
  quotesCount: u.quotesCount || 0,
  paidCents: db.payments.filter(p => p.userId === u.id && p.status === 'paid' && p.provider !== 'simulated').reduce((s, p) => s + p.amountCents, 0)
});
const adminCount = () => db.users.filter(u => u.role === 'admin' && !u.suspended).length;
const target = ctx => { const u = findUser(ctx.params.id); if (!u) throw err(404, 'Utilisateur introuvable.'); return u; };

route('GET', '/api/admin/stats', A, () => {
  const paid = db.payments.filter(p => p.status === 'paid' && p.provider !== 'simulated');   // les paiements de démonstration ne comptent pas dans les revenus
  const t = Date.now(), d30 = t - 30 * 864e5, d7 = t - 7 * 864e5;
  const sum = l => l.reduce((s, p) => s + p.amountCents, 0);
  const activeSubs = db.users.filter(u => u.role !== 'admin' && access(u).active && u.accessSource === 'subscription');
  const mrr = activeSubs.reduce((s, u) => {
    const last = db.payments.filter(p => p.userId === u.id && p.status === 'paid').sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
    const plan = last && db.plans.find(x => x.id === last.planId);
    return s + (last ? (plan && plan.interval === 'year' ? last.amountCents / 12 : last.amountCents) : 0);
  }, 0);
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  return {
    users: db.users.length, verified: db.users.filter(u => u.verified).length, suspended: db.users.filter(u => u.suspended).length,
    activeAccess: db.users.filter(u => u.role !== 'admin' && access(u).active).length, activeSubs: activeSubs.length,
    newWeek: db.users.filter(u => new Date(u.createdAt) > d7).length,
    revenueTotal: sum(paid), revenue30: sum(paid.filter(p => new Date(p.paidAt) > d30)), mrr: Math.round(mrr),
    quotes: db.users.reduce((s, u) => s + (u.quotesCount || 0), 0),
    series: months.map(m => ({ month: m,
      revenue: sum(paid.filter(p => p.paidAt.startsWith(m))), signups: db.users.filter(u => u.createdAt.startsWith(m)).length })),
    recent: [...db.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(adminRow)
  };
});

route('GET', '/api/admin/users', A, ctx => {
  const q = str(ctx.query.q, 100).toLowerCase(), f = ctx.query.filter || '';
  let rows = db.users.map(adminRow).filter(u => (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)) && (
    !f || (f === 'active' && u.access.active && u.role !== 'admin') || (f === 'inactive' && !u.access.active && !u.suspended) ||
    (f === 'suspended' && u.suspended) || (f === 'unverified' && !u.verified) || (f === 'admin' && u.role === 'admin')));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = Math.max(1, parseInt(ctx.query.page, 10) || 1), size = 20;
  return { total: rows.length, page, size, rows: rows.slice((page - 1) * size, page * size) };
});

route('POST', '/api/admin/users', A, ctx => {
  const name = str(ctx.body.name, 80), email = str(ctx.body.email, 254).toLowerCase(), pw = ctx.body.password;
  if (name.length < 2 || !isEmail(email)) throw err(400, 'Nom et email valides requis.');
  if (!pwOk(pw)) throw err(400, PW_MSG);
  if (findByEmail(email)) throw err(409, 'Un compte existe déjà avec cet email.');
  const role = ctx.body.role === 'admin' ? 'admin' : 'user';
  const u = { id: store.uuid(), name, email, pw: hashPw(pw), role, verified: true, suspended: false, createdAt: now(), accessUntil: null, quotesCount: 0, trialGiven: true };
  const days = parseInt(ctx.body.days, 10);
  if (days > 0) extendAccess(u, { days }, 'gift');
  db.users.push(u); audit(ctx.user, 'création utilisateur', email, `rôle ${role}${days > 0 ? `, ${days} j offerts` : ''}`);
  return ok({ user: adminRow(u) });
});

route('GET', '/api/admin/users/:id', A, ctx => {
  const u = target(ctx);
  return { user: adminRow(u), payments: db.payments.filter(p => p.userId === u.id && p.status !== 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    sessions: db.sessions.filter(s => s.userId === u.id).map(s => ({ at: s.at, ip: s.ip, ua: s.ua })),
    history: db.audit.filter(a => a.target === u.email).slice(0, 15) };
});

route('PATCH', '/api/admin/users/:id', A, ctx => {
  const u = target(ctx), b = ctx.body, self = u.id === ctx.user.id, changes = [];
  if (b.name !== undefined) { const n = str(b.name, 80); if (n.length < 2) throw err(400, 'Nom invalide.'); if (n !== u.name) { u.name = n; changes.push('nom'); } }
  if (b.email !== undefined) {
    const e = str(b.email, 254).toLowerCase();
    if (!isEmail(e)) throw err(400, 'Email invalide.');
    if (e !== u.email) { if (findByEmail(e)) throw err(409, 'Cet email est déjà utilisé.'); u.email = e; changes.push('email'); }
  }
  if (b.role !== undefined && b.role !== u.role) {
    if (self) throw err(400, 'Vous ne pouvez pas modifier votre propre rôle.');
    if (u.role === 'admin' && adminCount() <= 1) throw err(400, 'Il doit rester au moins un administrateur.');
    u.role = b.role === 'admin' ? 'admin' : 'user'; changes.push('rôle → ' + u.role);
  }
  if (b.suspended !== undefined && !!b.suspended !== !!u.suspended) {
    if (self) throw err(400, 'Vous ne pouvez pas suspendre votre propre compte.');
    if (b.suspended && u.role === 'admin' && adminCount() <= 1) throw err(400, 'Il doit rester au moins un administrateur actif.');
    u.suspended = !!b.suspended; changes.push(u.suspended ? 'suspendu' : 'réactivé');
    if (u.suspended) db.sessions = db.sessions.filter(s => s.userId !== u.id);
  }
  if (b.verified === true && !u.verified) { onVerified(u); changes.push('email vérifié'); }
  if (changes.length) audit(ctx.user, 'modification utilisateur', u.email, changes.join(', '));
  store.save();
  return ok({ user: adminRow(u) });
});

route('POST', '/api/admin/users/:id/grant', A, ctx => {
  const u = target(ctx), days = parseInt(ctx.body.days, 10);
  if (!(days > 0 && days <= 3650)) throw err(400, 'Nombre de jours invalide (1 à 3650).');
  const until = extendAccess(u, { days }, 'gift');
  audit(ctx.user, 'accès offert', u.email, `${days} jours → ${until.slice(0, 10)}${ctx.body.note ? ' — ' + str(ctx.body.note, 120) : ''}`);
  return ok({ user: adminRow(u) });
});
route('POST', '/api/admin/users/:id/revoke', A, ctx => {
  const u = target(ctx);
  u.accessUntil = now(); audit(ctx.user, 'accès révoqué', u.email); store.save();
  return ok({ user: adminRow(u) });
});
route('POST', '/api/admin/users/:id/reset-link', A, async ctx => {
  const u = target(ctx), link = `${APP_URL()}/?reset=${newToken(u.id, 'reset', 3600e3)}`;
  await mail.send(u.email, `Réinitialisation de votre mot de passe — ${db.settings.siteName}`, `Bonjour ${u.name},\n\nUn administrateur a demandé la réinitialisation de votre mot de passe. Choisissez-en un nouveau (lien valable 1 heure) :\n\n${link}`);
  audit(ctx.user, 'lien de réinitialisation envoyé', u.email);
  return ok({ devLink: mail.configured() ? undefined : link });
});
route('POST', '/api/admin/users/:id/logout', A, ctx => {
  const u = target(ctx); db.sessions = db.sessions.filter(s => s.userId !== u.id);
  audit(ctx.user, 'sessions fermées', u.email); store.save(); return ok();
});
route('DELETE', '/api/admin/users/:id', A, ctx => {
  const u = target(ctx);
  if (u.id === ctx.user.id) throw err(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  if (u.role === 'admin' && adminCount() <= 1) throw err(400, 'Il doit rester au moins un administrateur.');
  audit(ctx.user, 'utilisateur supprimé', u.email); deleteUser(u);
  return ok();
});

route('GET', '/api/admin/payments', A, ctx => {
  const q = str(ctx.query.q, 100).toLowerCase(), st = ctx.query.status || '';
  const rows = db.payments.filter(p => p.status !== 'pending' || st === 'pending')
    .filter(p => (!st || p.status === st) && (!q || (p.userEmail || '').toLowerCase().includes(q) || (p.receiptNo || '').toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500)
    .map(p => ({ ...p, userEmail: (findUser(p.userId) || {}).email || p.userEmail }));
  return { rows };
});
route('POST', '/api/admin/payments', A, ctx => {
  const u = findUser(ctx.body.userId); if (!u) throw err(400, 'Utilisateur introuvable.');
  const plan = db.plans.find(p => p.id === ctx.body.planId);
  const amountCents = Math.round(Number(ctx.body.amount) * 100);
  if (!(amountCents >= 0 && amountCents < 1e7)) throw err(400, 'Montant invalide.');
  const days = plan ? 0 : parseInt(ctx.body.days, 10) || 30;
  const p = { id: store.uuid(), userId: u.id, userEmail: u.email, planId: plan ? plan.id : '', planName: plan ? plan.name : 'Paiement manuel', amountCents,
    currency: 'eur', status: 'pending', provider: 'manual', createdAt: now(), note: str(ctx.body.note, 200), days };
  db.payments.push(p); completePayment(p);
  audit(ctx.user, 'paiement manuel', u.email, money(amountCents));
  return ok({ payment: p });
});
route('POST', '/api/admin/payments/:id/refund', A, async ctx => {
  const p = db.payments.find(x => x.id === ctx.params.id);
  if (!p || p.status !== 'paid') throw err(400, 'Seuls les paiements réglés peuvent être remboursés.');
  if (p.provider === 'stripe' && p.paymentIntent && stripeKey()) await stripe('POST', '/refunds', { payment_intent: p.paymentIntent });
  p.status = 'refunded'; p.refundedAt = now();
  const u = findUser(p.userId);
  if (u && ctx.body.revoke) u.accessUntil = now();
  audit(ctx.user, 'remboursement', p.userEmail, `${money(p.amountCents)} (${p.receiptNo})${ctx.body.revoke ? ' + accès révoqué' : ''}`);
  store.save();
  return ok({ payment: p });
});

const planFrom = (b, base = {}) => {
  const name = str(b.name, 60), price = Math.round(Number(b.price) * 100);
  if (!name) throw err(400, 'Nom de l\'offre requis.');
  if (!(price >= 50 && price < 1e7)) throw err(400, 'Prix invalide (minimum 0,50 €).');
  return { ...base, name, priceCents: price, interval: b.interval === 'year' ? 'year' : 'month', description: str(b.description, 160),
    features: String(b.features || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12), active: !!b.active };
};
route('GET', '/api/admin/plans', A, () => ({ plans: db.plans }));
route('POST', '/api/admin/plans', A, ctx => {
  const p = planFrom(ctx.body, { id: 'p_' + rnd(4) }); db.plans.push(p);
  audit(ctx.user, 'offre créée', p.name); store.save(); return ok({ plan: p });
});
route('PATCH', '/api/admin/plans/:id', A, ctx => {
  const i = db.plans.findIndex(p => p.id === ctx.params.id); if (i < 0) throw err(404, 'Offre introuvable.');
  db.plans[i] = planFrom(ctx.body, db.plans[i]); audit(ctx.user, 'offre modifiée', db.plans[i].name); store.save(); return ok({ plan: db.plans[i] });
});
route('DELETE', '/api/admin/plans/:id', A, ctx => {
  const p = db.plans.find(x => x.id === ctx.params.id); if (!p) throw err(404, 'Offre introuvable.');
  db.plans = db.plans.filter(x => x !== p); audit(ctx.user, 'offre supprimée', p.name); store.save(); return ok();
});

route('GET', '/api/admin/settings', A, () => ({
  settings: db.settings, env: { ai: ai.available(), aiModel: ai.model(), aiTotal: db.settings.aiTotal || 0, mail: mail.configured(), stripe: !!stripeKey(), webhook: !!process.env.STRIPE_WEBHOOK_SECRET, simulated: simulatedAllowed(), appUrl: APP_URL() }
}));
route('PATCH', '/api/admin/settings', A, ctx => {
  const b = ctx.body, s = db.settings;
  if (b.siteName !== undefined) s.siteName = str(b.siteName, 60) || 'OptiDevis';
  if (b.trialDays !== undefined) s.trialDays = Math.max(0, Math.min(365, parseInt(b.trialDays, 10) || 0));
  if (b.registrationOpen !== undefined) s.registrationOpen = !!b.registrationOpen;
  if (b.requireVerification !== undefined) s.requireVerification = !!b.requireVerification;
  if (b.supportEmail !== undefined) s.supportEmail = str(b.supportEmail, 254);
  if (b.aiEnabled !== undefined) s.aiEnabled = !!b.aiEnabled;
  audit(ctx.user, 'réglages modifiés', '', Object.keys(b).join(', ')); store.save();
  return ok({ settings: s });
});
route('GET', '/api/admin/audit', A, () => ({ rows: db.audit.slice(0, 300) }));
route('GET', '/api/admin/outbox', A, () => ({ rows: db.outbox.slice(0, 100), configured: mail.configured() }));

/* ---------- Tâches de fond & amorçage ---------- */
function reminders() {
  const soon = Date.now() + 3 * 864e5;
  for (const u of db.users) {
    if (u.role === 'admin' || u.suspended || !u.accessUntil) continue;
    const t = new Date(u.accessUntil).getTime();
    if (t > Date.now() && t < soon && db.reminders[u.id] !== u.accessUntil) {
      db.reminders[u.id] = u.accessUntil;
      mail.send(u.email, `Votre accès expire bientôt — ${db.settings.siteName}`,
        `Bonjour ${u.name},\n\nVotre accès expire le ${new Date(u.accessUntil).toLocaleDateString('fr-FR')}. Renouvelez-le pour continuer à créer vos devis :\n\n${APP_URL()}/\n\nVos données sont conservées.`);
      store.save();
    }
  }
}
setInterval(reminders, 3600e3).unref();

function seedAdmin() {
  if (db.users.some(u => u.role === 'admin')) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@localhost.fr').toLowerCase();
  const generated = !process.env.ADMIN_PASSWORD;
  const pw = process.env.ADMIN_PASSWORD || rnd(6) + 'A1';
  db.users.push({ id: store.uuid(), name: 'Administrateur', email, pw: hashPw(pw), role: 'admin', verified: true, suspended: false, createdAt: now(), accessUntil: null, quotesCount: 0 });
  store.save();
  console.log('\n┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Compte ADMINISTRATEUR créé                                  │');
  console.log(`│  Email        : ${email.padEnd(45)}│`);
  console.log(`│  Mot de passe : ${pw.padEnd(45)}│`);
  if (generated) console.log('│  (généré automatiquement, changez-le dans « Mon compte »)    │');
  console.log('└──────────────────────────────────────────────────────────────┘\n');
}

module.exports = { handle, seedAdmin, reminders, shoppingOffers };
