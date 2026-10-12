# OptiDevis

Site de création de devis professionnels avec **comptes utilisateurs, abonnement payant et espace administrateur**.

## Essayer sur votre ordinateur
1. Installez [Node.js](https://nodejs.org) (version 18 ou plus récente), puis lancez une fois `npm install` dans le dossier.
2. **Windows** : double-cliquez sur `Lancer.bat` — **Mac/Linux** : double-cliquez sur `lancer.command` (ou `node server.js`).
3. Le site s'ouvre sur <http://localhost:3000>.

Au premier lancement, un **compte administrateur** est créé : son email et son mot de passe s'affichent dans la fenêtre du serveur
(ou choisissez-les dans un fichier `.env`, voir `.env.example`).

## Fonctionnalités
- **Comptes** : inscription, confirmation par email, connexion, mot de passe oublié, changement de mot de passe, suppression du compte.
- **Abonnement** : sans abonnement actif, impossible de créer ou modifier un devis. Offres modifiables par l'admin, reçus de paiement.
- **Paiement** : Stripe (carte bancaire) si `STRIPE_SECRET_KEY` est renseigné, sinon paiement de **démonstration** (aucun débit).
- **Emails** : envoyés via Resend si configuré, sinon visibles dans l'admin (onglet *Emails*) et affichés à l'écran en mode démo.
- **Administration** (`🛡 Administration`) : tableau de bord (revenus, MRR, inscriptions), gestion des utilisateurs (suspendre, offrir/révoquer
  un accès, rôle, réinitialisation de mot de passe, suppression), paiements (remboursement, paiement manuel, export CSV), offres, réglages
  (essai gratuit, inscriptions), journal d'activité.
- **Matériaux & fournisseurs** : vos fournisseurs, leurs matériaux avec prix d’achat et marge ; dans un devis, choix du fournisseur, recherche (« gouttière 80 mm »), quantité → total automatique ; liste d’achat par fournisseur.
- **Prix en ligne** : assistant dans la fiche matériau (liens de recherche Leroy Merlin, Castorama, Brico Dépôt, Point.P ; conversion TTC → HT par unité) et recherche automatique optionnelle via SerpApi (`SERPAPI_KEY`).
- **Personnalisation** : onglet pour choisir la couleur principale, le mode (sombre, clair, automatique), le fond, les arrondis, la taille du texte, la densité et la couleur des devis ; réglages enregistrés sur le compte. Sons d'interface réglables (activés ou coupés, style Doux, Cristal, Bulle ou Rétro, volume).
- **Chantiers (optionnel)** : à activer dans « Mon entreprise ». Fiche par chantier (client, adresse, ville, dates, heures prévues, équipe, accès), suivi des heures réalisées, devis et factures rattachés avec totaux ; le lieu, les dates et la durée estimée ne figurent sur le document que si vous le cochez.
- **Téléphone, tablette, ordinateur** : mise en page adaptée à chaque écran (barre de navigation en bas sur mobile, onglets Édition/Aperçu, tableaux en cartes) ; le site peut être ajouté à l’écran d’accueil comme une application.
- **Boîte à outils** : guide « Bien faire un devis » (7 étapes, simulateur de prix, vérificateur de devis), conversion et compression d’images, photos en PDF, petits calculs (TVA, marge, surfaces) et astuces. Tout fonctionne dans le navigateur.
- **Relecture par l’IA** : bouton « Relire avec l’IA » dans l’éditeur ; corrige fautes et oublis, mais rien n’est modifié sans l’accord de l’utilisateur (suggestions acceptées ou ignorées une à une). Nécessite `ANTHROPIC_API_KEY` et `npm install`.
- **Factures** : bouton « 🧾 Créer la facture » depuis un devis (lignes, client et mentions reprises), numérotation propre, échéance, acompte déjà réglé, suivi payée/en retard.
- **Page de connexion** : accueil animé avec la vidéo de présentation (30 s, son activable). Vidéo source dans video/ (index.html, render.js, audio.py).
- **Statistiques** : devis du mois, chiffre d’affaires facturé, encaissé et impayé, comparaison avec le mois précédent, la moyenne sur 3 mois et le même mois de l’an dernier, graphique sur 12 mois, factures en retard (affichage TTC ou HT).
- **Devis** : multi-pages façon pro, sous-totaux, échéancier, clients particuliers/pros (remplissage par SIRET ou raison sociale), catalogue, téléchargement direct en PDF (Chromium installé par le script de déploiement ; sans lui, repli sur l’impression). Correction gratuite des fautes (LanguageTool, sans clé) ou relecture par IA Claude si une clé est configurée.

## Mise en production
- Hébergez-le sur un serveur Node (Render, Railway, VPS…) derrière **HTTPS** et définissez : `APP_URL`, `COOKIE_SECURE=true`,
  `ALLOW_SIMULATED_PAYMENTS=false`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- Le webhook Stripe est `POST /api/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`). Le retour de paiement est aussi vérifié côté serveur.
- Les données sont dans le dossier `data/` (à sauvegarder). Pour une forte volumétrie, remplacer `server/store.js` par une base PostgreSQL.

## Vidéo de présentation (30 s)
`video/mes-devis-30s.mp4` — motion design 1080p avec musique et effets sonores.
Sources dans `video/` : `index.html` (animation pilotée image par image), `timeline.js` (repères sonores), `audio.py` (synthèse sonore, numpy), `render.js` (rendu des images avec Playwright). Montage : `ffmpeg -framerate 30 -i frames/f%04d.jpg -i audio.wav -c:v libx264 -pix_fmt yuv420p -c:a aac out.mp4`.
