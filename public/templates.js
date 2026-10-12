'use strict';
/* Modèles de devis par métier : des devis de départ réalistes (prix indicatifs HT) que chaque client peut ajouter puis adapter.
   Ligne : [réf, désignation, quantité, unité, prix HT, TVA %] — ['T', 'Titre'] = titre de section, ['S'] = sous-total. */
const TRADES = [
  { id: 'couvreur', name: 'Couvreur', ico: 'hardhat', vat: 10, title: 'RÉFECTION DE TOITURE — TUILES TERRE CUITE', lines: [
    ['T', 'Dépose et préparation'], ['COU-DEP', 'Dépose de la couverture existante, tri et évacuation en benne', 120, 'm2', 14], ['COU-ECR', 'Contrôle et remplacement ponctuel de liteaux et chevrons', 1, 'forfait', 450], ['S'],
    ['T', 'Couverture'], ['COU-ECRAN', 'Écran de sous-toiture HPV posé et fixé', 120, 'm2', 6.5], ['COU-LIT', 'Liteaux traités 27×40 mm, pose au pureau', 120, 'm2', 9], ['COU-TUI', 'Fourniture et pose de tuiles terre cuite (environ 13/m²)', 120, 'm2', 58], ['COU-FAI', 'Faîtage à sec ventilé, closoirs et rives', 12, 'ml', 42], ['S'],
    ['T', 'Zinguerie'], ['COU-GOU', 'Gouttière zinc demi-ronde et descente', 18, 'ml', 48], ['COU-SOL', 'Solin et noue en zinc', 8, 'ml', 55], ['S'],
    ['T', 'Finitions'], ['COU-NET', 'Nettoyage du chantier et évacuation des gravats', 1, 'forfait', 180]], notes: 'Travaux réalisés conformément au DTU 40.21. Échafaudage et protection du chantier compris.' },
  { id: 'plaquiste', name: 'Plaquiste', ico: 'layers', vat: 10, title: 'TRAVAUX DE PLÂTRERIE — AMÉNAGEMENT DE COMBLES', lines: [
    ['T', 'Cloisons et doublages'], ['PLA-CLO', 'Cloison de distribution en plaques de plâtre BA13 sur ossature métallique', 30, 'm2', 38], ['PLA-DBL', 'Doublage BA13 sur ossature avec isolant 100 mm', 45, 'm2', 46], ['S'],
    ['T', 'Plafonds'], ['PLA-PLF', 'Plafond suspendu BA13 sur ossature, isolation comprise', 40, 'm2', 44], ['PLA-TRP', 'Trappe de visite 60×60 cm', 2, 'u', 85], ['S'],
    ['T', 'Finitions'], ['PLA-BDE', 'Bandes à joints et enduit, finition prête à peindre (niveau Q2)', 115, 'm2', 12], ['PLA-ANG', 'Cornières d\'angle métalliques', 22, 'ml', 6], ['PLA-EVA', 'Évacuation des déchets', 1, 'forfait', 150]], notes: 'Plaques hydrofuges en pièces d\'eau (plus-value sur demande).' },
  { id: 'plombier', name: 'Plombier – chauffagiste', ico: 'tool', vat: 10, title: 'RÉNOVATION SALLE DE BAINS — PLOMBERIE', lines: [
    ['T', 'Dépose'], ['PLO-DEP', 'Dépose de la baignoire, du lavabo et des sanitaires, évacuation', 1, 'forfait', 380], ['S'],
    ['T', 'Plomberie'], ['PLO-ALI', 'Réseau d\'alimentation eau chaude / eau froide en PER', 1, 'forfait', 620], ['PLO-EVA', 'Évacuations PVC et raccordements', 1, 'forfait', 480], ['PLO-DCH', 'Receveur de douche extra-plat 90×120 et paroi (fourniture et pose)', 1, 'u', 980], ['PLO-MEU', 'Meuble vasque 80 cm avec mitigeur (fourniture et pose)', 1, 'u', 690], ['PLO-WC', 'WC suspendu avec bâti-support (fourniture et pose)', 1, 'u', 760], ['PLO-SEC', 'Radiateur sèche-serviettes électrique, pose et raccordement', 1, 'u', 540], ['S'],
    ['T', 'Main-d\'œuvre'], ['PLO-MO', 'Main-d\'œuvre complémentaire', 14, 'h', 55]], notes: 'Mise en eau et essais de fonctionnement à la fin des travaux. Garantie décennale et assurance responsabilité civile professionnelle.' },
  { id: 'electricien', name: 'Électricien', ico: 'tool', vat: 10, title: 'MISE AUX NORMES ÉLECTRIQUES — APPARTEMENT 65 M²', lines: [
    ['T', 'Tableau et protections'], ['ELE-TAB', 'Tableau électrique 3 rangées, disjoncteurs et différentiels (NF C 15-100)', 1, 'u', 1150], ['ELE-TER', 'Prise de terre et liaison équipotentielle', 1, 'forfait', 320], ['S'],
    ['T', 'Circuits'], ['ELE-PRI', 'Point prise 16 A encastré avec câblage', 22, 'u', 78], ['ELE-LUM', 'Point lumineux avec câblage et interrupteur', 12, 'u', 92], ['ELE-SPE', 'Circuit spécialisé (four, plaque, lave-linge)', 4, 'u', 165], ['ELE-VDI', 'Prise RJ45 et coffret de communication', 1, 'forfait', 420], ['S'],
    ['T', 'Finitions'], ['ELE-CON', 'Contrôle final et attestation de conformité (Consuel)', 1, 'forfait', 190]], notes: 'Appareillage de marque Legrand ou équivalent, coloris au choix du client.' },
  { id: 'peintre', name: 'Peintre en bâtiment', ico: 'file', vat: 10, title: 'PEINTURE ET REVÊTEMENTS — APPARTEMENT T3', lines: [
    ['T', 'Préparation'], ['PEI-PRE', 'Protection des sols et mobilier, rebouchage, ponçage', 1, 'forfait', 380], ['PEI-IMP', 'Impression des murs et plafonds', 210, 'm2', 4.5], ['S'],
    ['T', 'Finitions'], ['PEI-PLA', 'Peinture acrylique mate, 2 couches, plafonds', 62, 'm2', 18], ['PEI-MUR', 'Peinture acrylique satinée, 2 couches, murs', 148, 'm2', 20], ['PEI-BOI', 'Peinture laque sur portes, plinthes et huisseries', 8, 'u', 95], ['PEI-TAP', 'Pose de toile de verre à peindre', 36, 'm2', 17], ['S'],
    ['T', 'Nettoyage'], ['PEI-NET', 'Nettoyage fin de chantier', 1, 'forfait', 120]], notes: 'Teintes au choix du client sur nuancier. Peintures classées A+ (faibles émissions).' },
  { id: 'macon', name: 'Maçon', ico: 'building', vat: 10, title: 'EXTENSION DE 20 M² — GROS ŒUVRE', lines: [
    ['T', 'Terrassement et fondations'], ['MAC-TER', 'Terrassement et évacuation des terres', 1, 'forfait', 1450], ['MAC-FON', 'Semelles filantes béton armé', 24, 'ml', 135], ['S'],
    ['T', 'Élévation'], ['MAC-DAL', 'Dallage béton armé sur hérisson et isolant (ép. 12 cm)', 20, 'm2', 86], ['MAC-MUR', 'Murs en blocs béton de 20 cm, chaînages et linteaux', 52, 'm2', 98], ['MAC-OUV', 'Création d\'une ouverture dans mur porteur avec IPN', 1, 'u', 2200], ['S'],
    ['T', 'Divers'], ['MAC-ENT', 'Enduit de façade monocouche gratté', 52, 'm2', 44], ['MAC-GRA', 'Évacuation des gravats', 1, 'forfait', 420]], notes: 'Déclaration préalable ou permis de construire à la charge du client. Les prix incluent la main-d\'œuvre, la fourniture et la pose.' },
  { id: 'carreleur', name: 'Carreleur', ico: 'layers', vat: 10, title: 'CARRELAGE ET FAÏENCE — SÉJOUR ET SALLE DE BAINS', lines: [
    ['T', 'Préparation'], ['CAR-RAG', 'Ragréage autolissant des sols', 45, 'm2', 16], ['CAR-ETA', 'Étanchéité sous carrelage (SPEC) en pièce d\'eau', 9, 'm2', 32], ['S'],
    ['T', 'Pose'], ['CAR-SOL', 'Pose de carrelage grand format 60×60 cm (fourniture à part)', 45, 'm2', 52], ['CAR-FAI', 'Pose de faïence murale, joints époxy', 22, 'm2', 58], ['CAR-PLI', 'Plinthes assorties', 28, 'ml', 11], ['CAR-DIA', 'Coupes diagonales et finitions d\'angle', 1, 'forfait', 180], ['S'],
    ['T', 'Fournitures'], ['CAR-FOU', 'Carrelage grès cérame 60×60, 1ʳᵉ qualité (+ 10 % de chutes)', 50, 'm2', 29]], notes: 'Le choix du carrelage est à valider avant commande. Délai d\'approvisionnement : 1 à 2 semaines.' },
  { id: 'menuisier', name: 'Menuisier – agenceur', ico: 'tool', vat: 10, title: 'MENUISERIES EXTÉRIEURES ET INTÉRIEURES', lines: [
    ['T', 'Fenêtres'], ['MEN-FEN', 'Fenêtre PVC double vitrage 2 vantaux 120×135 cm, pose en rénovation', 5, 'u', 520], ['MEN-VRO', 'Volet roulant électrique, pose comprise', 5, 'u', 380], ['S'],
    ['T', 'Portes'], ['MEN-POR', 'Bloc-porte intérieur âme alvéolaire, pose comprise', 4, 'u', 290], ['MEN-ENT', 'Porte d\'entrée sécurisée 3 points, pose comprise', 1, 'u', 1450], ['S'],
    ['T', 'Aménagement'], ['MEN-PLA', 'Placard sur mesure avec portes coulissantes', 1, 'u', 1650], ['MEN-PAR', 'Pose de parquet stratifié avec sous-couche', 38, 'm2', 29]], notes: 'Dimensions confirmées sur place avant fabrication. Délai de fabrication : 4 à 6 semaines.' },
  { id: 'chauffagiste', name: 'Chauffagiste – climatisation', ico: 'tool', vat: 5.5, title: 'INSTALLATION D\'UNE POMPE À CHALEUR AIR/EAU', lines: [
    ['T', 'Fourniture'], ['CHA-PAC', 'Pompe à chaleur air/eau 8 kW avec module hydraulique', 1, 'u', 6900], ['CHA-BAL', 'Ballon tampon 100 L et accessoires', 1, 'u', 780], ['S'],
    ['T', 'Installation'], ['CHA-POS', 'Pose, raccordements hydrauliques et électriques', 1, 'forfait', 1850], ['CHA-DEP', 'Dépose de l\'ancienne chaudière fioul, cuve neutralisée', 1, 'forfait', 750], ['CHA-MIS', 'Mise en service, réglage de la régulation et formation du client', 1, 'forfait', 320], ['S'],
    ['T', 'Aides'], ['CHA-DOS', 'Constitution du dossier d\'aides (MaPrimeRénov\', CEE)', 1, 'forfait', 0]], notes: 'TVA à 5,5 % pour un logement de plus de 2 ans (attestation à signer). Contrat d\'entretien proposé en option.' },
  { id: 'charpentier', name: 'Charpentier', ico: 'hardhat', vat: 10, title: 'CHARPENTE TRADITIONNELLE ET ISOLATION DE COMBLES', lines: [
    ['T', 'Charpente'], ['CHP-FER', 'Fermes et pannes en bois traité (sapin du Nord, classe 2)', 1, 'forfait', 6200], ['CHP-CHE', 'Chevrons 63×75 mm, pose comprise', 120, 'm2', 22], ['CHP-TRA', 'Traitement insecticide et fongicide des bois existants', 120, 'm2', 9], ['S'],
    ['T', 'Isolation'], ['CHP-ISO', 'Isolation sous rampants en laine de bois, 200 mm', 120, 'm2', 48], ['CHP-PAR', 'Pare-vapeur et finition en lambris', 120, 'm2', 32], ['S'],
    ['T', 'Divers'], ['CHP-LEV', 'Levage, grutage et évacuation des déchets', 1, 'forfait', 780]], notes: 'Calcul de structure fourni si nécessaire. Assurance décennale n° : voir mentions légales.' },
  { id: 'facadier', name: 'Façadier – ravalement', ico: 'building', vat: 10, title: 'RAVALEMENT DE FAÇADE — MAISON INDIVIDUELLE', lines: [
    ['T', 'Préparation'], ['FAC-ECH', 'Installation et dépose d\'échafaudage', 160, 'm2', 9], ['FAC-NET', 'Nettoyage haute pression et traitement anti-mousse', 160, 'm2', 8], ['FAC-REP', 'Réparation des fissures et reprises d\'enduit', 1, 'forfait', 680], ['S'],
    ['T', 'Finition'], ['FAC-IMP', 'Impression fixatrice', 160, 'm2', 5], ['FAC-ENDU', 'Enduit de finition taloché fin, teinté dans la masse', 160, 'm2', 38], ['FAC-SOU', 'Peinture des soubassements et des encadrements de fenêtres', 1, 'forfait', 540]], notes: 'Travaux dépendant de la météo : report possible sans pénalité. Protection des menuiseries et des abords comprise.' },
  { id: 'isolation', name: 'Isolation – rénovation énergétique', ico: 'layers', vat: 5.5, title: 'ISOLATION THERMIQUE — COMBLES ET MURS', lines: [
    ['T', 'Combles perdus'], ['ISO-CPE', 'Isolation de combles perdus par soufflage de laine minérale, R = 7', 80, 'm2', 28], ['ISO-ECR', 'Pose de repères et protections des conduits', 1, 'forfait', 180], ['S'],
    ['T', 'Murs'], ['ISO-ITI', 'Isolation thermique par l\'intérieur, laine de verre 120 mm + BA13', 60, 'm2', 62], ['ISO-VMC', 'Mise en place d\'une ventilation (VMC simple flux hygroréglable)', 1, 'u', 980], ['S'],
    ['T', 'Administratif'], ['ISO-DOS', 'Dossier d\'aides MaPrimeRénov\' et CEE, attestation de TVA', 1, 'forfait', 0]], notes: 'Entreprise certifiée RGE (n° à indiquer) : condition d\'accès aux aides. TVA à 5,5 % sur justificatif.' },
  { id: 'paysagiste', name: 'Paysagiste – jardinier', ico: 'package', vat: 20, title: 'AMÉNAGEMENT ET ENTRETIEN DE JARDIN', lines: [
    ['T', 'Création'], ['PAY-TER', 'Terrassement et préparation du sol, apport de terre végétale', 80, 'm2', 14], ['PAY-GAZ', 'Engazonnement (semis ou plaques)', 80, 'm2', 9], ['PAY-HAI', 'Plantation de haie de 12 arbustes (fourniture et pose)', 12, 'u', 38], ['PAY-ARR', 'Système d\'arrosage automatique 4 zones', 1, 'forfait', 1450], ['S'],
    ['T', 'Entretien'], ['PAY-TAI', 'Taille de haies et d\'arbustes', 4, 'h', 48], ['PAY-TON', 'Tonte, bordures et ramassage', 6, 'h', 42], ['PAY-DEC', 'Évacuation des déchets verts en déchetterie', 1, 'forfait', 120]], notes: 'Les plantations sont garanties un an en cas de bon entretien. Entretien régulier possible sur contrat annuel.' },
  { id: 'serrurier', name: 'Serrurier – vitrier', ico: 'lock', vat: 10, title: 'SÉCURISATION ET DÉPANNAGE', lines: [
    ['T', 'Interventions'], ['SER-DEP', 'Déplacement et diagnostic', 1, 'forfait', 65], ['SER-OUV', 'Ouverture de porte claquée (sans dégradation)', 1, 'forfait', 120], ['SER-BLI', 'Remplacement de la serrure 5 points A2P***', 1, 'u', 480], ['SER-CYL', 'Cylindre haute sécurité avec 5 clés', 1, 'u', 135], ['SER-VIT', 'Remplacement de vitrage feuilleté 44.2', 1.2, 'm2', 190], ['SER-MO', 'Main-d\'œuvre', 2, 'h', 62]], notes: 'Devis gratuit. Paiement à la fin de l\'intervention. Cylindres et serrures conformes aux normes en vigueur.' },
  { id: 'nettoyage', name: 'Nettoyage – entretien', ico: 'sparkles', vat: 20, title: 'NETTOYAGE DE FIN DE CHANTIER ET ENTRETIEN', lines: [
    ['T', 'Fin de chantier'], ['NET-CHA', 'Nettoyage complet de fin de chantier (sols, vitres, sanitaires)', 85, 'm2', 6.5], ['NET-VIT', 'Nettoyage des vitres et des encadrements', 14, 'u', 12], ['NET-DEC', 'Évacuation des déchets légers', 1, 'forfait', 60], ['S'],
    ['T', 'Entretien régulier'], ['NET-ENT', 'Entretien hebdomadaire des parties communes', 4, 'h', 28], ['NET-DES', 'Désinfection des sanitaires et poignées', 1, 'forfait', 45]], notes: 'Produits et matériel fournis. Intervention possible en soirée ou le week-end.' },
  { id: 'services', name: 'Prestataire de services – freelance', ico: 'clipboard', vat: 20, title: 'PRESTATION DE CONSEIL ET DE CRÉATION', lines: [
    ['T', 'Phase 1 — Cadrage'], ['SRV-ATE', 'Atelier de cadrage et recueil du besoin', 1, 'jour', 600], ['SRV-CDC', 'Rédaction du cahier des charges', 1.5, 'jour', 600], ['S'],
    ['T', 'Phase 2 — Réalisation'], ['SRV-CRE', 'Création et développement', 8, 'jour', 600], ['SRV-REV', 'Deux séries de retours client incluses', 1, 'forfait', 0], ['S'],
    ['T', 'Phase 3 — Livraison'], ['SRV-FOR', 'Formation et prise en main (2 h)', 1, 'forfait', 240], ['SRV-SUI', 'Suivi et assistance pendant 30 jours', 1, 'forfait', 300]], notes: 'Les droits d\'utilisation sont cédés au paiement du solde. Prestation facturée à l\'avancement selon l\'échéancier.' },
  { id: 'depannage', name: 'Artisan multi-services – dépannage', ico: 'tool', vat: 10, title: 'PETITS TRAVAUX ET DÉPANNAGES', lines: [
    ['T', 'Intervention'], ['DEP-DEP', 'Déplacement', 1, 'forfait', 45], ['DEP-MO', 'Main-d\'œuvre (taux horaire)', 6, 'h', 52], ['DEP-FOU', 'Fournitures diverses (selon facture)', 1, 'forfait', 90], ['DEP-POS', 'Pose de meubles et accessoires', 3, 'u', 40], ['DEP-REP', 'Réparations diverses (joints, fuites, serrurerie légère)', 1, 'forfait', 160]], notes: 'Devis valable 30 jours. Le détail des fournitures est communiqué sur demande.' }
];
const tradeTotal = t => t.lines.reduce((s, l) => (l[0] === 'T' || l[0] === 'S' ? s : s + l[2] * l[4]), 0);

