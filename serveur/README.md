# Serveur NetCarto

Le serveur sert l'interface web, expose une API et range les données dans sa propre base SQLite.
Il n'y a rien d'autre à installer : le moteur SQLite est intégré à Node.js.

> **Pour installer NetCarto sur un serveur** (Docker, ou Debian et Ubuntu avec systemd), voir [`installation/README.md`](../installation/README.md). Cette page décrit le serveur lui-même et son lancement à la main, pour essayer ou développer. Les connecteurs PRTG et SNMP n'ont été validés que contre des simulateurs.

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

### La page d'administration

Les administrateurs ont un onglet **Administration**, à l'adresse `https://<serveur>:8443/admin`. Tout y est regroupé :

- **Comptes et rôles** : créer un compte, choisir son rôle, saisir son adresse de courriel, le désactiver, le déverrouiller, le supprimer.
- **Journal d'audit**, **Sauvegardes**, **Sécurité du serveur**.

Un compte qui n'est pas administrateur est renvoyé sur l'application avec un message.

### Connexion et mot de passe perdu

On se connecte avec son identifiant ou avec son adresse de courriel. Deux façons de retrouver l'accès :

- **Lien remis par un administrateur** (fonctionne toujours) : page d'administration, bouton *Lien* du compte. L'administrateur remet le lien au collègue, qui choisit lui-même son nouveau mot de passe. Le lien vaut 30 minutes et ne sert qu'une fois.
- **Lien envoyé par courriel** (si un serveur d'envoi est réglé) : « Mot de passe oublié ? » sur l'écran de connexion. La réponse est la même que le compte existe ou non, et un compte reçoit au plus trois liens par heure.

Pour régler l'envoi de courriels, dans le fichier de réglages :

```toml
[courriel]
hote = "smtp.exemple.interne"
utilisateur = "netcarto"
motDePasse = "env:SMTP_MDP"
expediteur = "NetCarto <netcarto@exemple.interne>"
adresse = "https://netcarto.exemple.interne:8443"
```

`adresse` est l'adresse par laquelle vos collègues ouvrent NetCarto : elle sert à écrire les liens des courriels. La liaison utilise STARTTLS sur le port 587 par défaut (`securite = "tls"` pour le port 465).

Le certificat du serveur d'envoi est toujours vérifié. S'il vient de l'autorité interne de votre entreprise, indiquez le certificat de cette autorité : `autorite = "ac-interne.pem"` (fichier PEM, chemin relatif au fichier de réglages). Avec `securite = "aucune"`, NetCarto refuse de démarrer si un compte est réglé : son mot de passe circulerait en clair.

L'envoi a été essayé contre un vrai Postfix, en STARTTLS et en TLS (`installation/tests/smtp-reel.test.js`).

Le bouton à votre nom (en haut à droite) ouvre : *Changer mon mot de passe*, *Page d'administration*, *Se déconnecter*.

- **Mots de passe** : 12 caractères au moins, jamais enregistrés en clair (empreinte scrypt salée).
- **Verrouillage** : 5 échecs de suite verrouillent le compte 15 minutes. Un administrateur peut le déverrouiller. La réponse est la même que le compte existe ou non, verrouillé ou non.
- **Limite par adresse** : après 20 échecs en 10 minutes, l'adresse attend la fin de la fenêtre.
- **Mots de passe courants refusés**, même allongés de chiffres.
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

Pour que ce certificat porte aussi le nom ou l'adresse par lesquels vos collègues ouvrent NetCarto, indiquez-les dans `https.noms` (par exemple `noms = ["netcarto.exemple.interne", "192.0.2.10"]`) : le certificat est refait au démarrage suivant.

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
| HTTPS | `https.actif`, `https.noms`, `https.certificat`, `https.cle` | | `--http` |
| Sécurité | `securite.echecsMax`, `securite.verrouillageMinutes`, `securite.sessionHeures`, `securite.inactiviteMinutes`, `securite.tentativesParAdresse`, `securite.fenetreMinutes`, `securite.coutMotDePasse` | | |
| Proxy inverse | `serveur.proxyDeConfiance` | | |
| Courriel (facultatif) | `courriel.hote`, `courriel.port`, `courriel.securite`, `courriel.utilisateur`, `courriel.motDePasse`, `courriel.expediteur`, `courriel.adresse`, `courriel.autorite` | | |
| Sauvegardes | `sauvegardes.actif`, `sauvegardes.heure`, `sauvegardes.conserver`, `sauvegardes.dossier` | | |
| Supervision | `supervision.intervalle`, `[[supervision.sources]]` | | |

Priorité : argument, puis variable, puis fichier, puis valeur par défaut. Un chemin relatif écrit dans le fichier part du dossier de ce fichier.

Aucun secret dans le fichier : une valeur `"env:NOM"` est lue dans la variable d'environnement `NOM`.

## Sécurité

L'audit de sécurité, les failles corrigées, les risques acceptés et les mesures à prendre à l'installation sont dans [`SECURITE.md`](../SECURITE.md).

Le serveur écrit ses événements de sécurité dans son journal, une ligne par événement :

```text
SECURITE echec_connexion compte=alice adresse=192.0.2.15
SECURITE compte_verrouille compte=alice adresse=192.0.2.15 minutes=15
SECURITE adresse_bloquee adresse=192.0.2.15 minutes=10
```

Derrière un proxy inverse, mettez `proxyDeConfiance = true` dans la section `[serveur]` : sans cela, toutes les requêtes portent l'adresse du proxy, et la limite par adresse bloquerait tout le monde d'un coup. Ne l'activez pas si NetCarto est joignable directement, car l'en-tête se falsifie.

## La base de données

Un seul fichier, `netcarto.sqlite`, dans le dossier de données. Ne le copiez pas à la main pendant que le serveur tourne : utilisez les sauvegardes ci-dessous, qui donnent une copie cohérente.

Une table par type d'objet : `sites`, `batiments`, `etages`, `pieces`, `baies`, `equipements`, `ports`, `prises`, `cables`, `catalogue`, `catalogue_ports`, `stock`, `vlans`, `interventions`, `journal`, `meta`, puis `utilisateurs`, `sessions` et `audit`. Le schéma complet est dans `donnees/migrations/sqlite/`.

Ce que la base garantit :

- **Relations** : toutes les liaisons sont des clés étrangères. On ne peut ni pointer vers un élément absent, ni supprimer un élément encore utilisé.
- **Unicité** : adresse IP, adresse MAC, nom d'hôte, repère de prise, nom de baie, code de bâtiment par site, niveau par bâtiment. Un équipement hors service libère son IP et son nom.
- **Tout ou rien** : une opération en plusieurs étapes est une transaction. Installer un équipement crée l'équipement, ses ports et décrémente le stock ; si une étape est refusée, rien n'est écrit.
- **Règles vérifiées par le serveur** : pas de chevauchement en baie, pas plus de câbles que permis sur un port ou une prise, pièce contenue dans son étage.
- **Migrations** : au démarrage, une base plus ancienne reçoit les migrations manquantes, dans l'ordre. Elle est sauvegardée juste avant.

## Sauvegardes et restauration

Les sauvegardes sont rangées dans `sauvegardes/`, à l'intérieur du dossier de données (réglage `sauvegardes.dossier` pour les mettre sur un autre disque). Chacune est un fichier complet, vérifié après écriture : `netcarto-AAAA-MM-JJ_HHMMSS-motif.sqlite`.

| Sauvegarde | Quand | Conservation |
|---|---|---|
| Automatique | chaque jour à l'heure réglée (02:30 par défaut) ; rattrapée au démarrage si le serveur était arrêté | les 14 plus récentes (réglable) |
| Manuelle | bouton *Sauvegarder maintenant*, ou ligne de commande | jusqu'à suppression par un administrateur |
| Avant mise à jour | avant d'appliquer une migration à une base existante | idem |
| Avant restauration | juste avant chaque restauration | idem |

Une sauvegarde contient toute la base, y compris les empreintes des mots de passe : gardez ces fichiers à l'abri. Téléchargez-en une régulièrement (page d'administration, rubrique *Sauvegardes*) pour en avoir une copie hors du serveur.

