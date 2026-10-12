# Mettre le site en ligne sur un VPS IONOS

Guide complet : voir aussi les étapes détaillées données avec le projet. Résumé :

1. **Commander** un VPS Linux IONOS avec **Ubuntu 22.04 ou 24.04**. Notez son **adresse IP** et le **mot de passe root**.
2. **Domaine** : créez un enregistrement DNS **A** `@` → IP du VPS, et un enregistrement **A** `www` → la même IP.
3. **Pare-feu IONOS** (espace client, réseau/pare-feu du serveur) : autoriser **SSH (22)**, **HTTP (80)** et **HTTPS (443)**.
4. **Envoyer le site** sur le VPS (zip + `scp`, ou `git clone`).
5. **Installer** : `bash deploy/install.sh` (répondre aux questions : domaine, email admin, mot de passe admin, clés Stripe/Resend si vous les avez).
6. Ouvrir `https://votredomaine.fr`, se connecter avec l'admin.
7. **Mettre à jour** plus tard : renvoyer les nouveaux fichiers puis `bash deploy/update.sh`.

Le script installe Node.js, Caddy (HTTPS automatique), crée un service qui redémarre tout seul, active le pare-feu du serveur et programme une sauvegarde quotidienne dans `/var/backups/sitedevis` (14 jours).

Fichiers utiles sur le serveur : configuration `/etc/sitedevis.env` (puis `systemctl restart sitedevis`), données `/var/lib/sitedevis`, logs `journalctl -u sitedevis -f`.
