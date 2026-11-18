# Consignes pour Claude — projet NetCarto

Ce dépôt sert à construire **NetCarto** : un outil web de cartographie, d'inventaire et de gestion du matériel réseau physique. L'application est répartie en plusieurs fichiers (`index.html`, `css/`, `js/`), sans backend ni outil de build, et publiée sur GitHub Pages.

## À faire au début de chaque session

1. Lis **`SUIVI.md`** en entier. C'est la référence du projet : cahier des charges complet, décisions de conception, plan par lots, journal.
2. Suis les « Instructions pour une nouvelle session Claude » (section 1 de `SUIVI.md`) : prends le prochain lot à faire, réalise-le, teste-le, puis mets `SUIVI.md` à jour.
3. Si l'utilisateur fait une nouvelle demande, ajoute-la au journal des demandes de `SUIVI.md`.

## Règles permanentes

- Données **uniquement fictives** : la page est publique.
- Code réparti en modules JavaScript natifs (voir la section 3.1 de `SUIVI.md`), sans backend ni outil de build. Un fichier = un rôle ; les imports et exports sont explicites.
- Three.js `0.160.0` par CDN (jsDelivr), aucune autre bibliothèque sans décision notée dans `SUIVI.md`.
- Le dossier `connecteurs/` est un service Node.js facultatif (relais de supervision, voir la section 3.12 de `SUIVI.md`). Il reste en lecture seule, ne contient aucun secret, et se teste avec `npm test` contre des simulateurs. L'application doit continuer de fonctionner sans lui.
- Interface et commentaires du code en français. Palette « Ardoise et vert », en deux thèmes au choix de l'utilisateur : sombre (par défaut) et clair. Toute couleur d'interface passe par une variable CSS de `css/style.css`, jamais par une valeur en dur.
- L'interface doit rester utilisable sur téléphone (règles regroupées à la fin de `css/style.css`, seuil 900 px). Vérifier aussi en largeur 390 px.
- Tester dans Chromium (Playwright) avant chaque commit, en servant le dossier par HTTP (les modules ne se chargent pas en `file://`). Si le CDN est bloqué, voir la note technique 3.9 de `SUIVI.md`.