**Revenir en arrière après une erreur de saisie** : page d'administration, rubrique *Sauvegardes*, bouton *Restaurer*. Les données d'inventaire reviennent à l'état de la sauvegarde ; les comptes et le journal d'audit sont conservés ; le serveur reste en marche.

**Restaurer toute la base** (panne, changement de machine), comptes et journal d'audit compris : arrêtez le serveur, puis

```bash
node --disable-warning=ExperimentalWarning netcarto.js sauvegardes
```

```bash
node --disable-warning=ExperimentalWarning netcarto.js restaurer netcarto-2026-01-15_023000-auto.sqlite
```

La commande accepte un nom de la liste ou le chemin d'un fichier. Elle refuse de s'exécuter si le serveur tourne, et ne touche à rien si la sauvegarde est abîmée. Pour une copie immédiate, serveur en marche ou non :

```bash
node --disable-warning=ExperimentalWarning netcarto.js sauvegarde
```

Ajoutez `--config` ou `--donnees` à ces commandes si vous n'utilisez pas les réglages par défaut.

## Surveiller le serveur

```bash
node --disable-warning=ExperimentalWarning netcarto.js sante
```

La commande interroge le serveur de ce poste et se termine avec le code 0 s'il répond, 1 sinon. En HTTPS, elle n'accepte que le certificat du serveur lui-même. Docker s'en sert pour son contrôle de santé.

