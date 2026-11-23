# NetCarto — rapport d'analyse

*Point de vue : un administrateur systèmes, réseau et sécurité qui reçoit NetCarto et doit s'en servir pour de bon.*
*Version analysée : celle du 20 novembre 2026, après les améliorations du premier audit.*

## 1. Verdict

**NetCarto est utilisable en production pour un site de taille moyenne, à trois conditions** : l'essayer d'abord sur votre vrai matériel (téléphone, PRTG ou switchs), sortir les sauvegardes de la machine, et remplacer le certificat auto-signé.

| Question que je me pose | Réponse |
|---|---|
| Est-ce que je retrouve vite une prise, un port, une adresse ? | Oui, en trois actions |
| Est-ce que l'outil m'aide quand un switch tombe ? | Oui depuis le premier audit : impact chiffré, remplacement en trois actions |
| Est-ce que je peux lui confier mes vraies données ? | Oui côté logiciel (comptes, audit, HTTPS, cloisonnement). Non tant que les sauvegardes restent sur la même machine |
| Est-ce que mon équipe peut s'en servir sans formation ? | Presque : le premier jour demande une explication (stock à zéro), et un compte en lecture seule voit des boutons qu'il ne peut pas utiliser |
| Est-ce que je peux m'en servir au téléphone dans le local technique ? | Oui pour consulter et installer. La vue 3D y est dégagée depuis le 22 novembre ; à confirmer sur un vrai téléphone |

Douze constats sont détaillés en section 4. Aucun n'est une faille de sécurité ; trois gênaient vraiment l'usage. Les cinq premiers sont corrigés, et un audit par profils (section 7) a ajouté le plan d'adressage, l'âge du parc et une synthèse imprimable.

## 2. Comment l'analyse a été faite

J'ai déroulé le parcours d'un administrateur sur un vrai serveur NetCarto, dans un navigateur piloté, en relevant ce que l'écran affiche et ce que le serveur enregistre.

- **Premier jour** : serveur neuf, création du compte administrateur, base vide.
- **Usage courant et urgence** : jeu de démonstration (2 bâtiments, 5 étages, 6 baies, 102 équipements, 121 prises), avec trois comptes : administrateur, technicien, lecture seule.
- **Téléphone** : écran de 390 px de large, avec contacts tactiles.
- **Installation** : image Docker et Debian 12 avec systemd, déroulées pour de bon lors des lots 19 et 20.

**Ce que cette analyse ne couvre pas.** Elle est faite par un automate, pas par une équipe pendant plusieurs semaines. Les connecteurs PRTG et SNMP n'ont tourné que contre des simulateurs. Aucun essai sur un vrai téléphone, ni sur Ubuntu. Les durées ressenties ne sont pas mesurées ; seules les actions et les résultats le sont.

## 3. Le parcours, étape par étape

### 3.1 Réception et installation

`docker compose up -d`, ou `sudo installation/linux/installer.sh` sur Debian. Dans les deux cas : données dans `/var/lib/netcarto`, réglages dans `/etc/netcarto/netcarto.toml`, service sous un compte sans privilège, HTTPS actif.

- **Ce qui marche bien.** Une commande. La mise à jour remet l'ancienne version en service si la nouvelle ne démarre pas (vérifié avec une version volontairement cassée). La désinstallation refuse de supprimer un dossier qui n'est pas le sien.
- **Ce qui manque.** Le script d'installation en ligne n'a été déroulé qu'en mode hors ligne. Ubuntu n'a pas été essayé.

### 3.2 Premier jour

À la première ouverture, la page demande le code affiché au démarrage du serveur, puis crée le compte administrateur. Aucun mot de passe par défaut n'existe. La base arrive vide de tout site, avec 34 modèles au catalogue et 8 VLAN usuels. L'écran propose « Créer un site » ou « Charger la démonstration ».

- **Ce qui marche bien.** L'écran d'accueil dit quoi faire. L'import CSV permet de charger un parc existant, ligne par ligne, avec les refus expliqués.
- **Ce qui accroche.** Tous les stocks sont à zéro. Pour poser un premier switch à la main, il faut d'abord faire une « entrée en stock » dans l'onglet Matériel : rien ne le dit au moment où l'on en a besoin (constat 2).

### 3.3 Usage courant

Recherche globale (touche `/`), arbre, plan, fiche. Une prise affiche sa chaîne complète : panneau, port du switch, VLAN, état, terminal. Le tracé suit le câble jusqu'au cœur.

- **Ce qui marche bien.** Trois actions pour répondre à un utilisateur au téléphone. Les doublons d'adresse IP, de nom et de MAC sont refusés à la saisie. Tout s'annule.
- **Ce qui manque.** Pas de plan d'adressage (prochaine adresse libre d'un VLAN). Pas de date de garantie.

