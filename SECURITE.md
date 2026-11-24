# NetCarto — audit de sécurité

*Audit mené le 22 novembre 2026, avant un déploiement en entreprise. Point de vue : responsable de la sécurité des systèmes d'information.*

## 1. Conclusion

**NetCarto peut être déployé sur un réseau interne d'entreprise**, à condition d'appliquer les cinq mesures d'exploitation de la section 5. Elles ne dépendent pas du logiciel mais de son installation.

L'audit a trouvé **16 points**, dont 1 de gravité haute et 6 de gravité moyenne. **14 sont corrigés** dans cette version, chacun avec un test automatique qui échouerait si la faille revenait. **2 sont acceptés** et documentés (section 4).

Une **campagne d'attaques** a ensuite été menée contre la version corrigée (section 8). Sur 40 essais, 3 défenses ont cédé, toutes liées à des tentatives envoyées en rafale. Elles sont corrigées, ainsi que 6 autres points trouvés en chemin. Rejouée, la campagne ne passe plus nulle part.

Une **relecture avec des grilles extérieures** (section 9) a ensuite trouvé 6 points dans le code, dont 1 de gravité haute, et 8 écarts dans la tenue du dépôt et de l'installation. Les 14 sont corrigés ; 5 autres points sont laissés en l'état et expliqués.

Ce document n'est pas une certification. Il ne remplace ni un test d'intrusion mené par un tiers, ni la revue de votre propre politique de sécurité.

## 2. Méthode et périmètre

| Examiné | Comment |
|---|---|
| Authentification, sessions, récupération de compte | Lecture du code, puis attaques réelles contre un serveur de test |
| Autorisations (trois rôles) | Appels directs à l'API avec chaque rôle |
| Contenu saisi et affiché | Base où chaque texte libre porte une charge d'injection, puis visite de tous les écrans |
| En-têtes HTTP, cookies, TLS | Requêtes directes, lecture des réponses |
| Fichiers, droits, journalisation | Lecture du disque après un démarrage réel |
| Dépendances | `npm audit` sur le serveur et les connecteurs : aucune vulnérabilité connue |
| Installation | Image Docker, Debian 12 et Ubuntu avec systemd, essayées pour de bon (`installation/tests/`) |

**Hors périmètre :** test d'intrusion externe, revue du système hôte, du réseau et du pare-feu, analyse du code de Node.js et de SQLite, connecteurs PRTG et SNMP sur du matériel réel.

Référentiels utilisés comme grille de lecture : OWASP Top 10 (2021), OWASP ASVS niveau 2 pour l'authentification et les sessions, guide d'hygiène informatique de l'ANSSI.

## 3. Failles trouvées et corrigées

### Gravité haute

