#!/usr/bin/env bash
# Installe NetCarto sur Debian ou Ubuntu, ou met à jour une installation existante.
#   sudo ./installer.sh
#
# Ce que fait le script :
#   - programme dans /opt/netcarto, avec son propre Node.js (rien n'est changé au Node.js du système) ;
#   - compte système « netcarto », sans privilège ni interpréteur de commandes ;
#   - données dans /var/lib/netcarto, réglages dans /etc/netcarto/netcarto.toml (jamais écrasés) ;
#   - service systemd « netcarto », démarré tout de suite et à chaque démarrage de la machine ;
#   - commande « netcarto » pour l'exploitation (compte, sauvegarde, restaurer, sante).
# Relancé sur une installation existante, il la met à jour : les données et les réglages sont gardés,
# et l'ancienne version est remise en place si la nouvelle ne démarre pas.
#
# Options :
#   --node <archive>   utilise cette archive Node.js (node-v22.x-linux-x64.tar.gz, prise sur nodejs.org) au lieu de la télécharger
#   --hors-ligne       ne télécharge rien : demande --node, et les dépendances déjà présentes dans la copie du dépôt
#                      (préparées sur un poste relié à Internet : « npm ci --omit=dev » dans serveur/ et connecteurs/)
set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$(cd "$ICI/../.." && pwd)"
# shellcheck source=installation/linux/commun.sh
. "$ICI/commun.sh"

MODE=installation; ARCHIVE_NODE=""; HORS_LIGNE=non
while [ $# -gt 0 ]; do
  case "$1" in
    --mise-a-jour) MODE=mise-a-jour ;;
    --hors-ligne) HORS_LIGNE=oui ;;
    --node) [ $# -ge 2 ] || echec "l'option --node demande le chemin d'une archive."; ARCHIVE_NODE="$2"; shift ;;
    --aide|-h) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echec "option inconnue : $1 (voir --aide)" ;;
  esac
  shift
done
if [ -n "$ARCHIVE_NODE" ] && [ ! -f "$ARCHIVE_NODE" ]; then echec "archive Node.js introuvable : $ARCHIVE_NODE"; fi

exiger_root
exiger_debian
[ -f "$SOURCE/serveur/netcarto.js" ] && [ -f "$SOURCE/index.html" ] || echec "fichiers de NetCarto introuvables à côté de ce script (attendus dans $SOURCE)."
if [ -e "$APP" ] && [ ! -e "$APP/$TEMOIN" ]; then echec "le dossier $APP existe déjà et n'a pas été créé par ce script. Rien n'a été modifié."; fi
DEJA=non; [ -e "$APP/$TEMOIN" ] && DEJA=oui
if [ "$MODE" = mise-a-jour ] && [ "$DEJA" = non ]; then echec "NetCarto n'est pas installé sur cette machine : lancez installer.sh."; fi

case "$(uname -m)" in
  x86_64) ARCHI=x64 ;;
  aarch64|arm64) ARCHI=arm64 ;;
  *) echec "processeur non pris en charge : $(uname -m)." ;;
esac

if [ "$HORS_LIGNE" = oui ]; then
  [ -n "$ARCHIVE_NODE" ] || [ -x "$APP/noeud/bin/node" ] || echec "hors ligne, indiquez l'archive Node.js avec --node (à prendre sur https://nodejs.org/dist/$NODE_BRANCHE/)."
  for partie in serveur connecteurs; do
    [ -d "$SOURCE/$partie/node_modules" ] || echec "hors ligne, les dépendances doivent déjà être dans $SOURCE/$partie/node_modules (lancez « npm ci --omit=dev » dans $partie/ sur un poste relié à Internet, puis recopiez le dépôt)."
  done
elif [ -z "$ARCHIVE_NODE" ] && { ! command -v curl >/dev/null 2>&1 || [ ! -e /etc/ssl/certs/ca-certificates.crt ]; }; then
  etape "Outils nécessaires"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends ca-certificates curl >/dev/null
  dire "curl et certificats installés."
fi

