const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DATA, readJSON } = require('./store');

const COOKIE = 'ap_session';
const SESSION_MS = 12 * 60 * 60 * 1000;

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA, 'secret.txt');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch {}
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SECRET = secret();

function getAdmin() {
  if (process.env.ADMIN_EMAIL && (process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD)) {
    return {
      email: process.env.ADMIN_EMAIL,
      hash: process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12),
    };
  }
  return readJSON('admin.json', null);
}
let cached = null;
function admin() { return (cached = cached || getAdmin()); }
function reloadAdmin() { cached = null; }

const DUMMY = bcrypt.hashSync('dummy-password-for-timing', 12);
const sha = s => crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest();

async function verify(email, password) {
  const a = admin();
  const emailOk = a ? crypto.timingSafeEqual(sha(email), sha(a.email)) : false;
  const pwOk = await bcrypt.compare(String(password || ''), a ? a.hash : DUMMY);
  return Boolean(a && emailOk && pwOk);
}

const sign = p => crypto.createHmac('sha256', SECRET).update(p).digest('hex');
function makeToken() {
  const p = 'admin.' + (Date.now() + SESSION_MS);
  return p + '.' + sign(p);
}
function checkToken(t) {
  if (!t) return false;
  const parts = t.split('.');
  if (parts.length !== 3) return false;
  const p = parts[0] + '.' + parts[1];
  const a = Buffer.from(sign(p)), b = Buffer.from(parts[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && parts[0] === 'admin' && Number(parts[1]) > Date.now();
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function setSession(req, res) {
  const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// middleware
function attach(req, res, next) {
  req.isAdmin = checkToken(cookies(req)[COOKIE]);
  next();
}
function requireAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(401).json({ error: 'Non connecté' });
  if (req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'Requête refusée' });
  next();
}

// limiteur de tentatives de connexion : 8 essais / 15 min / IP
const attempts = new Map();
function loginLimiter(req, res, next) {
  const now = Date.now(), win = 15 * 60 * 1000;
  const rec = (attempts.get(req.ip) || []).filter(t => now - t < win);
  if (rec.length >= 8) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  rec.push(now);
  attempts.set(req.ip, rec);
  next();
}
function resetAttempts(ip) { attempts.delete(ip); }

module.exports = { verify, setSession, clearSession, attach, requireAdmin, loginLimiter, resetAttempts, reloadAdmin, admin };
