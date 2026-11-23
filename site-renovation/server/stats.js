// Statistiques de visite sans cookie : aucune adresse IP n'est conservée
const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');

let data = readJSON('stats.json', { days: {} });
let dirty = false;
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|curl|wget|python|scrapy|lighthouse|facebookexternalhit/i;
const SECRET = require('crypto').createHash('sha256').update(String(process.env.SESSION_SECRET || 'ap-stats') + __dirname).digest('hex');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
function day(d) {
  return (data.days[d] = data.days[d] || { v: 0, u: 0, p: {}, r: {}, c: 0, m: 0, d: { mobile: 0, desktop: 0 }, f: 0, h: [] });
}
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };

function source(req) {
  if (req.query && req.query.src === 'qr') return 'QR code';
  const ref = req.get('referer');
  if (!ref) return 'Accès direct';
  let host; try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch { return 'Accès direct'; }
  if (host === req.hostname) return null;
  if (/google\./.test(host)) return 'Google';
  if (/bing\.|duckduckgo|qwant|ecosia|yahoo\./.test(host)) return 'Autre moteur de recherche';
  if (/facebook|fb\.com|instagram/.test(host)) return 'Facebook / Instagram';
  return host.slice(0, 60);
}

function view(req, page) {
  const ua = req.get('user-agent') || '';
  if (req.isAdmin || BOT.test(ua) || req.get('dnt') === '1') return;
  const t = today(), s = day(t);
  s.v++;
  inc(s.p, page);
  const src = source(req);
  if (src) inc(s.r, src);
  const id = crypto.createHmac('sha256', SECRET + t).update((req.ip || '') + ua).digest('hex').slice(0, 12);
  if (!s.h.includes(id)) { s.h.push(id); s.u++; inc(s.d, /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop'); }
  dirty = true;
}
function event(type) {
  const s = day(today());
  if (type === 'call') s.c++;
  else if (type === 'mail') s.m++;
  else if (type === 'form') s.f++;
  else return;
  dirty = true;
}
function flush() {
  if (!dirty) return;
  const keys = Object.keys(data.days).sort();
  keys.slice(0, Math.max(0, keys.length - 400)).forEach(k => delete data.days[k]);
  keys.slice(0, -1).forEach(k => { if (data.days[k]) data.days[k].h = []; }); // on ne garde les empreintes que pour le jour en cours
  writeJSON('stats.json', data);
  dirty = false;
}
setInterval(flush, 30000).unref();
['exit', 'SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => { flush(); if (s !== 'exit') process.exit(0); }));

function summary(n) {
  n = Math.min(Math.max(parseInt(n, 10) || 30, 1), 365);
  const out = { days: [], views: 0, visitors: 0, calls: 0, mails: 0, forms: 0, pages: {}, sources: {}, devices: { mobile: 0, desktop: 0 } };
  const d = new Date(today() + 'T12:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d); x.setUTCDate(x.getUTCDate() - i);
    const k = x.toISOString().slice(0, 10), s = data.days[k] || { v: 0, u: 0, p: {}, r: {}, c: 0, m: 0, f: 0, d: { mobile: 0, desktop: 0 } };
    out.days.push({ date: k, views: s.v, visitors: s.u, calls: s.c });
    out.views += s.v; out.visitors += s.u; out.calls += s.c; out.mails += s.m || 0; out.forms += s.f || 0;
    Object.entries(s.p).forEach(([a, b]) => { out.pages[a] = (out.pages[a] || 0) + b; });
    Object.entries(s.r).forEach(([a, b]) => { out.sources[a] = (out.sources[a] || 0) + b; });
    out.devices.mobile += s.d.mobile || 0; out.devices.desktop += s.d.desktop || 0;
  }
  return out;
}
module.exports = { view, event, summary, flush };
