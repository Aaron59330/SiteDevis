#!/usr/bin/env bash
# Active l'envoi d'e-mails du site PA Rénovation (demandes, rendez-vous, réponses aux clients).
# Le mot de passe est saisi ici, sur le serveur, et n'apparaît nulle part ailleurs.
#
# Avec Gmail (conseillé) : il faut un « mot de passe d'application » (pas votre mot de passe Gmail) :
#   myaccount.google.com → Sécurité → Validation en deux étapes (à activer) → Mots de passe des applications.
# Usage (root) :  cd ~/sitedevis && git pull && bash deploy/parenovation-mail.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root."; exit 1; }
ENVF=/etc/parenovation.env; SVC=parenovation; NODE=/opt/parenovation/node/bin/node; APP=/opt/parenovation/app
[ -f "$ENVF" ] || { echo "Site non installé : lancez d'abord  bash deploy/site-renovation.sh votre-domaine"; exit 1; }

echo "Envoi d'e-mails du site PA Rénovation"
echo "1) Gmail (smtp.gmail.com)   2) Autre service (OVH, IONOS, Brevo…)"
read -rp "Choix [1] : " C; C="${C:-1}"
if [ "$C" = 1 ]; then HOST=smtp.gmail.com; PORT=465
else read -rp "Serveur SMTP (ex. ssl0.ovh.net) : " HOST; read -rp "Port [465] : " PORT; PORT="${PORT:-465}"; fi
read -rp "Adresse e-mail d'envoi (ex. aydenpuche@gmail.com) : " USER
[[ "$USER" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "Adresse invalide."; exit 1; }
read -rsp "Mot de passe d'application (rien ne s'affiche, c'est normal) : " PASS; echo
PASS="$(printf '%s' "$PASS" | tr -d ' ')"     # Google l'affiche en 4 groupes séparés par des espaces
[ -n "$PASS" ] || { echo "Mot de passe vide."; exit 1; }
case "$PASS" in *[\#\"\'\\]*) echo "Ce mot de passe contient un caractère non pris en charge (# \" ' \\)."; exit 1 ;; esac

setvar() { local k="$1" v="$2"; grep -v "^$k=" "$ENVF" > "$ENVF.tmp" || true; printf '%s=%s\n' "$k" "$v" >> "$ENVF.tmp"; cat "$ENVF.tmp" > "$ENVF"; rm -f "$ENVF.tmp"; }
setvar SMTP_HOST "$HOST"; setvar SMTP_PORT "$PORT"; setvar SMTP_USER "$USER"; setvar SMTP_PASS "$PASS"
setvar MAIL_FROM "PA Rénovation <$USER>"
chown root:"$SVC" "$ENVF"; chmod 640 "$ENVF"

echo "Vérification de la connexion au serveur d'e-mails…"
cd "$APP"     # le compte du site ne peut pas lire /root : on lance la vérification depuis son dossier
if runuser -u "$SVC" -- env ENVF="$ENVF" "$NODE" -e '
  const fs = require("fs"); const e = {};
  for (const l of fs.readFileSync(process.env.ENVF, "utf8").split("\n")) { const m = /^([A-Z_]+)=(.*)$/.exec(l); if (m) e[m[1]] = m[2]; }
  const nm = require(process.argv[1] + "/node_modules/nodemailer");
  nm.createTransport({ host: e.SMTP_HOST, port: +e.SMTP_PORT, secure: +e.SMTP_PORT === 465, auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } })
    .verify().then(() => { console.log("✓ Connexion réussie"); }, err => { console.error("✗ " + err.message); process.exit(1); });' "$APP" </dev/null; then
  systemctl restart "$SVC"; sleep 2
  echo "✓ E-mails activés. Dans le tableau de bord du site → Réglages → « Envoyer un e-mail d'essai »."
else
  for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS MAIL_FROM; do sed -i "/^$k=/d" "$ENVF"; done   # rien d'enregistré
  echo "✗ La connexion au serveur d'e-mails a échoué (message ci-dessus)."
  echo "  Avec Gmail, vérifiez : validation en deux étapes activée, et mot de passe d'APPLICATION (16 lettres)."
  echo "  Relancez ce script pour réessayer. (Le site continue de fonctionner, sans e-mails.)"
  exit 1
fi