## L'API

Préfixe : `/api/v1`. Tout est en JSON.

| Route | Accès | Rôle |
|---|---|---|
| `GET /info`, `GET /sante` | libre | version, état du serveur |
| `GET /session` | libre | connecté ou non |
| `POST /session` | libre | connexion `{ identifiant, motDePasse }` |
| `POST /initialisation` | libre, une seule fois | création du premier administrateur |
| `POST /recuperation` | libre | mot de passe perdu `{ compte }` : envoie un lien par courriel si c'est possible ; répond toujours la même chose |
| `POST /recuperation/mot-de-passe` | libre, avec un lien valable | `{ jeton, motDePasse }` |
| `POST /recuperation/lien` | administrateur | `{ id }` : lien de réinitialisation à remettre à un collègue |
| `DELETE /session` | connecté | déconnexion |
| `PUT /session/mot-de-passe` | connecté | changer son mot de passe |
| `PUT /session/preferences` | connecté, tout rôle | régler son propre affichage `{ preferences: { tableau: { masques: [...] } } }` ; forme contrôlée, toute autre clé est écartée |
| `GET /revision`, `GET /base` | connecté | révision, base complète |
| `GET /{ressource}`, `GET /{ressource}/{id}` | connecté | lecture, filtres `?champ=valeur` |
| `GET /supervision/etat`, `/supervision/sante` | connecté | module de supervision |
| `POST /lots` | technicien, administrateur | lot de modifications, tout ou rien |
| `PUT /base` | administrateur | remplace toute la base |
| `GET`, `POST /utilisateurs` ; `PUT`, `DELETE /utilisateurs/{id}` | administrateur | gestion des comptes |
| `GET /audit` | administrateur | journal d'audit (filtres : `cle`, `collection`, `identifiant`, `action`, `actions` pour plusieurs à la fois, `avant`, `limite`). Chaque lot y a une ligne `operation` qui porte son libellé |
| `GET`, `POST /sauvegardes` | administrateur | liste et réglages ; sauvegarde immédiate |
| `GET`, `DELETE /sauvegardes/{nom}` | administrateur | télécharger, supprimer |
| `POST /sauvegardes/restauration` | administrateur | `{ nom }` : restaure les données d'inventaire |

La session tient dans un cookie `HttpOnly`, `SameSite=Strict` (et `Secure`, avec le préfixe `__Host-`, en HTTPS). Une requête est limitée à 64 Ko, sauf l'envoi d'un lot et le remplacement de la base (25 Mo, avec session). Un compte garde vingt sessions au plus : la plus ancienne est fermée.

La commande `npm run attaques` rejoue la campagne d'attaques de `SECURITE.md` (section 8) contre un serveur de test qu'elle démarre elle-même.

Ressources : `sites`, `batiments`, `etages`, `pieces`, `baies`, `equipements`, `ports`, `prises`, `cables`, `catalogue`, `stock`, `vlans`, `interventions`, `journal`.

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
| `404` | élément ou sauvegarde introuvable |
| `409` | conflit : l'élément a changé entre-temps |
| `422` | contrainte ou règle non respectée ; le message dit laquelle |

### Remplir NetCarto depuis un script ou un agent

Un script, ou un agent comme Claude Code, peut remplir l'inventaire sans navigateur. Il passe par la même API que l'interface, avec les mêmes contrôles. Le test « client automatisé » de `tests/api.test.js` déroule ce chemin de bout en bout.

**Préparer**

