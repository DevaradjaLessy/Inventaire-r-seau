# Consignes pour Claude — projet NetCarto

Ce dépôt sert à construire **NetCarto** : un outil web de cartographie, d'inventaire et de gestion du matériel réseau physique. Il tient dans un seul fichier `index.html`, publié sur GitHub Pages.

## À faire au début de chaque session

1. Lis **`SUIVI.md`** en entier. C'est la référence du projet : cahier des charges complet, décisions de conception, plan par lots, journal.
2. Suis les « Instructions pour une nouvelle session Claude » (section 1 de `SUIVI.md`) : prends le prochain lot à faire, réalise-le, teste-le, puis mets `SUIVI.md` à jour.
3. Si l'utilisateur fait une nouvelle demande, ajoute-la au journal des demandes de `SUIVI.md`.

## Règles permanentes

- Données **uniquement fictives** : la page est publique.
- Un seul fichier `index.html`, sans backend. Three.js `0.160.0` par CDN (jsDelivr), aucune autre bibliothèque sans décision notée dans `SUIVI.md`.
- Interface et commentaires du code en français. Thème sombre de type DCIM.
- Tester dans Chromium (Playwright) avant chaque commit. Si le CDN est bloqué, voir la note technique 3.9 de `SUIVI.md`.
