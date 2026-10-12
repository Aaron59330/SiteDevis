'use strict';
/* Personnalisation de l'interface : couleur, mode, fond, formes, taille du texte, densité (par compte, sur tous les appareils). */
const ACCENTS = [['', 'Neutre'], ['#3b82f6', 'Bleu'], ['#6366f1', 'Indigo'], ['#8b5cf6', 'Violet'], ['#ec4899', 'Rose'], ['#ef4444', 'Rouge'], ['#f97316', 'Orange'], ['#f59e0b', 'Ambre'], ['#22c55e', 'Vert'], ['#14b8a6', 'Turquoise'], ['#06b6d4', 'Cyan']];
const DOC_COLORS = ['#26323f', '#1e3a5f', '#0f766e', '#166534', '#7c2d12', '#9f1239', '#4c1d95', '#111111'];
const BGS = [['black', 'Noir', '#070707'], ['graphite', 'Anthracite', '#131417'], ['navy', 'Bleu nuit', '#0a1020'], ['forest', 'Vert forêt', '#0a120e']];
let prefTimer;
const curPrefs = () => window.currentPrefs || PREF_DEFAULTS;
const prefsBody = p => ({ accent: p.accent || '', mode: p.mode, bg: p.bg, radius: p.radius, size: p.size, density: p.density });
function hexLum(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map((v, i) => { v /= 255; v = v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); return v * [0.2126, 0.7152, 0.0722][i]; }).reduce((a, b) => a + b, 0); }

function savePrefs(patch) {
  const p = Object.assign({}, curPrefs(), patch);
  applyPrefs(p);
  try { localStorage.setItem('sitedevis.prefs', JSON.stringify(prefsBody(p))); } catch (e) { /* ignore */ }
  syncThemeBtn();
  if (session.user) { clearTimeout(prefTimer); prefTimer = setTimeout(() => api('PATCH', '/api/me/prefs', prefsBody(p)).catch(() => {}), 500); }
  if (view === 'custom') markPrefs();
}
function initPrefs(server) {
  let local = null; try { local = JSON.parse(localStorage.getItem('sitedevis.prefs') || 'null'); } catch (e) { /* ignore */ }
  const p = server ? Object.assign({}, PREF_DEFAULTS, server) : local;
  if (p) { applyPrefs(p); try { localStorage.setItem('sitedevis.prefs', JSON.stringify(prefsBody(curPrefs()))); } catch (e) { /* ignore */ } }
  if (!server && local) api('PATCH', '/api/me/prefs', prefsBody(curPrefs())).catch(() => {});
  syncThemeBtn();
}

