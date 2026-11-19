# NetCarto — rapport d'usage et d'audit

*Rédigé le 19 novembre 2026, du point de vue d'un administrateur systèmes, réseau et sécurité qui reçoit l'outil et doit s'en servir, y compris en urgence.*

## Résumé

NetCarto répond bien à la question « où est quoi, et relié à quoi ». Retrouver une prise, un port ou une adresse et suivre le câble jusqu'au cœur prend trois actions. Le serveur est sain : comptes, rôles, journal d'audit, HTTPS, sauvegardes.

L'outil était en revanche faible sur la question que l'on se pose en urgence : **« ce switch est mort, qui est touché, et comment je le remplace ? »** Il fallait ouvrir les ports un par un pour mesurer l'impact, et un remplacement obligeait à recâbler chaque port à la main. La vue 3D, belle, devenait illisible dès qu'on cherchait un port précis : les cordons le cachaient.

Sept améliorations ont été faites à la suite de cet audit. Elles sont listées en section 4, avec ce qui reste.

## 1. Méthode

La simulation a été faite sur un vrai serveur NetCarto (mode serveur, compte administrateur), avec le jeu de démonstration : 2 bâtiments, 5 étages, 6 baies, 102 équipements, 121 prises. Chaque scénario a été déroulé dans l'interface, comme le ferait un technicien, en comptant les actions et en notant ce qui manque. Les écrans ont été relus en capture, sur écran large et à 390 px.

Deux limites : la simulation est faite dans un navigateur automatisé, pas par plusieurs personnes pendant plusieurs semaines ; et les connecteurs PRTG et SNMP n'ont été vus que contre des simulateurs. Les durées « ressenties » ne sont donc pas mesurées, seules les actions le sont.

## 2. Scénarios déroulés

| # | Situation | Avant l'audit | Après les améliorations |
|---|---|---|---|
| 1 | Un utilisateur signale une prise morte | 3 actions : recherche, Entrée, lecture de la chaîne (panneau, port, VLAN, état). **Bon.** | Inchangé |
| 2 | Un switch d'accès tombe : qui prévenir ? | Aucune vue d'ensemble : ouvrir les 31 ports câblés un par un | Aucune action : la fiche affiche « 28 prises · 12 terminaux · 5 pièces » ; le détail par pièce s'exporte en CSV. Pour le switch de cœur : 112 prises, 52 terminaux, 9 équipements réseau isolés |
| 3 | Remplacer ce switch par un neuf | Retirer (tous les câbles sont supprimés), installer, puis recâbler 31 ports : environ 125 actions, avec risque d'erreur à chacune | 3 actions : « Remplacer », choix du modèle, valider. Nom, adresse, VLAN, états et câbles sont repris |
| 4 | Le pare-feu signale une adresse MAC inconnue | Trouvée seulement si elle est tapée au format `aa:bb:cc:dd:ee:ff` | Trouvée dans tous les formats (`AABB.CCDD.EEFF`, `aa-bb-…`) |
| 5 | Couper le port de ce poste, en gardant une trace | Changer l'état dans une liste ; aucun motif enregistré | Bouton « Désactiver » avec motif, noté dans la description du port et l'historique |
| 6 | Trouver un port précis dans la baie, en 3D | Port caché par les cordons, cadre peu visible, aucun nom affiché | Les autres cordons s'effacent, une étiquette suit le port (nom, état, VLAN, appareil au bout) |
| 7 | Voir d'un coup d'œil ce qui ne va pas dans une baie | Chercher la LED orange parmi les cordons | Ports en erreur encadrés en rouge à travers les cordons, et listés au-dessus de la vue |
| 8 | Erreur de manipulation | Annulation, historique, sauvegardes. **Bon.** | Inchangé |
| 9 | Installer du matériel depuis le local technique, au téléphone | Possible depuis le lot 13. **Correct**, mais non essayé sur un vrai appareil | Inchangé |
| 10 | Revue de sécurité mensuelle | Journal d'audit consultable mais non exportable ; aucun indicateur | Carte « Sécurité du serveur » et export CSV du journal |
| 11 | Quels équipements ne sont pas à jour ? | Tri de l'Inventaire par firmware, à lire ligne par ligne | Carte « Firmware par modèle » : les modèles à plusieurs versions sont signalés |

## 3. Constats par fonction

### Cartographie et plan

- **Points forts.** L'arbre, le fil d'Ariane et le plan se répondent. La chaîne de liaison d'une prise (panneau, port, VLAN, terminal) est exactement ce qu'il faut au téléphone avec un utilisateur.
- **Faiblesses.** À l'échelle d'un étage, une prise fait trois pixels sur téléphone. La légende couvrait le bas du plan (corrigé au lot 13). Le plan ne montre pas les chemins de câbles réels.

### Vue 3D

- **Points forts.** Reconnaître une baie comme on la voit sur place aide vraiment à ne pas se tromper de châssis. Les modes État, VLAN et PoE sont utiles.
- **Faiblesses constatées.** Dès qu'une baie est brassée, les cordons masquent les ports : le port sélectionné et le port en erreur ne se voyaient pas. Aucune étiquette ne disait quel port on regardait. Pas de vue de face pour lire les numéros. Passer d'un port au suivant demandait de viser un rectangle de quelques pixels.
- **Corrigé.** Voir section 4, point 3.
- **Reste.** La face arrière n'est pas modélisée (alimentations, liens permanents). Sur une machine sans carte graphique, la première ouverture prend une à deux secondes.

### Câblage et traçage

