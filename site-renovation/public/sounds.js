// Sons d'interface discrets (générés par le navigateur, aucun fichier audio) :
// clic sur un bouton, choix d'une option, ouverture / fermeture, envoi réussi, erreur.
// Coupables depuis le pied de page (« Sons »), le choix est mémorisé.
(function () {
  'use strict';
  if (document.body && document.body.hasAttribute('data-admin')) return;
  const KEY = 'pa-sons';
  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* stockage indisponible */ }
  let ctx = null, master = null;
  const audio = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  // une note courte : forme, fréquence de départ / d'arrivée, durée, volume, retard
  function tone({ type = 'sine', f1, f2 = f1, dur = 0.09, vol = 0.06, delay = 0, attack = 0.004 }) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  // petit souffle filtré (glissement, ouverture)
  function air({ dur = 0.14, vol = 0.035, from = 900, to = 2600, delay = 0 }) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  const S = {
    tap() { tone({ type: 'triangle', f1: 720, f2: 560, dur: 0.07, vol: 0.07 }); tone({ f1: 1440, f2: 1120, dur: 0.05, vol: 0.02 }); },
    primary() { tone({ type: 'triangle', f1: 540, f2: 820, dur: 0.11, vol: 0.075 }); tone({ f1: 1080, f2: 1640, dur: 0.08, vol: 0.025, delay: 0.015 }); },
    tick() { tone({ type: 'sine', f1: 1500, f2: 1250, dur: 0.035, vol: 0.035 }); },
    select() { tone({ type: 'sine', f1: 880, dur: 0.06, vol: 0.05 }); tone({ type: 'sine', f1: 1320, dur: 0.07, vol: 0.03, delay: 0.035 }); },
    open() { air({ dur: 0.16, from: 700, to: 2400 }); tone({ type: 'sine', f1: 420, f2: 640, dur: 0.12, vol: 0.04 }); },
    close() { air({ dur: 0.13, from: 2200, to: 700, vol: 0.03 }); tone({ type: 'sine', f1: 620, f2: 400, dur: 0.1, vol: 0.035 }); },
    swipe() { air({ dur: 0.1, from: 1200, to: 3000, vol: 0.025 }); },
    toggle() { tone({ type: 'square', f1: 300, dur: 0.03, vol: 0.02 }); tone({ type: 'sine', f1: 980, dur: 0.06, vol: 0.04, delay: 0.02 }); },
    success() { [[784, 0], [988, 0.09], [1319, 0.18]].forEach(([f, d]) => tone({ type: 'sine', f1: f, dur: 0.32, vol: 0.06, delay: d })); },
    error() { tone({ type: 'triangle', f1: 220, f2: 180, dur: 0.16, vol: 0.06 }); tone({ type: 'triangle', f1: 196, f2: 160, dur: 0.18, vol: 0.05, delay: 0.1 }); },
  };
  let last = '', lastAt = 0;
  const play = name => {
    const now = Date.now(); if (name === last && now - lastAt < 180) return;   // pas de doublon
    last = name; lastAt = now;
    if (on) try { S[name](); } catch (e) { /* audio indisponible */ }
  };

  // ---------- clics : le son dépend de l'élément ----------
  document.addEventListener('click', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.so-toggle')) return;
    if (t.closest('.pj-x, .announce-x, .lb .x')) return play('close');
    if (t.closest('.pj-nav, .pj-thumb, .lb .pv, .lb .nx')) return play('swipe');
    if (t.closest('.shot-img')) return play('open');
    const burger = t.closest('.burger');
    if (burger) return play(burger.getAttribute('aria-expanded') === 'true' ? 'close' : 'open');   // état avant le clic
    const faq = t.closest('.faq-q');
    if (faq) return play(faq.closest('.faq-item') && faq.closest('.faq-item').classList.contains('open') ? 'close' : 'open');
    if (t.closest('.theme-toggle')) return play('toggle');
    if (t.closest('.opt, .cal-grid button.avail, .times button, .chips li, input[type=checkbox], input[type=radio]')) return play('select');
    if (t.closest('.btn:not(.btn-ghost), .so-big, button[type=submit]')) return play('primary');
    if (t.closest('button, .btn, .so-btn, .so-card, .tb-so, .drop')) return play('tap');
    if (t.closest('a')) return play('tick');
  }, true);

  // ---------- résultats : demande envoyée, erreur ----------
  const seen = new WeakSet();
  new MutationObserver(list => {
    for (const m of list) {
      const el = m.target;
      if (!(el instanceof Element)) continue;
      // assistant devis / rendez-vous : l'écran de confirmation apparaît
      if ((el.id === 'done' || el.matches('.wiz-done')) && !el.hidden && m.attributeName === 'hidden') { if (!seen.has(el)) { seen.add(el); play('success'); } continue; }
      // formulaire de contact : message de succès
      if (el.matches('.ok') && !el.hidden && m.attributeName === 'hidden') { play('success'); continue; }
      // message d'erreur qui s'affiche
      if (el.matches('.wiz-err, .form-err') && !el.hidden && el.textContent.trim() && (m.type === 'childList' || m.attributeName === 'hidden')) play('error');
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'], childList: true, characterData: true });

  // ---------- bouton « Sons » dans le pied de page ----------
  const links = document.querySelector('.legal-links');
  if (links) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'so-toggle';
    const label = () => { b.textContent = on ? '🔊 Sons' : '🔇 Sons coupés'; b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Couper les sons du site' : 'Réactiver les sons du site'; };
    label();
    b.addEventListener('click', () => { on = !on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ } label(); if (on) play('toggle'); });
    links.prepend(b);
  }
})();
