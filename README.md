# Mes Devis

Site de création de devis professionnels avec **comptes utilisateurs, abonnement payant et espace administrateur**.

## Essayer sur votre ordinateur
1. Installez [Node.js](https://nodejs.org) (version 18 ou plus récente).
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
- **Boîte à outils** : guide « Bien faire un devis » (7 étapes, simulateur de prix, vérificateur de devis), conversion et compression d’images, photos en PDF, petits calculs (TVA, marge, surfaces) et astuces. Tout fonctionne dans le navigateur.
- **Factures** : bouton « 🧾 Créer la facture » depuis un devis (lignes, client et mentions reprises), numérotation propre, échéance, acompte déjà réglé, suivi payée/en retard.
- **Devis** : multi-pages façon pro, sous-totaux, échéancier, clients particuliers/pros (remplissage par SIRET ou raison sociale), catalogue, PDF.

## Mise en production
- Hébergez-le sur un serveur Node (Render, Railway, VPS…) derrière **HTTPS** et définissez : `APP_URL`, `COOKIE_SECURE=true`,
  `ALLOW_SIMULATED_PAYMENTS=false`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- Le webhook Stripe est `POST /api/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`). Le retour de paiement est aussi vérifié côté serveur.
- Les données sont dans le dossier `data/` (à sauvegarder). Pour une forte volumétrie, remplacer `server/store.js` par une base PostgreSQL.

## Vidéo de présentation (30 s)
`video/mes-devis-30s.mp4` — motion design 1080p avec musique et effets sonores.
Sources dans `video/` : `index.html` (animation pilotée image par image), `timeline.js` (repères sonores), `audio.py` (synthèse sonore, numpy), `render.js` (rendu des images avec Playwright). Montage : `ffmpeg -framerate 30 -i frames/f%04d.jpg -i audio.wav -c:v libx264 -pix_fmt yuv420p -c:a aac out.mp4`.
