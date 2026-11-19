#!/bin/sh
# Point d'entrée du conteneur NetCarto.
# 1. Au premier démarrage, pose les réglages par défaut dans /etc/netcarto (jamais écrasés ensuite).
# 2. Donne le dossier de données au compte du service (utile quand c'est un dossier de la machine hôte).
# 3. Passe la main à la commande « netcarto », qui quitte root avant de lancer le serveur.
# Le serveur devient le processus principal du conteneur : il reçoit directement la demande d'arrêt et ferme la base proprement.
set -eu
CONFIG="${NETCARTO_CONFIG:-/etc/netcarto/netcarto.toml}"
DONNEES=/var/lib/netcarto

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DONNEES" "$(dirname "$CONFIG")"
  if [ ! -f "$CONFIG" ]; then
    cp /opt/netcarto/installation/netcarto.toml "$CONFIG"
    echo "Réglages par défaut posés dans $CONFIG"
  fi
  # Réglages : lisibles par le service, modifiables par root seulement
  chown root:netcarto "$CONFIG" && chmod 640 "$CONFIG"
  # Données : au compte du service (parcours complet seulement si le dossier n'est pas déjà à lui)
  # (droits posés avant le changement de propriétaire : root n'a plus le droit de les changer ensuite)
  if [ "$(stat -c %u "$DONNEES")" != "$(id -u netcarto)" ]; then chmod 750 "$DONNEES"; chown -R netcarto:netcarto "$DONNEES"; fi
elif [ ! -f "$CONFIG" ]; then
  cp /opt/netcarto/installation/netcarto.toml "$CONFIG"
fi
exec netcarto "$@"
