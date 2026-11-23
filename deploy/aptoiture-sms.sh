#!/usr/bin/env bash
# Active les SMS du site P.A Couverture vers VOTRE téléphone (rappels d'agenda, programme du lendemain,
# nouvelles demandes). Les identifiants sont saisis ici, sur le serveur, et n'apparaissent nulle part ailleurs.
#
#  1) Free Mobile (gratuit, uniquement si votre ligne est chez Free) :
#     mobile.free.fr → Mon compte → Mes options → « Notifications par SMS » → activer : vous obtenez une CLÉ.
#  2) Brevo (tous opérateurs, ~0,045 € le SMS, crédit à acheter) :
#     app.brevo.com → compte → SMS (acheter des crédits) ; puis Paramètres → Clés API → créer une clé.
# Usage (root) :  cd ~/sitedevis && git pull && bash deploy/aptoiture-sms.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root."; exit 1; }
ENVF=/etc/aptoiture.env; SVC=aptoiture
[ -f "$ENVF" ] || { echo "Site non installé : lancez d'abord  bash deploy/site-aptoiture.sh votre-domaine"; exit 1; }
setvar() { local k="$1" v="$2"; grep -v "^$k=" "$ENVF" > "$ENVF.tmp" || true; printf '%s=%s\n' "$k" "$v" >> "$ENVF.tmp"; cat "$ENVF.tmp" > "$ENVF"; rm -f "$ENVF.tmp"; }
unsetvars() { for k in "$@"; do sed -i "/^$k=/d" "$ENVF"; done; }
TEST="P.A Couverture : SMS actives. Vous recevrez vos rappels sur ce telephone."

echo "SMS du site P.A Couverture"
echo "1) Free Mobile (gratuit, ligne Free uniquement)   2) Brevo (tous opérateurs, payant au SMS)   3) Désactiver les SMS"
read -rp "Choix [1] : " C; C="${C:-1}"
case "$C" in
1)
  read -rp "Identifiant Free Mobile (8 chiffres, celui de votre espace abonné) : " U
  [[ "$U" =~ ^[0-9]{6,12}$ ]] || { echo "Identifiant invalide."; exit 1; }
  read -rsp "Clé « Notifications par SMS » (rien ne s'affiche, c'est normal) : " K; echo
  K="$(printf '%s' "$K" | tr -d ' ')"; [ -n "$K" ] || { echo "Clé vide."; exit 1; }
  echo "Envoi d'un SMS d'essai…"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 -G https://smsapi.free-mobile.fr/sendmsg --data-urlencode "user=$U" --data-urlencode "pass=$K" --data-urlencode "msg=$TEST" || true)"
  case "$CODE" in
    200) ;;
    403) echo "✗ Refusé par Free : option « Notifications par SMS » non activée, ou identifiant / clé incorrects."; exit 1 ;;
    402) echo "✗ Trop de SMS envoyés à la suite : attendez quelques minutes et relancez."; exit 1 ;;
    *) echo "✗ Service Free injoignable (code ${CODE:-aucun}). Réessayez plus tard."; exit 1 ;;
  esac
  unsetvars BREVO_API_KEY SMS_TO SMS_SENDER
  setvar SMS_PROVIDER free; setvar FREE_SMS_USER "$U"; setvar FREE_SMS_PASS "$K" ;;
2)
  read -rp "Votre numéro de portable (ex. 06 12 34 56 78) : " N
  D="$(printf '%s' "$N" | tr -cd '0-9+')"; [[ "$D" =~ ^0[67][0-9]{8}$ ]] && D="+33${D:1}"
  [[ "$D" =~ ^\+[0-9]{10,14}$ ]] || { echo "Numéro invalide."; exit 1; }
  read -rsp "Clé API Brevo (rien ne s'affiche, c'est normal) : " K; echo
  K="$(printf '%s' "$K" | tr -d ' ')"; [ -n "$K" ] || { echo "Clé vide."; exit 1; }
  echo "Envoi d'un SMS d'essai…"
  BODY="$(printf '{"type":"transactional","sender":"PACouvert","recipient":"%s","content":"%s"}' "${D#+}" "$TEST")"
  OUT="$(curl -s -m 20 -w '\n%{http_code}' -X POST https://api.brevo.com/v3/transactionalSMS/sms -H "api-key: $K" -H 'content-type: application/json' -H 'accept: application/json' -d "$BODY" || true)"
  CODE="$(printf '%s' "$OUT" | tail -n1)"
  if [[ ! "$CODE" =~ ^20[01]$ ]]; then echo "✗ Refusé par Brevo (code $CODE) : $(printf '%s' "$OUT" | head -n1)"; echo "  Vérifiez la clé API et qu'il vous reste des crédits SMS."; exit 1; fi
  unsetvars FREE_SMS_USER FREE_SMS_PASS
  setvar SMS_PROVIDER brevo; setvar BREVO_API_KEY "$K"; setvar SMS_TO "$D"; setvar SMS_SENDER PACouvert ;;
3)
  unsetvars SMS_PROVIDER FREE_SMS_USER FREE_SMS_PASS BREVO_API_KEY SMS_TO SMS_SENDER
  systemctl restart "$SVC"; echo "SMS désactivés."; exit 0 ;;
*) echo "Choix invalide."; exit 1 ;;
esac
chown root:"$SVC" "$ENVF"; chmod 640 "$ENVF"
systemctl restart "$SVC"; sleep 2
echo "✓ SMS activés : vous avez dû recevoir un SMS d'essai."
echo "  Choisissez ce que vous recevez dans le tableau de bord du site → Réglages → « SMS sur mon téléphone »."
