# Suivi du projet — NetCarto (inventaire et cartographie réseau)

Ce fichier est la **référence unique du projet**. Il contient :

1. Les instructions pour une nouvelle session Claude
2. Le cahier des charges complet (texte d'origine)
3. Les décisions de conception
4. Le plan par lots et son avancement
5. Le journal des demandes
6. Les options de sécurité et les questions ouvertes

On le met à jour à chaque étape.

---

## 1. Instructions pour une nouvelle session Claude

> **Claude : si tu lis ce fichier au début d'une session, voici ta mission.**

**Mission :** faire évoluer l'application décrite dans le cahier des charges (section 2), en suivant les décisions de la section 3 (structure des fichiers en 3.1).

**Méthode de travail :**

1. Lis entièrement ce fichier avant d'écrire du code.
2. Regarde le tableau des lots (section 4). Prends le **premier lot dont le statut n'est pas « ✅ Fait »**.
3. Réalise ce lot dans les fichiers concernés, en respectant le découpage décrit en 3.1.
4. **Teste** le lot dans Chromium avec Playwright : la page se charge sans erreur dans la console, les fonctions du lot marchent, et une capture d'écran confirme le rendu. Voir la note technique en 3.9.
5. Mets à jour ce fichier : statut du lot, journal (section 5), décisions nouvelles si besoin.
6. Fais un commit avec un message clair en français, puis pousse sur la branche de travail.
7. Passe au lot suivant dans la même session, si le temps le permet. Ne réécris pas ce qui est déjà fait et validé.

**Règles :**

- Les données doivent rester **100 % fictives**. La page est publique sur GitHub Pages.
- NetCarto est désormais un logiciel serveur (section 3.14) : suivre l'ordre des lots indiqué en section 4. Ne pas ajouter de bibliothèque sans le noter dans la section 3.
- Écrire les tests avant le code, et lancer les trois suites avant chaque commit (voir 3.9).
- S'il manque une réponse à une question de la section 7, applique la valeur par défaut indiquée et continue. Ne bloque pas la session.
- L'interface et les commentaires du code sont en français.
- À la fin de la session, résume à l'utilisateur ce qui a été fait, ce qui reste à faire, et comment ouvrir la page.

**Pour l'utilisateur (comment relancer) :** ouvre une nouvelle session Claude Code sur ce dépôt et écris par exemple :
« Lis SUIVI.md et construis la solution en commençant par le prochain lot à faire. »
Le fichier `CLAUDE.md` à la racine renvoie automatiquement vers ce document.

---

## 2. Cahier des charges complet (texte d'origine de l'utilisateur)

> Ce texte est la demande de référence. Ne pas le modifier ; les précisions et décisions sont dans la section 3.

### Contexte
Je suis administrateur réseau et cybersécurité (Bac+5). Je veux créer un outil interne pour l'équipe informatique : un logiciel web de cartographie, d'inventaire et de gestion du matériel réseau physique (câblage, équipements, prises, stock). Ce n'est pas un site vitrine : c'est une vraie solution de travail, professionnelle, lisible et performante.

### Livrable attendu
Un fichier unique `index.html` (HTML + CSS + JavaScript, bibliothèques chargées par CDN, sans backend), que je publierai sur GitHub Pages pour y accéder par un lien.

### Structure de l'application : 4 onglets reliés entre eux
Les onglets partagent les mêmes données. Toute modification dans un onglet se répercute immédiatement dans les autres.

#### Onglet 1 : Cartographie
- Navigation hiérarchique : Site → Bâtiment → Étage → Pièce / Hall / Local technique → Baie → Équipement → Port
- Plan 2D de chaque étage avec l'emplacement des prises murales, bornes Wi-Fi, baies et équipements
- Vue 3D très réaliste (Three.js) des baies et des équipements :
  - Switchs 24 et 48 ports, ports SFP/SFP+, LEDs d'activité, façade, ventilation, numérotation des ports
  - Panneaux de brassage, baies 42U avec unités numérotées, routeurs, pare-feu, serveurs, onduleurs
  - Bornes Wi-Fi, téléphones IP, caméras IP, prises murales RJ45
  - Rotation, zoom, survol et clic sur chaque port
- Fiche détaillée de chaque port ou prise : identifiant, état (up/down/désactivé), vitesse, VLAN, PoE (oui/non, puissance), MAC, appareil connecté
- Traçabilité du câblage : prise murale → panneau de brassage → port du switch → uplink, avec mise en surbrillance du chemin
- Topologie logique (cœur, distribution, accès) générée automatiquement à partir des données

#### Onglet 2 : Inventaire
- Liste de tous les équipements installés, dans un tableau filtrable et triable (type, marque, modèle, emplacement, n° de série, IP, firmware, date d'installation, statut)
- Recherche globale (prise, port, IP, MAC, pièce)
- Clic sur un équipement → ouverture directe de sa position dans la Cartographie
- Export CSV et JSON

#### Onglet 3 : Matériel disponible (catalogue et stock)
- Catalogue de matériel réseau réaliste : switchs, routeurs, pare-feu, bornes Wi-Fi, panneaux de brassage, baies, onduleurs, câbles, modules SFP, etc.
- Chaque modèle a une fiche technique (nombre et type de ports, budget PoE, hauteur en U, consommation) et son aperçu 3D
- Gestion du stock : quantité disponible, quantité installée, seuil d'alerte
- Ajout d'un équipement depuis le stock vers la Cartographie : je choisis le bâtiment, la pièce, la baie et l'emplacement en U (ou par glisser-déposer dans la baie / sur le plan). Le stock se décrémente et l'équipement apparaît dans l'Inventaire
- Retrait d'un équipement : il retourne en stock ou passe en « hors service »
- Possibilité d'ajouter de nouveaux modèles au catalogue via un formulaire

#### Onglet 4 : Tableau de bord
- Nombre d'équipements par type et par bâtiment
- Taux d'occupation des ports et des baies, budget PoE consommé
- Alertes : stock bas, ports en erreur, baies pleines
- Historique des dernières actions (ajout, déplacement, retrait)

### Données
- Un modèle JSON unique, clair et documenté, séparé de l'affichage : sites, bâtiments, étages, pièces, baies, équipements, ports, câbles, catalogue, stock, historique
- Import et export JSON, sauvegarde locale (localStorage)
- Pour la V1, un jeu de données fictif mais réaliste : 1 site, 2 bâtiments, plusieurs étages, un local technique par étage, plusieurs dizaines de prises et un catalogue d'une vingtaine de modèles

### Exigences de qualité
- Design professionnel et sombre, style outil de supervision / DCIM (NetBox, Cisco DNA)
- Fluide même avec beaucoup d'équipements (3D optimisée)
- Lisible : code couleur cohérent (statut, VLAN, PoE), légendes, infobulles
- Code commenté et structuré pour évoluer

### Évolution prévue
Plus tard, je te fournirai :
- Les marques et modèles exacts de mes équipements, avec des photos, pour des modèles 3D fidèles
- Les plans réels des bâtiments et des pièces

Prévois une architecture où l'on peut facilement ajouter un nouveau modèle d'équipement ou un nouveau plan.

### Sécurité
Le fichier sera public sur GitHub Pages : la V1 ne doit contenir que des données fictives. Propose-moi aussi des options pour protéger l'accès aux vraies données plus tard (dépôt privé, authentification, hébergement interne).

### Consigne de départ
Commence par me présenter l'architecture et le modèle de données en quelques lignes, puis génère le fichier `index.html` complet.

> ✅ La présentation de l'architecture et du modèle de données a déjà été faite (voir section 3). La prochaine session peut passer directement à la construction.

---

## 3. Décisions de conception

### 3.1 Architecture générale
- **Plusieurs fichiers, sans outil de build** (décision du 2026-11-18, qui remplace le fichier unique du cahier des charges). Modules JavaScript natifs, imports et exports explicites :

```text
index.html                 structure de la page
css/style.css              thème et mise en page
js/main.js                 point d'entrée
js/config.js               constantes (couleurs, états, VLAN, catégories)
js/utils.js  icones.js     utilitaires, icônes SVG
js/catalogue.js            catalogue par défaut
js/demo.js                 jeu de données fictif (graine fixe)
js/store.js                état, index, annulation, sauvegarde
js/stockage.js             stockage local du mode démonstration (IndexedDB), copies de secours
js/ecarts.js               écart entre deux états : changements à envoyer, retour en arrière
js/services/               requetes, cablage, topologie, tracage, connexion, recherche, installation, impact, remplacement, doublons, import-csv, securite, adressage, cycle-de-vie
js/3d/                     three (chargement), facades, viewer, objets
js/ui/socle.js             onglets, fenêtres, infobulles, notifications
js/ui/carto/               carto, plan, fiches, baie, tracage, connexion, topologie
js/ui/dossier.js, synthese.js   documents à imprimer : dossier pour un prestataire, synthèse du parc
js/ui/inventaire.js  import-csv.js  recherche.js  tableau-de-bord.js
js/ui/materiel/            catalogue, installation, palette, modele
```
- **Sens des dépendances :** config → utils → store → services → 3d → ui. Les couches basses n'importent jamais l'interface (le store prévient l'interface par `Store.onSaveError` et `Store.on`). Les fichiers de `js/ui/` peuvent s'importer entre eux, mais n'utilisent ces imports que dans des fonctions, jamais au chargement.
- **Conséquence :** la page doit être servie par HTTP (GitHub Pages, serveur interne, ou `python3 -m http.server` en local). L'ouverture par double-clic ne fonctionne plus.
- **Bibliothèque unique : Three.js `0.160.0`**, copie locale dans `js/vendor/three/` depuis le lot 22 (voir 3.22), chargée par import map :
  - `three` → `./js/vendor/three/build/three.module.min.js`
  - `three/addons/` → `./js/vendor/three/examples/jsm/` (OrbitControls, RoomEnvironment)
- Plan 2D, élévation de baie, topologie et graphiques : **SVG/HTML natif**, sans autre dépendance.
- Script en `type="module"`. Les actions passent par des attributs `data-act` et un gestionnaire délégué, pas par des `onclick` en ligne.
- **Store :** toute modification passe par `commit(type, texte, mutation)`. Cette fonction prend un instantané pour l'annulation, applique la mutation, ajoute une entrée à l'historique, reconstruit les index, sauvegarde (avec un délai court) et notifie les vues. Les vues visibles se redessinent tout de suite, les autres au prochain affichage.
- Persistance : clé localStorage `netcarto:db:v1`. Chaque accès au localStorage est protégé par try/catch.
- Ajouter un modèle = ajouter une entrée au catalogue qui pointe vers un gabarit existant. Ajouter une forme nouvelle = enregistrer un gabarit dans le registre 3D.
- Photos réelles : champ `visual.frontImage` (URL ou data URI). S'il est rempli, la photo sert de texture de façade à la place de la façade générée.
- Plans réels : champ `floor.planImage`, affiché en fond du plan SVG. Un bouton permet de l'importer.

### 3.2 Modèle de données
```text
meta       { app, schemaVersion: 1, updatedAt, demo: true }
vlans      [{ id, name, color, subnet }]
sites      [{ id, name, code, address }]
buildings  [{ id, siteId, code, name }]
floors     [{ id, buildingId, level, name, width, height, planImage }]   // dimensions en mètres
rooms      [{ id, floorId, name, type, x, y, w, h }]                     // types : office, open, meeting, hall, tech, server, storage, workshop
racks      [{ id, roomId, catalogId, name, heightU, x, y, serial, installDate, status }]
devices    [{ id, catalogId, hostname, rackId, u, roomId, x, y, serial, ip, mac, firmware, installDate, status, layer?, notes }]
           // rackId + u (U la plus basse occupée) pour un équipement en baie ; roomId + x,y sinon (borne, caméra, téléphone)
           // status : active | maintenance | fault | retired (hors service)
ports      [{ id, deviceId, idx, name, kind, role, speed, status, vlan, poe:{ capable, watts }, mac, connected, description }]
           // kind : rj45 | sfp | sfp+ | lc ; role : access | uplink | pp (passif) ; status : up | down | disabled | error
outlets    [{ id, roomId, label, x, y, usage }]                          // prise murale = 1 prise RJ45 ; usage : data | voice | ap | camera | printer
cables     [{ id, a, b, type, length, color, label }]                    // a et b = id d'un port ou d'une prise ; type : cat6a | patch | om3 | os2 | dac
catalog    [{ id, category, brand, model, ref, template, mount, heightU, layer, ports:[{ kind, count, speed, poe, role, prefix, start, names }],
              poeBudgetW, poeDrawW, powerW, firmware, specs:{}, visual:{ color, accent, logo, frontImage }, description }]
stock      [{ catalogId, available, threshold, location }]               // « installé » est calculé depuis devices
history    [{ id, ts, type, text, ref }]                                 // type : add | move | remove | edit | stock | import | catalog
```
- Les identifiants ont un préfixe par type (`dev-`, `p-`, `o-`, `cab-`, `rack-`…) et sont uniques dans toute la base.
- Les index sont reconstruits après chaque modification : par id, ports par équipement, câbles par extrémité, équipements par baie, etc.

### 3.3 Traçage du câblage et topologie
- **Éléments passifs :** prise murale, panneau de brassage, tiroir optique, passe-câbles. Un port passif a au plus 2 câbles : l'arrière (lien permanent) et l'avant (cordon). Le traçage le traverse en prenant l'autre câble.
- **Exemple de traçage :** appareil → prise → port du panneau de brassage → port du switch d'accès → uplink (SFP+) → tiroir optique du local technique → tiroir optique de la salle serveurs → port du switch de cœur. Le parcours continue par les uplinks jusqu'au cœur, sur 3 niveaux au maximum.
- **Mise en surbrillance** du chemin dans le plan 2D (ligne animée de la prise vers la baie), la 3D (ports et cordons), la topologie (liens) et la fiche (liste des sauts).
- **Topologie :** les liens viennent des câbles entre équipements actifs, une fois les éléments passifs écartés. Les niveaux sont calculés automatiquement :
  - périmètre (routeur, pare-feu)
  - cœur (switchs reliés au pare-feu)
  - distribution (switchs reliés au cœur qui ont eux-mêmes des switchs en aval)
  - accès (les autres)
  - terminaux (affichage optionnel)

  Un champ `device.layer` permet de forcer le niveau à la main.

### 3.4 Vue 3D
- **Unités en mètres :** 1U = 0,04445 m, largeur 19" ; baie de 750 × 1070 mm.
- **Façades** générées sur un canvas, une texture par modèle, mise en cache : logo, ports dessinés, numéros, aérations, LEDs système.
- **InstancedMesh** pour les zones de clic des ports, les LEDs (couleur par instance, clignotement des ports actifs), les fiches RJ45 branchées et la surcouche de couleur des ports.
- Cordons de brassage en `TubeGeometry` (on peut les masquer). Matériaux PBR et `RoomEnvironment` pour les reflets métalliques. Sol en dalles de faux plancher.
- **Survol :** infobulle du port (nom, état, VLAN, vitesse, PoE, appareil connecté). **Clic :** fiche du port.
- **Modes de coloration :** aucune (aspect réel), état, VLAN, PoE, chacun avec sa légende.
- **Mode « objet » :** un équipement seul (borne Wi-Fi, téléphone, caméra, prise murale, aperçu catalogue).
- Le rendu se met en pause quand la vue est cachée. Les LEDs sont rafraîchies environ 10 fois par seconde.
- **Rendu (révision du 2026-11-18) :** ombres portées douces (carte d'ombres recalculée seulement quand la scène change, pas à chaque clignotement), lumière principale chaude, contre-jour et lumière d'arête ; mur de fond et plinthe ; sol, mur et exposition suivent le thème. Halo additif sur chaque LED. Passe-câbles verticaux et bandeaux de prises dans les baies au sol. Tout maillage porte et reçoit l'ombre, sauf les éléments lumineux ou transparents (`finishScene`).
- Une **élévation 2D de la baie** (HTML) est affichée à côté de la 3D. On y voit les U libres, et elle accepte le glisser-déposer depuis le stock.

### 3.5 Code couleur
- **Statut (palette réservée) :**

  | État | Couleur | Code |
  |---|---|---|
  | up / bon | vert | `#0ca30c` |
  | avertissement | jaune | `#fab219` |
  | sérieux | orange | `#ec835a` |
  | critique / erreur | rouge | `#d03b3b` |
  | down | gris | `#6b7a8c` |
  | désactivé | gris foncé pointillé | `#3b4656` |

  Une couleur de statut est toujours accompagnée d'une icône ou d'un libellé.
- **VLAN** (couleurs attribuées dans un ordre fixe) :

  | VLAN | Nom | Couleur |
  |---|---|---|
  | 10 | DATA | `#3987e5` |
  | 20 | VOIX | `#d95926` |
  | 30 | WIFI | `#199e70` |
  | 40 | VIDEO | `#c98500` |
  | 50 | IMPRESSION | `#d55181` |
  | 99 | MGMT | `#0ca30c` |
  | 100 | SERVEURS | `#9085e9` |
  | 200 | INVITES | `#e66767` |

  Au-delà, gris.
- **PoE :** dégradé ambré selon la puissance (≤ 7 W, ≤ 15 W, ≤ 30 W, > 30 W), et pastille éclair sur les ports.
- **Thème (décision du 2026-11-18) : palette « Ardoise et vert », en deux thèmes au choix.** Le bouton soleil/lune de l'en-tête bascule entre les deux ; le choix est mémorisé dans le navigateur (`netcarto:theme`).
  - Sombre (par défaut) : fond `#0b1110`, panneaux `#111a18`, bordures `#1f2e2a`, accent émeraude `#34d399`.
  - Clair : fond `#f3f6f4`, panneaux blancs, bordures `#e1e7e4`, accent vert `#047857`.
  - Toutes les couleurs d'interface sont des variables CSS définies en tête de `css/style.css`. Ajouter un thème = ajouter un bloc `:root[data-theme=…]`.
  - Les tracés et sélections dans les dessins (plan, topologie, 3D) restent en bleu (`--hl`), pour ne pas se confondre avec le vert de l'état « actif ».
  - Les couleurs d'état et de VLAN sont identiques dans les deux thèmes.

### 3.6 Jeu de données de démonstration (fictif)
- **Site :** « Campus Démo », adresse fictive.
- **Bâtiment A (Administration) :**
  - RDC : accueil, salle informatique (2 baies 42U, cœur et serveurs)
  - R+1 : open space, local technique avec 2 switchs
  - R+2 : direction
- **Bâtiment B (Ateliers & Logistique) :**
  - RDC : atelier, magasin, quai, local technique avec un switch de distribution
  - R+1 : bureaux et formation, coffret mural 15U presque plein, pour déclencher une alerte
- **Baie de cœur :** tiroir optique, switch de cœur (16 × SFP+), pare-feu, routeur WAN, switch d'accès du RDC, 2 panneaux de 24 ports, onduleur 2U.
- **Baie serveurs :** switch serveurs, 2 serveurs 2U, 2 serveurs 1U, onduleur.
- **Chaque local technique :** tiroir optique (U42), panneaux de 24 ports, passe-câbles, switch 48 ports PoE+, onduleur. Uplinks redondants en fibre vers le cœur, ou vers la distribution pour le bâtiment B.
- **Environ 85 prises murales** reliées aux panneaux (environ 85 % brassées), environ 15 bornes Wi-Fi au plafond, 6 caméras, environ 20 téléphones IP (avec un PC derrière).
- **Ports :**
  - États variés : majorité up, quelques down et désactivés, 2 ou 3 en erreur
  - VLAN selon l'usage
  - PoE selon l'appareil : téléphone ≈ 6 W, borne 13 à 18 W, caméra 9 à 12 W
- **Valeurs fictives :**
  - MAC en adresses administrées localement (`02:…`)
  - IP en plages privées 10.10.x.x, et plage de documentation 203.0.113.x pour le WAN
  - numéros de série préfixés `DMO-`
- **Stock :** 2 ou 3 articles sous le seuil d'alerte, pour illustrer les alertes.

### 3.7 Catalogue par défaut (environ 25 modèles, caractéristiques indicatives)
| Catégorie | Modèles |
|---|---|
| Switchs | Cisco Catalyst 9200L-48P-4X, 9200L-24P-4G, 9200L-24T-4X, 9500-16X (cœur) ; Aruba CX 6100 48G PoE 4SFP+, CX 6300M 24SFP+ (distribution) ; Ubiquiti USW-Pro-24-PoE |
| Routeurs | Cisco ISR 4331, MikroTik CCR2004-16G-2S+ |
| Pare-feu | Fortinet FortiGate 100F, Stormshield SN910 |
| Bornes Wi-Fi | Cisco Meraki MR46, Ubiquiti U6-Pro, Aruba AP-515 |
| Passif | Panneau 24 ports Cat6A 1U, panneau 48 ports Cat6A 2U, tiroir optique 24 LC 1U, passe-câbles 1U, prise murale RJ45 Cat6A double |
| Baies | APC NetShelter SX 42U 750×1070, coffret mural 15U |
| Onduleurs | APC Smart-UPS SRT 3000 2U, Eaton 5PX 1500 2U |
| Serveurs | Dell PowerEdge R650 1U, HPE ProLiant DL380 Gen11 2U |
| Terminaux | Cisco IP Phone 8851, Yealink T54W, Axis P3265-LVE, Hikvision DS-2CD2143G2-I |
| Consommables | SFP+ 10GBASE-SR, SFP 1000BASE-LX, cordon Cat6A 1 m, jarretière LC/LC OM3 3 m |

### 3.8 Détail des onglets
- **Cartographie :**
  - 3 colonnes : arbre (avec filtre), zone centrale, fiche de détails
  - zone centrale : fil d'Ariane cliquable, puis sous-vues « Plan 2D », « Baie 3D » et « Topologie »
  - **Plan 2D :** zoom à la molette, déplacement à la souris, bouton d'ajustement. Option couverture Wi-Fi et mode Édition pour déplacer les objets.
  - **Palette « Stock » :** on la glisse sur le plan ou sur l'élévation de baie.
  - **Fiche port :** modifiable (état, VLAN, PoE…), avec les boutons « Tracer », « Connecter à… » et « Débrancher ».
- **Inventaire :**
  - barre de recherche globale : filtre le tableau et affiche les prises, ports, pièces, IP et MAC trouvés
  - filtres par type, bâtiment, statut et marque
  - tri par colonne, pagination par 100 lignes
  - clic sur une ligne → Cartographie
  - export CSV et JSON de la vue filtrée
  - actions par ligne : modifier, retirer
- **Matériel :**
  - liste des catégories, cartes de modèles avec pastilles de stock, panneau de droite (aperçu 3D, fiche technique, gestion du stock)
  - **Installer :** fenêtre en cascade bâtiment → étage → pièce → baie → U libre. Pour un appareil hors baie : pièce, position et prise à laquelle le brancher.
  - **Retirer :** retour en stock ou passage en hors service.
  - **Consommables :** « Sortie de stock ».
  - formulaire « Nouveau modèle » avec des groupes de ports dynamiques
- **Tableau de bord :**
  - indicateurs : équipements, ports occupés, U occupés, PoE consommé / budget, prises brassées, alertes
  - barres : équipements par type, par bâtiment, occupation des ports par switch, remplissage des baies, PoE par switch
  - matrice type × bâtiment
  - barre segmentée des états de ports
  - alertes cliquables
  - historique
- **En-tête :**
  - logo NetCarto, onglets (avec un badge d'alertes)
  - recherche globale (raccourci `/`)
  - Thème clair ou sombre, Sources de données, Importer, Exporter, Annuler (Ctrl+Z), Réinitialiser (démonstration ou base vide)
  - mention « Données fictives »

### 3.9 Note technique pour les tests
- **Les tests sont dans le dépôt :** `tests/netcarto.test.js` (interface, Chromium via Playwright), `serveur/tests/` (serveur et base), `connecteurs/tests/test.js` (supervision) et `installation/tests/` (image Docker et installation Linux, quand Docker est disponible). Lancer les trois premières suites avant chaque commit (`npm test` dans chacun des trois dossiers), et la quatrième après toute modification de `installation/`.
- La page ne demande plus rien à Internet : Three.js est dans `js/vendor/three/`. Les tests de l'interface coupent toute requête vers une adresse extérieure et vérifient qu'il n'y en a aucune.
- Les modules ne se chargent pas en `file://` : les tests servent le dépôt par un petit serveur HTTP local.
- Dans l'environnement cloud de Claude, Playwright et Chromium sont déjà installés (`NODE_PATH=/opt/node-tools/node_modules`). Le dépôt de paquets Debian y est bloqué ; Docker Hub, npm et nodejs.org sont accessibles.

### 3.10 Précisions apportées pendant la construction
- **Three.js est chargé sans bloquer la page** (import dynamique). Si la bibliothèque ne se charge pas, seule la vue 3D est indisponible ; un message l'indique.
- **Catégories :** les « Terminaux » sont séparés en deux catégories, Téléphones IP et Caméras IP, pour des comptages plus lisibles.
- **Prise murale :** le modèle du catalogue est une prise simple (1 RJ45), en accord avec le modèle de données.
- **Jeu de démo réel :** 121 prises murales (dont 21 pour les bornes et caméras), 102 équipements, 26 téléphones, 15 bornes, 6 caméras, 972 ports, 344 câbles, 34 modèles au catalogue.
- **Topologie :** un switch n'est classé « cœur » que s'il est relié au pare-feu par un port d'uplink (un port de gestion ne suffit pas). Le routeur de secours RTR-B1-01 a son niveau forcé à « accès » (`device.layer`).
- **Câblage :** un nœud passif accepte un câble vers un autre élément passif (arrière) et un câble vers un port actif (avant). Brancher deux ports actifs fait monter le lien ; débrancher le fait retomber.
- **Retrait « hors service » :** l'équipement reste à l'inventaire, sans emplacement, avec son ancien emplacement en note. Il peut ensuite être remis en stock.
- **Glisser-déposer :** sur l'élévation, la U visée devient la U la plus haute de l'équipement. L'installation est immédiate, avec un nom proposé automatiquement et un bouton Annuler.
- **Modèle déjà installé :** ses ports, sa hauteur et son gabarit ne sont plus modifiables.
- **Tests :** les scripts Playwright sont restés hors du dépôt (dossier temporaire), comme prévu en 3.9.

### 3.13 Structure et base vide (lot 10)
- Logique dans `js/services/structure.js`, interface dans `js/ui/carto/structure.js`.
- **Base vide** (`emptyBase`) : aucun site, VLAN usuels, catalogue par défaut, stock à zéro, `meta.demo = false`.
- **Règles :** une pièce reste dans l'étage et ne chevauche pas une autre (tolérance de 5 cm) ; un étage ne peut pas être réduit sous ses pièces ; une pièce ne peut pas être réduite en laissant dehors une baie, un équipement ou une prise ; un élément ne se supprime que vide ; un VLAN ne se supprime que si aucun port ne l'utilise. Renuméroter un VLAN met à jour les ports concernés.
- **Tracé à la souris :** bouton « Pièce » du plan, rectangle aligné sur une grille de 50 cm, 1 m au minimum de chaque côté, puis fenêtre pour le nom et le type.

### 3.12 Supervision en direct et relais (décision du 2026-11-18)
- **État saisi et état mesuré sont séparés.** Les mesures vivent dans `js/services/mesures.js` (objet `Live`). Elles ne sont ni enregistrées ni annulables, et remplacent l'état saisi seulement à l'affichage (`effStatus`) : LEDs de la vue 3D, ports, prises du plan, alertes. La fiche d'un port montre les deux et signale un écart.
- **Sources côté navigateur** (table `SOURCES`) : aucune, simulation (fait vivre la démo sans équipement), relais.
- **Relais interne** dans `connecteurs/` : service Node.js en lecture seule, avec les sources `prtg`, `snmp` (IF-MIB standard) et `simulation`. Il peut servir NetCarto lui-même (`webRoot`), ce qui règle en même temps l'hébergement interne. Documentation : `connecteurs/README.md`.
- **Exception à la règle « sans backend » :** le relais est un composant serveur facultatif. La page publique de démonstration continue de fonctionner sans lui. Sa seule dépendance est `net-snmp`.
- **Contrat commun** (version 1) entre relais et NetCarto : décrit dans `connecteurs/lib/contrat.js`. Correspondance par IP puis nom d'hôte ; ports par nom d'interface (formes longues et courtes rapprochées).
- **Limite connue :** une page publique (GitHub Pages) ne peut pas joindre un relais interne, le navigateur le bloque. Il faut ouvrir NetCarto depuis le relais.
- **Validation :** PRTG et SNMP sont testés contre des simulateurs (`npm test` dans `connecteurs/`), **pas sur du matériel réel**. À vérifier sur site.
- **À faire ensuite :** API des constructeurs (Cisco, Aruba, UniFi, Meraki) une fois les modèles connus ; table MAC, voisins LLDP et PoE par SNMP ; comparaison automatique entre topologie saisie et topologie mesurée.

### 3.14 Passage en logiciel serveur (décision du 2026-11-19)

NetCarto devient un vrai logiciel serveur, installable sur Linux avec ou sans Docker, avec sa propre base de données. Cette décision remplace la règle « sans backend » pour l'application installée ; la page GitHub Pages reste une démonstration hors ligne.

**1. Serveur**
- Serveur Node.js (dossier `serveur/`), construit à partir du relais de `connecteurs/`. Il sert à la fois l'interface web et une API.
- Le relais de supervision (PRTG, SNMP, simulation) devient un module de ce serveur.

**2. Base de données propre à NetCarto**
- SQLite intégrée par défaut, rien à installer à part.
- Vrai schéma relationnel : une table par type d'objet (sites, bâtiments, étages, pièces, baies, équipements, ports, prises, câbles, catalogue, stock, vlans, utilisateurs, journal…).
- Clés étrangères, contraintes d'unicité (IP, MAC, nom d'hôte, repère de prise), transactions pour toute opération en plusieurs étapes (exemple : installer un équipement crée ses ports et décrémente le stock, tout ou rien).
- Migrations versionnées : une base d'une version précédente est mise à jour automatiquement au démarrage, avec une sauvegarde faite juste avant.
- Code d'accès aux données isolé dans une couche dédiée, pour pouvoir passer à PostgreSQL plus tard sans réécrire le reste.
- Le modèle de données de la section 3.2 sert de point de départ ; le schéma est documenté en 3.15.

**3. Comptes et sécurité**
- Connexion par identifiant et mot de passe (12 caractères minimum, hachage fort, verrouillage après plusieurs échecs).
- Rôles : lecture, technicien, administrateur.
- Journal d'audit : qui, quand, quoi, valeur avant et après.
- Contrôle des modifications concurrentes : si deux personnes modifient le même élément, la seconde est prévenue au lieu d'écraser.
- HTTPS par défaut (certificat auto-signé généré à l'installation, possibilité de fournir le sien).
- Aucun mot de passe ni secret dans le dépôt : uniquement des fichiers d'exemple.

**4. Installation (deux modes, même application)**
- Docker : image NetCarto et `docker-compose.yml`, lancement par `docker compose up -d`.
- Linux sans Docker : script `installer.sh` pour Debian/Ubuntu, service systemd, compte système dédié sans privilèges.
- Données dans `/var/lib/netcarto`, réglages dans `/etc/netcarto/netcarto.toml`, dans les deux modes.
- Scripts de mise à jour et de désinstallation complète (avec garde-fou contre la suppression d'un mauvais dossier).
- Pas de version Windows pour l'instant.

**5. Portabilité (pour pouvoir ajouter Windows plus tard)**
- Le code de l'application reste portable (Linux, Windows, macOS).
- Aucun chemin ni aucune commande propre à Linux dans l'application elle-même : les dossiers de données et de réglages viennent de la configuration.
- Tout ce qui est propre à Linux reste dans les scripts d'installation et l'image Docker.
- Une version Windows pourra être ajoutée plus tard comme simple lot d'emballage.

**6. Ce qui ne change pas**
- L'interface actuelle est conservée (cartographie, 3D, traçage, inventaire, matériel, tableau de bord) ; elle lit et écrit désormais via l'API du serveur au lieu du localStorage.
- La page GitHub Pages reste une démo hors ligne, avec des données fictives uniquement, sans serveur.
- Aucune dépendance à NetBox.
- Interface et commentaires en français, palette et règles de `CLAUDE.md` inchangées.

**Méthode demandée :** tests écrits avant le code, un scénario par nouvelle fonction ; toute la suite lancée avant chaque commit (`tests/`, `connecteurs/`, `serveur/`) ; travail sur une branche dédiée, jamais sur la branche principale.

**Ordre de réalisation :** lots 16, 17, 11, 18, 14, 19, 20, 22.

### 3.15 Serveur, base et API (lot 16)

**Schéma (migration `serveur/donnees/migrations/sqlite/001_initial.sql`)**

| Table | Contenu | Contraintes notables |
|---|---|---|
| `meta` | révision de la base, drapeau de démonstration | |
| `vlans` | id, nom, couleur, sous_reseau | id de 1 à 4094 |
| `sites`, `batiments`, `etages`, `pieces` | la structure | code de bâtiment unique par site, niveau unique par bâtiment, dimensions positives |
| `catalogue`, `catalogue_ports` | modèles et leurs groupes de ports | catégorie contrôlée |
| `stock` | disponible, seuil, lieu | jamais négatif |
| `baies` | nom, hauteur, position | nom unique |
| `equipements` | nom d'hôte, emplacement, IP, MAC, statut… | IP, MAC et nom d'hôte uniques ; en baie (avec U) ou en pièce, pas les deux ; un équipement hors service libère son IP et son nom |
| `ports` | rang, nom, type, rôle, état, VLAN, PoE… | nom et rang uniques par équipement |
| `prises` | repère, position, usage | repère unique |
| `cables` | `a_port_id`, `a_prise_id`, `b_port_id`, `b_prise_id`, type… | chaque extrémité est un port ou une prise |
| `journal` | historique affiché dans l'interface | |

Les tables `utilisateurs` et `audit` viendront avec la migration du lot 17.

**Décisions prises pendant le lot**
- **Pilote `node:sqlite`**, intégré à Node (22.5 ou plus récent) : rien à compiler, portable. Il est encore marqué « expérimental » par Node 22, d'où l'option `--disable-warning=ExperimentalWarning` au lancement. Seul `donnees/pilote-sqlite.js` le connaît.
- **Dépendance ajoutée :** `smol-toml`, pour lire le fichier de réglages. Le serveur n'utilise aucun cadre web.
- **Écriture par lots.** L'interface garde sa logique : elle modifie ses données en mémoire, puis `js/sync.js` calcule l'écart et l'envoie (`POST /api/v1/lots`). Le serveur l'applique en une transaction. Chaque changement porte la valeur « avant » ; si elle ne correspond plus à la base, le lot est refusé (code 409). Cela sert déjà à détecter les modifications concurrentes, et fournira le « avant / après » du journal d'audit.
- **Refus du serveur :** l'écran revient à l'état d'avant la modification et un message explique le refus. En cas de conflit, la base est rechargée.
- **Changements faits ailleurs :** la page compare la révision toutes les 20 secondes et recharge si un autre poste a écrit.
- **Identifiants :** tirés au hasard en mode serveur, pour que deux postes ne créent pas le même.
- **Mode serveur ou démonstration :** le serveur inscrit l'adresse de son API dans la page (`<meta name="netcarto-api">`). Sans cette balise (GitHub Pages), la page reste en démonstration locale.
- **Modèle de départ et démonstration :** le serveur les lit dans les modules de l'interface (`js/config.js`, `js/catalogue.js`, `js/demo.js`), pour n'avoir qu'une définition.
- **Supervision :** `connecteurs/lib/releveur.js` est partagé par le relais autonome et par le serveur (`/api/v1/supervision/…`).
- **Règles vérifiées par le serveur** en plus des contraintes SQL : chevauchement en baie, nombre de câbles par port ou prise, pièce dans son étage. Les autres règles restent contrôlées par l'interface ; les déplacer côté serveur est à prévoir avant d'ouvrir l'API à d'autres outils.
- **Sécurité :** écoute sur `127.0.0.1` par défaut ; une écriture venue d'une page d'un autre site est refusée. Comptes et HTTPS : voir 3.16.
- **Migrations :** le moteur de migrations existe déjà (une transaction par fichier). La sauvegarde automatique avant migration est prévue au lot 18.
- **Branche :** le travail reste sur `claude/upbeat-ptolemy-lq3vu6`, déjà distincte de la branche principale ; la session n'était pas autorisée à en pousser une autre.

**API :** liste des routes dans `serveur/README.md`.

**Tests :** `serveur/tests/` (19 scénarios, écrits avant le code) et 9 scénarios de bout en bout en mode serveur dans `tests/netcarto.test.js` (23 au total).

### 3.16 Comptes, rôles, audit et HTTPS (lot 17)

- **Migration 002 :** tables `utilisateurs`, `sessions`, `audit`. Deux déclencheurs SQL empêchent toute modification ou suppression dans `audit`.
- **Mots de passe :** 12 caractères au moins ; empreinte scrypt salée (fonction intégrée à Node, aucune dépendance) ; comparaison en temps constant. Le message d'échec est le même que le compte existe ou non.
- **Verrouillage :** 5 échecs de suite verrouillent le compte 15 minutes (réglable). Un administrateur peut déverrouiller.
- **Sessions :** jeton aléatoire dans un cookie `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS. Seule l'empreinte du jeton est en base. Expiration après 2 heures d'inactivité et 12 heures au plus (réglable).
- **Rôles :** lecture (consultation), technicien (lots de modifications), administrateur (comptes, audit, remplacement de la base). Le contrôle est fait par le serveur à chaque route ; l'interface refuse aussi d'emblée ce que le rôle ne permet pas.
- **Premier administrateur :** tant qu'aucun compte n'existe, le serveur affiche au démarrage un code à usage unique ; la page le demande pour créer le compte. Aucun mot de passe par défaut n'existe.
- **Récupération :** commande `node netcarto.js compte <identifiant>` (crée le compte, ou change son mot de passe et le déverrouille).
- **Journal d'audit :** une ligne par objet créé, modifié ou supprimé, avec l'auteur, la date, l'adresse, la valeur avant et la valeur après ; les changements d'un même lot portent le même numéro. Y figurent aussi les connexions, les échecs et la gestion des comptes. L'historique affiché dans l'interface (`journal`) reste distinct.
- **Modifications concurrentes :** le refus (409) nomme la personne qui a modifié l'élément, d'après le journal d'audit ; l'interface recharge les données.
- **HTTPS par défaut :** certificat fourni par l'administrateur, sinon certificat auto-signé créé au premier démarrage dans le dossier de données. Le certificat est construit par NetCarto lui-même (structure X.509 écrite dans `securite/certificat.js`), sans programme extérieur, pour rester portable. L'option `--http` existe pour les essais sur le poste.
- **Port par défaut :** 8443.
- **Interface :** écran de connexion et de première initialisation, bouton du compte dans l'en-tête, gestion des comptes et journal d'audit (`js/ui/compte.js` ; rangés depuis dans la page d'administration, voir 3.27). Une session expirée en cours de travail redemande la connexion sans perdre la page.
- **Non fait dans ce lot :** politique de sécurité du contenu (CSP), à poser quand Three.js sera hébergé localement (lot 22) ; limitation du nombre de tentatives par adresse (seul le verrouillage par compte existe) ; double authentification.

**Tests :** 33 scénarios pour le serveur, 30 de bout en bout (dont 16 en mode serveur).

### 3.17 Qualité des données (lot 11)

- **Import CSV** (onglet Inventaire, bouton « Importer ») : équipements ou prises murales. Séparateur `;` ou `,` détecté ; fichiers UTF-8 ou Windows-1252 (Excel). Un modèle de fichier se télécharge depuis la fenêtre.
- **Analyse avant import :** chaque ligne est acceptée ou refusée avec ses motifs (modèle absent du catalogue, baie ou pièce introuvable, emplacement U occupé, position hors de la pièce, doublon avec la base ou dans le fichier, IP, MAC, date ou statut invalide). Rien n'est écrit pendant l'analyse.
- **Import d'un bloc :** les lignes acceptées sont enregistrées en une seule opération (un pas d'annulation, une transaction côté serveur). Les lignes refusées sont laissées de côté. 5 000 lignes au plus par fichier.
- **Le stock n'est pas modifié par l'import :** il décrit du matériel déjà en place. Les ports de chaque équipement sont créés d'après le modèle du catalogue.
- **Emplacement :** un équipement en baie se désigne par le nom de la baie (U facultatif : première place libre en partant du haut) ; les autres par la pièce, précisée par le bâtiment et l'étage si le nom n'est pas unique. Sans position, l'équipement est posé au centre de la pièce et les prises sont réparties le long d'un mur.
- **Doublons :** `js/services/doublons.js` contrôle le nom d'hôte, l'adresse IP, l'adresse MAC, le nom de baie et le repère de prise, sans tenir compte de la casse, à la modification, à l'installation et à l'import. Les messages sont ceux du serveur, qui garde ses propres contraintes d'unicité en dernier rempart. Les adresses MAC sont ramenées à la forme `aa:bb:cc:dd:ee:ff`.
- **Déplacement d'un équipement câblé :** la fenêtre indique le nombre de câbles branchés et propose de les débrancher. La case est cochée d'office si l'équipement change de baie (ou de pièce), décochée s'il reste dans la même. Le déplacement et le débranchement forment une seule opération.
- **Fichiers :** `js/services/import-csv.js`, `js/services/doublons.js`, `js/ui/import-csv.js`.

**Tests :** 35 scénarios de bout en bout (dont 17 en mode serveur), 33 pour le serveur, 6 pour les connecteurs.

### 3.18 Sauvegardes et restauration (lot 18)

- **Copie à chaud :** une sauvegarde est une copie complète et cohérente de la base, faite par le moteur pendant que le serveur tourne (`VACUUM INTO`, dans `pilote-sqlite.js`). Elle est relue et vérifiée (intégrité, niveau du schéma) ; une copie illisible est supprimée et signalée.
- **Nom des fichiers :** `netcarto-AAAA-MM-JJ_HHMMSS-motif.sqlite`, dans `sauvegardes/` sous le dossier de données, ou dans le dossier réglé (`sauvegardes.dossier`).
- **Planification :** une sauvegarde automatique par jour à l'heure réglée (02:30 par défaut). Le serveur vérifie chaque minute, et au démarrage : une sauvegarde manquée parce qu'il était arrêté est rattrapée. Réglages : `sauvegardes.actif`, `heure`, `conserver`.
- **Conservation :** seules les sauvegardes automatiques sont purgées (les 14 plus récentes sont gardées). Les sauvegardes manuelles, « avant mise à jour » et « avant restauration » restent jusqu'à ce qu'un administrateur les supprime.
- **Avant une migration :** une base existante est sauvegardée juste avant sa première migration en attente. Une base neuve ne l'est pas.
- **Deux restaurations, deux usages :**
  - *Depuis l'interface* (administrateur, serveur en marche) : les données d'inventaire reviennent à l'état de la sauvegarde, en une transaction. Les comptes, les sessions et le journal d'audit sont gardés, car un journal d'audit ne doit pas pouvoir être remonté dans le temps. L'opération est tracée, et l'état d'avant est sauvegardé.
  - *En ligne de commande* (`node netcarto.js restaurer <sauvegarde>`, serveur arrêté) : le fichier de la base est remplacé en entier, comptes et journal compris. Pour une panne ou un changement de machine. La commande refuse de s'exécuter si le serveur tourne (témoin `netcarto.verrou` dans le dossier de données) et met l'état d'avant de côté.
- **Sauvegarde plus ancienne que le logiciel :** elle est mise au niveau du schéma actuel par les migrations avant d'être relue.
- **Sécurité :** routes réservées à l'administrateur ; une sauvegarde n'est désignée que par son nom, contrôlé, jamais par un chemin ; création, suppression et restauration sont inscrites au journal d'audit. Un fichier de sauvegarde contient les empreintes des mots de passe : il est créé lisible par le seul compte du serveur.
- **Routes ajoutées :** `GET|POST /sauvegardes`, `GET|DELETE /sauvegardes/{nom}`, `POST /sauvegardes/restauration`.
- **Interface :** rubrique « Sauvegardes » de la page d'administration (`js/ui/sauvegardes.js`) : liste, sauvegarde immédiate, téléchargement, restauration, suppression.
- **Non fait :** envoi automatique des sauvegardes vers un autre serveur (à faire avec l'outil de sauvegarde de l'entreprise, en pointant sur le dossier) ; chiffrement des fichiers de sauvegarde.

**Tests :** 42 scénarios pour le serveur (dont 9 pour les sauvegardes), 36 de bout en bout.

### 3.19 Montée en charge (lot 14)

**Jeu de test :** `tests/grande-base.mjs` fabrique une base fictive de 20 bâtiments de 5 étages : 3 222 équipements, 33 992 ports, 8 000 prises, 18 421 câbles, 1 100 pièces, 200 baies (10 Mo en JSON). Les tailles sont réglables.

**Mesures** (Chromium sans carte graphique, machine de test ; durées avec affichage) :

| Action | Durée |
|---|---|
| Serveur : charger toute la base (`PUT /base`) | 0,96 s |
| Serveur : lire toute la base | 0,32 s |
| Serveur : appliquer un lot d'une modification, règles comprises | 20 ms |
| Serveur : sauvegarde | 0,14 s (fichier de 7,7 Mo) |
| Page : chargement complet en mode serveur | 1,4 s |
| Page : plan d'un étage, traçage, recherche globale | 20 à 35 ms |
| Page : onglet Inventaire, Tableau de bord, vue Topologie | 110 à 180 ms |
| Page : enregistrer une modification | 130 ms |
| Page : annuler | 37 ms |

**Ce que les mesures ont montré, et ce qui a été fait :**

- **Annulation :** chaque étape gardait une copie complète de la base, soit 253 Mo pour 25 étapes sur la grande base. Elle garde maintenant l'écart avec l'état d'avant (`js/ecarts.js`) : 13 Ko pour 25 étapes. La base revient à l'identique, ordre des listes compris. Seul le remplacement de toute la base (import, réinitialisation) garde encore une copie complète.
- **Envoi au serveur :** le lot de modifications est mis en texte au moment de la modification, et non au moment de l'envoi. Deux modifications rapprochées du même élément ne provoquent plus de faux conflit.
- **Comparaison des états :** faite valeur par valeur, sans passer par du texte (environ trois fois plus rapide).
- **Réseau :** les réponses de plus de 2 Ko et les fichiers de l'interface sont compressés (gzip). La base de 10 Mo voyage en 0,7 Mo.
- **Réaffichage partiel et affichage limité à la zone visible :** non faits. Les mesures ne les justifient pas à cette taille : l'Inventaire est déjà paginé, l'arbre ne déplie que ce qui est ouvert, le plan ne dessine qu'un étage.
- **3D :** les durées longues relevées (1 à 2 s à la première ouverture d'une vue 3D) viennent de la préparation du rendu graphique sur une machine sans carte graphique, pas du volume de données.

**Limites connues :** au-delà d'environ 15 000 équipements, enregistrer une modification demanderait une demi-seconde : il faudrait alors suivre les changements au fil de l'eau au lieu de comparer deux états. L'arbre entièrement déplié (12 000 lignes) reste fluide mais lourd. La vue Topologie devient peu lisible au-delà de quelques centaines d'équipements.

**Tests :** 39 scénarios de bout en bout (dont une grande base et l'annulation à l'identique), 44 pour le serveur (dont la grande base et la compression).

### 3.20 Image Docker (lot 19)

- **Fichiers :** `docker-compose.yml` à la racine (`docker compose up -d`), `installation/docker/Dockerfile`, `installation/docker/entree.sh`, `installation/netcarto.toml` (réglages posés à la première installation), `installation/netcarto` (commande d'exploitation), `.dockerignore`. Mode d'emploi : `installation/README.md`.
- **Dossiers :** `/var/lib/netcarto` (base, sauvegardes, certificat) et `/etc/netcarto/netcarto.toml`, sur la machine hôte comme dans le conteneur. Docker crée ces dossiers au premier lancement.
- **Compte du service :** le conteneur démarre en root le temps de poser les réglages par défaut et de donner le dossier de données au compte `netcarto` (numéro 10001) ; le serveur tourne ensuite sous ce compte. La commande `netcarto` quitte root de la même façon : `docker compose exec netcarto netcarto compte alice` ne crée jamais de fichier en root.
- **Durcissement :** système de fichiers en lecture seule, toutes les capacités retirées sauf les quatre nécessaires au démarrage (CHOWN, SETUID, SETGID, DAC_OVERRIDE), `no-new-privileges`. Les réglages appartiennent à root : le service les lit mais ne peut pas les modifier.
- **Arrêt :** le serveur est le processus principal du conteneur ; il reçoit la demande d'arrêt et ferme la base proprement (code de sortie 0). Pas de processus `init` intermédiaire : sans la capacité KILL, il ne pourrait pas transmettre le signal.
- **Contrôle de santé :** nouvelle commande `node netcarto.js sante` (code 0 ou 1), utilisée par Docker. En HTTPS, elle n'accepte que le certificat du serveur lui-même (comparaison d'empreinte).
- **Certificat :** nouveau réglage `https.noms` pour inscrire dans le certificat auto-signé les noms et adresses par lesquels on ouvre NetCarto (dans un conteneur, le nom du poste ne veut rien dire). Le certificat est refait si la liste n'est plus couverte.
- **Image :** `node:22-bookworm-slim`, dépendances installées dans une étape séparée, 330 Mo. Aucun secret dans l'image ni dans `docker-compose.yml` ; les secrets de supervision passent par un fichier `.env` local.
- **Essais réels :** `installation/tests/docker.test.js` construit l'image, démarre un conteneur durci, vérifie le compte du service, les commandes d'exploitation, le contrôle de santé, l'arrêt propre et la persistance des données. `docker compose up -d` a aussi été essayé avec les dossiers de l'hôte. Ces essais sont ignorés quand Docker n'est pas disponible.

### 3.21 Installation Linux sans Docker (lot 20)

- **Fichiers :** `installation/linux/installer.sh`, `mettre-a-jour.sh`, `desinstaller.sh`, `commun.sh` (fonctions partagées), `netcarto.service`. Mode d'emploi : `installation/README.md`. Debian et Ubuntu seulement ; le script refuse les autres systèmes.
- **Node.js :** Debian et Ubuntu livrent une version trop ancienne. Le script installe donc un Node.js 22 propre à NetCarto dans `/opt/netcarto/noeud`, téléchargé sur nodejs.org avec vérification de la somme de contrôle. Le Node.js du système n'est pas touché.
- **Dossiers :** programme dans `/opt/netcarto` (à root, non modifiable par le service), données dans `/var/lib/netcarto` (au compte `netcarto`, 750), réglages dans `/etc/netcarto/netcarto.toml` (root:netcarto, 640, jamais écrasés), secrets de supervision dans `/etc/netcarto/netcarto.env` (root, 600).
- **Service systemd :** compte `netcarto` sans privilège ; écriture limitée à `/var/lib/netcarto` (`ProtectSystem=strict`), aucune capacité, `NoNewPrivileges`, noyau et périphériques protégés. Niveau d'exposition mesuré par `systemd-analyze security` : inférieur à 3,5 sur 10.
- **Mise à jour sûre :** la nouvelle version est préparée à côté (`/opt/netcarto.nouveau`), une sauvegarde est faite, puis les dossiers sont échangés. Si le serveur ne répond pas après le redémarrage, l'ancienne version est remise en service automatiquement.
- **Désinstallation :** par défaut, les données et les réglages sont gardés. `--tout` les supprime aussi, après avoir fait taper `SUPPRIMER`.
- **Garde-fou de suppression :** `supprimer_dossier` n'accepte que les chemins de NetCarto écrits en dur, refuse un lien symbolique, un chemin vide ou modifié, et tout dossier qui ne contient pas son fichier témoin (`.installation-netcarto`, `netcarto.sqlite` ou `netcarto.toml`). L'installation refuse aussi d'écrire dans un `/opt/netcarto` qu'elle n'a pas créé.
- **Sans accès à Internet :** options `--node <archive>` et `--hors-ligne` (dépendances préparées sur un autre poste).
- **Défaut trouvé par l'essai réel :** sous le cloisonnement systemd, le serveur ne pouvait pas lire la liste des adresses du poste et refusait de démarrer. Corrigé des deux côtés (famille `AF_NETLINK` autorisée dans le service ; le serveur continue sans cette liste si elle lui est refusée).
- **Essais réels :** `installation/tests/linux.test.js` déroule tout dans un conteneur Debian 12 où tourne un vrai systemd : installation, droits, cloisonnement, exploitation, mise à jour, retour arrière sur une version cassée, désinstallation, garde-fou (dossier étranger, lien symbolique), désinstallation complète.
- **Non essayé :** Ubuntu (même famille, mêmes outils, mais non déroulé) ; le téléchargement de Node.js depuis l'intérieur du script sur une machine réelle (la fonction de téléchargement et de vérification est essayée à part) ; processeurs ARM.

### 3.22 Three.js local et politique de sécurité du contenu (lot 22)

- **Three.js dans le dépôt :** `js/vendor/three/` contient les trois fichiers utilisés de la version 0.160.0 (`three.module.min.js`, `OrbitControls.js`, `RoomEnvironment.js`), repris sans modification du paquet npm, avec leur licence MIT. Poids : 0,7 Mo. `SOMMES.txt` garde leur empreinte ; un test signale toute modification ultérieure.
- **Plus aucun appel à Internet :** `index.html` ne cite plus aucune adresse extérieure. Cela vaut aussi pour la démonstration GitHub Pages, par simplicité (un seul chemin de chargement). Le serveur NetCarto fonctionne donc sur un réseau sans accès à Internet, vue 3D comprise.
- **Politique de sécurité du contenu (CSP)**, posée par le serveur sur la page : tout doit venir de NetCarto lui-même (`default-src 'self'`). Les deux scripts écrits dans la page (carte d'import et thème) sont autorisés par leur empreinte, calculée sur la page servie ; aucun `unsafe-inline` ni `unsafe-eval` pour les scripts. Un script injecté ne s'exécute pas, et la page ne peut pas envoyer de données vers un autre site. Les styles en attribut restent permis, car l'interface en utilise partout.
- **Limite :** la démonstration GitHub Pages, sans serveur, n'a pas cette politique (elle ne contient que des données fictives).
- **Bibliothèque de test retirée :** `tests/package.json` ne dépend plus de `three`.

**Tests :** 41 scénarios de bout en bout (dont « sans Internet » et la politique de sécurité), 50 pour le serveur.

### 3.23 Sauvegarde locale du mode démonstration (fin du lot 9)

- **IndexedDB à la place de localStorage** (`js/stockage.js`) : plus de limite à 5 Mo (un grand fond de plan passe), et la base n'est plus convertie en texte à chaque enregistrement. Les données laissées par une ancienne version dans localStorage sont reprises, puis déplacées. Si IndexedDB est refusée par le navigateur, NetCarto se rabat sur localStorage ; si rien ne peut être écrit, un message le dit.
- **Copies de secours :** à chaque ouverture de la page, l'état retrouvé est gardé en copie ; les cinq plus récentes sont conservées. Le bouton « Copies de secours » de l'en-tête (mode démonstration seulement) les liste, les restaure (annulable) ou les télécharge. Une réinitialisation ou un import malheureux se rattrape donc même après fermeture de la page.
- **Écriture avant de quitter :** une modification en attente est enregistrée dès que la page passe en arrière-plan.
- **Mode serveur :** inchangé, rien n'est gardé dans le navigateur ; ses sauvegardes sont celles de la section 3.18.

### 3.24 Téléphone (lot 13)

- **Zoom par pincement :** deux doigts sur le plan zooment autour du point situé entre eux et déplacent le plan ; un doigt le déplace. Un second doigt posé en cours de geste annule le déplacement d'objet en cours.
- **Élévation de la baie :** sur téléphone, la vue « Baie 3D » a une barre « Vue 3D / Élévation / Stock ». L'élévation occupe alors tout l'écran, avec des lignes de 32 px ; on y choisit un équipement, ou une U libre pour y installer un modèle.
- **Installer au doigt, de deux façons :**
  - *toucher puis poser* : toucher un modèle de la palette « Stock » (elle se replie), puis toucher la pièce du plan ou la U libre ;
  - *glisser* : tirer la poignée du modèle jusqu'au plan ou à l'élévation ; une image suit le doigt et les U visées s'allument.
  Les deux passent par la même fonction que le glisser-déposer à la souris (`poser`, dans `js/ui/materiel/palette.js`).
- **Mode Édition au doigt :** une prise ou une borne suit le doigt. À l'échelle d'un étage entier, une prise mesure trois pixels : il faut zoomer avant de la saisir.
- **Corrections faites au passage :** la légende ne bloque plus les appuis sur le plan ; la fenêtre « Sauvegardes » passe à la ligne sur écran étroit.
- **Limite :** tout est vérifié dans Chromium en émulation de téléphone (390 px, contacts d'écran envoyés comme de vrais doigts), pas sur un appareil réel. Safari sur iPhone n'a pas été essayé.

### 3.25 Confort (lot 15)

- **Impression** (`js/ui/impression.js`) : bouton « Imprimer » de la fiche d'une baie. Le document contient la fiche de la baie (une ligne par équipement : position, nom, type, modèle, série, IP, statut) puis, sur une nouvelle page, le plan de brassage (pour chaque port actif câblé : VLAN, état, panneaux et prises traversés, équipement au bout, cordon). Il est écrit dans `#print-root`, invisible à l'écran ; la feuille de style d'impression ne montre que lui, en thème clair.
- **Export en image** (`js/ui/export-image.js`) : bouton de téléchargement sur le plan et sur la topologie. Le dessin est copié avec ses styles calculés, puis tracé en PNG de 2 400 px de large. Le plan exporté est toujours l'étage entier, quel que soit le zoom à l'écran. Compatible avec la politique de sécurité du contenu.
- **Clavier** (`js/ui/clavier.js`) : `1` à `4` changent d'onglet ; dans l'arbre, les flèches parcourent, ouvrent, referment ou remontent, `Entrée` choisit ; dans la recherche, les flèches parcourent les résultats et `Entrée` ouvre celui qui est choisi ; une ligne de l'Inventaire s'ouvre avec `Entrée` ; `Tab` reste dans la fenêtre ouverte ; `?` affiche la liste des raccourcis.
- **Historique** (`js/ui/historique.js`) : bouton « Tout voir » de la carte « Dernières actions » du Tableau de bord. Filtre par texte et par type. « Revenir avant » défait l'action choisie et toutes celles faites après elle, après confirmation du nombre d'actions annulées.
- **Limite du retour en arrière :** il porte sur les actions de la visite en cours, 25 au plus (la pile d'annulation). Pour revenir plus loin : les copies de secours en mode démonstration (3.23), les sauvegardes en mode serveur (3.18).
- **Non fait :** impression du plan d'un étage (l'export en image y répond) ; choix du format de papier.

### 3.26 Audit d'usage et interventions d'urgence

Le rapport complet est dans `AUDIT.md` : scénarios déroulés sur un vrai serveur, constats par fonction, améliorations faites, reste à faire classé par priorité.

**Constat principal :** l'outil répondait bien à « où est quoi », mal à « ce switch est mort, qui est touché et comment je le remplace », et la 3D devenait illisible dès qu'on cherchait un port précis.

**Améliorations faites :**

- **Impact d'une panne** (`js/services/impact.js`) : prises, terminaux et pièces qui dépendent d'un équipement réseau, y compris ceux des équipements qu'il isole du cœur (parcours du graphe de la topologie sans lui). Résumé dans la fiche, détail par pièce, export CSV.
- **Remplacement d'un équipement** (`js/services/remplacement.js`) : le modèle du stock reprend le nom, l'adresse IP, l'emplacement, la configuration des ports et les câbles, port par port (même rang si le type est compatible, sinon premier port équivalent libre). Les câbles sans port équivalent sont annoncés avant de valider. L'ancien passe hors service (renommé `…-ANCIEN`) ou retourne en stock. Une opération, annulable.
- **Vue 3D** (`js/3d/viewer.js`, `js/ui/carto/baie.js`) : cordons des autres ports effacés quand un port ou un équipement est choisi (bouton « Isoler ») ; étiquette accrochée au port choisi ; ports en erreur encadrés en rouge à travers les cordons et listés dans la barre d'outils ; vue de face ; flèches gauche et droite pour passer au port voisin.
- **Couper un port** avec un motif, noté dans la description et l'historique ; réactivation. NetCarto note l'état, il ne pilote pas le switch.
- **Recherche par adresse MAC** dans tous les formats.
- **Sécurité du serveur** : route `GET /securite` (administrateur) et carte du tableau de bord — échecs de connexion sur 24 h, comptes verrouillés, jamais connectés ou inactifs depuis 90 jours, âge de la dernière sauvegarde, validité du certificat, nombre d'administrateurs. Export CSV du journal d'audit.
- **Firmware par modèle** : carte du tableau de bord, modèles à plusieurs versions signalés.

**Constats du second passage (2026-11-20), non corrigés :** boutons d'action visibles pour un compte en lecture seule ; stock à zéro sans explication le premier jour ; barre d'outils 3D trop haute sur téléphone, bouton « Stock » en double ; alertes de sécurité absentes de la liste des alertes ; journal d'audit bavard (43 lignes pour un remplacement).

**Reste, par priorité** (détail dans `AUDIT.md`, sections 4 et 6) : essais en conditions réelles ; sauvegardes hors de la machine et chiffrées ; alertes envoyées ; double authentification ; plan d'adressage ; dates de garantie ; étiquettes ; face arrière des baies et alimentation électrique.

### 3.27 Page d'administration, courriel des comptes, mot de passe perdu

- **Rôles :** les trois niveaux demandés existaient déjà et sont gardés tels quels — *Lecture seule* (consulte tout), *Technicien* (modifie les données), *Administrateur* (tous les droits : comptes, mots de passe, journal d'audit, sauvegardes, remplacement de la base). Pas de quatrième niveau : il n'aurait rien à porter de plus.
- **Page d'administration :** onglet « Administration », adresse `/admin`, visible des seuls administrateurs (`js/ui/administration.js`). Quatre rubriques : comptes et rôles, journal d'audit, sauvegardes, sécurité du serveur. Les trois fenêtres qui faisaient doublon (« Utilisateurs », « Journal d'audit », « Sauvegardes », ouvertes depuis le menu du compte) ont été retirées : le menu ne propose plus que « Changer mon mot de passe », « Page d'administration » et « Se déconnecter », et le bouton « Journal d'audit » de la carte « Sécurité » du tableau de bord mène à la rubrique de la page. Le serveur sert la même page à `/admin` ; l'adresse suit l'onglet, et un rechargement y revient. Un non-administrateur est renvoyé sur l'application avec un message ; le contrôle réel reste celui du serveur, route par route.
- **Adresse de courriel des comptes** (migration 003) : facultative, unique, gardée en minuscules. On se connecte avec son identifiant ou son courriel.
- **Mot de passe perdu, deux voies :**
  - *Lien remis par un administrateur* : toujours disponible, sans aucun réglage. L'administrateur ne connaît jamais le nouveau mot de passe.
  - *Lien envoyé par courriel* : seulement si un serveur d'envoi est réglé (`[courriel]`). Sans lui, l'écran « Mot de passe oublié » explique de s'adresser à un administrateur.
- **Sécurité des liens :** jeton aléatoire de 32 octets, dont seule l'empreinte est en base ; valable 30 minutes ; usage unique ; le mot de passe choisi suit les mêmes règles que les autres ; les sessions ouvertes du compte sont fermées et le compte est déverrouillé. La demande par courriel répond la même chose que le compte existe ou non, et un compte reçoit au plus trois liens par heure (compté dans le journal d'audit). Le lien n'apparaît jamais dans le journal. Il est retiré de l'adresse du navigateur dès qu'il a servi.
- **Lien des courriels :** écrit à partir du réglage `courriel.adresse`, jamais à partir de l'adresse reçue dans la requête (qui peut être falsifiée). Ce réglage est donc obligatoire dès qu'un serveur d'envoi est déclaré.
- **Envoi de courriels :** `serveur/courrier.js`, sans bibliothèque (SMTP avec STARTTLS, TLS direct ou sans chiffrement ; authentification PLAIN). Le mot de passe du serveur d'envoi se donne par `"env:NOM"`. Un serveur d'envoi en panne n'empêche rien d'autre.
- **Compte en lecture seule :** les boutons d'action ne lui sont plus proposés (constat 1 de `AUDIT.md`).
- **Barre du haut :** libellés d'onglets raccourcis sur écran moyen, pour loger le cinquième onglet sans débordement (vérifié de 390 à 1700 px).
- **Non essayé en réel :** l'envoi n'a tourné que contre un faux serveur SMTP, sans chiffrement. STARTTLS, le TLS direct et un vrai serveur de messagerie restent à essayer.
- **Non fait :** raccordement à un annuaire (Active Directory, LDAP) ; double authentification ; alertes par courriel (le module d'envoi est prêt pour elles).

**Tests :** 5 scénarios serveur (`serveur/tests/administration.test.js`), 4 scénarios d'interface.

### 3.28 Audit de sécurité avant déploiement en entreprise

Rapport complet : `SECURITE.md`. Seize points trouvés : quatorze corrigés, deux acceptés et documentés.

**Corrigé :**

- **Injection dans la page (gravité haute) :** trois affichages inséraient un texte de la base sans le neutraliser (emplacement en tête des fiches de pièce et de baie, date d'installation). Corrigés. Un scénario charge une base où tous les textes libres portent une charge d'injection et visite tous les écrans : il doit rester vert après tout changement d'affichage.
- **Contenu contrôlé par le serveur :** nouveaux types de champ `coul`, `img` et `date` dans `serveur/donnees/schema.js`. Une couleur est `#rrggbb`, une image est toujours intégrée (`data:image/…`, jamais une adresse extérieure, 8 Mo au plus), une date est `AAAA-MM-JJ`. Un texte libre fait 20 000 caractères au plus. `Store.validate` applique les mêmes règles.
- **Limite par adresse** (`serveur/securite/limiteur.js`) : 20 échecs d'authentification en 10 minutes, puis attente. Couvre connexion, initialisation et récupération.
- **Aucun indice sur les comptes :** une seule réponse (401, même texte, même temps de calcul) pour compte inconnu, mauvais mot de passe, compte verrouillé ou désactivé.
- **Empreintes :** scrypt à N = 2^17 par défaut (`securite.coutMotDePasse`), relevées à la connexion quand elles sont plus faibles, deux calculs à la fois au plus. Les tests utilisent un coût réduit (14) pour rester rapides.
- **Mots de passe courants refusés.**
- **Requêtes sans session limitées à 64 Ko** ; version du serveur non donnée sans session.
- **Exports CSV :** `csvCell` (`js/utils.js`) neutralise les valeurs qu'un tableur lirait comme une formule. Tout nouvel export doit passer par elle.
- **En-têtes** ajoutés ; cookie `__Host-` en HTTPS ; TLS 1.2 au minimum ; délais de connexion courts.
- **Fichiers en 600** (base, journal d'écriture, sauvegardes) : `umask` posé au démarrage.
- **Événements de sécurité au journal du service** (`SECURITE …`), valeurs nettoyées de tout caractère de contrôle.
- **Proxy inverse :** réglage `serveur.proxyDeConfiance`.

**Accepté :** un tiers peut verrouiller un compte en échouant cinq fois (compensé par la limite par adresse et le déverrouillage) ; un technicien peut effacer l'historique affiché (le journal d'audit, lui, est inaltérable).

**Règles à tenir désormais :** tout texte venu de la base passe par `esc()` avant d'entrer dans la page ; toute valeur insérée dans un attribut de style ou d'image a une forme imposée, côté interface et côté serveur ; toute route sans session passe par la limite par adresse.

### 3.29 Campagne d'attaques et correctifs

Après l'audit (3.28), une campagne de 40 attaques a été menée contre un serveur de test local. Rapport : `SECURITE.md`, section 8. Elle se rejoue par `npm run attaques` dans `serveur/` (`serveur/tests/campagne-attaques.js`).

**Trois défenses cédaient, toutes sous une rafale de requêtes simultanées :**
- la limite par adresse comptait l'échec à la fin du calcul : 80 tentatives envoyées ensemble étaient toutes essayées ;
- le verrou du compte tombait trop tard : le bon mot de passe passait en 46e position ;
- avec une session volée, le mot de passe actuel se devinait sans limite par le changement de mot de passe.

**Décisions :**
- `securite/limiteur.js` : la tentative est comptée à l'arrivée (`entrer`), rendue en cas de succès (`reussir`). Clé par réseau `/64` en IPv6 (`cleAdresse`).
- `securite/index.js` : une tentative à la fois par compte (`unParUn`, douze en attente au plus), pour la connexion et le changement de mot de passe. Un mot de passe actuel faux compte comme un échec de connexion.
- Adresse de courriel : jeu de caractères restreint avant l'arobase.
- 64 Ko pour toute route, sauf `POST /lots` et `PUT /base`.
- Téléchargement d'une sauvegarde inscrit au journal d'audit (`sauvegarde_telecharger`).
- Vingt sessions par compte ; connexions muettes fermées en dix secondes ; 1 000 connexions au plus.

Chaque attaque réussie a son scénario dans `serveur/tests/securite.test.js`. Risques restants : `SECURITE.md`, 8.4.

### 3.30 Audit par profils et améliorations d'usage

Cinq profils ont déroulé leurs tâches dans l'application : administrateur réseau en exploitation, administrateur réseau en conception, RSSI, DSI, technicien sur téléphone. Rapport : `AUDIT.md`, section 7.

**Décisions :**
- **Journal d'audit.** Le serveur écrit une ligne `operation` par lot, avec le libellé de l'entrée d'historique du lot (`donnees/depot.js`). L'interface regroupe les lignes d'un même lot (`operations`, `ligneOperation` dans `js/ui/compte.js`). Filtre `actions` (liste) sur `GET /audit`.
- **Alertes de sécurité.** `js/services/securite.js` garde l'état rendu par `/securite` et en tire des alertes ; `computeAlerts` les ajoute. L'état n'est chargé que pour un administrateur, au démarrage puis toutes les cinq minutes. Une alerte peut porter une action (`act`) au lieu d'un objet à ouvrir.
- **Plan d'adressage.** `js/services/adressage.js` : IPv4 seulement, calculé depuis les adresses des équipements. Alerte à 90 % (`SEUIL_PLEIN_PCT`).
- **Âge du parc.** `js/services/cycle-de-vie.js`, depuis la date d'installation, hors éléments passifs. Seuil de renouvellement : `RENOUVELLEMENT_ANS` (7) dans `js/config.js`.
- **Synthèse imprimable.** `js/ui/synthese.js`, par le mécanisme d'impression existant (`imprimer`, exporté par `js/ui/impression.js`). Les alertes de sécurité du serveur n'y figurent pas : le document est fait pour circuler.
- **Téléphone.** Barre d'outils du plan et de la vue 3D repliée (`Carto.outils`, bouton `tl-plus`) ; un bouton marqué `tl-garde` reste visible replié (« Stock » sur le plan, « Effacer le tracé »). Indicateurs de l'inventaire sur une ligne.
- **Stock vide.** `entreeRapide` (`js/ui/materiel/palette.js`) : entrée en stock depuis la palette ou une U libre, puis reprise de l'installation.

**Défaut corrigé au passage :** la rubrique « Sécurité du serveur » et la carte du tableau de bord portaient le même identifiant ; seule la première était remplie. Les deux portent maintenant la classe `sec-etat`.

**Non fait, noté dans `AUDIT.md` 7.3 :** garantie et fin de support, seuil de renouvellement par type, alertes envoyées, réservation d'adresses, IPv6, étiquettes, lecture de code-barres.

### 3.31 Dossier technique pour un prestataire

Demande venue d'un futur utilisateur : sortir un plan à remettre à ses prestataires. Jusque-là, le plan sortait en image et chaque baie s'imprimait à part.

- **Bouton « Dossier »** sur la fiche d'un étage, d'un bâtiment ou d'un site (`js/ui/dossier.js`). Un seul document : page de garde avec sommaire, puis pour chaque étage le plan, la liste des prises avec leur liaison (panneau, switch, VLAN, état), les équipements hors baie, et chaque baie avec son élévation et son plan de brassage. Chaque rubrique se décoche.
- **Sortie par la fenêtre d'impression** du navigateur, qui sait enregistrer en PDF : aucune bibliothèque ajoutée. Le plan est le dessin vectoriel de l'écran (`planSvg`, exporté par `js/ui/carto/plan.js`), sans sélection ni couverture Wi-Fi, repères des prises affichés.
- **Plan en paysage** (`@page paysage`). Un navigateur qui ne sait pas mêler les orientations dans un même document le laisse en portrait.
- **Adresses IP, adresses MAC et numéros de série absents par défaut** : le document part chez un tiers. Une case les ajoute ; la page de garde dit s'ils ont été retirés. `ficheBaie` accepte `{ sensibles: false }`.
- **Limites :** le plan n'est pas éditable (ni Visio, ni DWG) ; la génération du dossier n'est pas inscrite au journal d'audit, car elle se fait dans le navigateur à partir de données que le compte peut déjà lire.

### 3.11 Pistes pour la suite
- **Premier lancement :** la page charge encore le jeu de démonstration par défaut. Pour une mise en service réelle, proposer le choix (démonstration ou base vide) dès la première ouverture.
- Activer GitHub Pages (réglages du dépôt), après fusion de la branche de travail dans la branche par défaut.
- Remplacer le catalogue générique par les modèles réels, avec photos de façade.
- Importer les plans réels des étages.
- Déplacer et redimensionner une pièce à la souris (aujourd'hui : par le formulaire « Modifier »).

---

## 4. Plan de réalisation par lots

| Lot | Contenu | Niveau d'effort conseillé | Statut |
|---|---|---|---|
| 1 | Socle : structure HTML/CSS (thème sombre), onglets, modèle de données, store, catalogue, jeu de démo, sauvegarde locale, import/export, annulation | Élevé (high) | ✅ Fait |
| 2 | Cartographie 2D : arbre hiérarchique, fil d'Ariane, plan d'étage SVG, fiches (site → port), fiche port et prise modifiable | Élevé (high) | ✅ Fait |
| 3 | Vue 3D : baies, équipements procéduraux, ports cliquables, LEDs, cordons, coloration, élévation 2D, mode objet | Très élevé (xhigh) | ✅ Fait |
| 4 | Traçage du câblage (surbrillance 2D/3D/fiche), connexion et débranchement de câbles, topologie logique | Très élevé (xhigh) | ✅ Fait |
| 5 | Inventaire : tableau, filtres, tri, recherche globale, exports CSV/JSON, navigation vers la Cartographie | Élevé (high) | ✅ Fait |
| 6 | Matériel : catalogue, fiches et aperçu 3D, stock, installation et retrait, glisser-déposer, formulaire de modèle | Élevé (high) | ✅ Fait |
| 7 | Tableau de bord : indicateurs, graphiques, alertes, historique | Moyen à élevé (medium/high) | ✅ Fait |
| 8 | Finitions : performances, tests complets, `README.md` (modèle de données, ajout d'un modèle ou d'un plan, sécurité), activation de GitHub Pages | Élevé (high) | ✅ Fait, sauf l'activation de GitHub Pages : elle se fait à la main dans les réglages du dépôt (voir `README.md`) |

| 9 | **Sécuriser le développement :** tests Playwright dans le dépôt (dossier `tests/`), sauvegarde locale plus sûre (IndexedDB et sauvegarde automatique téléchargeable), annulation plus légère | Élevé (high) | ✅ Fait : tests, annulation légère (voir 3.19), sauvegarde locale dans IndexedDB et copies de secours (voir 3.23). |
| 10 | **Saisir un vrai réseau :** démarrage sur base vide ; création, modification et suppression des sites, bâtiments, étages et pièces depuis l'interface (dessin des pièces sur le plan) ; gestion des VLAN | Élevé (high) | ✅ Fait |
| 11 | **Qualité des données :** import CSV des équipements et des prises ; contrôle des doublons (IP, nom d'hôte, MAC, repère de prise) ; vérification du brassage lors du déplacement d'un équipement | Élevé (high) | ✅ Fait (voir 3.17) |
| 12 | **Harmonisation visuelle :** appliquer le style du tableau de bord et de l'inventaire à la Cartographie et au Matériel ; sol et baie de la vue 3D adaptés au thème clair | Moyen à élevé | ✅ Fait |
| 13 | **Téléphone :** zoom du plan par pincement, élévation de baie accessible, glisser-déposer au doigt, vérification sur un vrai appareil | Moyen à élevé | ✅ Fait (voir 3.24), sauf la vérification sur un vrai appareil, qui reste à faire par l'utilisateur |
| 14 | **Montée en charge :** jeu de test de grande taille, mesures, puis réaffichage partiel et affichage limité à la zone visible si nécessaire | Élevé (high) | ✅ Fait (voir 3.19). Réaffichage partiel jugé inutile à cette taille, d'après les mesures. |
| 15 | **Confort :** impression d'une fiche de baie et d'un plan de brassage, export en image du plan et de la topologie, navigation au clavier, historique filtrable avec retour à un état antérieur | Moyen | ✅ Fait (voir 3.25) |

| 16 | **Serveur et base :** serveur Node, API, SQLite, schéma, couche d'accès aux données, bascule de l'interface vers l'API, mode démo conservé | Maximal (max) | ✅ Fait |
| 17 | **Comptes et sécurité :** comptes, rôles, journal d'audit, modifications concurrentes, HTTPS | Très élevé (xhigh) | ✅ Fait |
| 18 | **Sauvegardes et migrations :** sauvegardes automatiques planifiées, restauration, migrations versionnées | Élevé (high) | ✅ Fait (voir 3.18) |
| 19 | **Docker :** image NetCarto et `docker-compose.yml` | Élevé (high) | ✅ Fait (voir 3.20) |
| 20 | **Installation Linux :** `installer.sh`, systemd, mise à jour, désinstallation | Élevé (high) | ✅ Fait (voir 3.21) |
| 22 | **Three.js hébergé localement**, pour fonctionner sans Internet | Moyen | ✅ Fait (voir 3.22) |

**Ordre de réalisation (décision du 2026-11-19) :** 16, 17, 11, 18, 14, 19, 20, 22. Les lots 9 (reste), 13 et 15 viennent ensuite. Il n'y a pas de lot 21.

Le stockage partagé, les comptes, le journal d'audit et la supervision réelle, auparavant « en attente de décision », sont désormais couverts par les lots 16 et 17 et par la section 3.14.

Légende : ⏳ À faire · 🔄 En cours · ✅ Fait

### Rappels — à faire

| Quoi | Qui | Statut |
|---|---|---|
| **Ranger les branches du dépôt.** La branche `main` existe (créée le 2026-11-19, identique aux deux autres). Reste, dans GitHub : la choisir comme branche par défaut (*Settings → General → Default branch*) et, si GitHub Pages est activé, comme source (*Settings → Pages*) ; puis supprimer `claude/serene-johnson-wll23d` et `claude/upbeat-ptolemy-lq3vu6` (page *Branches* du dépôt). | Utilisateur (réglages GitHub, hors de portée de Claude) | 🔄 `main` créée ; réglages à faire |
| Essayer NetCarto sur un vrai téléphone (Android, et Safari sur iPhone) | Utilisateur | ⏳ À faire |
| Essayer `installer.sh` sur Ubuntu, et l'installation en ligne sur une vraie machine | Utilisateur | ⏳ À faire |
| Essayer les connecteurs avec un vrai PRTG ou de vrais switchs (SNMP) | Utilisateur | ⏳ À faire |
| Essayer l'envoi de courriels avec votre vrai serveur de messagerie (réglage `[courriel]`) | Utilisateur | ⏳ À faire |
| Avant le déploiement en entreprise : appliquer les cinq mesures de `SECURITE.md`, section 5 (certificat, sauvegardes hors machine, deux administrateurs, filtrage réseau, surveillance du journal) | Utilisateur | ⏳ À faire |

**Réglage de l'effort :**
- Moyen (medium) pour les petites corrections.
- Max seulement pour débloquer un bug difficile : c'est le plus lent et le plus coûteux.

---

## 5. Journal des demandes

| Date | Demande | Statut |
|---|---|---|
| 2026-11-18 | Lecture du cahier des charges (`Promp.txt`) | ✅ Fait |
| 2026-11-18 | Présenter l'architecture et le modèle de données | ✅ Fait (section 3) |
| 2026-11-18 | Créer un fichier de suivi du projet dans le dépôt | ✅ Fait (ce fichier) |
| 2026-11-18 | Quel modèle d'IA est le plus adapté ? | ✅ Répondu : Claude Opus 5.5 (niveau le plus adapté à ce projet), construction par lots testés |
| 2026-11-18 | Ne pas lancer tout de suite la création de la solution | ✅ Respecté : aucun code livré pour l'instant |
| 2026-11-18 | Remettre les instructions complètes du projet dans le suivi, pour qu'une nouvelle session Claude construise la solution | ✅ Fait (sections 1 à 3 + `CLAUDE.md`) |
| 2026-11-18 | Conseil sur le niveau d'effort (l'utilisateur prévoit Fable 5.2) | ✅ Répondu : élevé par défaut, très élevé pour les lots 3 et 4 (colonne ajoutée en section 4) |
| 2026-11-18 | « go » : lancer la construction en suivant le plan par lots | ✅ Fait : lots 1 à 8 réalisés et testés dans Chromium |
| 2026-11-18 | « Veux-tu des images ou des choses qui facilitent la création ? » | ✅ Répondu : rien de nécessaire pour la V1. Utile ensuite : liste exacte des modèles, photos de façade prises de face, plans en image avec une cote. Ne rien déposer de réel dans ce dépôt public. |
| 2026-11-18 | Ne plus tout garder dans un seul fichier `index.html` : répartir le code dans plusieurs fichiers, pour un projet plus propre et plus évolutif | ✅ Fait (« commence ») : 1 feuille de styles et 33 modules JavaScript natifs, sans outil de build. Tous les tests repassés, imports vérifiés avec ESLint. Structure décrite en 3.1. |
| 2026-11-18 | Proposer d'autres palettes de couleurs | ✅ Répondu : 3 pistes proposées |
| 2026-11-18 | Inventaire : lignes plus aérées, à la manière de Freshservice, avec des compteurs en haut (nombre d'équipements réseau, de switchs…) | ✅ Fait : bandeau « Vue d'ensemble » de 7 compteurs cliquables (ils filtrent la liste), tableau dans une carte, lignes plus hautes, pagination en haut à droite |
| 2026-11-18 | Palette « Ardoise et vert », avec fond blanc et mode sombre au choix | ✅ Fait : deux thèmes et bouton de bascule dans l'en-tête (voir 3.5) |
| 2026-11-18 | Tableau de bord : les informations conviennent, mais l'esthétique est à revoir (structuré, propre, agréable à l'œil) | ✅ Fait : nouvelle mise en page en cartes homogènes, indicateurs avec jauge circulaire, alertes en lignes avec niveau, anneau des états de ports, baies en jauges verticales, historique en frise. À valider par l'utilisateur ; les autres onglets pourront suivre le même style. |
| 2026-11-18 | Adapter l'affichage au téléphone | ✅ Fait (écran ≤ 900 px) : onglets en barre du bas, en-tête sur deux lignes, Cartographie en plein écran avec l'arbre et la fiche en volets, boutons de zoom sur le plan, Inventaire et Matériel empilés, tableau de bord sur deux colonnes. Vérifié sur un écran simulé de 390 × 800 ; à confirmer sur un vrai téléphone. |
| 2026-11-18 | Bilan des points forts, des inconvénients et des évolutions indispensables ; « il faudra corriger tout ça », « note-le » | ✅ Noté : lots 9 à 15 ajoutés en section 4, avec les points en attente de décision. Rien n'est encore réalisé. |
| 2026-11-18 | Peut-on brancher une supervision réelle (PRTG), ou interroger directement un switch ? Développer et préparer ces connecteurs en interne, comme un vrai outil professionnel | ✅ Fait pour la première étape (voir 3.12) : couche de mesures en direct dans NetCarto, écran « Sources de données », relais interne avec sources PRTG, SNMP et simulation. Testé contre des simulateurs ; reste à valider sur du matériel réel et à ajouter les API des constructeurs. |
| 2026-11-18 | Auditer et peaufiner la solution, améliorer encore les visuels 3D | ✅ Fait. **Audit :** faille corrigée à l'import (un fichier JSON pouvait injecter du code par un identifiant ou une couleur : le contenu est maintenant contrôlé élément par élément) ; suite de tests ajoutée au dépôt ; boutons à icône nommés pour les lecteurs d'écran ; message clair si l'on installe sans étage ; états de ports du tableau de bord alignés sur l'affichage ; jeton du relais comparé en temps constant ; code mort retiré. **3D :** ombres portées douces, mur de fond et plinthe, sol et éclairage adaptés au thème clair, passe-câbles verticaux à doigts, bandeaux de prises au fond de la baie, halo lumineux des LEDs, fiches en deux parties (corps clair et manchon à la couleur du cordon), dessus des équipements ajouré, façades légèrement auto-éclairées, bords de scène assombris. |
| 2026-11-18 | Continuer avec le lot 10 : base vide et création des bâtiments | ✅ Fait. Le bouton Réinitialiser propose « démonstration » ou « base vide » (aucun site, catalogue conservé, stock à zéro). Sites, bâtiments, étages et pièces se créent, se modifient et se suppriment depuis la fiche de droite ; une pièce peut aussi se tracer à la souris sur le plan (alignement tous les 50 cm). Contrôles : pièces sans chevauchement et dans l'étage, codes de bâtiment et niveaux uniques, suppression seulement si l'élément est vide. Gestion des VLAN depuis le tableau de bord ou la fiche d'un port. L'étiquette « Données fictives » ne s'affiche plus que pour la démonstration. Un scénario de test complet a été ajouté (14 tests au total). |
| 2026-11-18 | Peut-on encore peaufiner le design ? | ✅ Fait (lot 12) : typographie et espacements revus, en-tête plus aéré avec onglets en pastilles, boutons et champs arrondis avec transitions, anneau de focus au clavier, fiches de détail en cartes (Cartographie et Matériel), barres d'outils flottantes translucides sur le plan et la 3D, arbre à lignes arrondies, cartes du catalogue avec effet au survol, fenêtres et notifications animées. Vérifié dans les deux thèmes et sur téléphone. |
| 2026-11-19 | **Nouvelle orientation :** NetCarto devient un logiciel serveur installable sur Linux, avec ou sans Docker, avec sa propre base de données (décisions détaillées, lots 16 à 22, ordre de réalisation, méthode « tests avant le code ») | ✅ Décisions notées en 3.14, lots ajoutés en section 4. **Lot 16 fait** (voir 3.15) : serveur Node dans `serveur/`, base SQLite relationnelle, API `/api/v1`, interface basculée sur l'API, page GitHub Pages inchangée. Prochain lot : 17. |
| 2026-11-19 | « Continue à tout concevoir, je vais tester à la maison » | ✅ Lots 17, 11, 18, 14, 19, 20 et 22 faits (voir 3.16 à 3.22). Restent, hors de l'ordre fixé : la fin du lot 9, les lots 13 et 15. |
| 2026-11-19 | « Tu as tout fini ? Si non, fais tout » | ✅ Fin du lot 9 (3.23), lot 13 (3.24) et lot 15 (3.25) faits. Tous les lots du tableau sont faits. Reste à l'utilisateur : essai sur un vrai téléphone, sur Ubuntu, et avec un vrai PRTG ou de vrais switchs. |
| 2026-11-19 | « Fusionne tout sur la branche principale » | ✅ La branche par défaut du dépôt (`claude/serene-johnson-wll23d`) a été avancée jusqu'au dernier commit de la branche de travail, sans réécriture d'historique. Les deux branches sont identiques. |
| 2026-11-19 | « Pourquoi deux branches ? » puis « Mets en rappel à faire » | ✅ Rangement des branches noté dans les rappels de la section 4, avec les essais qui restent à faire par l'utilisateur. |
| 2026-11-19 | « Fais-le, prends la main » | ✅ Branche `main` créée et poussée. Le changement de branche par défaut et la suppression des anciennes branches se font dans les réglages GitHub : voir les rappels de la section 4. |
| 2026-11-19 | « Prends le rôle d'un administrateur système, réseau et cyber : simule l'usage (ajouts, interventions d'urgence), fais un rapport complet d'utilisation et d'audit, puis améliore chaque fonction, dont la praticité de la 3D » | ✅ Rapport `AUDIT.md` ; sept améliorations faites (voir 3.26) ; reste à faire classé par priorité dans le rapport. |
| 2026-11-20 | « Refais-moi le rapport d'analyse, en administrateur qui reçoit NetCarto et doit s'en servir en vrai » | ✅ `AUDIT.md` réécrit après un nouveau parcours complet sur un vrai serveur (premier jour, quotidien, urgence, sécurité, téléphone). Douze constats ; cinq corrections rapides proposées, non faites (section 6 du rapport). |
| 2026-11-20 | « Une page d'administration centrale à l'adresse /admin (création des comptes, rôles, réinitialisation des mots de passe), connexion par adresse mail, récupération de compte par mail avec serveur SMTP facultatif, niveaux de droits étagés. À toi de structurer. » | ✅ Fait (voir 3.27). |
| 2026-11-20 | « Oui, retire les anciennes fenêtres en doublon » | ✅ Fenêtres « Utilisateurs », « Journal d'audit » et « Sauvegardes » retirées du menu du compte ; tout passe par la page d'administration (voir 3.27). |
| 2026-11-22 | « En RSSI senior : audite la solution, trouve les failles et applique les correctifs de sécurité, elle va être déployée en entreprise » | ✅ Rapport `SECURITE.md` ; 14 failles corrigées et testées, 2 risques acceptés (voir 3.28). Restent les mesures d'exploitation de la section 5 du rapport, à la charge de l'utilisateur. |
| 2026-11-22 | « Applique les correctifs, puis teste en te mettant dans le rôle d'un attaquant, évalue les risques et corrige-les » | ✅ Campagne de 40 attaques (`npm run attaques`) : 3 défenses cédaient sous rafale, plus 6 points trouvés en chemin, tous corrigés et testés. Risques restants notés dans `SECURITE.md`, 8.4 (voir 3.29). |
| 2026-11-22 | « Peaufine encore la solution côté utilisation : mets-toi à la place d'un administrateur réseau (deux visions), d'un RSSI, d'un DSI et d'un technicien, audite et améliore » | ✅ Audit par cinq profils (`AUDIT.md`, section 7) : journal d'audit regroupé par opération, alertes de sécurité dans la liste, plan d'adressage, âge du parc et synthèse imprimable, barre d'outils repliée sur téléphone, entrée en stock depuis la baie (voir 3.30). Demandes restantes en 7.3. |
| 2026-11-23 | « Sortir des plans pour les prestataires : si on peut répondre à ce besoin, oui » (retour d'un collègue) | ✅ Bouton « Dossier » sur un étage, un bâtiment ou un site : un seul PDF avec plan, prises, équipements et baies ; adresses et numéros de série absents par défaut (voir 3.31). |
| 2026-11-23 | « Si je photographie les bureaux et que je t'envoie un plan, tu pourras tout reproduire (emplacements, liaisons, 3D) ? » | 🕓 Question, réponse donnée. Possible pour le plan, les pièces, les baies et leur contenu ; les liaisons demandent un relevé de brassage. Les données réelles ne doivent pas entrer dans le dépôt (public) : elles seraient livrées en fichier à importer. En attente des documents. |
| 2026-11-18 | Au déploiement réel, la solution ne contiendra pas tous ces équipements de démonstration ? | ✅ Répondu : non, ce sont des données de démonstration. À prévoir avant la mise en service : un démarrage sur base vide et le remplacement du catalogue (voir 3.11) |

---

## 6. Sécurité : options pour les vraies données (à décider plus tard)

1. **Dépôt privé + GitHub Pages privé** (GitHub Enterprise Cloud) : accès limité aux membres de l'organisation
2. **Hébergement interne** (serveur web de l'intranet, accessible uniquement depuis le LAN ou le VPN) : l'option la plus simple et la plus sûre
3. **Authentification devant la page** : reverse proxy (Nginx + SSO/LDAP, Authelia, Authentik) ou Cloudflare Access / Zero Trust
4. **Données séparées du code** : le JSON réel n'est jamais commité ; il est importé localement ou servi par une API interne authentifiée
5. **Évolution backend** : NetBox comme source de vérité, ou une petite API (base de données, rôles, journal d'audit)

⚠️ Une protection par mot de passe en JavaScript dans une page publique n'est **pas** une vraie protection.

---

## 7. Questions ouvertes (avec la valeur par défaut à appliquer si aucune réponse)

| Question | Valeur par défaut |
|---|---|
| Construction par lots ou en une seule fois ? | Par lots (section 4), enchaînés dans la même session si possible |
| Marques et modèles réels dès la V1 ? | Catalogue générique réaliste (section 3.7) |
| Format des futurs plans de bâtiment (PDF, image, DWG/DXF) ? | Image (PNG/JPG/SVG) en fond de plan via `floor.planImage` |
| Langue de l'interface | Français |
