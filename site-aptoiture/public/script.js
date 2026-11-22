document.getElementById('year').textContent = new Date().getFullYear();

const burger = document.querySelector('.burger');
const menu = document.querySelector('.menu');
burger.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  burger.setAttribute('aria-expanded', open);
});

const form = document.getElementById('form');
if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = form.querySelector('.ok'), bad = form.querySelector('.wiz-err'), btn = form.querySelector('button[type=submit]');
    ok.hidden = true; if (bad) bad.hidden = true;
    const f = new FormData(form);
    const fd = new FormData();
    fd.append('source', 'contact'); fd.append('nom', f.get('nom')); fd.append('tel', f.get('tel')); fd.append('email', f.get('email'));
    fd.append('travaux', f.get('type')); fd.append('message', f.get('message')); fd.append('website', f.get('website') || ''); fd.append('consent', '1');
    btn.disabled = true;
    try {
      const r = await fetch('/api/devis', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Envoi impossible.');
      ok.hidden = false; form.reset();
    } catch (ex) {
      // service indisponible : on ouvre la messagerie en secours
      const body = `Nom : ${f.get('nom')}\nTéléphone : ${f.get('tel')}\nE-mail : ${f.get('email')}\nTravaux : ${f.get('type')}\n\n${f.get('message')}`;
      if (ex instanceof TypeError) location.href = `mailto:pro.ap.couverture@gmail.com?subject=${encodeURIComponent('Demande de contact')}&body=${encodeURIComponent(body)}`;
      else if (bad) { bad.textContent = ex.message; bad.hidden = false; }
    }
    btn.disabled = false;
  });
}

// Visionneuse des réalisations : une fenêtre par chantier (photos, catégorie, description, devis)
(function () {
  if (document.body.hasAttribute('data-admin')) return;
  let box = null, photos = [], idx = 0, lastFocus = null;
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const show = i => {
    idx = (i + photos.length) % photos.length;
    const img = box.querySelector('.pj-img');
    img.classList.remove('on'); void img.offsetWidth; img.src = photos[idx]; img.classList.add('on');
    box.querySelector('.pj-count').textContent = (idx + 1) + ' / ' + photos.length;
    box.querySelectorAll('.pj-thumb').forEach((t, j) => t.classList.toggle('on', j === idx));
  };
  const close = () => { if (!box) return; box.remove(); box = null; document.body.classList.remove('pj-open'); document.removeEventListener('keydown', key); if (lastFocus) lastFocus.focus(); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') show(idx + 1); if (e.key === 'ArrowLeft') show(idx - 1); };
  function open(fig) {
    try { photos = JSON.parse(fig.dataset.photos || '[]'); } catch (e) { photos = []; }
    if (!photos.length) photos = [fig.querySelector('.shot-img').getAttribute('href')];
    const t = fig.querySelector('.t'), c = fig.querySelector('.c'), d = fig.querySelector('.d');
    const title = t ? t.textContent.trim() : '', cat = c ? c.textContent.trim() : '', desc = d ? d.textContent.trim() : '';
    lastFocus = document.activeElement;
    box = mk('div', 'pj'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title || 'Réalisation');
    const panel = mk('div', 'pj-box');
    const media = mk('div', 'pj-media'), stage = mk('div', 'pj-stage');
    const img = mk('img', 'pj-img'); img.alt = title;
    stage.append(img, mk('span', 'pj-count'));
    if (photos.length > 1) {
      const pv = mk('button', 'pj-nav pv', '‹'), nx = mk('button', 'pj-nav nx', '›');
      pv.type = nx.type = 'button'; pv.setAttribute('aria-label', 'Photo précédente'); nx.setAttribute('aria-label', 'Photo suivante');
      pv.onclick = () => show(idx - 1); nx.onclick = () => show(idx + 1);
      stage.append(pv, nx);
    }
    media.append(stage);
    if (photos.length > 1) {
      const th = mk('div', 'pj-thumbs');
      photos.forEach((p, j) => { const b = mk('button', 'pj-thumb'); b.type = 'button'; b.setAttribute('aria-label', 'Photo ' + (j + 1)); const im = mk('img'); im.src = p; im.alt = ''; im.loading = 'lazy'; b.append(im); b.onclick = () => show(j); th.append(b); });
      media.append(th);
    }
    // glisser du doigt sur mobile
    let x0 = null;
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40 && photos.length > 1) show(idx + (dx < 0 ? 1 : -1)); x0 = null; });
    const info = mk('div', 'pj-info');
    if (cat) info.append(mk('span', 'pj-tag', cat));
    if (title) info.append(mk('h2', 'pj-title', title));
    const txt = mk('div', 'pj-desc');
    desc.split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean).forEach(par => txt.append(mk('p', '', par)));
    info.append(txt);
    const cta = mk('a', 'btn pj-cta', 'Demander un devis similaire');
    cta.href = 'devis.html?projet=' + encodeURIComponent(title || cat || 'Réalisation');
    info.append(cta);
    const x = mk('button', 'pj-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = close;
    panel.append(media, info, x);
    box.append(panel);
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.body.append(box); document.body.classList.add('pj-open');
    document.addEventListener('keydown', key);
    show(0); x.focus();
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('.shot-img'); if (!a) return;
    e.preventDefault(); open(a.closest('.shot'));
  });
})();