# --- Nouvelle version préparée à côté, sans toucher à celle en service ---
NOUVEAU="$APP.nouveau"; ANCIEN="$APP.ancien"
TEMP="$(mktemp -d)"
nettoyer() { rm -rf -- "$TEMP"; if [ -e "$NOUVEAU/$TEMOIN" ]; then supprimer_dossier "$NOUVEAU" "$TEMOIN" || true; fi; }
trap nettoyer EXIT
if [ -e "$NOUVEAU" ]; then supprimer_dossier "$NOUVEAU" "$TEMOIN" || echec "dossier $NOUVEAU inattendu : supprimez-le à la main après vérification."; fi
mkdir -p "$NOUVEAU"
date -u +"installé le %Y-%m-%dT%H:%M:%SZ" > "$NOUVEAU/$TEMOIN"

etape "Node.js (propre à NetCarto, dans $APP/noeud)"
if [ -z "$ARCHIVE_NODE" ] && [ "$HORS_LIGNE" = non ]; then
  NOM_ARCHIVE="$(telecharger_node "$TEMP" "$ARCHI")" || echec "Node.js n'a pas pu être téléchargé. Sur un serveur sans accès à Internet, voir les options --node et --hors-ligne."
  ARCHIVE_NODE="$TEMP/$NOM_ARCHIVE"
  dire "$NOM_ARCHIVE téléchargé, somme de contrôle vérifiée."
fi
if [ -n "$ARCHIVE_NODE" ]; then
  mkdir -p "$NOUVEAU/noeud"
  tar -xf "$ARCHIVE_NODE" -C "$NOUVEAU/noeud" --strip-components=1 --no-same-owner || echec "archive Node.js illisible : $ARCHIVE_NODE"
else
  cp -a "$APP/noeud" "$NOUVEAU/noeud"
fi
NOEUD="$NOUVEAU/noeud/bin/node"
[ -x "$NOEUD" ] && node_convenable "$NOEUD" || echec "ce Node.js ne convient pas : NetCarto demande la version 22.5 ou plus récente, pour ce processeur ($(uname -m))."
dire "Node.js $("$NOEUD" --version) en place."

etape "Programme"
# Seuls les fichiers utiles au serveur sont copiés : ni tests, ni dépendances locales, ni données d'essai
(cd "$SOURCE" && tar -cf - --exclude=node_modules --exclude=tests --exclude=donnees-locales --exclude='netcarto.toml' \
    index.html css js serveur connecteurs installation/README.md installation/netcarto) | tar -xf - -C "$NOUVEAU" --no-same-owner
cp "$SOURCE/installation/netcarto.toml" "$NOUVEAU/installation/netcarto.toml"
cp "$ICI/netcarto.service" "$NOUVEAU/installation/netcarto.service"
for partie in serveur connecteurs; do
  if [ "$HORS_LIGNE" = oui ]; then
    cp -a "$SOURCE/$partie/node_modules" "$NOUVEAU/$partie/node_modules"
  else
    (cd "$NOUVEAU/$partie" && PATH="$NOUVEAU/noeud/bin:$PATH" npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error) || echec "installation des dépendances de « $partie » impossible (accès à Internet nécessaire, ou option --hors-ligne)."
  fi
done
"$NOEUD" -e "require('$NOUVEAU/serveur/node_modules/smol-toml'); require('$NOUVEAU/connecteurs/node_modules/net-snmp')" 2>/dev/null || echec "dépendances incomplètes dans la nouvelle version : rien n'a été modifié."
chown -R root:root "$NOUVEAU"; chmod -R go-w "$NOUVEAU"
VERSION="$("$NOEUD" -p "require('$NOUVEAU/serveur/package.json').version")"
dire "NetCarto $VERSION prêt."

etape "Compte, dossiers et réglages"
if ! id "$COMPTE" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$DONNEES" --no-create-home --shell /usr/sbin/nologin "$COMPTE"
  dire "Compte système « $COMPTE » créé."
fi
install -d -m 750 -o "$COMPTE" -g "$COMPTE" "$DONNEES"
# Des données restées d'une installation précédente peuvent appartenir à un ancien numéro de compte : on les rend au service
if [ -n "$(find "$DONNEES" ! -user "$COMPTE" -print -quit)" ]; then chown -R "$COMPTE:$COMPTE" "$DONNEES"; dire "Données existantes rendues au compte « $COMPTE »."; fi
install -d -m 755 -o root -g root "$REGLAGES"
if [ ! -f "$FICHIER_REGLAGES" ]; then
  install -m 640 -o root -g "$COMPTE" "$SOURCE/installation/netcarto.toml" "$FICHIER_REGLAGES"
  dire "Réglages par défaut posés dans $FICHIER_REGLAGES"
