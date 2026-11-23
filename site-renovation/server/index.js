const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS, readJSON, writeJSON } = require('./store');
const settings = require('./settings');
const stats = require('./stats');
const publicApi = require('./api-public');
const adminApi = require('./api-admin');
const reminders = require('./reminders');
const auth = require('./auth');
const { process: processPage, sanitize, faqJsonLd } = require('./render');

const PUBLIC = path.join(__dirname, '..', 'public');
const VIEWS = path.join(__dirname, 'views');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(auth.attach);
app.use(express.json({ limit: '1mb' }));

// ---------- pages
const pages = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'));
const rawPages = {};
pages.forEach(f => { rawPages[f] = fs.readFileSync(path.join(PUBLIC, f), 'utf8'); });

/* une réalisation = un chantier : plusieurs photos (la première sert de couverture), titre, catégorie, description */
const normReal = it => ({ ...it, photos: Array.isArray(it.photos) && it.photos.length ? it.photos : (it.file ? [it.file] : []), category: it.category || '' });
const getRealisations = () => readJSON('realisations.json', []).map(normReal).filter(it => it.photos.length);
const getOverrides = () => readJSON('content.json', { global: {}, pages: {} });

/* chaque démarrage (donc chaque mise à jour) change la version des scripts et feuilles de style :
   le navigateur recharge les nouveaux fichiers au lieu de garder les anciens en cache */