### 3.4 Intervention d'urgence

| Situation | Ce que fait l'outil | Relevé |
|---|---|---|
| Un switch d'accès tombe | La fiche affiche ce qui en dépend | « 28 prises · 12 terminaux · 5 pièces » pour SW-A1-ACC-01 |
| Le switch de distribution tombe | Compte aussi ce que desservent les équipements qu'il isole | « 34 prises · 17 terminaux · 13 pièces · 4 équipements réseau isolés » |
| Remplacer un switch | Nom, adresse, VLAN et câbles repris | 6 câbles repris, 1 seule transaction sur le serveur, aucune erreur |
| Adresse MAC suspecte | Trouvée dans tous les formats | `02AA.BBCC.DD77` mène au port |
| Couper un port | Bouton « Désactiver » avec motif | Motif noté dans l'historique |
| Port en erreur dans une baie | Encadré en rouge en 3D, listé au-dessus de la vue | 1 clic pour y aller |

- **Ce qui marche bien.** C'était le point faible ; c'est devenu un point fort.
- **Ce qui reste.** NetCarto note qu'un port est désactivé, il ne le coupe pas sur le switch. Un remplacement écrit 43 lignes dans le journal d'audit (constat 5). Rien ne prévient par courriel ou par message quand quelque chose tombe.

### 3.5 Contrôle de sécurité

La carte « Sécurité du serveur » a affiché, sur le serveur d'essai : 0 échec de connexion en 24 h, dernière sauvegarde il y a moins d'une heure, « HTTPS désactivé : les mots de passe circulent en clair », 1 seul administrateur (« prévoyez un second administrateur de secours »), 2 comptes jamais connectés. Tout cela était exact.

- **Ce qui marche bien.** Les bons signaux, sans aucun secret dans la réponse. Un compte non administrateur reçoit un refus (403) sur cette route.
- **Ce qui accroche.** La carte est tout en bas du tableau de bord, et ses alertes ne figurent pas dans la liste « Alertes » ni dans la pastille rouge de l'onglet (constat 4).

### 3.6 Au téléphone

Les fenêtres ajoutées récemment (impact, remplacement, cartes du tableau de bord) tiennent dans 390 px sans débordement. Le plan se zoome à deux doigts. On installe un équipement en touchant le modèle puis l'emplacement.

- **Ce qui accroche.** Dans la vue 3D, la barre d'outils occupe 149 px sur 435, soit un tiers de la vue ; la baie n'apparaît qu'en bas, en petit. Le bouton « Stock » y figure deux fois (constat 3).

## 4. Constats

Classés par gêne pour l'usage. Aucun n'expose de données.