const optBtn = (k, v, label) => `<button class="opt" data-act="pref" data-k="${k}" data-v="${v}">${label}</button>`;
EXTRA.custom = function renderCustom() {
  const p = curPrefs(), canDoc = session.access.active;
  return `<h1>Personnalisation</h1>
  <p class="muted" style="margin-top:0">Choisissez les couleurs et l'apparence de votre interface. Ces réglages sont enregistrés sur votre compte et s'appliquent sur tous vos appareils.</p>
  <div class="pref-grid">
    <div class="card"><h2>Couleur principale</h2>
      <p class="muted" style="margin-top:0">Boutons, onglets actifs, éléments mis en avant.</p>
      <div class="swatches" id="swatches">${ACCENTS.map(([c, n]) => `<button class="sw ${c ? '' : 'neutral'}" ${c ? `style="background:${c}"` : ''} data-act="pref" data-k="accent" data-v="${c}" title="${n}" aria-label="${n}">✓</button>`).join('')}
        <label class="sw" id="swCustom" style="background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red);overflow:hidden;position:relative" title="Couleur personnalisée"><input type="color" id="prefColor" value="${/^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : '#3b82f6'}" style="position:absolute;inset:-8px;width:60px;height:60px;opacity:0;cursor:pointer"></label></div>
      <p class="muted" id="prefWarn" style="font-size:.82rem;margin:12px 0 0"></p></div>

    <div class="card"><h2>Mode d'affichage</h2>
      <div class="optrow">${optBtn('mode', 'dark', 'Sombre')}${optBtn('mode', 'light', 'Clair')}${optBtn('mode', 'auto', 'Automatique')}</div>
      <p class="muted" style="font-size:.82rem;margin:8px 0 14px">« Automatique » suit le réglage de votre téléphone ou de votre ordinateur.</p>
      <label style="margin-bottom:8px">Fond (mode sombre)</label>
      <div class="swatches">${BGS.map(([k, n, c]) => `<button class="bgsw" style="background:${c}" data-act="pref" data-k="bg" data-v="${k}" title="${n}" aria-label="${n}"></button>`).join('')}</div></div>

    <div class="card"><h2>Formes et confort</h2>
      <label>Arrondis</label><div class="optrow" style="margin-bottom:14px">${optBtn('radius', 'sharp', 'Carrés')}${optBtn('radius', 'normal', 'Normaux')}${optBtn('radius', 'round', 'Très arrondis')}</div>
      <label>Taille du texte</label><div class="optrow" style="margin-bottom:14px">${optBtn('size', 'normal', 'Normale')}${optBtn('size', 'large', 'Grande')}${optBtn('size', 'xl', 'Très grande')}</div>
      <label>Densité</label><div class="optrow">${optBtn('density', 'comfortable', 'Confortable')}${optBtn('density', 'compact', 'Compacte')}</div></div>

    <div class="card"><h2>Couleur de vos devis et factures</h2>
      <p class="muted" style="margin-top:0">Titres et accents des documents PDF envoyés à vos clients.${canDoc ? '' : ' (Modifiable avec un abonnement actif.)'}</p>
      <div class="swatches" id="docSw">${DOC_COLORS.map(c => `<button class="sw" style="background:${c}" data-act="doc-color" data-v="${c}" ${canDoc ? '' : 'disabled'} aria-label="${c}">✓</button>`).join('')}
        <input type="color" id="docColor" value="${esc(db.company.accent || '#26323f')}" ${canDoc ? '' : 'disabled'} style="width:44px;height:40px;padding:2px"></div></div>

    <div class="card" style="grid-column:1 / -1"><h2>Aperçu</h2>
      <div class="preview-box"><div class="row">
        <button class="btn primary" type="button">Bouton principal</button><button class="btn" type="button">Bouton secondaire</button>
        <span class="badge accepte">Accepté</span><span class="badge envoye">Envoyé</span><span class="badge brouillon">Brouillon</span>
        <button class="cchip on" type="button">Filtre actif <i>3</i></button><button class="cchip" type="button">Filtre</button></div>
        <div class="grid3" style="margin-top:14px"><div class="field"><label>Champ de saisie</label><input value="Exemple de texte"></div>
          <div class="stat" style="width:auto"><div class="n">1 250,00 €</div><div class="l">Exemple de statistique</div></div>
          <div class="field"><label>Liste</label><select><option>Option</option></select></div></div></div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-act="pref-reset">Réinitialiser l'apparence</button></div></div>
  </div>`;
};
AFTER.custom = () => markPrefs();

function markPrefs() {
  const p = curPrefs();
  document.querySelectorAll('[data-act=pref]').forEach(b => b.classList.toggle('on', (p[b.dataset.k] || '') === b.dataset.v));
  const preset = ACCENTS.some(([c]) => c === (p.accent || ''));
  const cs = document.getElementById('swCustom'); if (cs) cs.classList.toggle('on', !preset);
  const docC = (db.company.accent || '#26323f').toLowerCase();
  document.querySelectorAll('[data-act=doc-color]').forEach(b => b.classList.toggle('on', b.dataset.v === docC));
  const w = document.getElementById('prefWarn');
  if (w) {
    const dark = document.documentElement.dataset.theme !== 'light';
    if (/^#[0-9a-f]{6}$/i.test(p.accent)) { const l = hexLum(p.accent); w.textContent = dark && l < 0.04 ? 'Cette couleur est très sombre : elle sera peu visible en mode sombre.' : !dark && l > 0.8 ? 'Cette couleur est très claire : elle sera peu visible en mode clair.' : ''; } else w.textContent = '';
  }
}
Object.assign(actions, {
  pref(t) { savePrefs({ [t.dataset.k]: t.dataset.v }); },
  'pref-reset'() { savePrefs(Object.assign({}, PREF_DEFAULTS)); toast('Apparence réinitialisée'); },
  'doc-color'(t) { if (!session.access.active) return; db.company.accent = t.dataset.v; save(); const i = document.getElementById('docColor'); if (i) i.value = t.dataset.v; markPrefs(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'prefColor') savePrefs({ accent: e.target.value });
  if (e.target.id === 'docColor' && session.access.active) { db.company.accent = e.target.value; save(); markPrefs(); }
});