function tplOpen() {
  const m = openModal(`<div class="modal-wide" id="tplBox"><div class="row between"><h2 style="margin:0">Modèles de devis par métier</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
    <p class="muted" style="margin:10px 0">Choisissez votre métier : un devis complet de départ est créé, avec des lignes et des prix <b>indicatifs</b> à adapter. Vous modifiez tout ensuite.</p>
    <div class="tpl-grid">${TRADES.map(t => `<button type="button" class="tpl-card" data-act="tpl-pick" data-id="${t.id}"><i class="ld-tile" aria-hidden="true">${icon(t.ico)}</i><div><b>${esc(t.name)}</b><span>${t.lines.filter(l => l[0] !== 'T' && l[0] !== 'S').length} lignes · environ ${money(tradeTotal(t))} HT</span></div></button>`).join('')}</div>
    <p class="muted" style="font-size:.82rem;margin-top:12px">Votre métier n'est pas dans la liste ? Prenez « Artisan multi-services » ou « Prestataire de services » et adaptez les lignes, ou créez un devis vierge.</p></div>`);
  return m;
}
function tplPreview(id) {
  const t = TRADES.find(x => x.id === id); if (!t) return;
  const vat = db.company.vatExempt ? 0 : t.vat;
  const rows = t.lines.map(l => l[0] === 'T' ? `<tr class="kindrow"><td colspan="5"><b>${esc(l[1])}</b></td></tr>` : l[0] === 'S' ? '' : `<tr><td>${esc(l[1])}</td><td class="right">${String(l[2]).replace('.', ',')} ${esc(l[3])}</td><td class="right">${money(l[4])}</td><td class="right"><b>${money(l[2] * l[4])}</b></td></tr>`).join('');
  const ht = tradeTotal(t);
  $('#tplBox').innerHTML = `<div class="row between"><h2 style="margin:0">${esc(t.name)}</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
    <p class="muted" style="margin:8px 0">${esc(t.title)}</p>
    <div style="overflow-x:auto;max-height:46vh"><table class="list"><thead><tr><th>Désignation</th><th class="right">Quantité</th><th class="right">PU HT</th><th class="right">Total HT</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="notice" style="margin:12px 0">Total indicatif : <b>${money(ht)} HT</b>${vat ? ` — TVA ${String(vat).replace('.', ',')} % : <b>${money(ht * (1 + vat / 100))} TTC</b>` : ' (TVA non applicable)'}. Les quantités et prix sont des exemples : adaptez-les à votre chantier et à vos tarifs.</div>
    <label class="check"><input type="checkbox" id="tplCat"> Ajouter aussi ces prestations à mon catalogue</label>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-act="tpl-back">← Autres métiers</button><button class="btn primary" data-act="tpl-use" data-id="${t.id}">Utiliser ce modèle</button></div>`;
}
function tplUse(id) {
  if (!requireAccess()) return;
  const t = TRADES.find(x => x.id === id); if (!t) return;
  const vat = db.company.vatExempt ? 0 : t.vat, date = today();
  const lines = t.lines.map(l => l[0] === 'T' ? { t: 'title', desc: l[1] } : l[0] === 'S' ? { t: 'subtotal', label: 'Sous Total' } : { t: 'item', ref: l[0], desc: l[1], qty: l[2], unit: l[3], price: l[4], vat });
  const q = normQuote({ id: uid(), number: makeNumber(), date, validUntil: addDays(date, num(db.settings.validityDays)), clientId: '', title: t.title, status: 'brouillon', notes: t.notes || '', discount: 0, lines,
    payments: [{ id: uid(), invoiceId: '', pct: 30, label: 'Acompte à la commande' }, { id: uid(), invoiceId: '', pct: 70, label: 'Solde à la fin des travaux' }] }, db);
  db.settings.next = num(db.settings.next) + 1;
  if ($('#tplCat') && $('#tplCat').checked) {
    let n = 0; t.lines.forEach(l => { if (l[0] === 'T' || l[0] === 'S' || db.catalog.some(c => c.ref === l[0])) return; db.catalog.push({ id: uid(), ref: l[0], desc: l[1], cat: t.name, type: 'prestation', unit: l[3], price: l[4], cost: 0, vat }); n++; });
    if (n) toast(n + ' prestation(s) ajoutée(s) au catalogue');
  }
  db.quotes.push(q); save(); $('#modal').close(); toast('Devis « ' + t.name + ' » créé : adaptez-le'); go('editor', q.id);
}
Object.assign(actions, {
  'tpl-open': tplOpen, 'tpl-pick': t => tplPreview(t.dataset.id), 'tpl-back': () => { $('#modal').close(); tplOpen(); }, 'tpl-use': t => tplUse(t.dataset.id)
});
