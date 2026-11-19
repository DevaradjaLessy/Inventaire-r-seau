# Installer NetCarto

Deux façons d'installer NetCarto sur un serveur Linux. Dans les deux cas :

| Quoi | Où |
|---|---|
| Base de données, sauvegardes, certificat HTTPS | `/var/lib/netcarto` |
| Réglages | `/etc/netcarto/netcarto.toml` |
| Adresse | `https://<adresse-du-serveur>:8443` |

Le fichier de réglages est créé à la première installation, puis n'est plus jamais écrasé.

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

## Tests

Les essais de l'image construisent un vrai conteneur. Ils sont ignorés si Docker n'est pas disponible.

```bash
node --test installation/tests/
```
