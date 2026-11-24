# Consignes pour Claude — projet NetCarto

Ce dépôt contient **NetCarto** : un outil web de cartographie, d'inventaire et de gestion du matériel réseau physique. NetCarto est un logiciel serveur (dossier `serveur/` : serveur Node.js, API, base SQLite) dont l'interface (`index.html`, `css/`, `js/`) fonctionne aussi seule, en démonstration hors ligne.

Ce dépôt est **public** et ne contient que la solution. La branche de référence est `main`.

## Où est le suivi du projet

Le suivi n'est pas dans ce dépôt. Il est dans le dépôt **privé** `DevaradjaLessy/suivie_projet_general`, dossier `NetCarto` :

- `01 - Suivi/SUIVI.md` : la référence du projet (cahier des charges, décisions de conception, plan par lots, rappels, journal des demandes) ;
- `01 - Suivi/Journal des mises à jour.md` : chaque mise à jour, tirée de l'historique de ce dépôt ;
- `02 - Audits/` : l'audit d'usage ;
- `03 - Bible de connaissance/Bible NetCarto.html` : le guide complet de la solution.

Les sections de `SUIVI.md` citées plus bas (3.1, 3.14, 3.28…) sont celles de ce fichier.

## À faire au début de chaque session

1. Rattache le dépôt de suivi à la session, puis lis `NetCarto/01 - Suivi/SUIVI.md` en entier.
2. Suis les « Instructions pour une nouvelle session Claude » (section 1 de `SUIVI.md`) : prends le prochain lot à faire, réalise-le, teste-le, puis mets `SUIVI.md` à jour.
3. Si l'utilisateur fait une nouvelle demande, ajoute-la au journal des demandes de `SUIVI.md`.
4. Quand une fonction change, mets à jour la partie concernée de la bible de connaissance.

## Règles permanentes

- Données **uniquement fictives** dans ce dépôt : il est public. Aucun mot de passe ni secret, seulement des fichiers d'exemple.
- **Rien du dépôt de suivi ne vient dans ce dépôt** : ni plan, ni photo, ni relevé, ni nom ou adresse d'équipement réel. Le dépôt de suivi contient des informations sensibles.
- Suivre l'ordre des lots de la section 4 de `SUIVI.md` et les décisions de la section 3.14. Écrire les tests avant le code.
- Interface : modules JavaScript natifs (section 3.1 de `SUIVI.md`), sans outil de build. Un fichier = un rôle ; les imports et exports sont explicites. Elle doit continuer de fonctionner sans serveur (mode démonstration).
- Serveur : tout accès à la base passe par `serveur/donnees/` ; pas de SQL ailleurs. Le code reste portable (Linux, Windows, macOS) : aucun chemin ni commande propre à un système, les dossiers viennent de la configuration. Toute opération en plusieurs étapes est une transaction.
- Tout ce qui est propre à Linux vit dans `installation/` (image Docker, scripts Debian et Ubuntu, service systemd), jamais dans `serveur/` ni dans `js/`. Une suppression de dossier dans un script passe par `supprimer_dossier` (`installation/linux/commun.sh`). Après une modification de `installation/`, lancer `node --test --test-concurrency=1 "installation/tests/*.test.js"` sur une machine où Docker est disponible. Les essais contre de vrais logiciels (`snmp-reel`, `zabbix-reel`, `smtp-reel`) sont ignorés sans serveur d'essai ; chacun dit en tête les variables à donner.
- Three.js `0.160.0`, copie locale dans `js/vendor/three/` (ne pas modifier ces fichiers) ; aucune autre bibliothèque sans décision notée dans `SUIVI.md`. La page ne doit appeler aucune adresse extérieure : le serveur pose une politique de sécurité du contenu qui l'interdit.
- Le dossier `connecteurs/` contient le module de supervision (PRTG, SNMP, Zabbix, JSON, simulation), utilisé par le serveur. Il reste en lecture seule et se teste contre des simulateurs.
- Interface et commentaires du code en français. Palette « Ardoise et vert », en deux thèmes au choix de l'utilisateur : sombre (par défaut) et clair. Toute couleur d'interface passe par une variable CSS de `css/style.css`, jamais par une valeur en dur.
- L'interface doit rester utilisable sur téléphone (règles regroupées à la fin de `css/style.css`, seuil 900 px). Vérifier aussi en largeur 390 px.
- Lancer les trois suites avant chaque commit : `npm test` dans `tests/` (interface, Chromium via Playwright), dans `serveur/` et dans `connecteurs/`. Ne pas lancer deux suites de navigateur en même temps : elles se font échouer l'une l'autre par manque de processeur. Ajouter un scénario pour chaque nouvelle fonction. Voir la note technique 3.9 de `SUIVI.md`.
- Tout fichier importé est contrôlé par `Store.validate` : une nouvelle donnée insérée dans la page doit y avoir sa règle.
- Sécurité (`SECURITE.md`, section 3.28 de `SUIVI.md`) : tout texte venu de la base passe par `esc()` avant d'entrer dans la page ; une valeur insérée dans un style ou une image a une forme imposée, dans `Store.validate` et dans `serveur/donnees/schema.js` ; un export CSV passe par `csvCell` ; une route sans session passe par la limite par adresse. Le scénario « aucun texte saisi n'est interprété comme du code » doit rester vert.
