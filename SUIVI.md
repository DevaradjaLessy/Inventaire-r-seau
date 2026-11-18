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

**Mission :** construire l'application décrite dans le cahier des charges (section 2), dans un fichier unique `index.html` à la racine du dépôt, en suivant les décisions de la section 3.

**Méthode de travail :**

1. Lis entièrement ce fichier avant d'écrire du code.
2. Regarde le tableau des lots (section 4). Prends le **premier lot dont le statut n'est pas « ✅ Fait »**.
3. Réalise ce lot dans `index.html`, en gardant le découpage en sections commentées décrit en 3.1.
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
- **Un seul fichier `index.html`** à la racine, organisé en sections commentées (bandeaux `=== SECTION`), dans cet ordre :
  1. Configuration et constantes (couleurs, VLAN, statuts, catégories)
  2. Utilitaires (DOM, formatage, générateur pseudo-aléatoire, téléchargements)
  3. Icônes SVG (dessinées à la main, en ligne)
  4. Catalogue par défaut
  5. Jeu de données de démonstration (générateur déterministe à graine fixe)
  6. Store (état, index, historique, annulation, sauvegarde)
  7. Services métier (installation, retrait, câblage, traçage, topologie, statistiques, alertes, recherche)
  8. Moteur 3D (classe `Viewer3D` + registre de gabarits procéduraux)
  9. UI : socle (onglets, modales, infobulles, notifications)
  10. UI : Cartographie
  11. UI : Inventaire
  12. UI : Matériel disponible
  13. UI : Tableau de bord
  14. Démarrage
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
- **Thème :** fond `#090d12`, panneaux `#111821`, bordures `#1f2b39`, accent cyan `#38bdf8`.

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
  - Importer, Exporter, Annuler (Ctrl+Z), Réinitialiser la démo
  - mention « Données fictives »

### 3.9 Note technique pour les tests
- Dans l'environnement cloud de Claude, le CDN jsDelivr peut être bloqué (erreur 403 du proxy). Le registre npm, lui, est accessible.
- Pour tester :
  1. installer `three@0.160.0` avec npm dans un dossier temporaire (pas dans le dépôt) ;
  2. dans Playwright, intercepter les URL jsDelivr avec `page.route` et servir les fichiers locaux.
- Le fichier livré garde les URL CDN, qui fonctionnent sur GitHub Pages.

---

## 4. Plan de réalisation par lots

| Lot | Contenu | Niveau d'effort conseillé | Statut |
|---|---|---|---|
| 1 | Socle : structure HTML/CSS (thème sombre), onglets, modèle de données, store, catalogue, jeu de démo, sauvegarde locale, import/export, annulation | Élevé (high) | ✅ Fait |
| 2 | Cartographie 2D : arbre hiérarchique, fil d'Ariane, plan d'étage SVG, fiches (site → port), fiche port et prise modifiable | Élevé (high) | ⏳ À faire |
| 3 | Vue 3D : baies, équipements procéduraux, ports cliquables, LEDs, cordons, coloration, élévation 2D, mode objet | Très élevé (xhigh) | ⏳ À faire |
| 4 | Traçage du câblage (surbrillance 2D/3D/fiche), connexion et débranchement de câbles, topologie logique | Très élevé (xhigh) | ⏳ À faire |
| 5 | Inventaire : tableau, filtres, tri, recherche globale, exports CSV/JSON, navigation vers la Cartographie | Élevé (high) | ⏳ À faire |
| 6 | Matériel : catalogue, fiches et aperçu 3D, stock, installation et retrait, glisser-déposer, formulaire de modèle | Élevé (high) | ⏳ À faire |
| 7 | Tableau de bord : indicateurs, graphiques, alertes, historique | Moyen à élevé (medium/high) | ⏳ À faire |
| 8 | Finitions : performances, tests complets, `README.md` (modèle de données, ajout d'un modèle ou d'un plan, sécurité), activation de GitHub Pages | Élevé (high) | ⏳ À faire |

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
| 2026-11-18 | « go » : lancer la construction en suivant le plan par lots | 🔄 En cours (voir section 4) |

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
