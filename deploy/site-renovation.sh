#!/usr/bin/env bash
# Héberge le site PA Rénovation sur ce VPS, avec SON PROPRE nom de domaine, à côté d'OptiDevis mais séparé :
# utilisateur système à part, Node.js à part, service systemd « parenovation », données dans /var/lib/parenovation,
# HTTPS automatique par Caddy.
#
# Avant : chez le fournisseur du domaine, enregistrements A  @ → IP du VPS  et  www → IP du VPS.
# Installation ou mise à jour (root) :  cd ~/sitedevis && git pull && bash deploy/site-renovation.sh mon-domaine.fr
# Les données du site (textes modifiés, photos, demandes de devis, compte admin) sont toujours conservées.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root :  sudo bash deploy/site-renovation.sh mon-domaine.fr"; exit 1; }

SVC=parenovation
BASE=/opt/parenovation
APP=$BASE/app
NODE=$BASE/node
DATA=/var/lib/parenovation
ENVF=/etc/parenovation.env
PORT=3300                       # port interne (OptiDevis : 3000, bot : 3100, P.A Couverture : 3200)
REPO_SITE="$(cd "$(dirname "$0")/.." && pwd)/site-renovation"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# ---------- Nom de domaine ----------
DOM="${1:-}"
if [ -z "$DOM" ] && [ -f "$ENVF" ]; then DOM="$(sed -n 's/^SITE_DOMAIN=//p' "$ENVF")"; fi
[ -n "$DOM" ] || read -rp "Nom de domaine du site (ex. pa-renovation.fr) : " DOM
DOM="$(echo "$DOM" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##; s#^www\.##')"
[[ "$DOM" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "Nom de domaine invalide : $DOM"; exit 1; }
[ "$DOM" != "optidevis.pro" ] || { echo "Ce domaine est celui d'OptiDevis : indiquez celui du nouveau site."; exit 1; }
[ -f "$REPO_SITE/server/index.js" ] || { echo "Dossier site-renovation introuvable : faites d'abord  git pull"; exit 1; }

say "Vérification du DNS de $DOM"
MYIP="$(curl -4 -fsS -m 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
ipof() { getent ahostsv4 "$1" | awk 'NR==1{print $1}' || true; }
SUBDOM=0; [ "$(echo "$DOM" | tr -cd . | wc -c)" -ge 2 ] && SUBDOM=1
APEX="$(ipof "$DOM")"; WWW=""; [ "$SUBDOM" = 1 ] || WWW="$(ipof "www.$DOM")"
if [ "$APEX" != "$MYIP" ]; then
  echo "✗ $DOM ne pointe pas encore vers ce serveur ($MYIP) : ${APEX:-aucune adresse}."
  if [ "$(echo "$DOM" | tr -cd . | wc -c)" -ge 2 ]; then
    echo "  Zone DNS du domaine ${DOM#*.} : enregistrement A, sous-domaine « ${DOM%%.*} », valeur $MYIP"
  else
    echo "  Chez le fournisseur du domaine → zone DNS : enregistrement A, sous-domaine vide (@), valeur $MYIP"
  fi
  echo "  (supprimez l'ancien A ou CNAME de @ s'il y en a un). Attendez 10 à 30 minutes puis relancez ce script."
  exit 1
fi
echo "✓ $DOM → $MYIP"
if [ "$SUBDOM" = 1 ]; then :; elif [ "$WWW" = "$MYIP" ]; then echo "✓ www.$DOM → $MYIP"; else echo "⚠ www.$DOM ne pointe pas vers ce serveur (${WWW:-aucune adresse}) : le site marchera sans « www ». Ajoutez A  www → $MYIP  puis relancez ce script."; fi

say "Outils nécessaires"
apt-get install -y -qq rsync curl xz-utils >/dev/null

# ---------- Node.js 24 réservé au site ----------
case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "Processeur non pris en charge : $(uname -m)"; exit 1 ;; esac
if [ ! -x "$NODE/bin/node" ] || [ "$("$NODE/bin/node" -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  say "Installation de Node.js 24 pour ce site (OptiDevis n'est pas touché)"
  T="$(mktemp -d)"
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$T/SUMS"
  F="$(grep -oE "node-v24\.[0-9.]+-linux-$ARCH\.tar\.xz" "$T/SUMS" | head -1)"
  [ -n "$F" ] || { echo "Version de Node.js 24 introuvable."; exit 1; }
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$F" -o "$T/$F"
  (cd "$T" && grep " $F\$" SUMS | sha256sum -c - >/dev/null) || { echo "Téléchargement de Node.js corrompu."; exit 1; }
  rm -rf "$NODE"; mkdir -p "$NODE"; tar -xJf "$T/$F" -C "$NODE" --strip-components=1; rm -rf "$T"
fi

# ---------- Code et données ----------
say "Copie du site"
id "$SVC" >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin "$SVC"
mkdir -p "$APP" "$DATA" "$BASE/.npm"
rsync -a --delete --exclude node_modules --exclude data --exclude .env "$REPO_SITE"/ "$APP"/
chown -R "$SVC:$SVC" "$BASE" "$DATA"; chmod 750 "$DATA"

# ---------- Configuration ----------
if [ ! -f "$ENVF" ]; then
  cat > "$ENVF" <<ENV
# Configuration du site (modifiez puis :  systemctl restart $SVC)
# Envoi des e-mails (facultatif : sans cela, tout est visible dans le tableau de bord du site) :
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
# SMTP_USER=adresse@gmail.com
# SMTP_PASS=mot-de-passe-d-application
# MAIL_FROM=adresse@gmail.com
ENV
fi
setvar() { if grep -q "^$1=" "$ENVF"; then sed -i "s#^$1=.*#$1=$2#" "$ENVF"; else printf '%s=%s\n' "$1" "$2" >> "$ENVF"; fi; }
setvar SITE_DOMAIN "$DOM"
setvar PORT "$PORT"
setvar HOST 127.0.0.1           # uniquement accessible par Caddy (HTTPS)
setvar DATA_DIR "$DATA"
setvar TRUST_PROXY 1
setvar NODE_ENV production
chown root:"$SVC" "$ENVF"; chmod 640 "$ENVF"

say "Installation des dépendances (1 à 2 minutes la première fois)"
(cd "$APP" && runuser -u "$SVC" -- env PATH="$NODE/bin:$PATH" HOME="$BASE" npm_config_cache="$BASE/.npm" "$NODE/bin/npm" ci --omit=dev --no-audit --no-fund --loglevel=error --update-notifier=false)

# ---------- Compte administrateur du site (une seule fois) ----------
if [ ! -f "$DATA/admin.json" ]; then
  say "Création du compte administrateur du site (pour modifier les textes, photos, voir les demandes)"
  until runuser -u "$SVC" -- env DATA_DIR="$DATA" "$NODE/bin/node" "$APP/scripts/set-admin.js"; do echo "Réessayez."; done
fi

# ---------- Service ----------
say "Service « $SVC » (démarrage automatique)"
cat > /etc/systemd/system/$SVC.service <<UNIT
[Unit]
Description=Site PA Rénovation ($DOM)
After=network-online.target
Wants=network-online.target

[Service]
User=$SVC
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$NODE/bin/node server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "$SVC" >/dev/null 2>&1
systemctl restart "$SVC"; sleep 3
systemctl is-active --quiet "$SVC" || { echo "✗ Le site ne démarre pas. Dernières lignes :"; journalctl -u "$SVC" -n 30 --no-pager -o cat; exit 1; }
echo "✓ Site démarré (service « $SVC »)."

# ---------- Nom de domaine et HTTPS (Caddy) ----------
say "HTTPS pour $DOM"
mkdir -p /etc/caddy/conf.d
grep -q 'import /etc/caddy/conf.d/\*.caddy' /etc/caddy/Caddyfile || printf '\n# autres sites hébergés sur ce serveur\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
{
  printf '%s {\n\tencode gzip\n\trequest_body {\n\t\tmax_size 60MB\n\t}\n\treverse_proxy 127.0.0.1:%s\n}\n' "$DOM" "$PORT"
  if [ "$WWW" = "$MYIP" ]; then printf 'www.%s {\n\tredir https://%s{uri} permanent\n}\n' "$DOM" "$DOM"; fi
} > /etc/caddy/conf.d/$SVC.caddy
if ! caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  rm -f /etc/caddy/conf.d/$SVC.caddy; echo "✗ Configuration Caddy refusée : rien n'a été changé."; caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile || true; exit 1
fi
systemctl reload caddy || systemctl restart caddy

# le certificat HTTPS est obtenu automatiquement à la première visite (quelques secondes)
CODE=""; for i in 1 2 3 4 5 6 7 8; do CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://$DOM/" || true)"; [ "$CODE" = 200 ] && break; sleep 5; done
if [ "$CODE" = 200 ]; then echo "✓ Site en ligne : https://$DOM"; else echo "⚠ Le site ne répond pas encore en HTTPS (code ${CODE:-aucun}) : réessayez dans 1 à 2 minutes."; fi

cat <<TXT

Site :            https://$DOM
Administration :  https://$DOM/admin   (puis Tableau de bord : /admin/tableau-de-bord)
  → Dans le tableau de bord, « Adresse officielle du site » : https://$DOM (pour le QR code).

Commandes utiles :
  État / journal :     systemctl status $SVC   |   journalctl -u $SVC -f
  Redémarrer :         systemctl restart $SVC
  E-mails (SMTP) :     nano $ENVF   puis   systemctl restart $SVC
  Changer le mot de passe admin :
    runuser -u $SVC -- env DATA_DIR=$DATA $NODE/bin/node $APP/scripts/set-admin.js
  Sauvegarde des données (photos, demandes, textes) :
    tar czf ~/parenovation-sauvegarde-\$(date +%F).tgz -C $DATA .
TXT
