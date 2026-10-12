# Installer et configurer Mes Devis (guide pas à pas)

## Partie A — Essayer sur votre ordinateur (facultatif, 10 minutes)
1. Installez **Node.js** (version 18 ou plus) : <https://nodejs.org>.
2. Ouvrez le dossier du site, puis :
   - Windows : double-clic sur `Lancer.bat` ;
   - Mac : double-clic sur `lancer.command` (ou, dans le Terminal : `npm install` puis `node server.js`).
3. Ouvrez <http://localhost:3000>. L'email et le mot de passe de l'administrateur s'affichent dans la fenêtre noire.
4. En local, les emails ne partent pas (un lien s'affiche à l'écran) et le paiement est simulé : c'est normal.

## Partie B — Mettre le site en ligne sur un VPS IONOS
1. **Commander** un VPS Linux **Ubuntu 22.04 ou 24.04**. Notez l'**IP** et le **mot de passe root**.
2. **DNS du domaine** : enregistrement **A** `@` → IP du VPS ; **A** `www` → même IP.
3. **Pare-feu IONOS** : autoriser les ports **22 (SSH), 80 (HTTP), 443 (HTTPS)**.
4. **Envoyer le site** (depuis votre ordinateur, PowerShell ou Terminal) :
   `scp -r "CHEMIN\DU\DOSSIER" root@IP:/root/sitedevis`
5. **Installer** :
   ```
   ssh root@IP
   cd /root/sitedevis
   bash deploy/install.sh
   ```
   Le script demande : domaine, email et mot de passe admin, puis (facultatif, Entrée pour passer) les clés Stripe, Resend, SerpApi, Anthropic.
6. Ouvrir `https://votre-domaine.fr` (le certificat HTTPS prend 1 à 2 minutes) et se connecter en administrateur.

## Partie C — Services externes (tous facultatifs, à brancher quand vous êtes prêt)
Les clés se placent dans `/etc/sitedevis.env` sur le serveur : `nano /etc/sitedevis.env`, puis `systemctl restart sitedevis`.

| Service | À quoi ça sert | Variables |
|---|---|---|
| **Resend** (resend.com) | Envoyer les vrais emails (confirmation de compte, mot de passe oublié, reçus) | `RESEND_API_KEY`, `MAIL_FROM="Mes Devis <contact@votredomaine.fr>"` |
| **Stripe** (stripe.com) | Encaisser les abonnements par carte | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Anthropic** (console.anthropic.com) | Relecture des devis par l'IA | `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL=claude-haiku-5-5` pour une option moins chère) |
| **SerpApi** (serpapi.com) | Recherche automatique de prix de matériaux | `SERPAPI_KEY` |

### Resend (emails)
1. Créez un compte, puis **Domains → Add Domain** avec votre domaine.
2. Resend affiche des enregistrements DNS (TXT/CNAME) : ajoutez-les dans la zone DNS IONOS, puis cliquez sur **Verify**.
3. **API Keys → Create** : copiez la clé dans `RESEND_API_KEY`. `MAIL_FROM` doit utiliser le domaine vérifié.
4. Test : créez un compte sur le site avec une vraie adresse : l'email de confirmation doit arriver.

### Stripe (paiement)
1. Créez un compte. Commencez en **mode test** : clé `sk_test_…` (Developers → API keys).
2. Webhook (recommandé) : **Developers → Webhooks → Add endpoint**, URL `https://votre-domaine.fr/api/stripe/webhook`, événement `checkout.session.completed`. Copiez le **Signing secret** (`whsec_…`) dans `STRIPE_WEBHOOK_SECRET`.
3. Test : abonnez-vous avec la carte `4242 4242 4242 4242` (date future, CVC quelconque).
4. Passage en production : activez votre compte Stripe, remplacez par la clé `sk_live_…` et créez le webhook en mode live.
Dès qu'une clé Stripe est présente, le paiement de démonstration est désactivé automatiquement.

### Anthropic (IA)
1. Créez une clé sur console.anthropic.com et ajoutez du crédit (facturation à l'usage).
2. Mettez-la dans `ANTHROPIC_API_KEY`, redémarrez : le bouton « Relire avec l'IA » apparaît dans les devis.
3. Activation ou coupure à tout moment : Administration → Réglages.

## Partie D — Réglages à faire dans le site (en administrateur)
1. **Mon compte** : changez le mot de passe admin.
2. **Administration → Offres** : vos prix et durées (mensuel, annuel…).
3. **Administration → Réglages** : nom du site, jours d'essai gratuit, ouverture des inscriptions, confirmation d'email, email de support.
4. **Mon entreprise** : vos coordonnées, logo, SIRET, IBAN, mentions légales (reprises dans chaque devis).
5. Faites un **test complet** avec un compte d'essai : inscription, email, paiement test, création d'un devis, PDF.

## Partie E — Avant d'ouvrir au public
- HTTPS actif, paiements réels configurés, emails réels configurés.
- Pages légales : mentions légales, conditions de vente, politique de confidentialité (RGPD).
- Sauvegardes : automatiques chaque nuit dans `/var/backups/sitedevis` (14 jours). Copiez-en une régulièrement hors du serveur.

## Maintenance
- Voir les messages : `journalctl -u sitedevis -f`
- Modifier la configuration : `nano /etc/sitedevis.env` puis `systemctl restart sitedevis`
- Mettre à jour : renvoyer les fichiers (`scp`), puis `bash deploy/update.sh` (données et configuration conservées)
- Redémarrer : `systemctl restart sitedevis` — Statut du HTTPS : `systemctl status caddy`
