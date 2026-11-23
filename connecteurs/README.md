# Relais de supervision NetCarto

Petit service à installer **sur votre réseau interne**. Il interroge vos outils de supervision et vos switchs, puis transmet à NetCarto l'état réel des équipements et des ports.

- Il fonctionne en **lecture seule** : il ne modifie rien sur PRTG ni sur les switchs.
- Les identifiants restent dans le relais. Ils ne sont jamais envoyés au navigateur.
- Il peut aussi **servir NetCarto lui-même** : la page et le relais ont alors la même adresse.

> **État de validation.** Les connecteurs PRTG et SNMP ont été testés contre des simulateurs (`npm test`), pas sur du matériel réel. Prévoyez une vérification sur vos équipements avant de vous y fier.

## Sources disponibles

| Source | Ce qu'elle remonte | Prérequis |
|---|---|---|
| `prtg` | État de chaque équipement ; état et trafic total des ports qui ont un capteur de trafic | Clé d'API PRTG d'un compte en lecture seule |
| `snmp` | Par port physique : état, débit négocié, trafic entrant et sortant, erreurs de trame, adresses MAC apprises (MIB standard, toutes marques dont Juniper, Cisco, Aruba) | Communauté v2c ou utilisateur v3, en lecture seule |
| `json` | Ce que publie votre outil, au format du contrat : sert à raccorder Zabbix, Centreon, LibreNMS, Nagios ou un script maison | Une adresse HTTP qui renvoie l'état au format décrit plus bas |
| `simulation` | Équipements fictifs décrits dans la configuration | Aucun : sert à tester la chaîne |

### Ce que chaque source remonte réellement

| Donnée | `prtg` | `snmp` | Affichée dans NetCarto |
|---|---|---|---|
| Équipement joignable ou non | Oui | Oui (réponse SNMP) | Fiche, plan, alertes |
| État d'un port (actif, inactif, désactivé) | Oui, s'il a un capteur de trafic | Oui | LED de la vue 3D, fiche du port, plan |
| Port en erreur | Capteur en avertissement | Erreurs de trame depuis le relevé précédent, au-delà du seuil (10) | LED orange, alerte |
| Débit négocié | Non | Oui | Fiche du port |
| Trafic | Total | Entrant et sortant | Fiche du port |
| Adresses MAC vues sur le port | Non | Oui (table de commutation) | Fiche du port, rattachées à l'équipement de l'inventaire qui porte l'adresse |
| Puissance PoE par port | Non | Non : aucune MIB commune aux marques | — |
| VLAN du port | Non | Non : aucune MIB commune aux marques | — |

Le VLAN et la puissance PoE affichés restent donc ceux **saisis** dans NetCarto. Une source dédiée à une marque pourrait les lire dans ses MIB propres.

Plusieurs sources peuvent être actives ensemble. Un même équipement vu par deux sources est fusionné (reconnu par son IP, sinon par son nom) ; l'état le plus grave l'emporte.

## Installation

Il faut Node.js 18 ou plus récent.

```bash
cd connecteurs
```

```bash
npm install
```

```bash
cp config.exemple.json config.json
```

Adaptez `config.json`, puis lancez :

```bash
node serveur.js
```

Ouvrez ensuite `http://<serveur>:8787/` : c'est NetCarto, servi par le relais. Dans NetCarto, cliquez sur l'icône de jauge en haut à droite (*Sources de données*), choisissez *Relais NetCarto*, laissez l'adresse vide, puis *Appliquer*.

## Configuration

```json
{
  "host": "127.0.0.1",
  "port": 8787,
  "intervalSeconds": 30,
  "webRoot": "..",
  "token": "",
  "corsOrigins": [],
  "sources": []
}
```

| Clé | Rôle |
|---|---|
| `host` | Adresse d'écoute. `127.0.0.1` = ce poste seulement. Mettez l'adresse du serveur (ou `0.0.0.0`) pour le rendre accessible aux collègues. |
| `port` | Port d'écoute. |
| `intervalSeconds` | Délai entre deux relevés (5 au minimum). |
| `webRoot` | Dossier de NetCarto à servir. `..` = le dépôt. Retirez la clé pour ne servir que l'API. |
| `token` | Jeton exigé sur `/api/…` (facultatif). À saisir aussi dans NetCarto. |
| `corsOrigins` | Adresses de pages autorisées à appeler le relais depuis un autre serveur. Inutile si NetCarto est servi par le relais. |

