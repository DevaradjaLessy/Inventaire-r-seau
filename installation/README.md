# Installer NetCarto

Deux façons d'installer NetCarto sur un serveur Linux, et une façon de l'essayer sur son poste. Pour un serveur, dans les deux cas :

| Quoi | Où |
|---|---|
| Base de données, sauvegardes, certificat HTTPS | `/var/lib/netcarto` |
| Réglages | `/etc/netcarto/netcarto.toml` |
| Adresse | `https://<adresse-du-serveur>:8443` |

Le fichier de réglages est créé à la première installation, puis n'est plus jamais écrasé.

## Essayer sur son poste

Pour voir le logiciel complet (comptes, administration, sauvegardes) sur un poste Windows, macOS ou Linux, sans installer de serveur. Il faut seulement Docker : Docker Desktop sous Windows et macOS.

1. Récupérez le dépôt : sur sa page GitHub, bouton **Code**, puis **Download ZIP**, et décompressez l'archive.
2. Ouvrez un terminal dans le dossier décompressé, celui qui contient `docker-compose.essai.yml`.
3. Lancez NetCarto. La première fois, l'image est construite : comptez quelques minutes.

```bash
docker compose -f docker-compose.essai.yml up -d
```

4. Affichez le journal : il donne le **code d'initialisation**, de la forme `XXXX-XXXX-XXXX`.

```bash
docker compose -f docker-compose.essai.yml logs netcarto
```

5. Ouvrez `https://127.0.0.1:8443`, acceptez l'avertissement du navigateur (certificat auto-signé), puis créez le compte administrateur avec ce code.

| Pour… | Commande |
|---|---|
| Arrêter, en gardant les données | `docker compose -f docker-compose.essai.yml down` |
| Arrêter et tout effacer | `docker compose -f docker-compose.essai.yml down --volumes` |
| Relancer après une mise à jour du dépôt | `docker compose -f docker-compose.essai.yml up -d --build` |

Ce fichier d'essai lance le même conteneur que l'installation ci-dessous, avec les mêmes protections. Deux différences : la base et les réglages vont dans des volumes de Docker, et non dans `/var/lib/netcarto` et `/etc/netcarto`, qui n'existent pas sur un poste Windows ; et la base démarre remplie du **jeu de démonstration fictif**, pour avoir tout de suite quelque chose à regarder. Le port 8443 est ouvert sur le poste : sur un réseau qui n'est pas le vôtre, laissez le pare-feu du poste le fermer aux autres machines.

## Avec Docker

Il faut Docker avec le module Compose (`docker compose version`).

Depuis la racine du dépôt :

```bash
docker compose up -d
```

La première fois, l'image est construite (quelques minutes). Affichez ensuite le journal :

```bash
docker compose logs netcarto
```

Il contient le **code d'initialisation**, de la forme `XXXX-XXXX-XXXX`. Ouvrez `https://<adresse-du-serveur>:8443`, acceptez l'avertissement du navigateur (certificat auto-signé), puis créez le compte administrateur avec ce code.

### Commandes utiles

Créer un compte, ou retrouver l'accès (le mot de passe est demandé au clavier) :

```bash
docker compose exec netcarto netcarto compte alice --role administrateur
```

Sauvegarde immédiate, puis liste des sauvegardes :

```bash
docker compose exec netcarto netcarto sauvegarde
```

```bash
docker compose exec netcarto netcarto sauvegardes
```

Restaurer toute la base (comptes compris) : le serveur doit être arrêté.

```bash
docker compose stop
```

```bash
docker compose run --rm netcarto restaurer netcarto-2026-01-15_023000-auto.sqlite
```

```bash
docker compose start
```

Après une modification de `/etc/netcarto/netcarto.toml` :

```bash
docker compose restart
```

### Mettre à jour

Récupérez la nouvelle version du dépôt, puis :

```bash
docker compose up -d --build
```

Les données et les réglages restent en place. Si la nouvelle version modifie la base, une sauvegarde « avant mise à jour » est faite automatiquement.

### Désinstaller

```bash
docker compose down --rmi local
```

Cette commande retire le conteneur et l'image. Elle ne touche ni à `/var/lib/netcarto` ni à `/etc/netcarto` : supprimez ces deux dossiers vous-même si vous ne voulez rien garder.

### À savoir

- **Compte du service.** Le conteneur démarre en root, le temps de préparer les deux dossiers, puis le serveur tourne sous le compte `netcarto` (numéro 10001), sans privilège. Le système de fichiers du conteneur est en lecture seule.
- **Nom dans le certificat.** Pour que le certificat auto-signé porte le nom ou l'adresse que vos collègues utilisent, renseignez `noms` dans la section `[https]` des réglages, puis redémarrez. Vous pouvez aussi fournir votre propre certificat (`certificat` et `cle`).
- **Fuseau horaire.** La variable `TZ` de `docker-compose.yml` fixe l'heure locale, donc l'heure de la sauvegarde automatique.
- **Secrets de supervision.** Les jetons PRTG et communautés SNMP ne s'écrivent ni dans les réglages ni dans `docker-compose.yml` : mettez-les dans un fichier `.env` à côté de `docker-compose.yml`, et décommentez les lignes correspondantes de la section `environment`.
- **Proxy d'entreprise.** Si la construction échoue sur un téléchargement, voir les deux lignes d'en-tête de `installation/docker/Dockerfile`.