| # | Constat | Gravité | Preuve |
|---|---|---|---|
| 1 | *(corrigé le 20 novembre : ces boutons ne sont plus proposés)* **Un compte en lecture seule voit tous les boutons d'action** (Modifier, Déplacer, Remplacer, Retirer), non grisés. « Remplacer » ouvre même la fenêtre ; le refus n'arrive qu'à la validation. | Gênant | Relevé sur le compte `lecteur` |
| 2 | *(corrigé le 22 novembre : la palette et la U libre proposent l'entrée en stock)* **Premier jour : stock à zéro, sans explication.** Installer un premier équipement à la main demande une entrée en stock préalable, que rien ne suggère. | Gênant | Stock initial relevé : 0 pour tous les modèles |
| 3 | *(corrigé le 22 novembre : barre repliée, bouton en double retiré)* **Vue 3D peu exploitable sur téléphone.** La barre d'outils prend un tiers de la hauteur ; le bouton « Stock » est en double. | Gênant | 149 px sur 435 |
| 4 | *(corrigé le 22 novembre : elles figurent dans la liste et la pastille)* **Les alertes de sécurité sont hors de vue.** Carte en bas du tableau de bord, absente de la liste des alertes et de la pastille de l'onglet. | Moyen | « HTTPS désactivé » non compté parmi les 10 alertes |
| 5 | *(corrigé le 22 novembre : une ligne par opération, détail dépliable)* **Journal d'audit bavard.** Un remplacement y écrit 43 lignes (28 créations de ports, 6 câbles, 6 ports…), sans ligne de synthèse. Relire une journée d'interventions devient pénible. | Moyen | 43 lignes pour une transaction |
| 6 | **Sauvegardes sur la même machine, non chiffrées.** | Moyen (exploitation) | Par conception, voir `SUIVI.md` 3.18 |
| 7 | **Aucune alerte envoyée.** Sauvegarde en échec, compte verrouillé, équipement en panne : il faut ouvrir la page pour le savoir. | Moyen | Fonction absente |
| 8 | **Pas de double authentification** pour les administrateurs. | Moyen | Fonction absente |
| 9 | **Connecteurs non éprouvés sur du vrai matériel.** | Moyen | Testés contre des simulateurs seulement |
| 10 | *(plan d'adressage ajouté le 22 novembre ; la garantie reste à faire)* **Pas de plan d'adressage** ni de dates de garantie. | Faible | Fonctions absentes |
| 11 | **Face arrière des baies et alimentation électrique non modélisées.** On ne sait pas quel équipement dépend de quel onduleur. | Faible | Fonction absente |
| 12 | **Pas d'étiquettes à imprimer** pour les câbles et les prises. | Faible | Fonction absente |

## 5. Appréciation par fonction

| Fonction | Appréciation | En une phrase |
|---|---|---|
| Recherche et navigation | Très bien | Trois actions pour tout retrouver, clavier compris |
| Plan 2D | Bien | Clair ; les prises sont minuscules sur téléphone tant qu'on n'a pas zoomé |
| Vue 3D sur ordinateur | Bien | Lisible depuis l'isolement des cordons et l'étiquette du port |
| Vue 3D sur téléphone | Correct | Barre d'outils repliée depuis le 22 novembre ; à confirmer sur un vrai téléphone |
| Câblage et traçage | Très bien | Suit le câble à travers panneaux et prises |
| Inventaire, import, export | Bien | Complet, avec plan d'adressage et âge du parc ; manque la garantie |
| Interventions d'urgence | Bien | Impact et remplacement font gagner le plus de temps |
| Comptes et rôles | Bien | Contrôle solide côté serveur ; interface à ajuster pour la lecture seule |
| Journal d'audit | Très bien | Fiable, non modifiable, une ligne par opération |
| Sauvegardes | Bien | Automatiques et vérifiées ; à sortir de la machine |
| Installation et mise à jour | Très bien | Une commande, retour arrière automatique |
| Supervision (PRTG, SNMP) | À confirmer | Prête, jamais branchée sur du réel |

## 6. Recommandations, dans l'ordre

**Avant de mettre vos vraies données**

1. Essayer sur votre matériel : un vrai téléphone, votre PRTG ou deux switchs en SNMP, et Ubuntu si c'est votre système.
2. Envoyer `/var/lib/netcarto/sauvegardes` vers une autre machine avec votre outil de sauvegarde habituel.
3. Renseigner `https.noms`, ou fournir le certificat de votre autorité interne.
4. Créer un second compte administrateur.

**Corrections rapides dans le logiciel** *(toutes faites : la 5 le 20 novembre, les 6 à 9 le 22 novembre)*

5. Masquer ou griser les boutons d'action pour un compte en lecture seule (constat 1).
6. Proposer l'entrée en stock au moment où l'installation échoue faute de stock (constat 2).
7. Replier la barre d'outils 3D sur téléphone et retirer le bouton en double (constat 3).
8. Faire remonter les alertes de sécurité dans la liste des alertes, pour l'administrateur (constat 4).
9. Ajouter une ligne de synthèse par opération dans le journal d'audit, le détail restant dépliable (constat 5).

**Évolutions à planifier**

10. Alertes envoyées par courriel ou webhook.
11. Double authentification des administrateurs.
12. Chiffrement des sauvegardes.
13. Plan d'adressage, dates de garantie, étiquettes, alimentation électrique.

## 7. Audit par profils (22 novembre 2026)

Cinq utilisateurs types ont déroulé leurs tâches dans l'application réelle : serveur NetCarto, jeu de démonstration, trois comptes, écran d'ordinateur et écran de téléphone de 390 px. Chaque constat ci-dessous a été relevé à l'écran, puis corrigé et couvert par un scénario automatique.

### 7.1 Ce que chaque profil cherchait, et ce qu'il a trouvé

| Profil | Sa question | Ce qui le gênait | Ce qui a été fait |
|---|---|---|---|
| **Administrateur réseau — exploitation** | « Qui a fait quoi hier soir ? » | Un remplacement écrivait 43 lignes dans le journal d'audit, sans titre. Les champs et les objets y portaient leur nom technique (`installDate`, `devices`). | Une ligne par opération, avec le libellé donné dans l'interface (« Remplacement de… ») ; le détail se déplie. Noms en français. Filtre par famille d'actions. |
| **Administrateur réseau — conception** | « Reste-t-il des adresses dans ce VLAN ? Quelle est la prochaine ? » | Aucune vue de l'adressage : il fallait trier l'inventaire par adresse et compter. | Carte « Plan d'adressage » : occupation de chaque sous-réseau, prochaine adresse libre, adresses hors plan, sous-réseaux qui se chevauchent. Alerte à 90 % d'occupation. |
| **RSSI** | « Y a-t-il un problème de sécurité sur le serveur ? » | Les signaux existaient, mais dans une carte en bas du tableau de bord, hors de la liste des alertes et de la pastille de l'onglet. La rubrique « Sécurité du serveur » restait sur « Chargement… » si l'on était passé par le tableau de bord avant. | Les alertes de sécurité (HTTPS désactivé, sauvegarde trop ancienne, compte verrouillé, rafale d'échecs, certificat qui expire) rejoignent la liste et la pastille, pour l'administrateur seulement. Un clic mène à la rubrique. Défaut d'affichage corrigé. |
| **DSI** | « Quel est l'état du parc, et que faut-il prévoir au budget ? » | Des graphiques, mais rien sur l'âge du matériel ni de document à emporter en comité. | Carte « Âge du parc » : tranches d'âge, âge moyen, équipements de plus de 7 ans. Bouton « Synthèse » : document d'une à deux pages, à imprimer ou à enregistrer en PDF. |
| **Technicien de terrain** | « Je suis devant la baie avec mon téléphone. » | La barre d'outils couvrait un tiers de la vue 3D, avec le bouton « Stock » en double. Les indicateurs de l'inventaire occupaient tout le premier écran. Avec un stock à zéro, rien ne disait quoi faire pour installer. | Barre repliée sur une ligne, bouton « Outils » pour la déplier. Indicateurs sur une ligne qui défile. La palette et le clic sur une U libre proposent l'entrée en stock, puis reprennent l'installation au même endroit. |

### 7.2 Relevés avant et après

| Mesure | Avant | Après |
|---|---|---|
| Lignes du journal d'audit pour une opération | Une par changement (43 pour un remplacement) | 1, dépliable |
| Hauteur de la barre d'outils 3D sur téléphone | 149 px sur 435 | Moins de 100 px, problème signalé compris |
| Hauteur des indicateurs de l'inventaire sur téléphone | 4 rangées, environ 300 px | 1 rangée, moins de 110 px |
| Alertes de sécurité dans la pastille de l'onglet (administrateur, HTTPS désactivé) | 0 | 1 |
| Connaître la prochaine adresse libre d'un VLAN | Tri de l'inventaire et comptage à la main | Lue dans l'onglet Tableau |
| Installer quand le stock est vide | Quitter la baie, onglet Matériel, entrée en stock, revenir | Entrée en stock puis pose, sans quitter la baie |

### 7.3 Ce que les profils demandent encore

Ces points ont été relevés pendant l'audit et ne sont pas faits. Ils demandent une décision ou un changement du modèle de données.

| Profil | Demande | Pourquoi ce n'est pas fait |
|---|---|---|
| DSI | Date de fin de garantie et de fin de support par équipement ; coût d'achat | Nouveaux champs : migration de la base, formulaires, import CSV. L'âge calculé depuis la date d'installation en tient lieu pour l'instant. |
| DSI | Seuil de renouvellement réglable (7 ans aujourd'hui, pour tout le parc) | Réglage unique dans `js/config.js` ; un seuil par type de matériel serait plus juste. |
| RSSI | Alertes envoyées par courriel ou webhook | Le module d'envoi existe ; il reste à décider quelles alertes, à qui, à quelle fréquence. |
| RSSI | Double authentification des administrateurs | Voir `SECURITE.md`, section 7. |
| Administrateur — conception | Réserver une adresse sans équipement (passerelle, plage DHCP) | Le plan ne connaît que les adresses des équipements : la « prochaine adresse libre » peut être celle de la passerelle. À vérifier avant de l'attribuer. |
| Administrateur — conception | Adressage IPv6 | Le plan ne traite que l'IPv4. |
| Technicien | Étiquettes à imprimer pour les câbles et les prises | Fonction absente (constat 12). |
| Technicien | Lecture d'un code-barres ou d'un QR code pour retrouver un équipement | Demande l'accès à l'appareil photo, donc HTTPS et un essai sur un vrai téléphone. |

**Depuis l'audit (23 novembre).** Un futur utilisateur a demandé à sortir des plans pour ses prestataires. Le bouton « Dossier », sur la fiche d'un étage, d'un bâtiment ou d'un site, produit un seul document : plan, prises, équipements hors baie, baies et brassage. Les adresses IP et les numéros de série n'y figurent que sur demande.

**Limite de cet audit.** Les profils sont joués par un automate qui suit des parcours écrits à l'avance. Il mesure ce que l'écran affiche, pas ce qu'une personne ressent après une semaine d'usage. Un essai par de vrais utilisateurs reste à faire.

## 8. Où trouver les preuves

- Scénarios automatiques : `tests/netcarto.test.js` (82 scénarios, dont les blocs « Interventions d'urgence » et « Audit par profils ») et `serveur/tests/` (78 scénarios).
- Essais d'installation réels : `installation/tests/` (image Docker, Debian 12 avec systemd).
- Décisions et limites connues : `SUIVI.md`, sections 3.14 à 3.26.