**Secrets.** Une valeur de la forme `"env:NOM"` est lue dans la variable d'environnement `NOM`. Aucun mot de passe n'a donc besoin d'être écrit dans `config.json`. Ce fichier est de toute façon ignoré par Git.

### Source PRTG

```json
{ "type": "prtg", "url": "https://prtg.exemple.interne", "apiToken": "env:PRTG_TOKEN", "insecureTls": false }
```

- `apiToken` : clé d'API créée dans PRTG pour un compte en lecture seule. À défaut : `username` et `passhash`.
- `insecureTls` : mettre `true` seulement si PRTG utilise un certificat auto-signé.
- Un port est reconnu quand le nom du capteur contient l'interface, par exemple `(001) GigabitEthernet1/0/1 Traffic`.
- À vérifier chez vous : les codes d'état et le format des débits peuvent différer selon la version et la langue de PRTG.

### Source SNMP

```json
{ "type": "snmp", "version": "2c", "community": "env:SNMP_COMMUNITY",
  "devices": [{ "ip": "192.0.2.10", "hostname": "SW-EXEMPLE-01" }] }
```

SNMP v3 : `"version": "3"`, `user`, `authProtocol` (`sha`), `authKey`, `privProtocol` (`aes`), `privKey`.

Le trafic est calculé entre deux relevés : il apparaît donc à partir du deuxième.