- **Points forts.** Le tracé traverse panneaux et prises et s'affiche partout (plan, 3D, topologie). Les règles du serveur empêchent deux câbles sur un port.
- **Faiblesses.** Pas d'étiquettes de câbles à imprimer. Le plan de brassage s'imprime par baie, pas par switch seul.

### Inventaire et stock

- **Points forts.** Compteurs, filtres, import et export CSV, doublons refusés.
- **Faiblesses.** Pas de date de fin de garantie ni de fin de support. Pas de plan d'adressage (prochaine adresse libre d'un VLAN).

### Interventions d'urgence

- **Avant l'audit, c'était le point le plus faible** : ni analyse d'impact, ni remplacement d'un équipement. Les deux existent maintenant.
- **Reste.** NetCarto note qu'un port est désactivé mais ne le coupe pas sur le switch : c'est voulu (les connecteurs sont en lecture seule), mais il faut le savoir. Pas de lien avec un outil de tickets.

### Sécurité (regard cyber)

| Sujet | État |
|---|---|
| Authentification | Mots de passe de 12 caractères au moins, empreinte scrypt, verrouillage après 5 échecs. Pas de double authentification |
| Autorisations | Trois rôles, contrôlés par le serveur à chaque requête |
| Traçabilité | Journal d'audit non modifiable, avec valeur avant et après ; exportable depuis cet audit |
| Transport | HTTPS par défaut, certificat auto-signé ou fourni |
| Navigateur | Politique de sécurité du contenu stricte ; aucune requête vers Internet |
| Hébergement | Compte sans privilège, service cloisonné, conteneur en lecture seule |
| Sauvegardes | Quotidiennes, vérifiées, restaurables. **Non chiffrées**, et sur la même machine par défaut |
| Surveillance | Avant l'audit : rien. Maintenant : échecs de connexion, comptes verrouillés ou dormants, âge de la sauvegarde, validité du certificat |

Points à traiter par l'exploitant, hors du logiciel : envoyer les sauvegardes sur une autre machine, prévoir un second compte administrateur, remplacer le certificat auto-signé par celui de l'autorité interne.

### Exploitation

- **Points forts.** Installation en une commande, mise à jour avec retour arrière automatique, commande de contrôle de santé.
- **Faiblesses.** Pas d'alerte envoyée (courriel, webhook) quand une sauvegarde échoue ou qu'un compte est verrouillé : il faut ouvrir le tableau de bord.

## 4. Améliorations faites à la suite de l'audit

1. **Impact d'une panne.** La fiche d'un équipement réseau affiche ce qui en dépend : prises, terminaux, pièces, et les équipements réseau qu'il isole du cœur (leurs prises sont comptées aussi). Le détail, classé par pièce, s'exporte en CSV pour prévenir les personnes concernées.
2. **Remplacement d'un équipement.** « Remplacer » échange un équipement contre un modèle du stock. Le nouveau reprend le nom, l'adresse IP, l'emplacement, la configuration de chaque port et tous les câbles. Si le nouveau modèle a moins de ports, les câbles sans équivalent sont annoncés avant de valider. L'ancien passe hors service ou retourne en stock. Une seule opération, annulable.
3. **Vue 3D utilisable en intervention.**
   - Quand un port ou un équipement est choisi, les autres cordons s'effacent ; le bouton « Isoler » rétablit l'ensemble.
   - Une étiquette suit le port choisi : nom, état, VLAN, appareil au bout.
   - Les ports en erreur sont encadrés en rouge, visibles à travers les cordons, et listés au-dessus de la vue : un clic y mène.
   - Bouton « Vue de face », bien droite, pour lire les numéros.
   - Flèches gauche et droite du clavier : port précédent, port suivant.
4. **Couper un port avec un motif.** Bouton « Désactiver » sur la fiche du port, motif noté dans la description et l'historique ; bouton « Réactiver ».
5. **Recherche par adresse MAC dans tous les formats.**
6. **Sécurité du serveur.** Carte du tableau de bord pour l'administrateur ; export CSV du journal d'audit.
7. **Firmware par modèle.** Carte du tableau de bord ; un clic ouvre l'Inventaire sur le modèle.

## 5. Ce qui reste, par ordre de priorité

| Priorité | Sujet | Pourquoi |
|---|---|---|
| Haute | Essais en conditions réelles : vrai téléphone, vrai PRTG ou vrais switchs, Ubuntu | Aucune simulation ne les remplace |
| Haute | Sauvegardes envoyées hors de la machine, et chiffrées | Une panne de disque ou un vol emporte aujourd'hui la base et ses copies |
| Moyenne | Alertes envoyées (courriel ou webhook) : sauvegarde en échec, compte verrouillé, équipement en panne | Personne ne regarde un tableau de bord la nuit |
| Moyenne | Double authentification pour les administrateurs | Le compte administrateur ouvre tout |
| Moyenne | Plan d'adressage : adresses par VLAN, prochaine adresse libre | Demande quotidienne d'un administrateur réseau |
| Moyenne | Dates de garantie et de fin de support | Nécessaire au renouvellement du parc |
| Basse | Étiquettes de câbles et de prises à imprimer | Gain de temps à la pose |
| Basse | Face arrière des baies en 3D, alimentation électrique (quel équipement sur quel onduleur) | Utile pour les coupures de courant |

## 6. Comment vérifier

Chaque amélioration a son scénario dans `tests/netcarto.test.js` (bloc « Interventions d'urgence ») et, pour l'état de sécurité, dans `serveur/tests/exploitation.test.js`.