const VERSION = Date.now().toString(36);
const versioned = html => html.replace(/(\s(?:src|href)=")((?!https?:|\/\/)[^"?#]+\.(?:js|css))"/g, `$1$2?v=${VERSION}"`);
const sendView = (res, name) => { res.setHeader('Cache-Control', 'no-store'); res.type('html').send(versioned(fs.readFileSync(path.join(VIEWS, name), 'utf8'))); };
function sendPage(file) {
  return (req, res) => {
    const admin = req.isAdmin;
    const st = settings.get();
    const { $ } = processPage(rawPages[file], {
      admin, page: file, overrides: getOverrides(),
      extras: { announce: st.announcement, reviews: readJSON('reviews.json', []), googleUrl: st.reviews.googleUrl, socials: st.socials, page: file, hasDoc: fs.existsSync(publicApi.DOC) },
      gallery: file === 'realisations.html' ? getRealisations() : null,
    });
    if (file === 'faq.html') faqJsonLd($);
    res.setHeader('Cache-Control', admin ? 'no-store' : 'no-cache');
    stats.view(req, file === 'index.html' ? '/' : '/' + file);
    res.type('html').send(versioned($.html()));
  };
}
pages.forEach(f => app.get('/' + f, sendPage(f)));
app.get('/', sendPage('index.html'));

// ---------- API publique (devis, rendez-vous, statistiques) et administration
app.use('/api/admin', adminApi.router);
app.use('/api', publicApi.router);
app.get('/attestation-decennale.pdf', publicApi.docRoute);

// ---------- connexion
app.get('/admin', (req, res) => {
  if (req.isAdmin) return res.redirect('/');
  res.setHeader('Cache-Control', 'no-store');
  sendView(res, 'login.html');
});
app.get('/admin/tableau-de-bord', (req, res) => {
  if (!req.isAdmin) return res.redirect('/admin');
  res.setHeader('Cache-Control', 'no-store');
  sendView(res, 'dashboard.html');
});
app.get('/admin/qr-print', async (req, res) => {
  if (!req.isAdmin) return res.redirect('/admin');
  const QRCode = require('qrcode');
  const url = adminApi.qrTarget(req);
  if (!url) return res.status(400).type('text').send('Lien manquant : renseignez vos avis Google dans le tableau de bord.');
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#10151d', light: '#ffffff' } });
  const labels = { devis: 'Demandez votre devis gratuit', rdv: 'Prenez rendez-vous', avis: 'Laissez-nous un avis' };
  const label = labels[req.query.target] || 'Découvrez notre site';
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>QR code | PA Rénovation</title><link rel="stylesheet" href="/admin/print.css"></head><body><main class="poster"><img class="plogo" src="/images/logo.png" alt="PA Rénovation"><h1>${label}</h1><div class="qr">${svg}</div><p class="scan">Scannez avec l'appareil photo de votre téléphone</p><p class="tel">07 89 58 02 24</p><p class="mail">aydenpuche@gmail.com</p><p class="noprint"><button id="go">Imprimer</button></p></main><script src="/admin/print.js"></script></body></html>`);
});
app.post('/api/login', auth.loginLimiter, async (req, res) => {
  if (req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'Requête refusée' });
  const { email, password } = req.body || {};
  if (await auth.verify(email, password)) {
    auth.resetAttempts(req.ip);
    auth.setSession(req, res);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
});
app.post('/api/logout', (req, res) => { auth.clearSession(res); res.json({ ok: true }); });

// ---------- images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
async function saveImage(buf) {
  const out = await sharp(buf, { failOn: 'error' }).rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer();
  const name = crypto.randomBytes(10).toString('hex') + '.webp';
  fs.writeFileSync(path.join(UPLOADS, name), out);
  return '/uploads/' + name;
}
app.post('/api/upload', auth.requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image valide reçue.' });
  try { res.json({ url: await saveImage(req.file.buffer) }); }
  catch { res.status(400).json({ error: 'Image illisible.' }); }
});

// ---------- modification des textes / images du site
app.post('/api/content', auth.requireAdmin, (req, res) => {
  const { page, text = {}, img = {} } = req.body || {};
  if (!rawPages[page]) return res.status(400).json({ error: 'Page inconnue' });
  const { texts, imgs } = processPage(rawPages[page], { page });
  const data = getOverrides();
  data.global = data.global || {}; data.pages = data.pages || {}; data.pages[page] = data.pages[page] || {};
  const bucket = key => (key[0] === 'g' ? data.global : data.pages[page]);

  for (const [key, html] of Object.entries(text)) {
    if (!(key in texts) || typeof html !== 'string' || html.length > 5000) continue;
    const clean = sanitize(html);
    if (clean === texts[key]) delete bucket(key)[key];
    else bucket(key)[key] = { o: texts[key], v: clean };
  }
  for (const [key, url] of Object.entries(img)) {
    if (!(key in imgs) || typeof url !== 'string') continue;
    if (url === imgs[key]) delete bucket(key)[key];
    else if (/^\/(uploads|images)\/[\w.\-]+$/.test(url)) bucket(key)[key] = { o: imgs[key], v: url };
  }
  writeJSON('content.json', data);
  res.json({ ok: true });
});

// ---------- réalisations
const newId = () => crypto.randomBytes(6).toString('hex');
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

app.post('/api/realisations', auth.requireAdmin, upload.array('files', 30), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Aucune image valide reçue.' });
  const list = getRealisations();
  const files = [];
  for (const f of req.files) { try { files.push(await saveImage(f.buffer)); } catch {} }
  if (!files.length) return res.status(400).json({ error: 'Images illisibles.' });
  const target = req.body.projectId && list.find(x => x.id === req.body.projectId);
  if (target) { target.photos = target.photos.concat(files).slice(0, 40); target.file = target.photos[0]; writeJSON('realisations.json', list); return res.json({ ok: true, id: target.id, count: files.length }); }
  const it = { id: newId(), photos: files, file: files[0], title: clip(req.body.title, 120), category: clip(req.body.category, 60), description: clip(req.body.description, 4000), created: new Date().toISOString() };
  writeJSON('realisations.json', [it].concat(list));
  res.json({ ok: true, id: it.id, count: files.length });
});
app.patch('/api/realisations/:id', auth.requireAdmin, (req, res) => {
  const list = getRealisations();
  const it = list.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ error: 'Introuvable' });
  if ('title' in req.body) it.title = clip(req.body.title, 120).trim();
  if ('description' in req.body) it.description = clip(req.body.description, 4000).trim();
  if ('category' in req.body) it.category = clip(req.body.category, 60).trim();
  if (req.body.coverPhoto && it.photos.includes(req.body.coverPhoto)) it.photos = [req.body.coverPhoto].concat(it.photos.filter(p => p !== req.body.coverPhoto));
  if (req.body.removePhoto && it.photos.includes(req.body.removePhoto)) {
    if (it.photos.length === 1) return res.status(400).json({ error: 'Une réalisation garde au moins une photo : supprimez la réalisation entière.' });
    it.photos = it.photos.filter(p => p !== req.body.removePhoto);
    fs.rm(path.join(UPLOADS, path.basename(req.body.removePhoto)), { force: true }, () => {});
  }
  it.file = it.photos[0];
  writeJSON('realisations.json', list);
  res.json({ ok: true });
});
app.delete('/api/realisations/:id', auth.requireAdmin, (req, res) => {
  const list = getRealisations();
  const it = list.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ error: 'Introuvable' });
  writeJSON('realisations.json', list.filter(x => x !== it));
  it.photos.forEach(p => fs.rm(path.join(UPLOADS, path.basename(p)), { force: true }, () => {}));
  res.json({ ok: true });
});
app.post('/api/realisations/move', auth.requireAdmin, (req, res) => {
  const { id, dir } = req.body || {};
  const list = getRealisations();
  const i = list.findIndex(x => x.id === id), j = i + (dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return res.json({ ok: true });
  [list[i], list[j]] = [list[j], list[i]];
  writeJSON('realisations.json', list);
  res.json({ ok: true });
});

// ---------- fichiers statiques
app.use('/uploads', express.static(UPLOADS, { maxAge: '30d', immutable: true, index: false, fallthrough: false }));
app.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));
app.use((req, res) => res.status(404).type('text').send('Page introuvable'));
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(err.status || 500).json({ error: 'Erreur serveur' });
  res.status(err.status || 500).type('text').send('Erreur');
});

reminders.start();
app.listen(PORT, process.env.HOST || undefined, () => {   // HOST=127.0.0.1 : accessible uniquement via le serveur web (Caddy)
  console.log(`Site PA Rénovation : http://localhost:${PORT}`);
  if (!auth.admin()) console.log('Aucun compte admin : lancez « npm run set-admin ».');
});
