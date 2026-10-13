'use strict';
/* Mémoire (activable dans le Catalogue) :
   1. en tapant une désignation dans un devis, propose les lignes connues : votre catalogue, ce que vous avez déjà écrit
      dans d'anciens devis, puis la bibliothèque de votre métier (modèles par métier + matériaux des fournisseurs du métier) ;
   2. quand une ligne n'est pas dans le catalogue, propose de l'y ajouter, en devinant matériau / prestation et la catégorie
      d'après votre métier et votre secteur. */
(function () {
  const on = () => db.settings.memory !== false;
  const mem = () => (db.memory = db.memory || { items: {}, ignore: {} });
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const key = s => fold(s).replace(/\s+/g, ' ').trim().slice(0, 160);
  const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'a', 'au', 'aux', 'pour', 'sur', 'avec', 'un', 'une', 'par', 'mm', 'cm', 'm', 'x']);
  const words = s => fold(s).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
  const PRESTA = /\b(pose|poser|depose|main d.?oeuvre|installation|installer|montage|nettoyage|forfait|deplacement|intervention|realisation|mise en (place|oeuvre|service)|reparation|entretien|heure|prestation|evacuation|demolition|preparation|application|raccordement|livraison|reglage|diagnostic|conseil|formation|seance|location|animation|coupe|soin)\b/;
  /* catégories de matériaux reconnues par mots-clés (testées dans l'ordre) */
  const MAT_CATS = [
    [/carrel|faience|gres cerame|croisillon|joint (de )?carrel|colle carrel/, 'Carrelage'],
    [/\bba ?13\b|placo|plaque de platre|\brail\b|montant|bande a joint|\benduit\b|fourrure|suspente|cornier/, 'Plâtrerie'],
    [/laine (de )?(verre|roche)|isolant|polystyrene|pare.?vapeur|ouate|panneau isol/, 'Isolation'],
    [/tuile|liteau|faitage|ecran (de )?sous.?toiture|ardoise|closoir/, 'Couverture'],
    [/goutti|descente|zinc|naissance|dauphin/, 'Zinguerie'],
    [/cable|gaine|disjonct|interrupt|prise|tableau elec|domino|wago|spot|luminaire|ampoule/, 'Électricité'],
    [/tube|raccord|cuivre|\bper\b|multicouche|robinet|mitigeur|siphon|\bwc\b|lavabo|evier|chauffe.?eau|pvc evac/, 'Plomberie'],
    [/peinture|sous.?couche|vernis|lasure|impression|rouleau (de )?peint|pinceau|bache|ruban de masquage/, 'Peinture'],
    [/ciment|parpaing|beton|sable|gravier|mortier|brique|agglo|treillis|fer a beton/, 'Maçonnerie'],
    [/\bvis\b|cheville|clou|boulon|ecrou|agrafe|rondelle/, 'Visserie'],
    [/silicone|mastic|mousse expansive|colle\b|scotch|adhesif/, 'Consommables'],
    [/chevron|bastaing|madrier|planche|tasseau|osb|contreplaque|\bbois\b|lambourde/, 'Bois'],
    [/parquet|stratifie|sous.?couche parquet|plinthe|sol (pvc|vinyle)/, 'Sols']];
  const kwCat = f => { const m = MAT_CATS.find(([r]) => r.test(f)); return m ? m[1] : ''; };
  window.materialCategory = desc => kwCat(fold(desc));   // utilisé aussi pour deviner « vente de marchandises » en comptabilité
  const myTrade = () => { const T = typeof TRADES !== 'undefined' ? TRADES : []; const sec = (db.settings.sector || 'btp');
    return T.find(t => t.id === db.settings.trade) || T.find(t => t.sector === sec) || null; };

  /* ---------- Bibliothèque (recalculée quand le catalogue ou le métier change) ---------- */
  let libCache = null, libSig = '';
  function library() {
    const sig = [db.catalog.length, db.settings.trade, db.settings.sector, Object.keys(mem().items).length].join('|');
    if (libCache && sig === libSig) return libCache;
    const out = [], T = typeof TRADES !== 'undefined' ? TRADES : [], tr = myTrade(), sec = db.settings.sector || 'btp';
    db.catalog.forEach(c => { if (c.type === 'ouvrage' || !c.desc) return;
      out.push({ src: 'cat', w: 50 + (c.fav ? 10 : 0), desc: c.desc, ref: c.ref || '', unit: c.unit, price: itemPrice(c), vat: num(c.vat), kind: isMat(c) ? 'materiau' : 'prestation', cat: c.cat || '', label: isMat(c) ? 'Catalogue · matériau' : 'Catalogue' }); });
    Object.values(mem().items).forEach(m => out.push({ src: 'mem', w: 35 + Math.min(m.n || 1, 15), desc: m.desc, ref: m.ref || '', unit: m.unit, price: m.price, vat: m.vat, kind: m.kind, cat: m.cat || '', label: `Déjà utilisé ${m.n > 1 ? m.n + ' fois' : ''}`.trim() }));
    T.filter(t => t.sector === sec).forEach(t => (t.lines || []).forEach(l => { if (l.length < 5 || l[0] === 'T') return;
      out.push({ src: 'metier', w: t === tr ? 22 : 12, desc: l[1], ref: '', unit: l[3], price: num(l[4]), vat: l[5] != null ? num(l[5]) : num(t.vat ?? db.settings.defaultVat), kind: PRESTA.test(fold(l[1])) ? 'prestation' : 'materiau', cat: t.name, label: `Métier · ${t.name}` }); }));
    const L = window.SUPPLIER_LIB;
    if (L) { const ids = new Set((tr && L.BY[tr.id]) || L.BY_SECTOR[sec] || []);
      ids.forEach(id => { const s = L.S[id]; if (!s) return; s.items.forEach(([ref, desc, cat, unit, cost]) =>
        out.push({ src: 'fourn', w: 14, desc, ref, unit, price: Math.round(cost * (1 + s.markup / 100) * 100) / 100, cost, vat: db.company.vatExempt ? 0 : num(db.settings.defaultVat), kind: 'materiau', cat, supplier: s.name, label: `Matériau · ${s.name}` })); }); }
    // une même désignation n'apparaît qu'une fois (la source la plus personnelle gagne)
    const seen = new Map(); out.sort((a, b) => b.w - a.w).forEach(x => { const k = key(x.desc); if (!seen.has(k)) seen.set(k, x); });
    libCache = [...seen.values()].map(x => ({ ...x, f: fold(x.desc), ws: words(x.desc) })); libSig = sig;
    return libCache;
  }
  function search(text, n = 7) {
    const q = words(text); if (!q.length) return [];
    const res = [];
    for (const x of library()) {
      let hit = 0, pre = 0;
      for (const w of q) { if (x.ws.some(v => v.startsWith(w))) { hit++; if (x.ws[0] && x.ws[0].startsWith(w)) pre++; } else if (x.f.includes(w)) hit += .6; }
      if (hit < q.length * .99 && !(q.length > 2 && hit >= q.length - 1)) continue;
      if (key(x.desc) === key(text)) continue;
      res.push({ x, s: hit * 20 + pre * 6 + x.w - x.f.length / 40 });
    }
    return res.sort((a, b) => b.s - a.s).slice(0, n).map(r => r.x);
  }

  /* ---------- Suggestions sous la désignation ---------- */
  let box = null, list = [], idx = -1, target = null;
  const close = () => { if (box) box.remove(); box = null; list = []; idx = -1; target = null; };
  function show(ta) {
    const txt = ta.value; if (!on() || txt.trim().length < 2 || txt.includes('\n')) return close();
    list = search(txt); if (!list.length) return close();
    target = ta; idx = -1;
    if (!box) { box = document.createElement('div'); box.className = 'mem-pop'; box.setAttribute('role', 'listbox'); }
    const r1 = ta.closest('.r1') || ta.parentNode; if (box.parentNode !== r1) r1.appendChild(box);
    box.innerHTML = list.map((x, i) => `<button type="button" class="mem-opt" data-mi="${i}" role="option"><span class="mem-d">${esc(x.desc)}</span>
      <span class="mem-m"><i class="mem-src ${x.src}">${esc(x.label)}</i>${x.price ? ` ${money(x.price)}${x.unit ? ' / ' + esc(x.unit) : ''}` : ''}</span></button>`).join('')
      + '<div class="mem-foot">↑ ↓ pour choisir · Entrée pour valider · Échap pour fermer</div>';
  }
  function hl(i) { idx = i; box.querySelectorAll('.mem-opt').forEach((b, j) => b.classList.toggle('on', j === idx)); }
  function pick(i) {
    const x = list[i], ta = target; if (!x || !ta) return close();
    const q = getQuote(editingId), l = q && q.lines[+ta.closest('.line').dataset.i]; if (!l) return close();
    Object.assign(l, { desc: x.desc, ref: x.ref || l.ref || '', unit: x.unit || l.unit, price: num(x.price), vat: db.company.vatExempt ? 0 : num(x.vat) });
    const li = ta.closest('.line').dataset.i; close(); save(); refreshLines(); refreshPreview();
    const nx = document.querySelector(`#linesBody .line[data-i="${li}"] [data-l=qty]`); if (nx) { nx.focus(); nx.select(); }
    toast(x.src === 'cat' ? 'Ligne reprise du catalogue' : x.src === 'mem' ? 'Ligne reprise de vos anciens devis' : `Prix indicatif (${x.label}) : vérifiez-le`);
  }
  document.addEventListener('input', e => { const t = e.target; if (view === 'editor' && t.matches && t.matches('textarea[data-l=desc]')) show(t); });
  document.addEventListener('keydown', e => {
    if (!box || e.target !== target) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); hl(Math.min(list.length - 1, idx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hl(Math.max(-1, idx - 1)); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); pick(idx); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }, true);
  document.addEventListener('mousedown', e => { const o = e.target.closest('.mem-opt'); if (o) { e.preventDefault(); pick(+o.dataset.mi); } else if (box && !e.target.closest('.mem-pop')) close(); });

  /* ---------- Apprentissage + proposition d'ajout au catalogue ---------- */
  const inCatalog = l => db.catalog.some(c => key(c.desc) === key(l.desc) || (l.ref && c.ref && c.ref === l.ref));
  function guess(desc) {
    const ws = words(desc), f = fold(desc); let best = null, bs = 0;
    for (const x of library()) { if (x.src === 'mem') continue; const s = ws.filter(w => x.ws.includes(w)).length; if (s > bs) { bs = s; best = x; } }
    const strong = best && bs >= Math.min(2, ws.length);
    const kind = PRESTA.test(f) ? 'prestation' : strong ? best.kind : 'materiau';
    const tr = myTrade();
    // à défaut : catégorie de matériau la plus courante chez les fournisseurs du métier (ex. Plâtrerie), ou le nom du métier
    const cnt = {}; library().forEach(x => { if (x.src === 'fourn' && x.cat) cnt[x.cat] = (cnt[x.cat] || 0) + 1; });
    const topMat = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
    let near = null, ns = 0; library().forEach(x => { if (x.src !== 'fourn' && !(x.src === 'cat' && x.kind === 'materiau')) return; const s = ws.filter(w => x.ws.some(v => v.startsWith(w.slice(0, 5)))).length; if (s > ns && x.cat) { ns = s; near = x; } });
    const own = {}; db.catalog.filter(isMat).forEach(c => { if (c.cat) own[c.cat] = (own[c.cat] || 0) + 1; });
    const topOwn = Object.keys(own).sort((a, b) => own[b] - own[a])[0] || '';
    const fallback = kind === 'materiau' ? (kwCat(f) || (near && near.cat) || topOwn || topMat || (tr ? tr.name : '')) : (tr ? tr.name : '');
    return { kind, cat: strong && best.cat ? best.cat : fallback, supplier: strong && best.supplier ? best.supplier : '' };
  }
  function remember(l) {
    if (!on() || !l || String(l.desc).trim().length < 4 || inCatalog(l)) return;
    const k = key(l.desc), m = mem().items[k] || { n: 0 }, g = guess(l.desc);
    mem().items[k] = { desc: String(l.desc).trim(), ref: l.ref || '', unit: l.unit, price: num(l.price), vat: num(l.vat), kind: m.kind || g.kind, cat: m.cat || g.cat, n: (m.n || 0) + (m.lastQ === editingId ? 0 : 1), lastQ: editingId, last: today() };
    const keys = Object.keys(mem().items); if (keys.length > 800) keys.sort((a, b) => (mem().items[a].last || '').localeCompare(mem().items[b].last || '')).slice(0, keys.length - 800).forEach(x => delete mem().items[x]);
    libCache = null; save();
  }
  function propose(lineEl) {
    const q = getQuote(editingId), i = +lineEl.dataset.i, l = q && q.lines[i];
    lineEl.querySelectorAll('.mem-prop').forEach(x => x.remove());
    if (!on() || !l || l.t !== 'item' || String(l.desc).trim().length < 4 || !(num(l.price) > 0) || inCatalog(l) || mem().ignore[key(l.desc)]) return;
    const g = guess(l.desc), mat = g.kind === 'materiau';
    lineEl.insertAdjacentHTML('beforeend', `<div class="mem-prop" data-i="${i}"><span>💡 Pas encore dans votre catalogue :</span>
      <select class="mem-kind"><option value="materiau" ${mat ? 'selected' : ''}>Matériau</option><option value="prestation" ${mat ? '' : 'selected'}>Prestation</option></select>
      <input class="mem-cat" value="${esc(g.cat)}" placeholder="Catégorie" list="${mat ? 'matcatsMem' : 'catsMem'}" title="Catégorie proposée selon votre métier">
      <button type="button" class="btn small primary" data-act="mem-add" data-i="${i}">Ajouter au catalogue</button>
      <button type="button" class="btn small" data-act="mem-no" data-i="${i}" title="Ne plus proposer pour cette désignation">Ne plus proposer</button></div>`);
  }
  document.addEventListener('focusout', e => {
    if (view !== 'editor') return;
    const line = e.target.closest && e.target.closest('#linesBody .line'); if (!line) return;
    if (e.relatedTarget && line.contains(e.relatedTarget)) return;
    const q = getQuote(editingId), l = q && q.lines[+line.dataset.i]; if (!l || l.t !== 'item') return;
    setTimeout(() => { if (!document.body.contains(line)) return; remember(l); propose(line); }, 120);
  });

  Object.assign(actions, {
    'mem-add'(t) {
      const q = getQuote(editingId), l = q.lines[+t.dataset.i], bar = t.closest('.mem-prop'); if (!l) return;
      const kind = bar.querySelector('.mem-kind').value, cat = bar.querySelector('.mem-cat').value.trim();
      if (kind === 'prestation') {
        db.catalog.push({ id: uid(), type: 'prestation', ref: l.ref || '', desc: String(l.desc).trim(), cat, unit: l.unit, price: num(l.price), cost: 0, vat: num(l.vat), fav: false });
        save(); libCache = null; bar.remove(); toast(`Ajouté au catalogue (Prestations${cat ? ' · ' + cat : ''})`);
        return;
      }
      // matériau : la fiche s'ouvre pré-remplie pour choisir le fournisseur et vérifier le prix d'achat
      const g = guess(l.desc), sp = sups().find(s => g.supplier && s.name === g.supplier);
      matModal(null, () => { libCache = null; refreshLines(); toast(`Ajouté au catalogue (Matériaux${cat ? ' · ' + cat : ''})`); }, sp && sp.id);
      const f = document.getElementById('matForm'); if (!f) return;
      const set = (n, v) => { const el = f.elements[n]; if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      const s = sups().find(x => x.id === f.elements.supplierId.value), mk = num(s ? s.markup : 0);
      set('desc', String(l.desc).trim()); set('ref', l.ref || ''); set('unit', l.unit || 'pièce(s)'); set('cat', cat); set('vat', String(num(l.vat)));
      set('cost', String(Math.round(num(l.price) / (1 + mk / 100) * 100) / 100));
      const h = document.getElementById('mhint'); if (h) h.textContent = 'Prix d’achat calculé à partir du prix du devis et de la marge du fournisseur : vérifiez-le.';
    },
    'mem-no'(t) { const q = getQuote(editingId), l = q.lines[+t.dataset.i]; if (l) { mem().ignore[key(l.desc)] = 1; save(); } t.closest('.mem-prop').remove(); },
    'mem-toggle'() { db.settings.memory = !on(); save(); render(); toast(on() ? 'Mémoire activée' : 'Mémoire désactivée'); },
    'mem-clear'() { if (!confirm('Oublier toutes les lignes mémorisées ? (votre catalogue n’est pas touché)')) return; db.memory = { items: {}, ignore: {} }; libCache = null; save(); render(); toast('Mémoire effacée'); }
  });

  /* listes de catégories pour le champ « Catégorie » de la proposition */
  const lists = () => { const cats = k => [...new Set(db.catalog.filter(c => (k === 'm') === isMat(c)).map(c => c.cat).filter(Boolean))];
    let d = document.getElementById('memLists'); if (!d) { d = document.createElement('div'); d.id = 'memLists'; d.hidden = true; document.body.appendChild(d); }
    d.innerHTML = `<datalist id="matcatsMem">${cats('m').map(c => `<option value="${esc(c)}">`).join('')}</datalist><datalist id="catsMem">${cats('p').map(c => `<option value="${esc(c)}">`).join('')}</datalist>`; };
  const prevEd = AFTER.editor; AFTER.editor = function () { if (prevEd) prevEd.apply(this, arguments); lists(); close(); };

  /* interrupteur dans le Catalogue */
  const prevCat = EXTRA.catalog;
  EXTRA.catalog = function () {
    const html = prevCat.apply(this, arguments), n = Object.keys(mem().items).length, tr = myTrade();
    const strip = `<div class="mem-strip ${on() ? 'on' : ''}"><label class="switch"><input type="checkbox" data-act="mem-toggle" ${on() ? 'checked' : ''}><span></span></label>
      <div><b>Mémoire ${on() ? 'activée' : 'désactivée'}</b><span class="muted">${on() ? `Dans un devis, les désignations se complètent toutes seules (catalogue, anciens devis${tr ? ', métier ' + esc(tr.name) : ''}) et les nouvelles lignes vous sont proposées pour le catalogue.` : 'Activez-la pour retrouver vos lignes en tapant et enrichir le catalogue au fil des devis.'}</span></div>
      ${n ? `<button class="btn small" data-act="mem-clear" title="Effacer les lignes mémorisées">Oublier ${n} ligne${n > 1 ? 's' : ''}</button>` : ''}</div>`;
    return html.replace('</div>', '</div>' + strip);   // juste après les onglets
  };
  window.memorySearch = search;
})();