// Formulaire de devis : « Demander un devis similaire » pré-remplit la description
(function () {
  const p = new URLSearchParams(location.search).get('projet');
  const m = p && document.querySelector('form textarea[name="message"]');
  if (m && !m.value) m.value = 'Bonjour, je souhaiterais un devis pour des travaux similaires à votre réalisation « ' + p.slice(0, 120) + ' ».';
})();

// Effets d'animation (désactivés en mode administrateur et si l'utilisateur réduit les animations)
(function () {
  const header = document.querySelector('.header');
  const bar = document.createElement('div');
  bar.className = 'progress';
  document.body.appendChild(bar);
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(h.scrollTop / max, 1) : 0) + ')';
    if (header) header.classList.toggle('scrolled', h.scrollTop > 10);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (document.body.hasAttribute('data-admin')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

  const groups = '.head, .steps > *, .tips > *, .counters-grid > *, .faq-item, .chips, .urgent, .map, .grid4 > *, .grid-svc > *, .grid3 > *, .grid2 > *, .gallery > *, .srv > *, .two > *, .crow, .cta .container > *, .fgrid > *, .section .container > .lead2';
  const targets = Array.from(document.querySelectorAll(groups)).filter(el => !el.closest('.hero, .banner'));
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(el => {
    const idx = Array.prototype.indexOf.call(el.parentElement.children, el);
    el.style.setProperty('--d', Math.min(idx, 5) * 0.1 + 's');
    el.classList.add('reveal');
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) { el.classList.add('in'); el.style.transition = 'none'; requestAnimationFrame(() => { el.style.transition = ''; }); }
    else io.observe(el);
  });
})();

// Reflet brillant sur le logo : copie de l'image actuelle, balayée par un dégradé lumineux
(function () {
  if (document.body.hasAttribute('data-admin')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const w = document.querySelector('.logo-shine');
  const img = w && w.querySelector('img');
  if (!img) return;
  const copy = img.cloneNode(false);
  copy.className = 'shine-img';
  copy.alt = '';
  copy.setAttribute('aria-hidden', 'true');
  copy.removeAttribute('data-edi');
  copy.removeAttribute('data-edi-orig');
  w.appendChild(copy);
})();

// ---------- Bascule clair / sombre
(function () {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const light = root.getAttribute('data-theme') !== 'light';
    if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    try { localStorage.setItem('pa-theme', light ? 'light' : 'dark'); } catch (e) {}
  });
})();

