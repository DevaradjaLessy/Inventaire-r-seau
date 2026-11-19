# Serveur NetCarto

Le serveur sert l'interface web, expose une API et range les données dans sa propre base SQLite.
Il n'y a rien d'autre à installer : le moteur SQLite est intégré à Node.js.

> **État actuel (lots 16 et 17).** Base, API, comptes, rôles, journal d'audit et HTTPS sont faits. Restent les sauvegardes automatiques (lot 18) et les paquets d'installation Docker et Linux (lots 19 et 20). Les connecteurs de supervision n'ont pas encore été validés sur du matériel réel.

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

Ouvrez ensuite `https://127.0.0.1:8443`.

**Deux choses se passent à la première visite :**

1. **Le navigateur affiche un avertissement de sécurité.** C'est attendu : NetCarto a créé son propre certificat (auto-signé), que votre navigateur ne connaît pas. Choisissez « Avancé », puis « Continuer ». Pour ne plus voir l'avertissement, fournissez votre propre certificat (voir *HTTPS*).
2. **La page demande de créer le compte administrateur.** Le serveur a affiché dans sa console un *code d'initialisation* de la forme `XXXX-XXXX-XXXX` : recopiez-le, puis choisissez votre identifiant et votre mot de passe (12 caractères au moins). Ce code ne sert qu'une fois.

## Comptes et rôles

| Rôle | Peut |
|---|---|
| Lecture seule | tout consulter |
| Technicien | modifier les données (équipements, câblage, stock, structure) |
| Administrateur | en plus : gérer les comptes, lire le journal d'audit, importer ou réinitialiser la base |

Dans l'interface, le bouton à votre nom (en haut à droite) ouvre : *Changer mon mot de passe*, *Utilisateurs*, *Journal d'audit*, *Se déconnecter*.

- **Mots de passe** : 12 caractères au moins, jamais enregistrés en clair (empreinte scrypt salée).
- **Verrouillage** : 5 échecs de suite verrouillent le compte 15 minutes. Un administrateur peut le déverrouiller.
- **Sessions** : fermées après 2 heures d'inactivité, et au bout de 12 heures dans tous les cas.
- **Journal d'audit** : chaque modification y est notée avec son auteur, la date, la valeur avant et la valeur après. Il ne peut être ni modifié ni effacé.
- **Modifications concurrentes** : si un collègue a modifié le même élément entre-temps, votre modification est refusée, son nom s'affiche et les données sont rechargées.

### Accès perdu, ou compte à créer sans passer par la page

```bash
node --disable-warning=ExperimentalWarning netcarto.js compte alice --role administrateur
```

La commande crée le compte ; s'il existe déjà, elle change son mot de passe et le déverrouille. Le mot de passe est demandé au clavier, sans s'afficher. Ajoutez `--config` ou `--donnees` si vous n'utilisez pas les réglages par défaut.

## HTTPS

Le HTTPS est actif par défaut. Sans réglage, NetCarto crée au premier démarrage un certificat auto-signé dans `certificats/`, à l'intérieur du dossier de données, valable pour `localhost`, le nom du poste et ses adresses.

