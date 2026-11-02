#!/usr/bin/env bash
# Héberge le bot Discord « Atelier » sur ce VPS, à côté du site mais complètement séparé :
# utilisateur système à part, Node.js 24 à part (le site garde sa version), service systemd « discordbot »,
# panneau web non exposé sur Internet (accès par tunnel SSH depuis votre ordinateur).
#
# 1) Depuis votre ordinateur :  scp BotDiscord.zip root@IP_DU_VPS:/root/BotDiscord.zip
# 2) Sur le VPS (root)        :  bash deploy/bot-discord.sh /root/BotDiscord.zip
# Relancer le script avec un nouveau zip = mise à jour du code (configuration .env et base de données conservées).
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root :  sudo bash deploy/bot-discord.sh /root/BotDiscord.zip"; exit 1; }
ZIP="${1:-/root/BotDiscord.zip}"
BASE=/opt/discordbot
APP=$BASE/app
NODE=$BASE/node
ENVF=/etc/discordbot.env
SVC=discordbot
PORT=3100                       # port interne (le site utilise 3000)

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
[ -f "$ZIP" ] || { echo "Archive introuvable : $ZIP (envoyez-la d'abord avec scp)"; exit 1; }

say "Outils nécessaires"
apt-get install -y -qq unzip rsync curl xz-utils build-essential python3 >/dev/null

# ---------- Node.js 24 réservé au bot ----------
case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "Processeur non pris en charge : $(uname -m)"; exit 1 ;; esac
if [ ! -x "$NODE/bin/node" ] || [ "$("$NODE/bin/node" -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  say "Installation de Node.js 24 pour le bot (le site n'est pas touché)"
  T="$(mktemp -d)"
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$T/SUMS"
  F="$(grep -oE "node-v24\.[0-9.]+-linux-$ARCH\.tar\.xz" "$T/SUMS" | head -1)"
  [ -n "$F" ] || { echo "Version de Node.js 24 introuvable."; exit 1; }
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$F" -o "$T/$F"
  (cd "$T" && grep " $F\$" SUMS | sha256sum -c - >/dev/null) || { echo "Téléchargement de Node.js corrompu."; exit 1; }
  rm -rf "$NODE"; mkdir -p "$NODE"; tar -xJf "$T/$F" -C "$NODE" --strip-components=1; rm -rf "$T"
fi
echo "Node.js du bot : $("$NODE/bin/node" -v)"

# ---------- Code du bot ----------
say "Copie du bot"
id discordbot >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin discordbot
SRC="$(mktemp -d)"; trap 'rm -rf "$SRC"' EXIT
unzip -q "$ZIP" -d "$SRC"
ROOT="$(dirname "$(find "$SRC" -name package.json -not -path '*/node_modules/*' | head -1)")"
[ -f "$ROOT/src/server.js" ] || { echo "Archive inattendue : src/server.js introuvable."; exit 1; }
mkdir -p "$APP/data"
FIRST=0; [ -f "$APP/data/app.sqlite" ] || FIRST=1
# le code est remplacé ; node_modules (compilé pour Windows) et la base existante ne sont jamais écrasés
rsync -a --delete --exclude node_modules --exclude data --exclude .env "$ROOT"/ "$APP"/
if [ "$FIRST" = 1 ] && [ -d "$ROOT/data" ]; then cp -a "$ROOT/data/." "$APP/data/"; echo "Base de données reprise depuis l'archive (vos réglages de serveurs)."; fi

# ---------- Configuration (.env) ----------
if [ ! -f "$ENVF" ]; then
  if [ -f "$ROOT/.env" ]; then cp "$ROOT/.env" "$ENVF"
  else cp "$ROOT/.env.example" "$ENVF"; echo "Pas de .env dans l'archive : complétez $ENVF avec les identifiants Discord."; fi
  echo "Configuration créée : $ENVF"
fi
setvar() { if grep -q "^$1=" "$ENVF"; then sed -i "s#^$1=.*#$1=$2#" "$ENVF"; else printf '%s=%s\n' "$1" "$2" >> "$ENVF"; fi; }
setvar HOST 127.0.0.1           # panneau uniquement accessible depuis le serveur (tunnel SSH)
setvar PORT "$PORT"
grep -q '^NODE_ENV=' "$ENVF" || setvar NODE_ENV development
grep -q '^BASE_URL=' "$ENVF" || setvar BASE_URL http://localhost:3000
grep -q '^DISCORD_REDIRECT_URI=' "$ENVF" || setvar DISCORD_REDIRECT_URI http://localhost:3000/auth/callback
chown root:discordbot "$ENVF"; chmod 640 "$ENVF"
for k in DISCORD_TOKEN DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET SESSION_SECRET; do
  grep -qE "^$k=.+" "$ENVF" || echo "⚠ $k est vide dans $ENVF : complétez-le (nano $ENVF) puis : systemctl restart $SVC"
done

# ---------- Dépendances ----------
say "Installation des dépendances (quelques minutes la première fois)"
chown discordbot:discordbot "$BASE"
mkdir -p "$BASE/.npm"; chown -R discordbot:discordbot "$APP" "$BASE/.npm"
(cd "$APP" && runuser -u discordbot -- env PATH="$NODE/bin:$PATH" HOME="$BASE" npm_config_cache="$BASE/.npm" "$NODE/bin/npm" ci --omit=dev --no-audit --no-fund --loglevel=error --update-notifier=false)

# ---------- Service ----------
say "Service « $SVC » (démarrage automatique)"
cat > /etc/systemd/system/$SVC.service <<UNIT
[Unit]
Description=Bot Discord Atelier
After=network-online.target
Wants=network-online.target

[Service]
User=discordbot
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$NODE/bin/node src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$APP/data

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "$SVC" >/dev/null 2>&1
systemctl restart "$SVC"; sleep 4

if systemctl is-active --quiet "$SVC"; then
  echo "✓ Bot en ligne (service « $SVC »)."
  journalctl -u "$SVC" -n 5 --no-pager -o cat | sed 's/^/   /'
else
  echo "✗ Le bot ne démarre pas. Dernières lignes :"; journalctl -u "$SVC" -n 30 --no-pager -o cat; exit 1
fi
cat <<TXT

Commandes utiles :
  État / journal en direct :  systemctl status $SVC   |   journalctl -u $SVC -f
  Redémarrer / arrêter      :  systemctl restart $SVC  |   systemctl stop $SVC
  Configuration             :  nano $ENVF   (puis systemctl restart $SVC)

Panneau de configuration (non visible sur Internet) — depuis votre ordinateur :
  ssh -L 3000:127.0.0.1:$PORT root@$(hostname -I | awk '{print $1}')
  puis ouvrez http://localhost:3000 dans le navigateur (laissez la fenêtre SSH ouverte).
TXT
