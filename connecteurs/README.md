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
| `snmp` | Par port : état, débit négocié, trafic entrant et sortant (IF-MIB standard, toutes marques) | Communauté v2c ou utilisateur v3 en lecture seule |
| `simulation` | Équipements fictifs décrits dans la configuration | Aucun : sert à tester la chaîne |

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

## Correspondance avec NetCarto

- **Équipement** : par adresse IP, sinon par nom d'hôte (sans tenir compte de la casse).
- **Port** : par nom d'interface. Les formes longues et courtes sont rapprochées : `GigabitEthernet1/0/1` correspond à `Gi1/0/1`.
- Les équipements non reconnus sont listés dans la fenêtre *Sources de données*.

## Interface du relais

| Adresse | Réponse |
|---|---|
| `GET /api/etat` | État fusionné : `{ version: 1, source, ts, devices: [...] }` |
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
