#!/usr/bin/env bash
# Désinstalle NetCarto.
#   sudo ./desinstaller.sh          retire le service, le programme et la commande ; GARDE les données et les réglages
#   sudo ./desinstaller.sh --tout   retire aussi les données, les sauvegardes, les réglages et le compte système
#
# Avec --tout, le script demande de taper SUPPRIMER (ou l'option --oui, pour un usage dans un script).
# Chaque dossier n'est supprimé que s'il figure dans la liste des dossiers de NetCarto et contient son
# fichier témoin : une erreur de chemin ne peut pas effacer autre chose.
set -euo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=installation/linux/commun.sh
. "$ICI/commun.sh"

TOUT=non; OUI=non
for arg in "$@"; do
  case "$arg" in
    --tout) TOUT=oui ;;
    --oui) OUI=oui ;;
    --aide|-h) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echec "option inconnue : $arg (voir --aide)" ;;
  esac
done
exiger_root

if [ "$TOUT" = oui ] && [ "$OUI" != oui ]; then
  dire "Vous allez supprimer DÉFINITIVEMENT la base de NetCarto, ses sauvegardes et ses réglages :"
  dire "    $DONNEES"
  dire "    $REGLAGES"
  dire "Copiez d'abord ailleurs les sauvegardes que vous voulez garder ($DONNEES/sauvegardes)."
  printf 'Pour confirmer, tapez SUPPRIMER : '
  read -r reponse || reponse=""
  [ "$reponse" = "SUPPRIMER" ] || echec "désinstallation annulée : rien n'a été modifié."
fi

etape "Service"
if command -v systemctl >/dev/null 2>&1 && service_installe; then
  systemctl disable --now netcarto >/dev/null 2>&1 || true
  rm -f -- "$UNITE"
  systemctl daemon-reload
  dire "Service arrêté et retiré."
else
  dire "Aucun service à retirer."
fi

etape "Programme"
ECHECS=0
if [ -e "$APP" ]; then
  if supprimer_dossier "$APP" "$TEMOIN"; then dire "$APP supprimé."; else ECHECS=1; fi
else
  dire "$APP : déjà absent."
fi
for reste in "$APP.nouveau" "$APP.ancien"; do
  if [ -e "$reste" ]; then supprimer_dossier "$reste" "$TEMOIN" || ECHECS=1; fi
done
if [ -f "$COMMANDE" ] && grep -q 'NETCARTO_DOSSIER' "$COMMANDE" 2>/dev/null; then rm -f -- "$COMMANDE"; dire "$COMMANDE supprimée."; fi

if [ "$TOUT" = oui ]; then
  etape "Données, réglages et compte"
  if [ -e "$DONNEES" ]; then
    # Le témoin est la base elle-même ; un dossier de données jamais utilisé (sans base) doit être vide pour être supprimé
    if [ -e "$DONNEES/netcarto.sqlite" ]; then
      if supprimer_dossier "$DONNEES" "netcarto.sqlite"; then dire "$DONNEES supprimé."; else ECHECS=1; fi
    elif rmdir -- "$DONNEES" 2>/dev/null; then dire "$DONNEES (vide) supprimé."
    else dire "Refus de supprimer « $DONNEES » : il ne contient pas de base NetCarto et n'est pas vide." >&2; ECHECS=1; fi
  fi
  if [ -e "$REGLAGES" ]; then
    if supprimer_dossier "$REGLAGES" "netcarto.toml"; then dire "$REGLAGES supprimé."; else ECHECS=1; fi
  fi
  # Le compte n'est retiré que si tout le reste l'a été : des données gardées doivent garder leur propriétaire
  if [ "$ECHECS" = 0 ] && id "$COMPTE" >/dev/null 2>&1; then userdel "$COMPTE" >/dev/null 2>&1 && dire "Compte système « $COMPTE » supprimé." || dire "Compte « $COMPTE » non supprimé (encore utilisé ?)." >&2; fi
else
  dire ""
  dire "Les données et les réglages sont gardés :"
  dire "    $DONNEES"
  dire "    $REGLAGES"
  dire "Pour tout supprimer : $0 --tout"
fi

[ "$ECHECS" = 0 ] || echec "certains éléments n'ont pas été supprimés : voir les refus ci-dessus."
dire ""
dire "NetCarto est désinstallé."