## Sur Debian ou Ubuntu, sans Docker

Il faut un accès root, systemd, et un accès à Internet pendant l'installation (sinon, voir « Sans accès à Internet »). NetCarto installe son propre Node.js dans `/opt/netcarto` : celui du système, s'il existe, n'est pas modifié.

Depuis la racine du dépôt :

```bash
sudo installation/linux/installer.sh
```

Le script :

1. télécharge Node.js 22 sur nodejs.org et vérifie sa somme de contrôle ;
2. copie le programme dans `/opt/netcarto` (modifiable par root seulement) ;
3. crée le compte système `netcarto`, sans privilège ni interpréteur de commandes ;
4. pose les réglages par défaut dans `/etc/netcarto/netcarto.toml`, s'ils n'existent pas ;
5. installe et démarre le service systemd `netcarto` ;
6. affiche l'adresse et le **code d'initialisation** pour créer le compte administrateur.

### Commandes utiles

```bash
systemctl status netcarto
```

```bash
journalctl -u netcarto
```

Après une modification de `/etc/netcarto/netcarto.toml` :

```bash
sudo systemctl restart netcarto
```

La commande `netcarto` sert à l'exploitation. Lancée en root, elle passe d'elle-même sous le compte du service :

```bash
sudo netcarto compte alice --role administrateur
```

```bash
sudo netcarto sauvegarde
```

```bash
sudo netcarto sauvegardes
```

Restaurer toute la base (comptes compris) : le serveur doit être arrêté.

```bash
sudo systemctl stop netcarto
```

```bash
sudo netcarto restaurer netcarto-2026-01-15_023000-auto.sqlite
```

```bash
sudo systemctl start netcarto
```

Les jetons PRTG et communautés SNMP se rangent dans `/etc/netcarto/netcarto.env` (lisible par root seulement), une ligne `NOM=valeur` par secret ; les réglages y renvoient par `"env:NOM"`.

### Mettre à jour

Récupérez la nouvelle version du dépôt, puis :

```bash
sudo installation/linux/mettre-a-jour.sh
```

Une sauvegarde est faite, puis la nouvelle version remplace l'ancienne. **Si elle ne démarre pas, l'ancienne est remise en service automatiquement.** Les données et les réglages ne sont jamais touchés.

### Désinstaller

Retirer le programme et le service, en gardant les données et les réglages :

```bash
sudo installation/linux/desinstaller.sh
```

Tout retirer, base et sauvegardes comprises (le script demande de taper `SUPPRIMER`) :

```bash
sudo installation/linux/desinstaller.sh --tout
```

Le script ne supprime un dossier que s'il s'agit bien de l'un des trois dossiers de NetCarto, qu'il n'est pas un lien vers un autre emplacement, et qu'il contient son fichier témoin. Dans le doute, il refuse et le dit.

### Sans accès à Internet

Sur un poste relié à Internet : récupérez le dépôt, lancez `npm ci --omit=dev` dans `serveur/` puis dans `connecteurs/`, et téléchargez l'archive `node-v22.x.y-linux-x64.tar.gz` sur `https://nodejs.org/dist/latest-v22.x/`. Recopiez le tout sur le serveur, puis :

```bash
sudo installation/linux/installer.sh --hors-ligne --node /chemin/vers/node-v22.x.y-linux-x64.tar.gz
```

Pour être sûr que l'archive est bien celle publiée par Node.js, donnez sa somme de contrôle, lue dans le fichier `SHASUMS256.txt` du même dossier de nodejs.org :

```bash
sudo installation/linux/installer.sh --hors-ligne --node /chemin/vers/node-v22.x.y-linux-x64.tar.gz --somme <somme SHA-256>
```

Si l'archive ne correspond pas, l'installation s'arrête avant toute écriture. Sans `--somme`, le script affiche la somme de l'archive : comparez-la vous-même.

Les mêmes options valent pour `mettre-a-jour.sh`.

### À savoir

- **Cloisonnement.** Le service ne peut écrire que dans `/var/lib/netcarto` ; le reste du système lui est en lecture seule, il n'a aucun privilège, ses appels système sont limités à ceux d'un service ordinaire et il ne voit que ses propres processus (voir `installation/linux/netcarto.service`).
- **Pare-feu.** Si `ufw` est actif, ouvrez le port : `sudo ufw allow 8443/tcp`.
- **Autres systèmes Linux.** Le script refuse de s'exécuter ailleurs que sur Debian ou Ubuntu : utilisez Docker.

## Tests

Les essais construisent un vrai conteneur : l'image Docker d'une part, une Debian 12 avec systemd d'autre part, où l'installation, la mise à jour, le retour arrière et la désinstallation sont déroulés pour de bon. Ils sont ignorés si Docker n'est pas disponible.

```bash
node --test --test-concurrency=1 "installation/tests/*.test.js"
```
