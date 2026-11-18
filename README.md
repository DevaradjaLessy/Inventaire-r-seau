# NetCarto

Outil web de cartographie, d'inventaire et de gestion du matériel réseau physique : câblage, équipements, prises, stock.
Tout tient dans un seul fichier, `index.html`, sans serveur. **Les données fournies sont fictives.**

## Ouvrir l'application

- **En local :** ouvrez `index.html` dans un navigateur récent (Chrome, Edge, Firefox). Une connexion Internet est nécessaire pour la vue 3D, car Three.js est chargé depuis le CDN jsDelivr. Sans connexion, tout le reste fonctionne.
- **Sur GitHub Pages :** dans le dépôt, allez dans *Settings → Pages*, choisissez *Deploy from a branch*, puis la branche qui contient `index.html` et le dossier `/ (root)`. La page est publiée à l'adresse `https://<utilisateur>.github.io/<dépôt>/`.

## Les quatre onglets

| Onglet | Rôle |
|---|---|
| **Cartographie** | Arbre Site → Bâtiment → Étage → Pièce → Baie → Équipement → Port. Plan 2D, baie en 3D, topologie logique, traçage du câblage. |
| **Inventaire** | Tableau filtrable et triable de tous les équipements. Recherche, export CSV et JSON. |
| **Matériel disponible** | Catalogue, fiche technique, aperçu 3D, stock. Installation et retrait. |
| **Tableau de bord** | Indicateurs, occupation des ports et des baies, PoE, alertes, historique. |

Les onglets partagent la même base : une modification faite dans l'un apparaît tout de suite dans les autres.

Raccourcis : `/` pour la recherche, `Ctrl+Z` pour annuler, `Échap` pour fermer une fenêtre.

## Données

- La base est un objet JSON unique, sauvegardé dans le navigateur (`localStorage`, clé `netcarto:db:v1`).
- **Exporter / Importer** (boutons en haut à droite) : fichier JSON complet de la base.
- **Réinitialiser la démo** : recharge le jeu de données fictif.

### Modèle de données

```text
meta       { app, schemaVersion, updatedAt, demo, seq }
vlans      [{ id, name, color, subnet }]
sites      [{ id, name, code, address }]
buildings  [{ id, siteId, code, name }]
floors     [{ id, buildingId, level, name, width, height, planImage }]      dimensions en mètres
rooms      [{ id, floorId, name, type, x, y, w, h }]
racks      [{ id, roomId, catalogId, name, heightU, x, y, serial, installDate, status }]
devices    [{ id, catalogId, hostname, rackId, u, roomId, x, y, serial, ip, mac, firmware, installDate, status, layer?, notes }]
ports      [{ id, deviceId, idx, name, kind, role, speed, status, vlan, poe:{ capable, watts }, mac, connected, description }]
outlets    [{ id, roomId, label, x, y, usage }]
cables     [{ id, a, b, type, length, color, label }]                       a et b : id d'un port ou d'une prise
catalog    [{ id, category, brand, model, ref, template, mount, heightU, layer, ports:[…], poeBudgetW, poeDrawW, powerW, firmware, specs, visual, description }]
stock      [{ catalogId, available, threshold, location }]
history    [{ id, ts, type, text, ref }]
```

- Un équipement en baie porte `rackId` et `u` (U la plus basse occupée). Un équipement hors baie porte `roomId`, `x` et `y`.
- Un port de panneau de brassage ou de tiroir optique a le rôle `pp` (passif). Il accepte deux câbles : le lien permanent à l'arrière, le cordon à l'avant.
- La quantité installée d'un modèle n'est pas stockée : elle est calculée à partir des équipements.

## Ajouter un modèle d'équipement

**Depuis l'interface :** onglet *Matériel disponible* → *Nouveau modèle*. Choisissez la catégorie, le gabarit 3D, les groupes de ports, la couleur de façade, le stock de départ.

**Avec une photo réelle :** dans le même formulaire, renseignez *Photo de façade* (URL ou data URI). La photo remplace la façade générée dans la vue 3D.

**Dans le code :** ajoutez une entrée dans `defaultCatalog()` (section 4 de `index.html`). Exemple :

```js
C('cat-mon-switch', 'switch', 'Marque', 'Modèle 24P', 'REF-24P', 'switch', 'rack', 1, {
  ports: [g('rj45', 24, 1000, { poe: true, prefix: 'Gi1/0/' }), g('sfp+', 4, 10000, { role: 'uplink', prefix: 'Te1/1/' })],
  poe: 370, power: 80, color: '#26333b', accent: '#049fd9',
}),
```

**Nouvelle forme 3D :** ajoutez un gabarit dans `GABARITS` (section 8). Un gabarit de type `facade` décrit un équipement 19" dessiné sur un canvas. Un gabarit de type `object` renvoie vers une fonction de `OBJECTS` qui construit la géométrie.

## Ajouter un plan réel

1. Dans la Cartographie, sélectionnez l'étage.
2. Dans la fiche de droite, cliquez sur *Importer un plan* et choisissez une image (PNG, JPG ou SVG).
3. L'image s'affiche en fond du plan, étirée sur les dimensions de l'étage (`width` × `height`, en mètres). Activez le mode *Édition* pour replacer les prises, bornes et baies à la souris.

Préférez une image de moins de 2 Mo : elle est enregistrée dans la base locale.

## Sécurité

Cette page est publique. **Ne mettez pas de vraies données dans ce dépôt.** Un mot de passe en JavaScript dans une page publique ne protège rien.

Pour travailler avec les vraies données, plusieurs options :

1. **Hébergement interne** : copier `index.html` sur un serveur web de l'intranet, accessible seulement depuis le LAN ou le VPN. C'est le plus simple et le plus sûr.
2. **Dépôt privé et GitHub Pages privé** (GitHub Enterprise Cloud) : accès réservé aux membres de l'organisation.
3. **Authentification devant la page** : reverse proxy avec SSO ou LDAP (Nginx, Authelia, Authentik), ou Cloudflare Access.
4. **Données séparées du code** : garder la page publique avec la démo, et importer le JSON réel localement. Il reste dans le navigateur et n'est jamais commité.
5. **Évolution avec backend** : NetBox comme source de vérité, ou une petite API avec base de données, rôles et journal d'audit.

## Développement

- Un seul fichier, découpé en sections commentées (`=== SECTION n`). Aucune étape de build.
- Seule bibliothèque externe : Three.js `0.160.0`.
- Le suivi du projet (cahier des charges, décisions, plan par lots, journal) est dans `SUIVI.md`.
