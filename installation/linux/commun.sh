# Fonctions communes aux scripts d'installation Linux de NetCarto (Debian et Ubuntu).
# Ce fichier est lu par installer.sh, mettre-a-jour.sh et desinstaller.sh ; il ne se lance pas seul.

APP=/opt/netcarto
DONNEES=/var/lib/netcarto
REGLAGES=/etc/netcarto
FICHIER_REGLAGES="$REGLAGES/netcarto.toml"
FICHIER_SECRETS="$REGLAGES/netcarto.env"
UNITE=/etc/systemd/system/netcarto.service
COMMANDE=/usr/local/bin/netcarto
COMPTE=netcarto
TEMOIN=.installation-netcarto      # fichier posé dans /opt/netcarto : prouve que le dossier est bien celui de NetCarto
NODE_BRANCHE=latest-v22.x          # NetCarto demande Node.js 22.5 ou plus récent

dire()   { printf '%s\n' "$*"; }
etape()  { printf '\n== %s\n' "$*"; }
echec()  { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }

exiger_root() { [ "$(id -u)" = "0" ] || echec "ce script doit être lancé en root (sudo)."; }

exiger_debian() {
  [ -r /etc/os-release ] || echec "système non reconnu (fichier /etc/os-release absent)."
  # shellcheck disable=SC1091
  . /etc/os-release
  case " ${ID:-} ${ID_LIKE:-} " in
    *" debian "*|*" ubuntu "*) ;;
    *) echec "ce script est prévu pour Debian et Ubuntu (système détecté : ${PRETTY_NAME:-inconnu}). Utilisez Docker sur les autres systèmes." ;;
  esac
  command -v systemctl >/dev/null 2>&1 || echec "systemd est nécessaire (commande systemctl introuvable)."
}

# Supprime un dossier de NetCarto, et seulement cela.
#   $1 : dossier à supprimer        $2 : fichier témoin qui doit s'y trouver
# Refuse tout chemin qui n'est pas dans la liste, tout lien symbolique, et tout dossier sans son témoin :
# une variable vide ou un chemin modifié par erreur ne peut donc jamais effacer autre chose.
supprimer_dossier() {
  local dossier="${1:-}" temoin="${2:-}"
  case "$dossier" in
    /opt/netcarto|/opt/netcarto.nouveau|/opt/netcarto.ancien|/var/lib/netcarto|/etc/netcarto) ;;
    *) dire "Refus de supprimer « $dossier » : ce n'est pas un dossier de NetCarto." >&2; return 1 ;;
  esac
  [ -n "$temoin" ] || { dire "Refus de supprimer « $dossier » : aucun fichier témoin indiqué." >&2; return 1; }
  [ -e "$dossier" ] || [ -L "$dossier" ] || return 0
  if [ -L "$dossier" ] || [ "$(readlink -f -- "$dossier")" != "$dossier" ]; then
    dire "Refus de supprimer « $dossier » : c'est un lien vers un autre emplacement." >&2; return 1
  fi
  [ -d "$dossier" ] || { dire "Refus de supprimer « $dossier » : ce n'est pas un dossier." >&2; return 1; }
  if [ ! -e "$dossier/$temoin" ]; then
    dire "Refus de supprimer « $dossier » : le fichier « $temoin » n'y est pas. Ce dossier ne semble pas être celui de NetCarto." >&2; return 1
  fi
  rm -rf --one-file-system -- "$dossier"
}

# Télécharge l'archive Node.js de la branche voulue dans le dossier $1 et vérifie sa somme de contrôle.
# Écrit le nom du fichier téléchargé sur la sortie standard.
telecharger_node() {
  local dossier="$1" archi="$2" sommes archive
  sommes="$(curl --proto '=https' --tlsv1.2 -fsSL "https://nodejs.org/dist/$NODE_BRANCHE/SHASUMS256.txt")" || { dire "téléchargement impossible depuis nodejs.org (accès à Internet nécessaire, ou option --node)." >&2; return 1; }
  archive="$(printf '%s\n' "$sommes" | awk -v a="linux-$archi.tar.gz" '$2 ~ a"$" { print $2 }' | head -n 1)"
  [ -n "$archive" ] || { dire "archive Node.js introuvable pour linux-$archi." >&2; return 1; }
  curl --proto '=https' --tlsv1.2 -fsSL -o "$dossier/$archive" "https://nodejs.org/dist/$NODE_BRANCHE/$archive" || { dire "téléchargement de $archive impossible." >&2; return 1; }
  (cd "$dossier" && printf '%s\n' "$sommes" | grep " $archive\$" | sha256sum -c --quiet - >&2) || { dire "l'archive Node.js téléchargée ne correspond pas à sa somme de contrôle." >&2; rm -f -- "$dossier/$archive"; return 1; }
  printf '%s\n' "$archive"
}

# Vérifie la somme de contrôle SHA-256 ($2) du fichier $1
somme_correcte() {
  local fichier="$1" attendue
  attendue="$(printf '%s' "$2" | tr 'A-F' 'a-f')"
  [[ "$attendue" =~ ^[0-9a-f]{64}$ ]] || return 1
  [ "$(sha256sum -- "$fichier" | awk '{ print $1 }')" = "$attendue" ]
}

# Vrai si le programme Node.js $1 convient (22.5 ou plus récent)
node_convenable() {
  "$1" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 5) ? 0 : 1)' 2>/dev/null
}

# Le service est-il connu de systemd ? En marche ?
service_installe() { [ -f "$UNITE" ]; }
service_actif()    { systemctl is-active --quiet netcarto 2>/dev/null; }

# Attend que le serveur réponde (30 secondes au plus)
attendre_sante() {
  local i
  for i in $(seq 1 30); do
    if "$COMMANDE" sante >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
