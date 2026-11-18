# Suivi du projet — NetCarto (inventaire et cartographie réseau)

Ce fichier trace les demandes, les décisions et l'avancement du projet. On le met à jour à chaque étape.

---

## 1. Objet du projet

Outil web interne pour l'équipe informatique : cartographie, inventaire et gestion du matériel réseau physique (câblage, équipements, prises, stock).

- **Livrable :** un fichier unique `index.html` (HTML + CSS + JS, bibliothèques par CDN, sans backend)
- **Hébergement :** GitHub Pages
- **Données V1 :** uniquement fictives (le dépôt et la page sont publics)

---

## 2. Demande initiale (résumé structuré)

### Onglet 1 : Cartographie
- Navigation hiérarchique : Site → Bâtiment → Étage → Pièce / Hall / Local technique → Baie → Équipement → Port
- Plan 2D par étage : prises murales, bornes Wi-Fi, baies, équipements
- Vue 3D réaliste (Three.js) : switchs 24/48 ports, SFP/SFP+, LEDs, façade, ventilation, numérotation, panneaux de brassage, baies 42U numérotées, routeurs, pare-feu, serveurs, onduleurs, bornes Wi-Fi, téléphones IP, caméras IP, prises RJ45, avec rotation, zoom, survol et clic par port
- Fiche port / prise : identifiant, état (up/down/désactivé), vitesse, VLAN, PoE (oui/non, puissance), MAC, appareil connecté
- Traçage du câblage : prise → panneau de brassage → port switch → uplink, avec le chemin en surbrillance
- Topologie logique (cœur / distribution / accès) générée à partir des données

### Onglet 2 : Inventaire
- Tableau filtrable et triable : type, marque, modèle, emplacement, n° de série, IP, firmware, date d'installation, statut
- Recherche globale : prise, port, IP, MAC, pièce
- Clic sur un équipement → ouverture de sa position dans la Cartographie
- Export CSV et JSON

### Onglet 3 : Matériel disponible (catalogue et stock)
- Catalogue réaliste (switchs, routeurs, pare-feu, bornes, panneaux, baies, onduleurs, câbles, SFP…)
- Fiche technique + aperçu 3D par modèle
- Stock : disponible, installé, seuil d'alerte
- Installation depuis le stock (bâtiment, pièce, baie, position U, ou glisser-déposer) → stock décrémenté, équipement visible dans l'inventaire
- Retrait : retour en stock ou « hors service »
- Ajout de nouveaux modèles via formulaire

### Onglet 4 : Tableau de bord
- Équipements par type et par bâtiment
- Occupation des ports et des baies, budget PoE consommé
- Alertes : stock bas, ports en erreur, baies pleines
- Historique des dernières actions

### Données
- Modèle JSON unique et documenté, séparé de l'affichage
- Import / export JSON, sauvegarde locale (localStorage)
- Jeu de démo V1 : 1 site, 2 bâtiments, plusieurs étages, 1 local technique par étage, plusieurs dizaines de prises, catalogue d'environ 20 modèles

### Qualité
- Design sombre et professionnel (style NetBox / Cisco DNA)
- Fluide avec beaucoup d'équipements (3D optimisée)
- Code couleur cohérent (statut, VLAN, PoE), légendes, infobulles
- Code commenté et structuré pour évoluer

### Évolutions prévues
- Modèles 3D fidèles à partir des marques, modèles et photos réels
- Plans réels des bâtiments
- Architecture qui permet d'ajouter facilement un modèle d'équipement ou un plan

### Sécurité
- V1 publique : données fictives uniquement
- Proposer des options pour protéger les vraies données plus tard

---

## 3. Journal des demandes

| Date | Demande | Statut |
|---|---|---|
| 2026-11-18 | Lecture du cahier des charges (`Promp.txt`) | ✅ Fait |
| 2026-11-18 | Présenter l'architecture et le modèle de données | ✅ Proposé (section 4), à valider |
| 2026-11-18 | Créer un fichier de suivi du projet dans le dépôt | ✅ Ce fichier |
| 2026-11-18 | Quel modèle d'IA est le plus adapté ? | ✅ Répondu dans la conversation |
| 2026-11-18 | Génération de `index.html` | ⏸️ En pause, à la demande de l'utilisateur |

---

## 4. Architecture proposée (à valider)

**Principe :** un seul fichier `index.html`, organisé en couches bien séparées.