| # | Faille | Risque | Correction |
|---|---|---|---|
| 1 | **Injection de code dans la page (XSS stocké).** Trois affichages inséraient un texte de la base sans le neutraliser : l'emplacement en tête de la fiche d'une pièce, celui de la fiche d'une baie, et la date d'installation (fiche et tableau de l'Inventaire). | Un technicien, ou un fichier importé piégé, pouvait faire exécuter du code dans le navigateur d'un administrateur. En mode serveur, la politique de sécurité du contenu bloquait l'exécution, mais pas l'insertion de faux contenu ; en mode démonstration, rien ne la bloquait. | Les trois affichages neutralisent le texte. Un test charge une base où **tous** les textes libres portent une charge d'injection, visite tous les écrans et toutes les fenêtres, et échoue au moindre élément inséré. |

### Gravité moyenne

| # | Faille | Risque | Correction |
|---|---|---|---|
| 2 | **Le serveur ne contrôlait pas la forme des couleurs, des images et des dates.** Seule l'interface le faisait. | Par un appel direct à l'API, un technicien pouvait enregistrer une valeur que l'interface juge invalide : la base devenait illisible pour tous les postes (déni de service), ou servait de support à une injection. | Le serveur impose la forme de ces valeurs : couleur `#rrggbb`, image intégrée seulement (jamais d'adresse extérieure), date `AAAA-MM-JJ`. Les textes libres sont limités à 20 000 caractères. |
| 3 | **Aucune limite de tentatives par adresse.** Seul le verrouillage par compte existait. | Un attaquant pouvait essayer un mot de passe courant sur tous les comptes, sans jamais déclencher de verrou. | Après 20 échecs en 10 minutes, l'adresse attend la fin de la fenêtre (réglable). La limite couvre la connexion, l'initialisation et la récupération de mot de passe. |
| 4 | **Le serveur révélait l'existence d'un compte.** Un compte verrouillé répondait autrement qu'un compte inconnu, et plus vite. | Énumération des identifiants valides, étape préalable à une attaque ciblée. | Une seule réponse pour tous les refus, calculée dans le même temps. Le message rappelle la règle de verrouillage sans dire si elle s'applique. |
| 5 | **Requêtes sans session acceptées jusqu'à 25 Mo.** | Saturation de la mémoire du serveur sans aucun compte. | Limite de 64 Ko pour toute requête sans session. |
| 6 | **Coût des empreintes de mots de passe sous la recommandation**, et calculs sans limite de simultanéité. | Base volée plus facile à attaquer hors ligne ; rafale de connexions capable de saturer le processeur. | scrypt à N = 2^17 (recommandation OWASP). Les empreintes plus faibles sont refaites à la connexion suivante. Deux calculs au plus à la fois. |
| 7 | **Formules dans les exports CSV.** Une valeur commençant par `=`, `+`, `-` ou `@` était écrite telle quelle. | Ouvert dans un tableur, le fichier pouvait exécuter une formule choisie par un tiers. | Ces valeurs reçoivent une apostrophe en tête, dans les trois exports (inventaire, impact, journal d'audit). |

### Gravité faible

| # | Faille | Correction |
|---|---|---|
| 8 | Mots de passe courants acceptés s'ils faisaient 12 caractères (`Motdepasse123!`). | Refus des mots et suites les plus répandus, même allongés de chiffres. |
| 9 | En-têtes de sécurité absents des réponses de l'API. | `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Resource-Policy` partout ; `Cross-Origin-Opener-Policy` et `Permissions-Policy` sur la page. |
| 10 | Version du serveur donnée sans session. | Donnée seulement à un compte connecté. |
| 11 | Base de données lisible par tous les comptes de la machine (droits 644), protégée seulement par son dossier. | Base, journal d'écriture et sauvegardes en 600 ; le serveur crée tous ses fichiers ainsi. |
| 12 | Aucun événement de sécurité dans le journal du service. | Lignes `SECURITE …` (échec de connexion, compte verrouillé, adresse bloquée), sans retour à la ligne injectable, exploitables par un outil de surveillance. |
| 13 | Derrière un proxy inverse, toutes les requêtes portaient l'adresse du proxy. | Réglage `serveur.proxyDeConfiance` : l'adresse réelle est alors lue dans l'en-tête ajouté par votre proxy. Désactivé par défaut, car cet en-tête se falsifie. |
| 14 | Cookie de session sans préfixe ; version de TLS et délais de connexion laissés aux valeurs par défaut ; un bouton de la page d'erreur utilisait un gestionnaire que la politique de sécurité bloque. | Cookie `__Host-` en HTTPS, TLS 1.2 au minimum, délais courts contre les connexions lentes, bouton corrigé. |

## 4. Risques acceptés

| # | Risque | Pourquoi il reste | Mesure compensatoire |
|---|---|---|---|
| 15 | **Un tiers peut verrouiller un compte** en se trompant volontairement cinq fois de mot de passe, y compris celui d'un administrateur. | Le verrouillage par compte est une exigence du projet ; le supprimer rouvrirait l'attaque par essais successifs. | Limite par adresse (point 3), verrou de 15 minutes seulement, déverrouillage par un autre administrateur ou par la commande `netcarto compte`. Prévoir deux administrateurs. |
| 16 | **Un technicien peut effacer l'historique affiché** dans l'application. | L'historique sert à l'annulation et doit rester modifiable. | Le journal d'audit, lui, ne peut être ni modifié ni effacé, et garde chaque opération avec son auteur. |

## 5. Mesures d'exploitation à appliquer

Aucune ne peut être faite par le logiciel à votre place.

1. **Certificat.** Remplacer le certificat auto-signé par celui de votre autorité interne (`https.certificat`, `https.cle`). Ne jamais lancer avec `--http` hors d'un poste d'essai.
2. **Sauvegardes hors de la machine.** Elles sont sur le même disque que la base et ne sont pas chiffrées. Les copier chaque nuit vers un autre serveur, sur un support chiffré.
3. **Deux administrateurs au moins**, avec des mots de passe distincts et longs. La carte « Sécurité du serveur » signale quand il n'y en a qu'un.
4. **Filtrage réseau.** N'ouvrir le port 8443 qu'aux postes qui en ont besoin. Ne jamais exposer NetCarto sur Internet : il n'a pas de double authentification.
5. **Surveillance.** Envoyer le journal du service (`journalctl -u netcarto`, ou les journaux Docker) vers votre outil de collecte, et alerter sur les lignes `SECURITE adresse_bloquee` et `SECURITE compte_verrouille`.

## 6. Ce qui était déjà solide

- Mots de passe jamais stockés ; jeton de session et lien de réinitialisation gardés sous forme d'empreinte seulement.
- Contrôle des rôles fait par le serveur à chaque requête, jamais par l'interface seule.
- Toutes les requêtes SQL sont paramétrées et confinées à `serveur/donnees/`.
- Écritures refusées quand elles viennent d'un autre site ; cookie `HttpOnly` et `SameSite=Strict`.
- Politique de sécurité du contenu stricte, sans script en ligne non déclaré ; aucune requête vers Internet.
- Journal d'audit protégé par la base elle-même contre toute modification.
- Service sous un compte sans privilège, système de fichiers en lecture seule, conteneur sans capacité superflue.
- Aucun secret dans le dépôt ni dans les fichiers de réglages (`"env:NOM"`).

## 7. Manques connus, à planifier

| Sujet | Portée |
|---|---|
| Double authentification pour les administrateurs | La mesure qui apporterait le plus après cet audit |
| Raccordement à l'annuaire de l'entreprise (LDAP, Active Directory, SSO) | Éviterait un mot de passe de plus, et couperait l'accès au départ d'un salarié |
| Chiffrement des sauvegardes | Aujourd'hui à la charge de l'exploitant |
| Alertes envoyées (courriel, webhook) | Le module d'envoi existe, les alertes non |
| Test d'intrusion par un tiers | À faire avant toute ouverture hors du réseau interne |
| Envoi de courriels en STARTTLS ou TLS | Écrit, mais essayé seulement contre un faux serveur sans chiffrement |

## 8. Campagne d'attaques

*Menée le 22 novembre 2026, après les correctifs de la section 3, contre un serveur de test local et jetable, en HTTP. Point de vue : un attaquant sur le réseau interne, d'abord sans compte, puis avec un compte en lecture, un compte de technicien, et enfin une session volée.*

La campagne est rejouable : `npm run attaques` dans `serveur/`. Elle démarre son propre serveur, lance 40 essais et rend un code d'erreur si une défense cède.

### 8.1 Résultat

**Premier passage : 37 défenses ont tenu, 3 ont cédé**, et un quatrième défaut est apparu à la lecture des réponses. Les quatre sont corrigés. **Second passage : 40 sur 40 tiennent.**

| Famille d'essais | Essais | Résultat |
|---|---|---|
| Accès sans compte : huit routes de l'API, cookies forgés, cookie rejoué après déconnexion | 11 | Tient |
| Élévation de privilèges : routes d'administration, écriture par un lecteur, tables internes, promotion de soi-même, variantes d'adresse, méthodes inattendues | 6 | Tient |
| Requêtes venues d'un autre site : écriture forcée, formulaire simple, origine nulle ou imitée, lecture croisée | 5 | Tient |
| Injection : SQL, traversée de dossier, nom de sauvegarde détourné, pollution de prototype | 4 | Tient |
| Robustesse : requêtes mal formées, tronquées ou démesurées ; adresse de courriel conçue pour ralentir le contrôle | 2 | Tient |
| Devinette de mots de passe : rafale par adresse, rafale par compte, adresse usurpée par un en-tête, session volée | 4 | **3 cédaient**, corrigé |
| Récupération de compte : jeton altéré, lien détourné vers un autre compte, jeton dans le journal | 3 | Tient |
| Fuites : empreintes, messages d'erreur, tables internes, en-têtes, temps de réponse | 5 | Tient |

Un essai regroupe souvent plusieurs requêtes : 18 pour les routes d'administration, 13 pour la traversée de dossier, 11 pour l'injection SQL.

### 8.2 Les attaques qui ont réussi

Probabilité et impact sont notés pour un réseau interne d'entreprise.

| # | Attaque | Probabilité | Impact | Risque | Correction |
|---|---|---|---|---|---|
| 17 | **Rafale contre la limite par adresse.** 80 tentatives de connexion envoyées en même temps : toutes étaient essayées, car l'échec n'était compté qu'à la fin du calcul. La limite de 20 ne valait que pour un attaquant patient. | Haute : un script de dix lignes | Moyen | **Haut** | La tentative est comptée dès son arrivée, avant tout calcul. Une connexion réussie rend sa place. |
| 18 | **Rafale contre le verrou du compte.** 60 tentatives simultanées sur un seul compte : le verrou, prévu au cinquième échec, ne tombait pas à temps. Le bon mot de passe, placé en 46e position, était accepté. | Haute | Haut : le verrou est la défense principale d'un compte | **Haut** | Les tentatives d'un même compte passent une par une. Au-delà de douze en attente, les suivantes sont refusées sans être essayées. |
| 19 | **Session volée, mot de passe deviné sans limite.** Avec un cookie de session volé, le changement de mot de passe acceptait un nombre illimité d'essais du mot de passe actuel. L'attaquant passait d'un accès de quelques heures à un accès durable. | Faible : il faut d'abord voler une session | Haut | **Moyen** | Un mot de passe actuel faux compte comme un échec de connexion : cinquième échec, compte verrouillé et sessions fermées. La limite par adresse s'applique aussi. |
| 20 | **Adresse de courriel porteuse de balises.** Une adresse comme `"><img src=x>"@exemple.test` était acceptée. L'interface la neutralisait, mais elle partait telle quelle dans l'en-tête du courriel de récupération. | Faible : réservé à un administrateur | Faible | **Faible** | Seuls les lettres, les chiffres et `. _ % + -` sont admis avant l'arobase. |

### 8.3 Durcissements du second passage

Aucun n'a donné lieu à une attaque réussie. Ils ferment des contournements que la relecture du code, en cherchant la parade aux correctifs ci-dessus, a montrés possibles.

| # | Contournement | Correction |
|---|---|---|
| 21 | Un attaquant en IPv6 dispose de milliards d'adresses dans son propre réseau : la limite par adresse ne le gênait pas. | La limite compte par réseau `/64` en IPv6. Une adresse IPv4 écrite au format IPv6 est ramenée à sa forme IPv4. |
| 22 | Un compte en lecture pouvait envoyer 25 Mo à n'importe quelle route. | 64 Ko pour toutes les routes, sauf l'envoi d'un lot et le remplacement de la base. |
| 23 | Le téléchargement d'une sauvegarde, donc de toute la base, ne laissait aucune trace. | Inscrit au journal d'audit (« Sauvegarde téléchargée »). |
| 24 | Un compte pouvait ouvrir des sessions sans limite et remplir la table. | Vingt sessions par compte ; la plus ancienne est fermée. |
| 25 | Des milliers de connexions ouvertes sans rien envoyer occupaient le serveur jusqu'au délai. | Connexions muettes fermées en dix secondes, vérification toutes les deux secondes, 1 000 connexions au plus. |

### 8.4 Risques qui restent après la campagne

| Risque | Niveau | Pourquoi il reste | Parade |
|---|---|---|---|
| Un tiers verrouille un compte en se trompant cinq fois (point 15). Le point 18 le rend un peu plus facile : les tentatives en file comptent toutes. | Moyen | Contrepartie directe du verrou | Deux administrateurs, verrou de 15 minutes, alerte sur `SECURITE compte_verrouille` |
| Plusieurs postes derrière une même adresse (traduction d'adresses, proxy sans `proxyDeConfiance`) partagent la limite de 20 tentatives. | Faible | La limite ne connaît que l'adresse | Régler `serveur.proxyDeConfiance` derrière un proxy ; relever `securite.tentativesParAdresse` au besoin |
| Un technicien malveillant peut supprimer beaucoup d'objets, un par un ou par lot. | Moyen | C'est son droit d'écriture | Journal d'audit non modifiable, sauvegarde quotidienne, restauration en une commande |
| Une session volée reste valable jusqu'à son expiration (12 heures, ou 2 heures d'inactivité, réglables). | Moyen | Pas de double authentification | Cookie illisible par les scripts, HTTPS obligatoire, fermeture des autres sessions au changement de mot de passe |
| Attaque distribuée depuis de nombreuses adresses. | Faible en interne | Aucune limite par adresse ne l'arrête | Verrou par compte, filtrage réseau (mesure 4 de la section 5) |

La campagne confirme les priorités de la section 7 : la **double authentification** est la seule mesure qui réduirait à la fois le risque de session volée et celui de mot de passe deviné.

## 9. Relecture avec des grilles extérieures

*Menée le 24 novembre 2026. Deux relectures indépendantes : l'une du code modifié depuis la campagne d'attaques, l'autre de la tenue du dépôt et de l'installation. Elles ont suivi des listes de contrôle publiques : `TikiTribe/claude-secure-coding-rules`, `Consensys/repo-security-review`, `Security-Phoenix-demo/security-skills-claude-code`, `trilwu/secskills` et `anthropics/claude-code-security-review`. Ces dépôts ont servi de grilles de lecture ; rien n'en a été installé.*

### 9.1 Failles trouvées et corrigées

| # | Faille | Gravité | Correction |
|---|---|---|---|
| 26 | **Balisage injecté par le type d'une entrée d'historique.** Le serveur acceptait n'importe quel texte dans le champ `type` de l'historique, et le tableau de bord l'affichait sans le neutraliser. Un technicien pouvait y placer du balisage. La politique de sécurité du contenu bloquait tout script, mais pas un faux bouton : posé sur la page, il pouvait faire créer un compte administrateur par un administrateur qui cliquait dessus. | **Haute** : il faut un compte de technicien, mais le gain est le rôle d'administrateur | Le type est pris dans une liste fermée, au serveur (refus 400) comme au contrôle des fichiers importés. Le tableau de bord neutralise la valeur. Le formulaire de création de compte ne lit que ses propres champs. |
| 27 | **Nom d'une source de supervision affiché tel quel** dans l'infobulle du bouton « Sources ». Une source compromise, ou un relais mal réglé, pouvait y placer du balisage. | Faible | Le nom est neutralisé. Un scénario charge un relevé où chaque texte est piégé (noms, messages, erreurs, écarts) et visite tous les écrans qui l'affichent. |
| 28 | **Mesures attendues en nombre, acceptées en texte.** Erreurs de trame, nombre d'adresses MAC, puissance PoE, débit : un texte à la place du nombre arrivait jusqu'à la fiche du port. | Faible | Une mesure est un nombre ou rien. Une adresse MAC est un texte ou rien. |
| 29 | **Réponse mal formée d'une source.** Un élément inattendu dans la réponse (un nombre à la place d'un équipement, une liste de ports qui n'en est pas une) arrêtait la fusion des sources. | Faible : la supervision s'arrêtait, pas l'inventaire | Les éléments mal formés sont écartés ; les autres sources continuent. |
| 30 | **Réponse sans limite de taille.** Une source pouvait envoyer une réponse démesurée et saturer la mémoire du serveur. | Faible | Réponse coupée à 32 Mo, avec le message « Réponse trop volumineuse ». |
| 31 | **Adresse d'expéditeur mal contrôlée.** Le réglage `courriel.expediteur` était vérifié par un motif non ancré : un retour à la ligne y passait. | Faible : réglage réservé à l'administrateur du serveur | Motif ancré, retour à la ligne refusé au démarrage. |

### 9.2 Tenue du dépôt et de l'installation

| # | Écart | Correction |
|---|---|---|
| 32 | Le fichier d'exemple rangeait la base dans `serveur/donnees/`, qui est un dossier de code, non ignoré par git. Une base réelle pouvait partir dans un commit. | L'exemple indique `donnees-locales`, dossier ignoré. |
| 33 | Pas de `.gitignore` à la racine du dépôt. | Ajouté : `.env`, bases SQLite, clés, certificats, réglages locaux. |
| 34 | L'image Docker et le script d'installation copiaient tout le contenu de `serveur/` et de `connecteurs/`, y compris une base, une clé ou un fichier de réglages laissés là. | Exclus de l'image (`.dockerignore`) et de la copie du script. |
| 35 | Une archive Node.js apportée à la main (`--node`) n'était pas vérifiée. Le téléchargement pouvait suivre une redirection hors HTTPS. | Option `--somme` : l'installation s'arrête avant toute écriture si l'archive ne correspond pas. Sans l'option, la somme est affichée pour comparaison. `curl` est limité à HTTPS et TLS 1.2 au moins. |
| 36 | La construction de l'image exécutait les scripts d'installation des paquets. | `npm ci --ignore-scripts` : les dépendances sont du JavaScript seul. |
| 37 | Les tests d'interface n'avaient pas de fichier de verrouillage. | `tests/package-lock.json`, sur la version de Playwright réellement utilisée. |
| 38 | L'image des essais d'installation était désignée par son étiquette. | Désignée par son condensat. |
| 39 | Le service systemd pouvait utiliser tous les appels système et voyait les processus des autres comptes. | `SystemCallFilter=@system-service`, `ProtectProc=invisible`, `ProcSubset=pid`, `RemoveIPC`. Le niveau d'exposition mesuré par `systemd-analyze security` sur Ubuntu 24.04 est de 1,5 sur 10 ; les essais d'installation exigent moins de 2,5 sur Debian 12, Ubuntu 22.04 et 24.04. |

### 9.3 Points relevés et laissés en l'état

| Point | Pourquoi il reste | Ce qui le couvre |
|---|---|---|
| Le libellé d'une opération au journal d'audit vient du poste qui l'envoie. Un technicien peut intituler « Mise à jour » une suppression. | Le libellé sert à lire le journal, pas à faire foi | Le détail de chaque objet créé, modifié ou supprimé est écrit par le serveur, avec le compte réel |
| Le champ « créée par » d'une intervention vient lui aussi du poste. | Même raison | Le journal d'audit porte le compte réel |
| Une source de supervision peut être réglée en `http://`. Son jeton circule alors en clair. | PRTG est souvent installé sans HTTPS sur un réseau interne | À régler en HTTPS dès que la source le permet ; un compte en lecture seule côté supervision |
| L'image Docker part d'une image de base désignée par son étiquette, et démarre en root avant de passer au compte du service. | L'épingler par condensat demande de la mettre à jour à la main ; le démarrage en root prépare les dossiers | Conteneur en lecture seule, privilèges retirés, compte sans privilège pour le serveur |
| Le dépôt n'a ni intégration continue, ni alerte de dépendances, ni recherche automatique de secrets. | Ce sont des réglages du dépôt GitHub, à décider par son propriétaire | Trois suites de tests lancées avant chaque commit, `npm audit` sans alerte, aucun secret dans l'arbre ni dans l'historique |

## 10. Vérifier par vous-même

| Sujet | Test |
|---|---|
| Injection dans l'interface, exports CSV | `tests/netcarto.test.js`, bloc « Sécurité de l'interface » (3 scénarios, dont le relevé de supervision piégé) |
| Serveur : contenu, tentatives, indices, tailles, en-têtes, empreintes, proxy, journal, droits, TLS, rafales, session volée, IPv6, sessions par compte | `serveur/tests/securite.test.js` |
| Campagne d'attaques complète (40 essais) | `npm run attaques` dans `serveur/` |
| Réponses mal formées ou démesurées d'une source de supervision | `connecteurs/tests/test.js` |
| Somme de contrôle de l'archive Node.js, cloisonnement du service systemd | `installation/tests/linux.test.js` (Docker nécessaire) |
| Comptes, rôles, récupération | `serveur/tests/comptes.test.js`, `serveur/tests/administration.test.js` |

Réglages ajoutés par cet audit : `securite.tentativesParAdresse` (20), `securite.fenetreMinutes` (10), `securite.coutMotDePasse` (17), `serveur.proxyDeConfiance` (false).