Pour utiliser votre propre certificat (autorité interne de l'entreprise, par exemple) :

```toml
[https]
certificat = "/chemin/vers/netcarto.crt"
cle = "/chemin/vers/netcarto.key"
```

Pour un essai sur votre seul poste, `--http` (ou `actif = false`) désactive le HTTPS. Ne le faites jamais sur un serveur joignable depuis le réseau : les mots de passe circuleraient en clair.

## Réglages

Sans fichier, le serveur écoute sur `127.0.0.1:8443` (ce poste seulement) et range sa base dans `serveur/donnees-locales/`. Pour le rendre joignable par vos collègues, indiquez l'adresse du serveur dans `serveur.hote`.

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
| HTTPS | `https.actif`, `https.certificat`, `https.cle` | | `--http` |
| Sécurité | `securite.echecsMax`, `securite.verrouillageMinutes`, `securite.sessionHeures`, `securite.inactiviteMinutes` | | |
| Supervision | `supervision.intervalle`, `[[supervision.sources]]` | | |

Priorité : argument, puis variable, puis fichier, puis valeur par défaut. Un chemin relatif écrit dans le fichier part du dossier de ce fichier.

Aucun secret dans le fichier : une valeur `"env:NOM"` est lue dans la variable d'environnement `NOM`.

## La base de données

Un seul fichier, `netcarto.sqlite`, dans le dossier de données. Pour une sauvegarde manuelle, arrêtez le serveur puis copiez ce fichier (les sauvegardes automatiques sont prévues au lot 18).

Une table par type d'objet : `sites`, `batiments`, `etages`, `pieces`, `baies`, `equipements`, `ports`, `prises`, `cables`, `catalogue`, `catalogue_ports`, `stock`, `vlans`, `journal`, `meta`, puis `utilisateurs`, `sessions` et `audit`. Le schéma complet est dans `donnees/migrations/sqlite/`.

Ce que la base garantit :

- **Relations** : toutes les liaisons sont des clés étrangères. On ne peut ni pointer vers un élément absent, ni supprimer un élément encore utilisé.
- **Unicité** : adresse IP, adresse MAC, nom d'hôte, repère de prise, nom de baie, code de bâtiment par site, niveau par bâtiment. Un équipement hors service libère son IP et son nom.
- **Tout ou rien** : une opération en plusieurs étapes est une transaction. Installer un équipement crée l'équipement, ses ports et décrémente le stock ; si une étape est refusée, rien n'est écrit.
- **Règles vérifiées par le serveur** : pas de chevauchement en baie, pas plus de câbles que permis sur un port ou une prise, pièce contenue dans son étage.
- **Migrations** : au démarrage, une base plus ancienne reçoit les migrations manquantes, dans l'ordre.

## L'API

Préfixe : `/api/v1`. Tout est en JSON.

| Route | Accès | Rôle |
|---|---|---|
| `GET /info`, `GET /sante` | libre | version, état du serveur |
| `GET /session` | libre | connecté ou non |
| `POST /session` | libre | connexion `{ identifiant, motDePasse }` |
| `POST /initialisation` | libre, une seule fois | création du premier administrateur |
| `DELETE /session` | connecté | déconnexion |
| `PUT /session/mot-de-passe` | connecté | changer son mot de passe |
| `GET /revision`, `GET /base` | connecté | révision, base complète |
| `GET /{ressource}`, `GET /{ressource}/{id}` | connecté | lecture, filtres `?champ=valeur` |
| `GET /supervision/etat`, `/supervision/sante` | connecté | module de supervision |
| `POST /lots` | technicien, administrateur | lot de modifications, tout ou rien |
| `PUT /base` | administrateur | remplace toute la base |
| `GET`, `POST /utilisateurs` ; `PUT`, `DELETE /utilisateurs/{id}` | administrateur | gestion des comptes |
| `GET /audit` | administrateur | journal d'audit (filtres : `cle`, `collection`, `identifiant`, `action`, `avant`, `limite`) |

La session tient dans un cookie `HttpOnly`, `SameSite=Strict` (et `Secure` en HTTPS).

Ressources : `sites`, `batiments`, `etages`, `pieces`, `baies`, `equipements`, `ports`, `prises`, `cables`, `catalogue`, `stock`, `vlans`, `journal`.

Exemple :

```bash
curl -k -c cookies.txt -H "Content-Type: application/json" -d '{"identifiant":"alice","motDePasse":"…"}' https://127.0.0.1:8443/api/v1/session
```

```bash
curl -k -b cookies.txt "https://127.0.0.1:8443/api/v1/equipements?hostname=SW-A0-CORE-01"
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
| `401` | connexion requise |
| `403` | rôle insuffisant, ou écriture demandée par une page d'un autre site |
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
  comptes.js         utilisateurs, sessions, journal d'audit
  erreurs.js         refus de la base traduits en messages clairs
securite/            comptes, sessions, mots de passe, certificat HTTPS
tests/               tests (node:test)
```

Le reste du serveur ne contient pas de SQL. Passer à PostgreSQL reviendrait à écrire un second pilote et un second dossier de migrations.

L'application ne contient aucun chemin ni aucune commande propre à Linux : elle fonctionne aussi sous Windows et macOS.

## Tests

```bash
npm test
```
