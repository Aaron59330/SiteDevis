#!/usr/bin/env bash
# Donne au panneau du bot Discord une adresse permanente en HTTPS (ex. https://bot.optidevis.pro),
# accessible sans tunnel SSH. L'accès reste protégé par la connexion Discord (gérants des serveurs uniquement).
#
# Avant : chez IONOS (Domaines → optidevis.pro → DNS), ajoutez un enregistrement A :  bot → IP du VPS
# Puis sur le VPS (root) :  bash deploy/bot-panel.sh bot.optidevis.pro
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root."; exit 1; }
SUB="${1:-}"; ENVF=/etc/discordbot.env; SVC=discordbot; PORT=3100
[[ "$SUB" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "Usage : bash deploy/bot-panel.sh bot.votre-domaine.fr"; exit 1; }
[ -f "$ENVF" ] || { echo "Bot non installé : lancez d'abord deploy/bot-discord.sh"; exit 1; }
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Vérification du DNS de $SUB"
MYIP="$(curl -4 -fsS -m 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
DNSIP="$(getent ahostsv4 "$SUB" | awk 'NR==1{print $1}' || true)"
if [ "$DNSIP" != "$MYIP" ]; then
  echo "✗ $SUB ne pointe pas encore vers ce serveur ($MYIP) : ${DNSIP:-aucune adresse}."
  echo "  Chez IONOS : Domaines & SSL → optidevis.pro → DNS → Ajouter un enregistrement → type A,"
  echo "  nom d'hôte « ${SUB%%.*} », valeur $MYIP. Attendez 5 à 30 minutes puis relancez ce script."
  exit 1
fi
echo "✓ $SUB → $MYIP"

say "HTTPS (Caddy)"
mkdir -p /etc/caddy/conf.d
grep -q 'import /etc/caddy/conf.d/\*.caddy' /etc/caddy/Caddyfile || printf '\n# autres services hébergés sur ce serveur\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
cat > /etc/caddy/conf.d/discordbot.caddy <<CADDY
$SUB {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
CADDY
if ! caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  rm -f /etc/caddy/conf.d/discordbot.caddy; echo "✗ Configuration Caddy refusée : rien n'a été changé."; caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile || true; exit 1
fi
systemctl reload caddy || systemctl restart caddy

say "Adresse du panneau"
setvar() { if grep -q "^$1=" "$ENVF"; then sed -i "s#^$1=.*#$1=$2#" "$ENVF"; else printf '%s=%s\n' "$1" "$2" >> "$ENVF"; fi; }
setvar BASE_URL "https://$SUB"
setvar DISCORD_REDIRECT_URI "https://$SUB/auth/callback"
setvar NODE_ENV production          # cookies sécurisés (HTTPS)
setvar HOST 127.0.0.1               # le port reste fermé : on passe par Caddy
systemctl restart "$SVC"; sleep 4
systemctl is-active --quiet "$SVC" || { echo "✗ Le bot ne redémarre pas :"; journalctl -u "$SVC" -n 20 --no-pager -o cat; exit 1; }

# le certificat HTTPS est obtenu automatiquement à la première visite (quelques secondes)
for i in 1 2 3 4 5 6; do CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://$SUB/" || true)"; [ "$CODE" = 200 ] && break; sleep 5; done
if [ "${CODE:-}" = 200 ]; then echo "✓ Panneau en ligne : https://$SUB"; else echo "⚠ Le panneau ne répond pas encore en HTTPS (code ${CODE:-aucun}) : réessayez dans 1 à 2 minutes."; fi
cat <<TXT

Dernière étape, dans le portail Discord (discord.com/developers/applications → votre bot → OAuth2) :
  Redirects → Add Redirect →  https://$SUB/auth/callback   → Save Changes
Ensuite ouvrez https://$SUB et connectez-vous avec Discord. Le tunnel SSH n'est plus nécessaire.
TXT
