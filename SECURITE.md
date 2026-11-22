# NetCarto — audit de sécurité

*Audit mené le 22 novembre 2026, avant un déploiement en entreprise. Point de vue : responsable de la sécurité des systèmes d'information.*

## 1. Conclusion

**NetCarto peut être déployé sur un réseau interne d'entreprise**, à condition d'appliquer les cinq mesures d'exploitation de la section 5. Elles ne dépendent pas du logiciel mais de son installation.

L'audit a trouvé **16 points**, dont 1 de gravité haute et 6 de gravité moyenne. **14 sont corrigés** dans cette version, chacun avec un test automatique qui échouerait si la faille revenait. **2 sont acceptés** et documentés (section 4).

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
| Installation | Image Docker et Debian 12 avec systemd, déjà éprouvées (voir `SUIVI.md`, 3.20 et 3.21) |

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

## 8. Vérifier par vous-même

| Sujet | Test |
|---|---|
| Injection dans l'interface, exports CSV | `tests/netcarto.test.js`, bloc « Sécurité de l'interface » (3 scénarios) |
| Serveur : contenu, tentatives, indices, tailles, en-têtes, empreintes, proxy, journal, droits, TLS | `serveur/tests/securite.test.js` (11 scénarios) |
| Comptes, rôles, récupération | `serveur/tests/comptes.test.js`, `serveur/tests/administration.test.js` |

Réglages ajoutés par cet audit : `securite.tentativesParAdresse` (20), `securite.fenetreMinutes` (10), `securite.coutMotDePasse` (17), `serveur.proxyDeConfiance` (false).