1. **Données** : un objet JSON unique (`state`), sauvegardé dans le localStorage et importable/exportable
2. **Store** : point d'entrée unique pour toutes les modifications (`commit`), avec reconstruction des index, ajout à l'historique, annulation, sauvegarde et notification des onglets. C'est ce qui garde les 4 onglets synchronisés.
3. **Services métier** : installation et retrait, câblage, traçage du chemin, topologie, statistiques, alertes, recherche
4. **Registre de modèles** : chaque modèle du catalogue pointe vers un gabarit 3D (`switch`, `patchpanel`, `server`, `ap`…). Pour ajouter un modèle, on ajoute une entrée au catalogue, ou un gabarit si la forme est nouvelle. Champ prévu pour une photo de façade (texture réelle).
5. **Vues** : Cartographie (arbre, plan 2D en SVG, élévation de baie, 3D Three.js, topologie SVG, fiches), Inventaire, Matériel, Tableau de bord

**Bibliothèques :** Three.js uniquement (CDN avec version figée). Plan, topologie et graphiques en SVG/HTML natif, donc pas d'autre dépendance.

**Performance 3D :** instanciation (InstancedMesh) des ports et des LEDs, textures de façade générées une fois par modèle puis mises en cache, rendu suspendu quand l'onglet est masqué.

## 5. Modèle de données proposé (à valider)

```text
meta       { schemaVersion, updatedAt, demo }
vlans      [{ id, name, color, subnet }]
sites      [{ id, name, address }]
buildings  [{ id, siteId, code, name }]
floors     [{ id, buildingId, level, name, width, height, planImage }]   // dimensions en mètres ; planImage = plan réel (option)
rooms      [{ id, floorId, name, type, x, y, w, h }]                     // type : bureau, hall, local technique, salle serveurs…
racks      [{ id, roomId, catalogId, name, heightU, x, y, serial, status }]
devices    [{ id, catalogId, hostname, rackId, u, roomId, x, y, serial, ip, mac, firmware, installDate, status }]
ports      [{ id, deviceId, name, kind, role, speed, status, vlan, poe:{capable, watts}, mac, connected }]
outlets    [{ id, roomId, label, x, y, usage }]                          // prises murales
cables     [{ id, a, b, type, length, color, label }]                    // a/b = id de port ou de prise
catalog    [{ id, category, brand, model, template, mount, heightU, ports:[groupes], poeBudgetW, powerW, specs, visual }]
stock      [{ catalogId, available, threshold, location }]               // « installé » est calculé depuis devices
history    [{ ts, type, text, ref }]
```

**Traçage :** on parcourt le graphe `cables` en traversant les éléments passifs (prise, panneau de brassage, tiroir optique) jusqu'au port actif du switch, puis on remonte par ses ports `uplink`.

**Topologie :** les liens sont déduits des câbles entre équipements actifs. Le niveau (cœur, distribution, accès) est calculé à partir du graphe.

---

## 6. Plan de réalisation par lots (proposé)

| Lot | Contenu | Statut |
|---|---|---|
| 1 | Socle : structure de l'application, modèle de données, store, jeu de démo, sauvegarde, import/export | ⏳ À faire |
| 2 | Cartographie 2D : arbre hiérarchique, fil d'Ariane, plan d'étage, fiches port et prise | ⏳ À faire |
| 3 | Vue 3D : baies, équipements, ports cliquables, LEDs, cordons | ⏳ À faire |
| 4 | Traçage du câblage et topologie logique | ⏳ À faire |
| 5 | Inventaire : tableau, filtres, recherche globale, exports | ⏳ À faire |
| 6 | Matériel : catalogue, stock, installation et retrait, glisser-déposer, formulaire de modèle | ⏳ À faire |
| 7 | Tableau de bord : indicateurs, alertes, historique | ⏳ À faire |
| 8 | Finitions : performances, tests navigateur, documentation (README), mise en ligne GitHub Pages | ⏳ À faire |

---

## 7. Sécurité : options pour les vraies données (à décider plus tard)

1. **Dépôt privé + GitHub Pages privé** (GitHub Enterprise Cloud) : accès limité aux membres de l'organisation
2. **Hébergement interne** (serveur web de l'intranet, accessible uniquement depuis le LAN ou le VPN) : c'est l'option la plus simple et la plus sûre
3. **Authentification devant la page** : reverse proxy (Nginx + SSO/LDAP, Authelia, Authentik) ou Cloudflare Access / Zero Trust
4. **Données séparées du code** : le fichier JSON réel n'est jamais commité ; il est chargé localement (import) ou servi par une API interne authentifiée
5. **Évolution backend** : NetBox comme source de vérité, ou une petite API (base de données, contrôle d'accès par rôle, journal d'audit)

⚠️ À noter : une protection par mot de passe en JavaScript dans une page publique n'est **pas** une protection réelle.

---

## 8. Questions ouvertes

- Valider l'architecture et le modèle de données ci-dessus
- Valider le découpage en lots, ou préférer une génération en une fois
- Marques et modèles réels à prévoir dès la V1 (sinon catalogue générique réaliste)
- Format des futurs plans de bâtiment (PDF, image, DWG/DXF ?)