Options : `seuilErreurs` (10 par défaut : nombre d'erreurs de trame entre deux relevés au-delà duquel le port passe en erreur), `macs` (`false` pour ne pas lire la table de commutation).

Seules les interfaces Ethernet physiques sont gardées. Les unités logiques (`ge-0/0/0.0`), les bouclages, les agrégats et les interfaces internes sont écartés.

#### Switchs Juniper (Junos)

La source `snmp` suffit : Junos expose les MIB standard qu'elle lit (IF-MIB, BRIDGE-MIB, Q-BRIDGE-MIB). Les modèles EX2300-48P, EX2300-24P et EX3400-24P du catalogue portent les noms d'interface de Junos (`ge-0/0/0` à `ge-0/0/47`, `xe-0/1/0` à `xe-0/1/3`), et le rapprochement se fait sans réglage.

Exemple de compte SNMP v3 en lecture seule sur le switch (à adapter et à vérifier sur votre version de Junos) :

```
set snmp v3 usm local-engine user netcarto authentication-sha authentication-password "…"
set snmp v3 usm local-engine user netcarto privacy-aes128 privacy-password "…"
set snmp v3 vacm security-to-group security-model usm security-name netcarto group lecture
set snmp v3 vacm access group lecture default-context-prefix security-model usm security-level privacy read-view tout
set snmp view tout oid .1 include
```

Limites connues :

- **Pile de switchs (Virtual Chassis).** Les ports du deuxième membre s'appellent `ge-1/0/0`, `ge-1/0/1`… sur la même adresse. Dans NetCarto, chaque switch physique est un équipement dont les ports commencent par `ge-0/0/`. Les ports des autres membres apparaissent donc en « ports non reconnus » tant que le modèle n'a pas été copié avec le bon préfixe (onglet Matériel, « Nouveau modèle »).
- **Délai.** L'état est relevé toutes les 30 secondes (réglable, 5 au minimum). Ce n'est pas instantané : les notifications SNMP (traps `linkDown`) ne sont pas écoutées.
- **Autres voies de Junos**, non utilisées : NETCONF, l'API REST de Junos, la télémétrie en flux (gNMI) et l'API de Juniper Mist. Elles donneraient le VLAN et la puissance PoE par port, au prix d'une source propre à la marque.
- **Non essayé sur un vrai switch.** La source est validée contre un agent SNMP simulé qui imite la table d'interfaces de Junos.

### Source JSON : raccorder un autre outil de supervision

```json
{ "type": "json", "nom": "zabbix", "url": "https://supervision.exemple.interne/netcarto.json", "jeton": "env:SUPERVISION_JETON" }
```

L'adresse doit renvoyer la liste des équipements au format du contrat :

```json
{ "version": 1, "devices": [
  { "ip": "192.0.2.10", "hostname": "SW-EXEMPLE-01", "state": "up", "message": "",
    "ports": [{ "name": "ge-0/0/1", "status": "up", "speedMbps": 1000 }] } ] }
```

`state` : `up`, `warning`, `down` ou `unknown`. `status` : `up`, `down`, `disabled` ou `error`. Tous les autres champs sont facultatifs. Côté supervision, un petit script lit l'état des hôtes par l'API de l'outil et écrit ce fichier : aucune source dédiée n'est à écrire dans NetCarto.

## Plusieurs sources à la fois

Les sources sont interrogées en parallèle, puis fusionnées. Les règles sont fixes :

1. **Un équipement vu par deux sources n'apparaît qu'une fois.** Il est reconnu par son adresse IP ; si une source ne donne qu'un nom (PRTG accepte un nom DNS), par son nom d'hôte, sans le domaine ni la casse. Deux adresses différentes font toujours deux équipements.
2. **Un port vu par deux sources n'apparaît qu'une fois**, même si l'une l'appelle `GigabitEthernet1/0/1` et l'autre `Gi1/0/1`.
3. **L'ordre de la configuration donne la priorité.** La première source qui renseigne une valeur fait foi ; les suivantes complètent ce qui manque. Une source qui ne sait pas (`unknown`, valeur absente) ne masque jamais une source qui sait.
4. **Un désaccord est gardé, pas caché.** Si PRTG dit un port inactif et le SNMP le dit actif, la valeur de la première source s'affiche, et l'écart figure dans la fenêtre *Sources de données*.
5. **Une source en panne n'arrête pas les autres.** Elle est comptée en erreur après 60 secondes sans réponse, ses équipements ne sont plus fournis, et NetCarto lève une alerte « Source de supervision en erreur ».
6. **Un relevé trop ancien n'est pas affiché.** Si le relais ne relève plus rien, NetCarto revient à l'état saisi et le dit, au lieu de montrer un état mesuré périmé.

## Correspondance avec NetCarto

- **Équipement** : par adresse IP, sinon par nom d'hôte (sans tenir compte de la casse ni du domaine).
- **Port** : par nom d'interface. Les formes longues et courtes sont rapprochées : `GigabitEthernet1/0/1` correspond à `Gi1/0/1`.
- Les équipements non reconnus sont listés dans la fenêtre *Sources de données*, ainsi que, pour chaque équipement reconnu, les **ports non reconnus** : un nom d'interface remonté par la source qui n'existe pas sur le modèle.

## Interface du relais

| Adresse | Réponse |
|---|---|
| `GET /api/etat` | État fusionné : `{ version: 1, source, ts, sources: [...], devices: [...] }`. `sources` donne, pour chacune, la réussite du dernier relevé. Un équipement porte `sources` (qui l'a vu) et `ecarts` (désaccords). |
| `GET /api/sante` | État de chaque source (réussite, erreur, nombre d'équipements) |

Le format exact est décrit dans `lib/contrat.js`.

## Sécurité

- Créez des comptes **en lecture seule** dédiés au relais (PRTG, SNMP).
- Laissez `host` sur `127.0.0.1` tant que vous testez. Pour l'ouvrir au réseau, limitez l'accès par le pare-feu du serveur et renseignez un `token`.
- Le relais parle en HTTP. Pour du HTTPS, placez-le derrière un reverse proxy (Nginx, Caddy).
- N'exposez jamais le relais sur Internet.
- Une page publique (GitHub Pages) ne peut pas joindre un relais interne : le navigateur le bloque. Ouvrez NetCarto depuis le relais.

## Ajouter une source

1. Créez `sources/ma-source.js` qui exporte `creer(cfg)` et renvoie `{ nom, relever() }`. `relever()` renvoie une liste d'équipements au format de `lib/contrat.js`.
2. Déclarez-la dans la table `TYPES` de `serveur.js`.
3. Ajoutez un test dans `tests/test.js`, avec un simulateur.

Pistes déjà identifiées : API des constructeurs (Cisco, Aruba, UniFi, Meraki), table des adresses MAC, voisins LLDP, consommation PoE.

## Tests

```bash
npm test
```
