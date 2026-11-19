#!/usr/bin/env bash
# Met à jour NetCarto depuis cette copie du dépôt (à récupérer d'abord dans sa nouvelle version).
#   sudo ./mettre-a-jour.sh
# Les données et les réglages sont gardés. Une sauvegarde est faite avant la bascule, et l'ancienne version
# est remise en service si la nouvelle ne démarre pas.
set -euo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$ICI/installer.sh" --mise-a-jour "$@"