else
  dire "Réglages existants gardés : $FICHIER_REGLAGES"
fi
if [ ! -f "$FICHIER_SECRETS" ]; then
  printf '%s\n' "# Secrets des sources de supervision, lus par les valeurs \"env:NOM\" des réglages. Une ligne NOM=valeur par secret." "# PRTG_TOKEN=" "# SNMP_COMMUNITY=" "# SMTP_MDP=" > "$FICHIER_SECRETS"
  chown root:root "$FICHIER_SECRETS"; chmod 600 "$FICHIER_SECRETS"
fi

# --- Bascule : sauvegarde, arrêt, échange des dossiers, démarrage, contrôle ---
if [ "$DEJA" = oui ]; then
  etape "Mise à jour de l'installation existante"
  if [ -f "$DONNEES/netcarto.sqlite" ] && [ -x "$COMMANDE" ]; then "$COMMANDE" sauvegarde | head -n 1 || dire "Sauvegarde préalable impossible : la mise à jour continue (une sauvegarde est faite avant toute migration)."; fi
  if service_actif; then systemctl stop netcarto; fi
  if [ -e "$ANCIEN" ]; then supprimer_dossier "$ANCIEN" "$TEMOIN" || echec "dossier $ANCIEN inattendu : supprimez-le à la main après vérification."; fi
  mv "$APP" "$ANCIEN"
fi
mv "$NOUVEAU" "$APP"
install -m 755 -o root -g root "$APP/installation/netcarto" "$COMMANDE"
install -m 644 -o root -g root "$APP/installation/netcarto.service" "$UNITE"
systemctl daemon-reload
systemctl enable --quiet netcarto

etape "Démarrage"
systemctl restart netcarto
if attendre_sante; then
  if [ -e "$ANCIEN" ]; then supprimer_dossier "$ANCIEN" "$TEMOIN" || true; fi
else
  dire "Le serveur ne répond pas. Dernières lignes de son journal :" >&2
  journalctl -u netcarto -n 20 --no-pager >&2 || true
  if [ -e "$ANCIEN/$TEMOIN" ]; then
    dire "Retour à la version précédente." >&2
    systemctl stop netcarto || true
    mv "$APP" "$NOUVEAU"; mv "$ANCIEN" "$APP"
    install -m 755 -o root -g root "$APP/installation/netcarto" "$COMMANDE"
    install -m 644 -o root -g root "$APP/installation/netcarto.service" "$UNITE"
    systemctl daemon-reload; systemctl restart netcarto || true
    echec "la nouvelle version ne démarre pas : la version précédente a été remise en service. Vos données n'ont pas été touchées."
  fi
  echec "NetCarto est installé mais ne démarre pas. Corrigez d'après le journal ci-dessus, puis : systemctl restart netcarto"
fi

PORT="$(sed -n 's/^port *= *\([0-9][0-9]*\).*/\1/p' "$FICHIER_REGLAGES" | head -n 1)"
ADRESSE="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
etape "NetCarto $VERSION est en service"
dire "Adresse      : https://${ADRESSE:-<adresse-du-serveur>}:${PORT:-8443}"
dire "Réglages     : $FICHIER_REGLAGES   (puis : systemctl restart netcarto)"
dire "Données      : $DONNEES"
dire "Journal      : journalctl -u netcarto"
dire "Exploitation : netcarto compte <identifiant> | sauvegarde | sauvegardes | restaurer <sauvegarde> | sante"
CODE="$(journalctl -u netcarto -n 60 --no-pager -o cat 2>/dev/null | grep -Eo '[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}' | tail -n 1 || true)"
if [ "$DEJA" = non ] && [ -n "$CODE" ]; then
  dire ""
  dire "Aucun compte n'existe encore. Ouvrez l'adresse ci-dessus, acceptez l'avertissement du navigateur"
  dire "(certificat auto-signé), puis créez le compte administrateur avec ce code :"
  dire ""
  dire "    $CODE"
fi
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  dire ""; dire "Le pare-feu ufw est actif : ouvrez le port avec « ufw allow ${PORT:-8443}/tcp »."
fi
