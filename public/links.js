'use strict';
/* Boîte à outils > Liens utiles : l'utilisateur choisit son métier, on affiche les sites officiels et organismes utiles. */
(function () {
  // [nom, adresse, description, catégorie]
  const L = {
    urssaf: ['URSSAF', 'https://www.urssaf.fr', 'Cotisations sociales, déclarations, attestations de vigilance', 'Administratif & cotisations'],
    autoe: ['URSSAF Auto-entrepreneur', 'https://www.autoentrepreneur.urssaf.fr', 'Déclarer son chiffre d’affaires de micro-entrepreneur', 'Administratif & cotisations'],
    impots: ['impots.gouv.fr', 'https://www.impots.gouv.fr', 'Espace professionnel : TVA, impôts, facture électronique', 'Administratif & cotisations'],
    annuaire: ['Annuaire des entreprises', 'https://annuaire-entreprises.data.gouv.fr', 'Vérifier le SIRET, le SIREN et les informations d’un client ou fournisseur', 'Administratif & cotisations'],
    guichet: ['Guichet unique des formalités', 'https://formalites.entreprises.gouv.fr', 'Créer, modifier ou fermer son entreprise', 'Administratif & cotisations'],
    entreprendre: ['Entreprendre.Service-Public.fr', 'https://entreprendre.service-public.fr', 'Le site officiel des démarches et obligations des entreprises', 'Administratif & cotisations'],
    cma: ['Chambres de métiers et de l’artisanat', 'https://www.artisanat.fr', 'Accompagnement, formations et répertoire des métiers', 'Organismes professionnels'],
    bpi: ['Bpifrance', 'https://www.bpifrance.fr', 'Financements, prêts et garanties pour les entreprises', 'Financement'],
    cibtp: ['CIBTP', 'https://www.cibtp.fr', 'Caisses congés payés et intempéries du BTP', 'Organismes du BTP'],
    probtp: ['PRO BTP', 'https://www.probtp.com', 'Retraite, prévoyance et santé des professionnels du BTP', 'Organismes du BTP'],
    oppbtp: ['OPPBTP (PréventionBTP)', 'https://www.preventionbtp.fr', 'Prévention des risques, document unique, sécurité sur chantier', 'Sécurité & prévention'],
    qualibat: ['Qualibat', 'https://www.qualibat.com', 'Qualifications et certifications des entreprises du bâtiment (dont RGE)', 'Qualifications & labels'],
    capeb: ['CAPEB', 'https://www.capeb.fr', 'Syndicat de l’artisanat du bâtiment', 'Organismes du BTP'],
    ffb: ['FFB – Fédération Française du Bâtiment', 'https://www.ffbatiment.fr', 'Fédération professionnelle, informations techniques et juridiques', 'Organismes du BTP'],
    cstb: ['CSTB', 'https://www.cstb.fr', 'Centre scientifique et technique du bâtiment : DTU, avis techniques', 'Normes & règles de l’art'],
    aqc: ['Agence Qualité Construction', 'https://qualiteconstruction.com', 'Prévention des désordres, fiches pathologies et bonnes pratiques', 'Normes & règles de l’art'],
    renov: ['France Rénov’', 'https://france-renov.gouv.fr', 'Le service public de la rénovation de l’habitat, annuaire RGE', 'Aides & rénovation énergétique'],
    mpr: ['MaPrimeRénov’', 'https://www.maprimerenov.gouv.fr', 'Aide de l’État pour la rénovation énergétique', 'Aides & rénovation énergétique'],
    ademe: ['ADEME', 'https://www.ademe.fr', 'Agence de la transition écologique : guides et données', 'Aides & rénovation énergétique'],
    qualitenr: ['Qualit’EnR', 'https://www.qualit-enr.org', 'Qualification RGE pour les énergies renouvelables (PAC, solaire, bois)', 'Qualifications & labels'],
    consuel: ['Consuel', 'https://www.consuel.com', 'Attestation de conformité des installations électriques', 'Normes & règles de l’art'],
    qualifelec: ['Qualifelec', 'https://www.qualifelec.fr', 'Qualification des entreprises de l’électricité et du génie énergétique', 'Qualifications & labels'],
    promotelec: ['Promotelec', 'https://www.promotelec.com', 'Guides et labels pour l’électricité et la performance du logement', 'Normes & règles de l’art'],
    qualigaz: ['Qualigaz', 'https://www.qualigaz.com', 'Certificats de conformité des installations gaz', 'Normes & règles de l’art'],
    placo: ['Placo', 'https://www.placo.fr', 'Fabricant : systèmes plaques de plâtre, documentations et fiches techniques', 'Fabricants & fournisseurs'],
    knauf: ['Knauf', 'https://www.knauf.fr', 'Fabricant : plâtre, isolation, guides de pose', 'Fabricants & fournisseurs'],
    siniat: ['Siniat', 'https://www.siniat.fr', 'Fabricant : plaques et systèmes plâtre', 'Fabricants & fournisseurs'],
    weber: ['Weber', 'https://www.fr.weber', 'Fabricant : mortiers, colles, enduits de façade, guides de pose', 'Fabricants & fournisseurs'],
    zolpan: ['Zolpan', 'https://www.zolpan.fr', 'Fabricant de peintures professionnelles', 'Fabricants & fournisseurs'],
    tollens: ['Tollens', 'https://www.tollens.com', 'Fabricant de peintures professionnelles', 'Fabricants & fournisseurs'],
    cerib: ['CERIB', 'https://www.cerib.com', 'Centre d’études et de recherches de l’industrie du béton', 'Normes & règles de l’art'],
    fcba: ['FCBA', 'https://www.fcba.fr', 'Institut technologique bois, construction et ameublement', 'Normes & règles de l’art'],
    cnpp: ['CNPP', 'https://www.cnpp.com', 'Certification A2P des serrures et prévention des risques', 'Qualifications & labels'],
    unep: ['Les Entreprises du Paysage (Unep)', 'https://www.lesentreprisesdupaysage.fr', 'Organisation professionnelle des paysagistes', 'Organismes professionnels'],
    valhor: ['Val’hor', 'https://www.valhor.fr', 'Interprofession de l’horticulture et du paysage', 'Organismes professionnels'],
    fep: ['Monde de la Propreté (FEP)', 'https://www.monde-proprete.com', 'Fédération des entreprises de propreté', 'Organismes professionnels'],
    malt: ['Malt', 'https://www.malt.fr', 'Plateforme pour trouver des missions en freelance', 'Clients & missions'],
    bpicrea: ['Bpifrance Création', 'https://bpifrance-creation.fr', 'Guides pour créer et gérer son activité', 'Financement'],
    pointp: ['Point.P', 'https://www.pointp.fr', 'Négoce de matériaux de construction', 'Fabricants & fournisseurs'],
    cedeo: ['Cedeo', 'https://www.cedeo.fr', 'Négoce sanitaire, chauffage et plomberie', 'Fabricants & fournisseurs'],
    gedimat: ['Gedimat', 'https://www.gedimat.fr', 'Négoce de matériaux', 'Fabricants & fournisseurs']
  };
  const BTP = ['cibtp', 'probtp', 'oppbtp', 'qualibat', 'capeb', 'ffb', 'cstb', 'aqc'];
  const ENERGIE = ['renov', 'mpr', 'ademe'];
  const BASE = ['urssaf', 'autoe', 'impots', 'annuaire', 'guichet', 'entreprendre', 'cma', 'bpi'];
  const BY = {
    couvreur: [...BTP, ...ENERGIE, 'pointp', 'gedimat'],
    plaquiste: [...BTP, 'placo', 'knauf', 'siniat', 'pointp', 'gedimat'],
    plombier: [...BTP, ...ENERGIE, 'qualitenr', 'qualigaz', 'cedeo', 'pointp'],
    electricien: [...BTP, ...ENERGIE, 'consuel', 'qualifelec', 'promotelec'],
    peintre: [...BTP, 'zolpan', 'tollens', 'pointp'],
    macon: [...BTP, 'cerib', 'weber', 'pointp', 'gedimat'],
    carreleur: [...BTP, 'weber', 'pointp'],
    menuisier: [...BTP, ...ENERGIE, 'fcba', 'pointp'],
    chauffagiste: [...BTP, ...ENERGIE, 'qualitenr', 'qualigaz', 'cedeo'],
    charpentier: [...BTP, 'fcba', 'pointp', 'gedimat'],
    facadier: [...BTP, ...ENERGIE, 'weber', 'pointp'],
    isolation: [...BTP, ...ENERGIE, 'qualitenr', 'placo', 'knauf'],
    paysagiste: ['unep', 'valhor', 'probtp', 'oppbtp'],
    serrurier: ['cnpp', 'qualibat', 'probtp', 'oppbtp'],
    nettoyage: ['fep'],
    services: ['malt', 'bpicrea'],
    depannage: [...BTP, 'pointp', 'cedeo']
  };
  const ORDER = ['Organismes du BTP', 'Organismes professionnels', 'Qualifications & labels', 'Normes & règles de l’art', 'Sécurité & prévention', 'Aides & rénovation énergétique', 'Fabricants & fournisseurs', 'Clients & missions', 'Administratif & cotisations', 'Financement'];
  const trades = () => (typeof TRADES !== 'undefined' ? TRADES : []);
  const domain = u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');

  function linksHtml() {
    const cur = db.settings.trade || '';
    const ids = [...new Set([...(BY[cur] || []), ...BASE])];
    const groups = {};
    ids.forEach(k => { const l = L[k]; if (l) (groups[l[3]] = groups[l[3]] || []).push(l); });
    const t = trades().find(x => x.id === cur);
    return `<div class="card"><h2 style="margin-bottom:6px">Votre métier</h2>
      <p class="muted" style="margin:0 0 12px;font-size:.88rem">Choisissez votre métier : on vous montre les organismes, qualifications, normes et fournisseurs utiles. Votre choix est retenu.</p>
      <div class="chips">${trades().map(x => `<button class="cchip ${cur === x.id ? 'on' : ''}" data-act="link-trade" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div></div>
      ${ORDER.filter(g => groups[g]).map(g => `<div class="card"><h2 style="margin-bottom:10px">${esc(g)}</h2><div class="links-grid">${groups[g].map(([n, u, d]) => `<a class="link-card" href="${u}" target="_blank" rel="noopener noreferrer"><b>${esc(n)} <span aria-hidden="true">↗</span></b><span>${esc(d)}</span><i>${esc(domain(u))}</i></a>`).join('')}</div></div>`).join('')}
      <p class="muted" style="font-size:.8rem">${t ? `Sélection pour <b>${esc(t.name)}</b>, plus les sites utiles à toutes les entreprises.` : 'Choisissez un métier pour voir les liens spécialisés. En attendant : les sites utiles à toutes les entreprises.'} Ces liens ouvrent des sites externes, indépendants d’OptiDevis.</p>`;
  }
  window.linksHtml = linksHtml;
  TOOL_TABS.push(['links', 'Liens utiles']);
  Object.assign(actions, {
    'link-trade'(t) { db.settings.trade = db.settings.trade === t.dataset.id ? '' : t.dataset.id; save(); const b = document.getElementById('toolsBody'); if (b) b.innerHTML = linksHtml(); }
  });
})();
