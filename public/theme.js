/* Préférences d'affichage appliquées avant le premier affichage (évite les clignotements) */
(function () {
  var DEF = { accent: '', mode: 'dark', bg: 'black', radius: 'normal', size: 'normal', density: 'comfortable', sound: 'on', sfx: 'soft', vol: 'mid' };
  function lum(h) { var n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  window.PREF_DEFAULTS = DEF;
  window.applyPrefs = function (p) {
    p = Object.assign({}, DEF, p || {});
    var r = document.documentElement, mode = p.mode;
    if (mode === 'auto') mode = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    r.dataset.theme = mode; r.dataset.mode = p.mode; r.dataset.bg = p.bg; r.dataset.radius = p.radius; r.dataset.size = p.size; r.dataset.density = p.density;
    if (/^#[0-9a-f]{6}$/i.test(p.accent)) {
      r.style.setProperty('--accent', p.accent); r.style.setProperty('--on-accent', lum(p.accent) > 0.179 ? '#0a0a0a' : '#ffffff');
      r.style.setProperty('--primary-soft', 'color-mix(in srgb, ' + p.accent + ' 18%, transparent)');
    } else ['--accent', '--on-accent', '--primary-soft'].forEach(function (k) { r.style.removeProperty(k); });
    window.currentPrefs = p;
    var tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.setAttribute('content', mode === 'light' ? '#f5f5f6' : '#070707');
  };
  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('sitedevis.prefs') || 'null');
    if (!saved) { var t = localStorage.getItem('sitedevis.theme'); if (t) saved = { mode: t }; }
  } catch (e) { /* ignore */ }
  /* L'ancien thème par défaut (or + fond bronze) est remplacé par le noir et blanc de base */
  if (saved && saved.accent === '#e3a04b' && saved.bg === 'bronze') { saved.accent = ''; saved.bg = 'black'; try { localStorage.setItem('sitedevis.prefs', JSON.stringify(saved)); } catch (e) { /* ignore */ } }
  window.applyPrefs(saved);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { if (window.currentPrefs && window.currentPrefs.mode === 'auto') window.applyPrefs(window.currentPrefs); });
})();