1. Créer un compte réservé à l'agent, de rôle **technicien** : il peut modifier l'inventaire, mais ni gérer les comptes, ni remplacer la base. Tout ce qu'il fait est inscrit au journal d'audit sous son nom.
2. Faire une sauvegarde avant un remplissage en masse (`netcarto sauvegarde`, ou la page d'administration).
3. Donner le mot de passe à l'agent par une variable d'environnement, jamais dans un fichier du dépôt.

**Se connecter.** `POST /session` rend un cookie de session, à renvoyer avec chaque requête :

```bash
curl -k -c cookies.txt -H "Content-Type: application/json" -d "{\"identifiant\":\"agent-saisie\",\"motDePasse\":\"$NETCARTO_AGENT_MDP\"}" https://netcarto.exemple.interne:8443/api/v1/session
```

**Lire avant d'écrire.** `GET /catalogue` donne les modèles et leur identifiant ; `GET /sites`, `/batiments`, `/etages`, `/pieces`, `/baies`, `/equipements`, `/prises` donnent l'existant.

**Écrire par lots.** Un lot crée en une fois tout ce qui va ensemble ; s'il contient une erreur, rien n'est écrit. Exemple : un site, son bâtiment, un étage, une pièce, une baie, un switch et un port.

```json
{ "type": "add", "changements": [
  { "collection": "sites", "op": "creer", "cle": "site-pilote", "apres": { "id": "site-pilote", "name": "Site pilote", "code": "PIL", "address": "" } },
  { "collection": "buildings", "op": "creer", "cle": "bld-pilote", "apres": { "id": "bld-pilote", "siteId": "site-pilote", "code": "P", "name": "Bâtiment pilote" } },
  { "collection": "floors", "op": "creer", "cle": "flr-pilote", "apres": { "id": "flr-pilote", "buildingId": "bld-pilote", "level": 0, "name": "RDC", "width": 30, "height": 20, "planImage": "" } },
  { "collection": "rooms", "op": "creer", "cle": "room-pilote", "apres": { "id": "room-pilote", "floorId": "flr-pilote", "name": "Local technique", "type": "tech", "x": 2, "y": 2, "w": 6, "h": 5 } },
  { "collection": "racks", "op": "creer", "cle": "rack-pilote", "apres": { "id": "rack-pilote", "roomId": "room-pilote", "catalogId": "<identifiant d'un modèle de baie>", "name": "BAIE-PIL-01", "heightU": 42, "x": 3, "y": 3, "serial": "", "installDate": "2026-11-25", "status": "active" } },
  { "collection": "devices", "op": "creer", "cle": "dev-pilote-1", "apres": { "id": "dev-pilote-1", "catalogId": "cat-ex4000-48p", "hostname": "SW-PIL-01", "rackId": "rack-pilote", "u": 40, "roomId": null, "x": null, "y": null, "serial": "", "ip": "10.20.0.10", "mac": "", "firmware": "", "installDate": "2026-11-25", "status": "active", "notes": "" } },
  { "collection": "ports", "op": "creer", "cle": "p-pilote-0", "apres": { "id": "p-pilote-0", "deviceId": "dev-pilote-1", "idx": 0, "name": "ge-0/0/0", "kind": "rj45", "role": "access", "speed": 1000, "status": "down", "vlan": 1, "poe": { "capable": true, "watts": 0 }, "mac": "", "connected": "", "description": "" } },
  { "collection": "history", "op": "creer", "cle": "h-pilote-1", "apres": { "id": "h-pilote-1", "ts": 1795600000000, "type": "add", "text": "Site pilote créé par l'agent de saisie", "ref": "site-pilote" } }
] }
```

À savoir :

- **Identifiants.** C'est le client qui les choisit. Ils sont uniques et commencent par le préfixe de leur famille : `site-`, `bld-`, `flr-`, `room-`, `rack-`, `dev-`, `p-`, `o-` (prise), `cab-` (câble), `h-` (historique).
- **Ports.** Un équipement se crée avec ses ports, un par port du modèle, numérotés par `idx` à partir de 0 et nommés comme sur le modèle (`ports` du catalogue).
- **Historique.** L'entrée `history` du lot donne son libellé à l'opération : elle s'affiche dans « Dernières actions » et titre le lot au journal d'audit. Son `type` vaut `add`, `move`, `remove`, `edit`, `stock`, `import` ou `catalog`.
- **Refus.** Une réponse `400` signale une forme inattendue, `422` une règle non respectée (adresse IP déjà prise, équipements qui se chevauchent dans une baie…). Le message dit laquelle, et le lot n'a rien écrit : corriger, puis renvoyer.
- **Modifier.** Lire l'objet, puis envoyer `op: "modifier"` avec `avant` (l'objet lu) et `apres` (l'objet modifié). Si quelqu'un l'a changé entre-temps, la réponse est `409` : relire et recommencer.
- **Parc existant dans un tableur.** L'import CSV de l'onglet Inventaire reste le plus simple pour une liste d'équipements ou de prises.

Il n'existe pas encore de clé d'API : la connexion se fait par ce compte et sa session.

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
  sauvegardes.js     copies de la base, planification, purge, restauration
  erreurs.js         refus de la base traduits en messages clairs
securite/            comptes, sessions, mots de passe, certificat HTTPS
courrier.js          envoi de courriels par SMTP (facultatif)
tests/               tests (node:test)
```

Le reste du serveur ne contient pas de SQL. Passer à PostgreSQL reviendrait à écrire un second pilote et un second dossier de migrations.

L'application ne contient aucun chemin ni aucune commande propre à Linux : elle fonctionne aussi sous Windows et macOS.

## Tests

```bash
npm test
```
