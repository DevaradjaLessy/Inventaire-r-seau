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
- Ne pas ajouter de backend ni de nouvelle bibliothèque CDN sans le noter dans la section 3.
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
js/services/               requetes, cablage, topologie, tracage, connexion, recherche, installation
js/3d/                     three (chargement), facades, viewer, objets
js/ui/socle.js             onglets, fenêtres, infobulles, notifications
js/ui/carto/               carto, plan, fiches, baie, tracage, connexion, topologie
js/ui/inventaire.js  recherche.js  tableau-de-bord.js
js/ui/materiel/            catalogue, installation, palette, modele
```
- **Sens des dépendances :** config → utils → store → services → 3d → ui. Les couches basses n'importent jamais l'interface (le store prévient l'interface par `Store.onSaveError` et `Store.on`). Les fichiers de `js/ui/` peuvent s'importer entre eux, mais n'utilisent ces imports que dans des fonctions, jamais au chargement.
- **Conséquence :** la page doit être servie par HTTP (GitHub Pages, serveur interne, ou `python3 -m http.server` en local). L'ouverture par double-clic ne fonctionne plus.
- **Bibliothèque unique : Three.js `0.160.0`**, chargée par import map depuis jsDelivr :
  - `three` → `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
  - `three/addons/` → `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/` (OrbitControls, RoomEnvironment)
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
- **Les tests sont dans le dépôt :** `tests/netcarto.test.js` (application, 13 scénarios) et `connecteurs/tests/test.js` (relais, 6 scénarios). Les lancer avant chaque commit. Si le CDN est bloqué, indiquer le dossier de Three.js par la variable `NETCARTO_THREE`, ou faire `npm install` dans `tests/`.
- Dans l'environnement cloud de Claude, le CDN jsDelivr peut être bloqué (erreur 403 du proxy). Le registre npm, lui, est accessible.
- Pour tester :
  1. installer `three@0.160.0` avec npm dans un dossier temporaire (pas dans le dépôt) ;
  2. dans Playwright, intercepter les URL jsDelivr avec `page.route` et servir les fichiers locaux ;
  3. servir le dossier du dépôt par HTTP (ou avec `page.route`), car les modules ne se chargent pas en `file://`.
- Les fichiers livrés gardent les URL CDN, qui fonctionnent sur GitHub Pages.

### 3.10 Précisions apportées pendant la construction
- **Three.js est chargé sans bloquer la page** (import dynamique). Si le CDN est inaccessible, seule la vue 3D est indisponible ; un message l'indique.
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

| 9 | **Sécuriser le développement :** tests Playwright dans le dépôt (dossier `tests/`), sauvegarde locale plus sûre (IndexedDB et sauvegarde automatique téléchargeable), annulation plus légère | Élevé (high) | 🔄 En cours : tests faits (13 scénarios, `npm test` dans `tests/`). Restent la sauvegarde et l'annulation. |
| 10 | **Saisir un vrai réseau :** démarrage sur base vide ; création, modification et suppression des sites, bâtiments, étages et pièces depuis l'interface (dessin des pièces sur le plan) ; gestion des VLAN | Élevé (high) | ✅ Fait |
| 11 | **Qualité des données :** import CSV des équipements et des prises ; contrôle des doublons (IP, nom d'hôte, MAC, repère de prise) ; vérification du brassage lors du déplacement d'un équipement | Élevé (high) | ⏳ À faire |
| 12 | **Harmonisation visuelle :** appliquer le style du tableau de bord et de l'inventaire à la Cartographie et au Matériel ; sol et baie de la vue 3D adaptés au thème clair | Moyen à élevé | ✅ Fait |
| 13 | **Téléphone :** zoom du plan par pincement, élévation de baie accessible, glisser-déposer au doigt, vérification sur un vrai appareil | Moyen à élevé | ⏳ À faire |
| 14 | **Montée en charge :** jeu de test de grande taille, mesures, puis réaffichage partiel et affichage limité à la zone visible si nécessaire | Élevé (high) | ⏳ À faire |
| 15 | **Confort :** impression d'une fiche de baie et d'un plan de brassage, export en image du plan et de la topologie, navigation au clavier, historique filtrable avec retour à un état antérieur | Moyen | ⏳ À faire |

**Hors lots, en attente d'une décision de l'utilisateur** (dépendent du choix d'hébergement, voir section 6) : stockage partagé entre plusieurs personnes, comptes et droits, journal d'audit, remontée automatique de l'état réel des équipements (SNMP, API). À trancher avant le déploiement si plusieurs personnes doivent modifier les données.

Légende : ⏳ À faire · 🔄 En cours · ✅ Fait

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
