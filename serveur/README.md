# Serveur NetCarto

Le serveur sert l'interface web, expose une API et range les données dans sa propre base SQLite.
Il n'y a rien d'autre à installer : le moteur SQLite est intégré à Node.js.

> **État actuel (lot 16).** Pas encore de comptes, de HTTPS, de sauvegardes automatiques ni de paquet d'installation : ils arrivent avec les lots 17 à 20. D'ici là, le serveur n'écoute que sur ce poste (`127.0.0.1`). Ne l'ouvrez pas au réseau.

## Lancer le serveur

Il faut Node.js 22.5 ou plus récent.

```bash
cd serveur
```

```bash
npm install
```

Avec le jeu de démonstration (données fictives), pour essayer :

```bash
npm run demo
```

Ou sur une base vide, pour saisir un vrai réseau :

```bash
npm start
```

Ouvrez ensuite `http://127.0.0.1:8080`. L'en-tête affiche « Serveur · enregistré » : chaque modification est écrite dans la base.

## Réglages

Sans fichier, le serveur écoute sur `127.0.0.1:8080` et range sa base dans `serveur/donnees-locales/`.

Pour changer cela, copiez `netcarto.exemple.toml`, adaptez-le, puis :

```bash
node --disable-warning=ExperimentalWarning netcarto.js --config netcarto.toml
```

| Réglage | Fichier TOML | Variable | Argument |
|---|---|---|---|
| Fichier de réglages | | `NETCARTO_CONFIG` | `--config` |
| Adresse d'écoute | `serveur.hote` | `NETCARTO_HOTE` | `--hote` |
| Port | `serveur.port` | `NETCARTO_PORT` | `--port` |
| Dossier de la base | `donnees.dossier` | `NETCARTO_DONNEES` | `--donnees` |
| Dossier de l'interface | `web.dossier` | | |
| Taille maximale d'une requête | `limites.corpsMaxMo` | | |
| Supervision | `supervision.intervalle`, `[[supervision.sources]]` | | |

Priorité : argument, puis variable, puis fichier, puis valeur par défaut. Un chemin relatif écrit dans le fichier part du dossier de ce fichier.

Aucun secret dans le fichier : une valeur `"env:NOM"` est lue dans la variable d'environnement `NOM`.

## La base de données

Un seul fichier, `netcarto.sqlite`, dans le dossier de données. Pour une sauvegarde manuelle, arrêtez le serveur puis copiez ce fichier (les sauvegardes automatiques sont prévues au lot 18).

Une table par type d'objet : `sites`, `batiments`, `etages`, `pieces`, `baies`, `equipements`, `ports`, `prises`, `cables`, `catalogue`, `catalogue_ports`, `stock`, `vlans`, `journal`, `meta`. Le schéma complet est dans `donnees/migrations/sqlite/001_initial.sql`.

Ce que la base garantit :

- **Relations** : toutes les liaisons sont des clés étrangères. On ne peut ni pointer vers un élément absent, ni supprimer un élément encore utilisé.
- **Unicité** : adresse IP, adresse MAC, nom d'hôte, repère de prise, nom de baie, code de bâtiment par site, niveau par bâtiment. Un équipement hors service libère son IP et son nom.
- **Tout ou rien** : une opération en plusieurs étapes est une transaction. Installer un équipement crée l'équipement, ses ports et décrémente le stock ; si une étape est refusée, rien n'est écrit.
- **Règles vérifiées par le serveur** : pas de chevauchement en baie, pas plus de câbles que permis sur un port ou une prise, pièce contenue dans son étage.
- **Migrations** : au démarrage, une base plus ancienne reçoit les migrations manquantes, dans l'ordre.

## L'API

Préfixe : `/api/v1`. Tout est en JSON.

| Route | Rôle |
|---|---|
| `GET /info` | version, mode, révision de la base |
| `GET /sante` | état du serveur et de la base |
| `GET /revision` | numéro de révision (il augmente à chaque écriture) |
| `GET /base` | toute la base, au format des exports |
| `PUT /base` | remplace toute la base (import, réinitialisation), en une transaction |
| `POST /lots` | applique un lot de modifications, tout ou rien |
| `GET /{ressource}` | liste, avec filtres simples : `?champ=valeur` |
| `GET /{ressource}/{id}` | un élément |
| `GET /supervision/etat`, `/supervision/sante` | module de supervision (PRTG, SNMP, simulation) |

Ressources : `sites`, `batiments`, `etages`, `pieces`, `baies`, `equipements`, `ports`, `prises`, `cables`, `catalogue`, `stock`, `vlans`, `journal`.

Exemple :

```bash
curl "http://127.0.0.1:8080/api/v1/equipements?hostname=SW-A0-CORE-01"
```

### Écrire : le lot de modifications

```json
{ "type": "edit", "changements": [
  { "collection": "devices", "op": "modifier", "cle": "dev-27",
    "avant": { "…": "l'objet tel que vous l'avez lu" },
    "apres": { "…": "l'objet modifié" } }
] }
```

- `op` vaut `creer`, `modifier` ou `supprimer`. `collection` porte le nom utilisé dans les exports (`devices`, `ports`, `stock`…).
- `avant` est la valeur que vous aviez sous les yeux. Si la base ne lui correspond plus, le lot entier est refusé : personne n'écrase le travail d'un autre.

| Réponse | Sens |
|---|---|
| `200` | lot appliqué ; la réponse donne la nouvelle révision |
| `400` | demande mal formée |
| `403` | écriture demandée par une page d'un autre site |
| `409` | conflit : l'élément a changé entre-temps |
| `422` | contrainte ou règle non respectée ; le message dit laquelle |

## Organisation du code

```text
netcarto.js          lancement (ligne de commande)
config.js            réglages : fichier TOML, variables, arguments
app.js               assemble la base, la supervision, l'API et les fichiers de l'interface
api/routes.js        routes de l'API
api/statique.js      fichiers de l'interface (index.html, css/, js/ uniquement)
donnees/             couche d'accès aux données, la seule à connaître la base
  pilote-sqlite.js   le seul fichier qui connaît le moteur
  migrations/        schéma, une migration par fichier
  schema.js          correspondance entre le modèle JSON et les tables
  depot.js           lectures et écritures
  regles.js          règles vérifiées avant de valider une transaction
  erreurs.js         refus de la base traduits en messages clairs
tests/               tests (node:test)
```

Le reste du serveur ne contient pas de SQL. Passer à PostgreSQL reviendrait à écrire un second pilote et un second dossier de migrations.

L'application ne contient aucun chemin ni aucune commande propre à Linux : elle fonctionne aussi sous Windows et macOS.

## Tests

```bash
npm test
```