// ---------- Écran de chargement
(function () {
  const loader = document.querySelector('.loader');
  if (!loader) return;
  const hide = () => {
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 700);
  };
  const start = Date.now();
  const go = () => setTimeout(hide, Math.max(0, 900 - (Date.now() - start)));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();

// ---------- Compteurs animés (la valeur affichée dans la page sert de valeur finale)
(function () {
  const items = document.querySelectorAll('.count');
  if (!items.length) return;
  if (document.body.hasAttribute('data-admin')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target; io.unobserve(el);
      const m = el.textContent.trim().match(/^(\D*)(\d+)(.*)$/);
      if (!m) return;
      const end = parseInt(m[2], 10), t0 = performance.now(), dur = 1400;
      const step = t => {
        const p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = m[1] + Math.round(end * e) + m[3];
        if (p < 1) requestAnimationFrame(step);
      };
      el.textContent = m[1] + '0' + m[3];
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  items.forEach(el => io.observe(el));
})();

// ---------- FAQ (accordéon)
(function () {
  const items = document.querySelectorAll('.faq-item');
  if (!items.length || document.body.hasAttribute('data-admin')) return;
  document.body.classList.add('faq-js');
  const toggle = it => {
    const open = it.classList.toggle('open');
    it.querySelector('.faq-q').setAttribute('aria-expanded', open);
  };
  items.forEach(it => {
    const q = it.querySelector('.faq-q');
    q.addEventListener('click', () => toggle(it));
    q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(it); } });
  });
  if (items[0]) toggle(items[0]);
})();

// ---------- Zone d'intervention : recherche de commune
(function () {
  const input = document.getElementById('commune');
  const res = document.getElementById('zs-res');
  if (!input || !res) return;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const chips = Array.from(document.querySelectorAll('.chips li'));
  const towns = Array.from(document.querySelectorAll('.map .town'));
  const clear = () => { chips.forEach(c => c.classList.remove('hit')); towns.forEach(t => t.classList.remove('hit')); };
  const run = () => {
    clear();
    const q = norm(input.value);
    res.className = 'zs-res'; res.textContent = '';
    if (q.length < 2) return;
    const found = chips.find(c => norm(c.textContent) === q) || chips.find(c => norm(c.textContent).startsWith(q));
    if (found) {
      found.classList.add('hit');
      const t = towns.find(x => x.dataset.c === found.dataset.c); if (t) t.classList.add('hit');
      res.className = 'zs-res yes';
      res.textContent = 'Oui, nous intervenons à ' + found.textContent.trim() + '.';
    } else if (norm(input.value).length >= 4) {
      res.className = 'zs-res no';
      res.append('Cette commune n\'est pas dans notre liste habituelle, mais ');
      const a = document.createElement('a'); a.href = 'contact.html'; a.textContent = 'contactez-nous';
      res.append(a, ' : nous étudions toutes les demandes.');
    }
  };
  input.addEventListener('input', run);
})();

// ---------- Annonce (fermable pour la session) et statistiques d'appel
(function () {
  const bar = document.querySelector('.announce');
  if (bar) {
    const key = 'pa-ann-' + (bar.getAttribute('data-text') || '').slice(0, 60);
    let closed = false; try { closed = sessionStorage.getItem(key) === '1'; } catch (e) {}
    if (closed && !document.body.hasAttribute('data-admin')) bar.classList.add('gone');
    const x = bar.querySelector('.announce-x');
    if (x) x.addEventListener('click', () => { bar.classList.add('gone'); try { sessionStorage.setItem(key, '1'); } catch (e) {} });
  }
  // compte les clics sur « Appeler » et sur l'e-mail (sans cookie, sans donnée personnelle)
  if (document.body.hasAttribute('data-admin')) return;
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="mailto:"]');
    if (!a || !navigator.sendBeacon) return;
    const type = a.getAttribute('href').startsWith('tel:') ? 'call' : 'mail';
    navigator.sendBeacon('/api/hit', new Blob([JSON.stringify({ type })], { type: 'application/json' }));
  });
})();
