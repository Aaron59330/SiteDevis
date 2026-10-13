'use strict';
/* Secteur d'activité : adapte le vocabulaire (chantier / projet / événement), les exemples, la nature d'opération
   et l'activité micro-entreprise par défaut, pour que le site convienne à tous les métiers. */
(function () {
  const SECTORS = {
    btp: { label: 'Bâtiment et travaux (BTP)', site: 'chantier', title: 'Ex : TRAVAUX DE PLÂTRERIE LOGEMENT 12 RUE DES LILAS', op: 'services', act: 'services' },
    commerce: { label: 'Commerce, vente de produits', site: 'projet', title: 'Ex : COMMANDE DE MOBILIER — MAGASIN DUPONT', op: 'biens', act: 'vente' },
    services: { label: 'Services (dépannage, nettoyage, jardin, informatique…)', site: 'projet', title: 'Ex : ENTRETIEN ANNUEL DU JARDIN', op: 'services', act: 'services' },
    conseil: { label: 'Conseil, création, informatique, formation', site: 'projet', title: 'Ex : CRÉATION DU SITE INTERNET', op: 'services', act: 'bnc' },
    evenement: { label: 'Restauration, traiteur, événementiel', site: 'événement', title: 'Ex : COCKTAIL DÎNATOIRE 80 PERSONNES — 12 JUIN', op: 'mixte', act: 'services' },
    beaute: { label: 'Beauté, bien-être, sport', site: 'projet', title: 'Ex : FORFAIT MARIAGE COIFFURE ET MAQUILLAGE', op: 'services', act: 'services' },
    transport: { label: 'Transport, déménagement, livraison', site: 'projet', title: 'Ex : DÉMÉNAGEMENT LILLE → LYON', op: 'services', act: 'services' },
    auto: { label: 'Automobile, mécanique, réparation', site: 'projet', title: 'Ex : RÉVISION ET REMPLACEMENT DES PLAQUETTES', op: 'mixte', act: 'services' },
    autre: { label: 'Autre activité', site: 'projet', title: 'Ex : PRESTATION DU 12 OCTOBRE', op: 'services', act: 'services' }
  };
  const sector = () => { try { return SECTORS[(db.settings || {}).sector] || SECTORS.btp; } catch (e) { return SECTORS.btp; } };
  window.SECTORS = SECTORS; window.sector = sector;
  window.sectorOp = base => (SECTORS[((base || db).settings || {}).sector] || SECTORS.btp).op;

  /* Vocabulaire : « chantier » devient « projet » ou « événement » dans les textes de l'interface (jamais dans les documents ni les données saisies) */
  const SKIP = '.doc, td, textarea, input, select:not(#nav select), .tpl-card, .link-card, [data-raw], script, style, #toasts';
  const RE = /\b([Cc])hantier(s?)\b/g;
  const swap = txt => { const w = sector().site; return txt.replace(RE, (m, c, s) => (c === 'C' ? w[0].toUpperCase() + w.slice(1) : w) + s); };
  function fix(node) {
    if (sector().site === 'chantier') return;
    if (node.nodeType === 3) { const p = node.parentElement; if (p && !p.closest(SKIP) && RE.test(node.nodeValue)) { RE.lastIndex = 0; node.nodeValue = swap(node.nodeValue); } RE.lastIndex = 0; return; }
    if (node.nodeType !== 1 || node.closest(SKIP)) return;
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = node.getAttribute(a); if (v && /hantier/.test(v)) node.setAttribute(a, swap(v)); }
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 1) { if (!n.closest(SKIP)) for (const a of ['placeholder', 'title', 'aria-label']) { const v = n.getAttribute(a); if (v && /hantier/.test(v)) n.setAttribute(a, swap(v)); } continue; }
      const p = n.parentElement; if (!p || p.closest(SKIP)) continue;
      if (/hantier/.test(n.nodeValue)) n.nodeValue = swap(n.nodeValue);
    }
  }
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(fix); }).observe(document.documentElement, { childList: true, subtree: true });
  window.sectorWord = (plural, cap) => { const w = sector().site + (plural ? 's' : ''); return cap ? w[0].toUpperCase() + w.slice(1) : w; };

  /* Choix du secteur dans « Mon entreprise » : tout se met à jour */
  document.addEventListener('change', e => {
    if (e.target.dataset && e.target.dataset.s === 'sector') { db.settings.sector = e.target.value; save(); if (typeof updateTopbar === 'function') updateTopbar(); render(); toast('Secteur enregistré : ' + sector().label); }
  });
  window.sectorField = () => `<div class="field"><label>Secteur d'activité</label><select data-s="sector">${Object.entries(SECTORS).map(([k, v]) => `<option value="${k}" ${(db.settings.sector || 'btp') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    <p class="muted" style="margin:6px 0 0;font-size:.8rem">Adapte le vocabulaire (chantier, projet, événement), les exemples, les modèles de devis proposés et les liens utiles.</p></div>`;
})();
