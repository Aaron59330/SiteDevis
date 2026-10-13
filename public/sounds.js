'use strict';
/* Petits sons d'interface synthétisés (Web Audio, aucun fichier). Réglables dans Personnalisation :
   activés/coupés, style (sfx) et volume (vol). Le contexte audio ne démarre qu'après un premier geste de l'utilisateur. */
(function () {
  const VOL = { low: 0.35, mid: 0.7, high: 1 };
  // note = [fréquence, début (s), durée (s), forme, gain, fréquence finale]
  const PACKS = {
    soft: {
      hover: [[740, 0, .035, 'sine', .05, 840]], tap: [[520, 0, .06, 'sine', .16, 440]], nav: [[392, 0, .07, 'sine', .15], [588, .05, .09, 'sine', .13]],
      toggle: [[660, 0, .05, 'sine', .15, 780]], open: [[330, 0, .09, 'sine', .14], [495, .06, .12, 'sine', .12]], close: [[495, 0, .08, 'sine', .12], [330, .06, .1, 'sine', .1]],
      success: [[523, 0, .1, 'sine', .16], [659, .09, .1, 'sine', .16], [784, .18, .22, 'sine', .16]], error: [[240, 0, .14, 'triangle', .18, 190], [200, .13, .18, 'triangle', .16, 150]],
      delete: [[300, 0, .14, 'triangle', .15, 140]]
    },
    crystal: {
      hover: [[1760, 0, .04, 'sine', .04]], tap: [[1320, 0, .09, 'sine', .12], [1980, 0, .07, 'sine', .05]], nav: [[1047, 0, .1, 'sine', .11], [1568, .05, .14, 'sine', .09]],
      toggle: [[1760, 0, .08, 'sine', .1], [2349, .03, .08, 'sine', .05]], open: [[880, 0, .12, 'sine', .1], [1318, .07, .2, 'sine', .09]], close: [[1318, 0, .1, 'sine', .09], [880, .06, .16, 'sine', .08]],
      success: [[1047, 0, .14, 'sine', .12], [1319, .09, .14, 'sine', .12], [1568, .18, .3, 'sine', .12], [2093, .18, .3, 'sine', .04]], error: [[440, 0, .18, 'sine', .15, 330], [349, .14, .26, 'sine', .14, 262]],
      delete: [[880, 0, .2, 'sine', .1, 330]]
    },
    pop: {
      hover: [[560, 0, .035, 'triangle', .07, 650]], tap: [[420, 0, .07, 'triangle', .22, 170]], nav: [[500, 0, .08, 'triangle', .2, 200], [700, .06, .08, 'triangle', .16, 300]],
      toggle: [[300, 0, .06, 'triangle', .22, 620]], open: [[240, 0, .1, 'triangle', .2, 520]], close: [[520, 0, .1, 'triangle', .18, 220]],
      success: [[330, 0, .08, 'triangle', .22, 660], [495, .09, .08, 'triangle', .2, 880], [660, .18, .14, 'triangle', .2, 1100]], error: [[200, 0, .12, 'triangle', .24, 90], [170, .12, .16, 'triangle', .22, 80]],
      delete: [[400, 0, .16, 'triangle', .2, 70]]
    },
    retro: {
      hover: [[1320, 0, .02, 'square', .025]], tap: [[880, 0, .04, 'square', .07]], nav: [[660, 0, .04, 'square', .07], [990, .05, .05, 'square', .07]],
      toggle: [[1175, 0, .04, 'square', .06], [1568, .04, .04, 'square', .06]], open: [[523, 0, .05, 'square', .06], [784, .05, .06, 'square', .06]], close: [[784, 0, .05, 'square', .06], [523, .05, .06, 'square', .06]],
      success: [[523, 0, .07, 'square', .07], [659, .07, .07, 'square', .07], [784, .14, .07, 'square', .07], [1047, .21, .16, 'square', .07]], error: [[196, 0, .12, 'square', .08], [147, .12, .18, 'square', .08]],
      delete: [[440, 0, .06, 'square', .07], [330, .06, .06, 'square', .07], [220, .12, .1, 'square', .07]]
    }
  };
  let ctx = null, last = 0;
  const prefs = () => window.currentPrefs || window.PREF_DEFAULTS || {};
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  window.playSound = function (name, force) {
    const p = prefs();
    if (p.sound === 'off' && !force) return;
    if (name === 'hover' && !force && (p.hover === 'off' || !ctx || ctx.state !== 'running')) return;
    const pack = PACKS[p.sfx] || PACKS.soft, notes = pack[name]; if (!notes) return;
    const now = performance.now(); if (!force && now - last < (name === 'hover' ? 70 : 35)) return; last = now;
    const c = audio(); if (!c) return;
    const vol = VOL[p.vol] || VOL.mid, t0 = c.currentTime + 0.005;
    for (const [f, at, dur, type, g, to] of notes) {
      const o = c.createOscillator(), a = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0 + at);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + at + dur);
      const peak = Math.max(0.0002, g * vol);
      a.gain.setValueAtTime(0.0001, t0 + at);
      a.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.008);
      a.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(a); a.connect(c.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
    }
  };

  /* Clics : boutons et liens ; navigation = onglets, menus, filtres. Les champs et cases ont leur propre son. */
  document.addEventListener('click', e => {
    const el = e.target.closest('button, a[data-act], [data-view], summary, .opt, .sw, .bgsw, .cchip');
    if (!el || el.disabled || el.closest('[data-nosound]')) return;
    if (el.matches('.ld-links a[href^="#/"], .ld-foot a[href^="#/"], a.ld-home') || /^auth-(open|go|close)$/.test(el.dataset.act || '')) return;
    const act = el.dataset.act || '';
    if (act === 'sound-test' || act === 'pref') return;
    if (/^(del|rm|remove|line-del|log-del)|delete/.test(act) || el.classList.contains('danger')) return playSound('delete');
    if (el.closest('#nav, #bottomnav, #moreSheet, .tabs') || el.dataset.view) return playSound('nav');
    playSound('tap');
  }, true);
  /* Survol : un tic très léger quand la souris entre sur un onglet, une catégorie ou un bouton (souris uniquement, désactivable) */
  const HOVER = '#nav button, .tabs button, .cchip, .seg2 button, button.btn, a.btn, label.btn, .tpl-card, .ld-links a, .ld-btn, .ld-login, .opt, .stat, .docs-card > summary, .docs-faq summary, .bottomnav button';
  let lastHover = null;
  if (window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest(HOVER);
      if (!el || el === lastHover || el.disabled || el.closest('[data-nosound]')) { if (!el) lastHover = null; return; }
      lastHover = el; playSound('hover');
    }, true);
  }
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('input[type=checkbox], input[type=radio]') || t.tagName === 'SELECT') playSound('toggle');
  }, true);

  /* Messages : succès ou erreur selon le texte */
  const baseToast = window.toast;
  if (typeof baseToast === 'function') {
    window.toast = function (msg) {
      baseToast.apply(this, arguments);
      if (window.__quietToast > Date.now()) return;   // le jingle d'achat joue déjà
      playSound(/impossible|erreur|invalide|incorrect|manque|indiquez|choisissez|d'abord|précède|déjà|refus|échec|requis|trop/i.test(String(msg)) ? 'error' : 'success');
    };
    try { toast = window.toast; } catch (e) { /* ignore */ }
  }

  /* ---------- Sons « motion design » ---------- */
  // souffle filtré (transition de page) : bruit blanc passé dans un filtre qui balaie les fréquences
  window.playWhoosh = function (dir) {
    const p = prefs(); if (p.sound === 'off') return;
    const c = audio(); if (!c || c.state !== 'running') return;
    const vol = (VOL[p.vol] || VOL.mid) * .5, t0 = c.currentTime + .005, dur = .42;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(dir < 0 ? 2600 : 420, t0); f.frequency.exponentialRampToValueAtTime(dir < 0 ? 420 : 2600, t0 + dur * .8);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.16 * vol, t0 + .12); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t0); src.stop(t0 + dur + .02);
    // petite note cristalline à la fin du souffle
    const o = c.createOscillator(), a = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(dir < 0 ? 660 : 990, t0 + .22);
    a.gain.setValueAtTime(.0001, t0 + .22); a.gain.exponentialRampToValueAtTime(.05 * vol, t0 + .23); a.gain.exponentialRampToValueAtTime(.0001, t0 + .5);
    o.connect(a); a.connect(c.destination); o.start(t0 + .22); o.stop(t0 + .52);
  };
  // jingle d'achat : arpège montant + accord tenu + scintillement
  const JINGLE = [[523.25, 0, .16, 'triangle', .16], [659.25, .1, .16, 'triangle', .16], [783.99, .2, .16, 'triangle', .16], [1046.5, .3, .9, 'sine', .15],
    [523.25, .3, 1, 'sine', .07], [659.25, .3, 1, 'sine', .06], [783.99, .3, 1, 'sine', .06], [130.81, .3, .9, 'sine', .12],
    [2093, .42, .18, 'sine', .035], [2637, .52, .18, 'sine', .03], [3136, .62, .26, 'sine', .025]];
  let pendingJingle = false;
  function jingle() {
    const p = prefs(); if (p.sound === 'off') return;
    const c = audio(); if (!c) return;
    if (c.state !== 'running') { pendingJingle = true; return; }   // le navigateur attend un premier geste
    const vol = VOL[p.vol] || VOL.mid, t0 = c.currentTime + .01;
    for (const [f, at, dur, type, gg] of JINGLE) { const o = c.createOscillator(), a = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0 + at);
      a.gain.setValueAtTime(.0001, t0 + at); a.gain.exponentialRampToValueAtTime(gg * vol, t0 + at + .012); a.gain.exponentialRampToValueAtTime(.0001, t0 + at + dur);
      o.connect(a); a.connect(c.destination); o.start(t0 + at); o.stop(t0 + at + dur + .02); }
  }
  document.addEventListener('pointerdown', () => { if (pendingJingle) { pendingJingle = false; setTimeout(jingle, 60); } }, true);
  // célébration : jingle + confettis aux couleurs du site
  window.celebrate = function () {
    window.__quietToast = Date.now() + 800; jingle();
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    const cols = ['var(--accent)', '#ffffff', '#f7d08a', '#e3a04b', '#22c55e'];
    for (let i = 0; i < 70; i++) { const s = document.createElement('i'); const x = (Math.random() - .5) * 2;
      s.style.cssText = `--x:${x * 46}vw;--r:${(Math.random() * 720 - 360) | 0}deg;--d:${(.9 + Math.random() * .9).toFixed(2)}s;--w:${(5 + Math.random() * 6) | 0}px;left:50%;background:${cols[i % cols.length]};animation-delay:${(Math.random() * .25).toFixed(2)}s`;
      box.appendChild(s); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
  };

  /* Accueil : souffle à chaque changement de page, sons d'ouverture / fermeture de la connexion */
  let lastPg = location.hash;
  window.addEventListener('hashchange', () => { if (!document.querySelector('.landing')) return; const back = location.hash === '' || location.hash === '#/'; playWhoosh(back ? -1 : 1); lastPg = location.hash; });
  document.addEventListener('click', e => {
    const a = e.target.closest('.landing [data-act=auth-open], .landing [data-act=auth-go]'); if (a) setTimeout(() => playSound('open', false), 0);
    const x = e.target.closest('.landing [data-act=auth-close]'); if (x) playSound('close');
  }, true);

  /* Fenêtres modales : ouverture / fermeture */
  const dlg = document.getElementById('modal');
  if (dlg) new MutationObserver(() => playSound(dlg.open ? 'open' : 'close')).observe(dlg, { attributes: true, attributeFilter: ['open'] });
})();
