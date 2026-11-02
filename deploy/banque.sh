#!/usr/bin/env bash
# Active la connexion bancaire de la Trésorerie (Enable Banking) sur le serveur.
# À lancer en root depuis le dossier du site :   bash deploy/banque.sh
# Le script demande l'identifiant de l'application et la clé privée (.pem), range la clé dans
# /etc/sitedevis-bank.pem (lisible uniquement par le service), remplit /etc/sitedevis.env et redémarre le site.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root :  sudo bash deploy/banque.sh"; exit 1; }
ENVF=/etc/sitedevis.env
KEY=/etc/sitedevis-bank.pem
SVC=sitedevis
[ -f "$ENVF" ] || { echo "$ENVF introuvable : installez d'abord le site (bash deploy/install.sh)."; exit 1; }
command -v openssl >/dev/null || apt-get install -y -qq openssl >/dev/null

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
URL="$(grep '^APP_URL=' "$ENVF" | cut -d= -f2- | tr -d '"')"
DIR="$(cd "$(dirname "$0")" && pwd)"
envval() { grep "^$1=" "$ENVF" | tail -1 | cut -d= -f2- | tr -d '"'; }
# vérification : appel réel à Enable Banking avec la configuration du serveur, sous l'utilisateur du service
runtest() {
  say "Vérification de la connexion à Enable Banking"
  local T; T="$(mktemp --suffix=.js)"; cp "$DIR/banque-test.js" "$T"; chmod 644 "$T"
  local rc=0
  runuser -u "$SVC" -- env ENABLEBANKING_APP_ID="$(envval ENABLEBANKING_APP_ID)" ENABLEBANKING_KEY_FILE="$(envval ENABLEBANKING_KEY_FILE)" APP_URL="$URL" /usr/bin/node "$T" || rc=$?
  rm -f "$T"; return $rc
}
if [ "${1:-}" = "--test" ]; then runtest; exit $?; fi

say "Connexion bancaire (Enable Banking)"
echo "Avant de continuer, sur https://enablebanking.com (Control Panel) :"
echo "  1. Applications → Register new application → environnement « Production »"
echo "  2. Redirect URL :  ${URL:-https://votre-domaine.fr}/api/bank/callback"
echo "  3. Laissez Enable Banking générer la clé : un fichier .pem est téléchargé sur votre ordinateur"
echo

# ---------- 1. Identifiant de l'application ----------
CUR="${1:-$(envval ENABLEBANKING_APP_ID || true)}"
read -r -p "Identifiant de l'application (Application ID)${CUR:+ [$CUR]} : " APPID
APPID="$(printf '%s' "${APPID:-$CUR}" | tr -d '[:space:]"')"
[[ "$APPID" =~ ^[A-Za-z0-9._-]{8,}$ ]] || { echo "Identifiant invalide (il ressemble à 1a2b3c4d-…)."; exit 1; }

# ---------- 2. Clé privée ----------
echo
echo "Clé privée : deux possibilités"
echo "  a) le fichier est déjà sur le serveur (envoyé avec scp) : indiquez son chemin, ex. /root/cle.pem"
echo "  b) laissez vide puis COLLEZ le contenu du fichier .pem (de -----BEGIN à -----END … KEY-----)"
read -r -p "Chemin du fichier .pem (vide = coller) : " SRC
TMP="$(mktemp)"; chmod 600 "$TMP"; trap 'rm -f "$TMP"' EXIT
if [ -n "$SRC" ]; then
  [ -f "$SRC" ] || { echo "Fichier introuvable : $SRC"; exit 1; }
  cp "$SRC" "$TMP"
else
  echo "Collez la clé maintenant (elle ne sera pas réaffichée) :"
  while IFS= read -r -s line; do
    printf '%s\n' "$line" >> "$TMP"
    [[ "$line" == -----END*KEY----- ]] && break
  done
fi
openssl pkey -in "$TMP" -noout 2>/dev/null || { echo "Ce n'est pas une clé privée valide (.pem). Rien n'a été modifié."; exit 1; }
install -m 600 -o "$SVC" -g "$SVC" "$TMP" "$KEY"
echo "Clé rangée dans $KEY (lisible uniquement par le service)."
if [ -n "$SRC" ]; then
  read -r -p "Supprimer la copie $SRC maintenant qu'elle est rangée ? [O/n] " RM
  if [[ "${RM:-O}" =~ ^[OoYy]$ ]]; then shred -u "$SRC" 2>/dev/null || rm -f "$SRC"; fi
fi

# ---------- 3. Configuration ----------
setvar() { if grep -q "^$1=" "$ENVF"; then sed -i "s#^$1=.*#$1=$2#" "$ENVF"; else printf '%s=%s\n' "$1" "$2" >> "$ENVF"; fi; }
setvar ENABLEBANKING_APP_ID "$APPID"
setvar ENABLEBANKING_KEY_FILE "$KEY"
chmod 600 "$ENVF"

# ---------- 4. Redémarrage ----------
say "Redémarrage du site"
systemctl restart "$SVC"; sleep 2
if systemctl is-active --quiet "$SVC"; then
  echo "✓ Site redémarré avec la connexion bancaire."
  runtest || { echo "La configuration est enregistrée, mais la vérification a échoué (voir ci-dessus)."; exit 1; }
  echo
  echo "Dernière étape, dans le Control Panel Enable Banking : ouvrez votre application et"
  echo "« Link accounts » (liez votre propre compte bancaire) pour l'activer en mode restreint."
  echo "Ensuite : site → Trésorerie → Connecter ma banque."
else
  echo "Le service ne redémarre pas : journalctl -u $SVC -n 50"; exit 1
fi
