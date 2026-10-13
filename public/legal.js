'use strict';
/* Pages légales : conditions générales de vente et d'utilisation, mentions légales, politique de confidentialité.
   Les informations de l'éditeur viennent d'Administration > Réglages (session.config.legal). */
(function () {
  const todo = t => `<span class="lg-todo">${t}</span>`;
  const info = () => {
    const c = session.config || {}, l = c.legal || {};
    return {
      site: esc(c.siteName || 'OptiDevis'), url: esc(location.host || 'optidevis.pro'),
      name: l.name ? esc(l.name) : todo('[nom de l’éditeur à compléter]'),
      status: l.status ? esc(l.status) : todo('[statut et SIRET à compléter]'),
      address: l.address ? esc(l.address) : todo('[adresse à compléter]'),
      email: l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : todo('[email de contact à compléter]'),
      creator: esc(l.creator || 'Aaron'), trial: Number(c.trialDays) || 0, plans: c.plans || []
    };
  };
  const eur = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const per = { month: '1 mois', quarter: '3 mois', year: '12 mois' };
  const UPDATED = '13 octobre 2026';

  const DOCS = {
    cgv: ['Conditions générales de vente et d’utilisation', i => `
      <p class="muted">Dernière mise à jour : ${UPDATED}</p>
      <h3>1. Objet</h3>
      <p>Les présentes conditions régissent l’accès et l’utilisation du service en ligne ${i.site} (${i.url}), qui permet de créer des devis et des factures, de gérer des clients, un catalogue et un suivi d’activité. Le service est édité par ${i.name}, ${i.status}, ${i.address} (« l’éditeur »). Créer un compte implique l’acceptation de ces conditions.</p>
      <h3>2. Compte</h3>
      <p>L’inscription est réservée aux personnes majeures et aux professionnels. Vous vous engagez à fournir des informations exactes et à garder votre mot de passe confidentiel. Vous êtes responsable de l’usage fait de votre compte.</p>
      <h3>3. Essai gratuit</h3>
      <p>${i.trial > 0 ? `Chaque nouveau compte bénéficie d’un essai gratuit de ${i.trial} jours, accordé une seule fois, sans carte bancaire et sans engagement. À la fin de l’essai, l’accès à la création et à la modification des documents nécessite une offre payante ; vos données restent conservées.` : 'Aucun essai gratuit n’est proposé actuellement.'}</p>
      <h3>4. Offres et prix</h3>
      <p>Les offres en vigueur sont présentées sur la page Tarifs et la page Abonnement :</p>
      ${i.plans.length ? `<ul>${i.plans.map(p => `<li><b>${esc(p.name)}</b> : ${eur(p.priceCents)} pour ${per[p.interval] || '1 mois'} d’accès</li>`).join('')}</ul>` : '<p>Voir la page Tarifs.</p>'}
      <p>Les prix sont indiqués en euros. ${i.status.includes('293 B') ? 'TVA non applicable, article 293 B du CGI.' : 'Ils s’entendent toutes taxes comprises lorsque la TVA est applicable.'} L’éditeur peut modifier ses prix à tout moment ; le prix appliqué est celui affiché au moment du paiement.</p>
      <h3>5. Paiement et durée</h3>
      <p>Le paiement s’effectue en ligne par carte bancaire via le prestataire sécurisé Stripe ; ${i.site} n’a jamais accès à vos numéros de carte. Chaque paiement ouvre ou prolonge l’accès pour la durée de l’offre choisie. <b>Il n’y a pas de renouvellement automatique</b> : sans nouveau paiement, l’accès s’arrête à la date indiquée dans votre espace, et vous êtes prévenu par email quelques jours avant. Un reçu est disponible pour chaque paiement.</p>
      <h3>6. Droit de rétractation</h3>
      <p>Si vous êtes un consommateur, vous disposez d’un délai de 14 jours à compter du paiement pour vous rétracter, en écrivant à ${i.email}. Toutefois, en demandant l’accès immédiat au service, vous acceptez qu’il commence avant la fin de ce délai ; conformément à l’article L221-28 du Code de la consommation, le droit de rétractation ne s’applique plus une fois le service pleinement exécuté. Les professionnels ne bénéficient pas du droit de rétractation.</p>
      <h3>7. Utilisation du service</h3>
      <p>Vous restez seul responsable du contenu de vos devis et factures (prix, mentions légales obligatoires, TVA, conditions de paiement) et de leur conformité à la réglementation qui vous est applicable, y compris la facturation électronique et la transmission via une plateforme agréée. Les modèles, prix indicatifs, calculs de cotisations et aides comptables sont fournis à titre indicatif et ne remplacent pas l’avis d’un expert-comptable. Il est interdit d’utiliser le service à des fins illicites, de tenter d’en perturber le fonctionnement ou d’accéder aux données d’autres utilisateurs.</p>
      <h3>8. Disponibilité</h3>
      <p>L’éditeur met tout en œuvre pour assurer l’accès au service 24 h/24 et la sauvegarde quotidienne des données, sans garantie d’absence d’interruption (maintenance, panne, cas de force majeure). Il est conseillé de conserver une copie de vos documents (PDF, export).</p>
      <h3>9. Responsabilité</h3>
      <p>La responsabilité de l’éditeur est limitée aux dommages directs et, en tout état de cause, au montant payé par vous au cours des 12 derniers mois. Elle ne peut être engagée pour les pertes d’exploitation, de chiffre d’affaires ou de données résultant d’un usage du service non conforme ou d’un manque de sauvegarde de votre part.</p>
      <h3>10. Données personnelles</h3>
      <p>Le traitement de vos données est décrit dans la <a href="#/confidentialite">politique de confidentialité</a>. Vos données (clients, devis, factures) vous appartiennent ; vous pouvez les exporter et demander la suppression de votre compte.</p>
      <h3>11. Résiliation</h3>
      <p>Vous pouvez cesser d’utiliser le service à tout moment et demander la suppression de votre compte. L’éditeur peut suspendre un compte en cas de manquement grave aux présentes conditions, après en avoir informé l’utilisateur sauf urgence.</p>
      <h3>12. Modification des conditions</h3>
      <p>Ces conditions peuvent évoluer ; la version applicable est celle en ligne au moment de l’utilisation. En cas de changement important, vous en serez informé par email ou dans l’application.</p>
      <h3>13. Litiges</h3>
      <p>Les présentes conditions sont soumises au droit français. En cas de difficulté, contactez d’abord ${i.email} pour trouver une solution amiable. Si vous êtes consommateur, vous pouvez recourir gratuitement à un médiateur de la consommation ${todo('[nom et site du médiateur à compléter]')} ou à la plateforme européenne de règlement en ligne des litiges. À défaut d’accord, les tribunaux compétents seront ceux prévus par la loi.</p>`],
    mentions: ['Mentions légales', i => `
      <h3>Éditeur du site</h3>
      <p>${i.name}<br>${i.status}<br>${i.address}<br>Contact : ${i.email}</p>
      <h3>Directeur de la publication</h3>
      <p>${i.name}</p>
      <h3>Conception et réalisation</h3>
      <p>Site conçu et développé par <b>${i.creator}</b>.</p>
      <h3>Hébergement</h3>
      <p>IONOS SE, Elgendorfer Str. 57, 56410 Montabaur, Allemagne — www.ionos.fr</p>
      <h3>Propriété intellectuelle</h3>
      <p>L’ensemble du site (textes, interface, logo, vidéos, code) est protégé. Toute reproduction sans autorisation est interdite. Les documents que vous créez avec ${i.site} vous appartiennent.</p>
      <h3>Contact</h3>
      <p>Pour toute question, écrivez à ${i.email} ou utilisez le formulaire de la page <a href="#/questions">Questions</a>.</p>`],
    confidentialite: ['Politique de confidentialité', i => `
      <p class="muted">Dernière mise à jour : ${UPDATED}</p>
      <h3>Responsable du traitement</h3>
      <p>${i.name}, ${i.address} — ${i.email}</p>
      <h3>Données collectées</h3>
      <ul><li><b>Compte</b> : nom, email, mot de passe (enregistré sous forme chiffrée, jamais en clair).</li>
        <li><b>Contenu de votre activité</b> : entreprise, clients, devis, factures, catalogue, charges — saisis par vous.</li>
        <li><b>Paiements</b> : offre choisie, montant, date ; les données de carte sont traitées uniquement par Stripe.</li>
        <li><b>Technique</b> : adresse IP et navigateur au moment de la connexion, pour la sécurité du compte.</li>
        <li><b>Questions</b> envoyées depuis la page Questions : nom, email, message.</li></ul>
      <h3>Pourquoi</h3>
      <p>Fournir le service (exécution du contrat), gérer les paiements et la facturation (obligation légale), assurer la sécurité et répondre à vos demandes (intérêt légitime). Vos données ne sont <b>jamais vendues</b> ni utilisées à des fins publicitaires.</p>
      <h3>Destinataires</h3>
      <p>Uniquement l’éditeur et ses prestataires techniques, pour les besoins du service : IONOS (hébergement), Stripe (paiement), Resend (envoi des emails). Certaines fonctions optionnelles (lecture d’un devis en photo, recherche de prix) transmettent le document ou la référence concernée au service utilisé, uniquement lorsque vous les lancez.</p>
      <h3>Durée de conservation</h3>
      <p>Tant que votre compte existe, puis suppression sur demande ; les pièces de paiement sont conservées 10 ans (obligation comptable).</p>
      <h3>Vos droits</h3>
      <p>Vous pouvez accéder à vos données, les rectifier, les exporter, demander leur suppression ou vous opposer à un traitement en écrivant à ${i.email}. Vous pouvez aussi adresser une réclamation à la CNIL (www.cnil.fr).</p>
      <h3>Cookies</h3>
      <p>${i.site} n’utilise qu’un cookie de connexion, indispensable au fonctionnement, et enregistre vos préférences d’affichage dans votre navigateur. Aucun cookie publicitaire ni de mesure d’audience tierce.</p>`]
  };

  window.LEGAL_PAGES = Object.keys(DOCS);
  window.legalSections = () => Object.entries(DOCS).map(([k, [t, f]]) =>
    `<section id="d-${k}" class="docs-sec legal" data-page="${k}"><h2>${t}</h2>${f(info())}</section>`).join('');
  window.legalFooter = () => { const i = info(), y = new Date().getFullYear();
    return `<footer class="ld-foot"><span>© ${y} ${i.site}</span><nav><a href="#/cgv">CGV</a><a href="#/mentions">Mentions légales</a><a href="#/confidentialite">Confidentialité</a><a href="#/questions">Contact</a></nav><span class="ld-credit">Site conçu par <b>${i.creator}</b></span></footer>`; };
  /* dans l'application : les mêmes textes en fenêtre */
  actions['legal-open'] = t => { const d = DOCS[t.dataset.doc]; if (!d) return;
    openModal(`<div class="legal modal-wide"><div class="row between"><h2 style="margin:0">${d[0]}</h2><button class="btn small" data-act="close-modal">Fermer</button></div>${d[1](info())}</div>`); };
  window.appLegalFooter = () => { const i = info();
    return `<span>© ${new Date().getFullYear()} ${i.site}</span><a href="#" data-act="legal-open" data-doc="cgv">CGV</a><a href="#" data-act="legal-open" data-doc="mentions">Mentions légales</a><a href="#" data-act="legal-open" data-doc="confidentialite">Confidentialité</a><span>Site conçu par <b>${i.creator}</b></span>`; };
})();
