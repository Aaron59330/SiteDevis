#!/usr/bin/env bash
# Installation de « OptiDevis » sur un VPS Ubuntu/Debian (IONOS, OVH, Hetzner…).
# À lancer en root depuis le dossier du site :   bash deploy/install.sh
# Relancer le script = mise à jour (la configuration et les données sont conservées).
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root :  sudo bash deploy/install.sh"; exit 1; }
command -v apt-get >/dev/null || { echo "Ce script est prévu pour Ubuntu ou Debian."; exit 1; }

SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/sitedevis
DATA=/var/lib/sitedevis
ENVF=/etc/sitedevis.env
SVC=sitedevis

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ask() { local v="$1" q="$2" d="${3:-}" a; if [ -n "${!v:-}" ]; then return; fi; read -r -p "$q${d:+ [$d]} : " a; printf -v "$v" '%s' "${a:-$d}"; }

# ---------- 1. Paramètres (première installation seulement) ----------
if [ ! -f "$ENVF" ]; then
  say "Configuration"
  ask DOMAIN "Nom de domaine du site (ex : mesdevis.fr, DNS déjà pointé vers ce serveur)"
  [ -n "${DOMAIN:-}" ] || { echo "Le nom de domaine est obligatoire."; exit 1; }
  ask ADMIN_EMAIL "Email du compte administrateur"
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    read -r -s -p "Mot de passe administrateur (8 caractères min., lettres + chiffres) : " ADMIN_PASSWORD; echo
  fi
  ask STRIPE_SECRET_KEY "Clé secrète Stripe (sk_live_…) — vide = paiements de démonstration" ""
  ask STRIPE_WEBHOOK_SECRET "Secret du webhook Stripe (whsec_…) — facultatif" ""
  ask RESEND_API_KEY "Clé API Resend pour l'envoi d'emails — vide = mode démo" ""
  if [ -n "${RESEND_API_KEY:-}" ]; then ask MAIL_FROM "Expéditeur des emails" "OptiDevis <contact@${DOMAIN}>"; fi
  ask SERPAPI_KEY "Clé SerpApi (recherche de prix en ligne) — facultatif" ""
  ask ANTHROPIC_API_KEY "Clé API Anthropic (relecture des devis par l'IA) — facultatif" ""
  SIM=true; [ -n "${STRIPE_SECRET_KEY:-}" ] && SIM=false
  [ "$SIM" = true ] && echo "ATTENTION : sans clé Stripe, les paiements de démonstration restent actifs (accès gratuit pour tous). Ajoutez la clé Stripe avant l'ouverture au public."
fi

# ---------- 2. Paquets ----------
say "Installation des paquets (Node.js, Caddy, pare-feu)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw rsync debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# ---------- 3. Code et données ----------
say "Copie du site dans $APP"
id sitedevis >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin sitedevis
mkdir -p "$APP" "$DATA" /var/backups/sitedevis
rsync -a --delete --exclude '.git' --exclude 'data' --exclude '.env' --exclude 'video' --exclude 'node_modules' "$SRC"/ "$APP"/
chown -R root:root "$APP"
(cd "$APP" && npm install --omit=dev --no-audit --no-fund)

# Moteur PDF (Chromium) : sert au bouton « Télécharger le PDF ». Sans lui, le site propose l'impression du navigateur.
say "Installation du moteur PDF (Chromium, quelques minutes la première fois)"
BROWSERS=/opt/sitedevis-browsers
apt-get install -y fonts-liberation fonts-inter >/dev/null 2>&1 || apt-get install -y fonts-liberation >/dev/null 2>&1 || true
if (cd "$APP" && PLAYWRIGHT_BROWSERS_PATH=$BROWSERS npx --no-install playwright-core install --with-deps chromium); then
  chmod -R a+rX "$BROWSERS"
else
  echo "ATTENTION : Chromium n'a pas pu être installé. Le téléchargement PDF direct sera remplacé par l'impression du navigateur."
fi
chown -R sitedevis:sitedevis "$DATA"
chmod 700 "$DATA"

# ---------- 4. Fichier de configuration ----------
if [ ! -f "$ENVF" ]; then
  say "Création de $ENVF"
  umask 077
  PW_ESC=$(printf '%s' "$ADMIN_PASSWORD" | sed 's/[\\"]/\\&/g')
  cat > "$ENVF" <<ENV
PORT=3000
DATA_DIR=$DATA
APP_URL=https://$DOMAIN
COOKIE_SECURE=true
ALLOW_SIMULATED_PAYMENTS=$SIM
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD="$PW_ESC"
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
RESEND_API_KEY=${RESEND_API_KEY:-}
MAIL_FROM="${MAIL_FROM:-}"
SERPAPI_KEY=${SERPAPI_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
ANTHROPIC_MODEL=
ENV
  chmod 600 "$ENVF"
  FIRST=1
else
  FIRST=0
  DOMAIN="$(grep '^APP_URL=' "$ENVF" | sed 's#APP_URL=https\?://##')"
fi

# ---------- 5. Service (démarrage automatique) ----------
say "Création du service systemd"
cat > /etc/systemd/system/$SVC.service <<UNIT
[Unit]
Description=OptiDevis
After=network.target

[Service]
User=sitedevis
WorkingDirectory=$APP
EnvironmentFile=$ENVF
Environment=PLAYWRIGHT_BROWSERS_PATH=$BROWSERS
Environment=HOME=$DATA
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable $SVC >/dev/null
systemctl restart $SVC
sleep 2
if curl -fs http://127.0.0.1:3000/api/config >/dev/null; then echo "Le site répond en local."; else echo "Le site ne répond pas : journalctl -u $SVC -n 50"; exit 1; fi

# On retire le mot de passe admin du fichier une fois le compte créé
if [ "$FIRST" = 1 ]; then sed -i '/^ADMIN_PASSWORD=/d' "$ENVF"; fi

# ---------- 6. HTTPS (Caddy) ----------
say "Configuration du HTTPS pour $DOMAIN"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
CADDY
systemctl enable caddy >/dev/null
systemctl reload caddy || systemctl restart caddy

# ---------- 7. Pare-feu et sauvegardes ----------
say "Pare-feu et sauvegardes automatiques"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
cat > /etc/cron.daily/sitedevis-backup <<'CRON'
#!/bin/sh
tar czf /var/backups/sitedevis/data-$(date +%F).tar.gz -C /var/lib/sitedevis .
find /var/backups/sitedevis -name 'data-*.tar.gz' -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/sitedevis-backup

say "Terminé"
echo "Site : https://$DOMAIN   (le certificat HTTPS peut prendre 1 à 2 minutes à l'activation)"
echo "Administrateur : connectez-vous avec l'email choisi."
echo "Logs : journalctl -u $SVC -f      Configuration : $ENVF (puis : systemctl restart $SVC)"
echo "Sauvegardes quotidiennes : /var/backups/sitedevis (conservées 14 jours)"
