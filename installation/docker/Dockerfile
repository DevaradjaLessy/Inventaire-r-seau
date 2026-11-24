# syntax=docker/dockerfile:1
# Image NetCarto : serveur, interface web et module de supervision.
# Construction, depuis la racine du dépôt :   docker compose build
# Derrière un proxy d'entreprise qui inspecte le HTTPS, fournir son certificat :
#   docker build --secret id=ca,src=ca.crt --build-arg HTTPS_PROXY=http://proxy:3128 -f installation/docker/Dockerfile .

# --- Étape 1 : dépendances (elles ne sont retéléchargées que si les fichiers package changent) ---
# L'image de base est désignée par son condensat : c'est toujours la même, octet pour octet.
# Dependabot propose le nouveau condensat quand l'image officielle est corrigée (.github/dependabot.yml).
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS dependances
WORKDIR /opt/netcarto
COPY serveur/package.json serveur/package-lock.json serveur/
COPY connecteurs/package.json connecteurs/package-lock.json connecteurs/
# Aucun script d'installation de paquet n'est exécuté : les dépendances sont du JavaScript seul
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix serveur && \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix connecteurs

# --- Étape 2 : image finale ---
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
ENV NODE_ENV=production \
    NETCARTO_CONFIG=/etc/netcarto/netcarto.toml
# Compte du service, sans privilège ni interpréteur de commandes
RUN groupadd --system --gid 10001 netcarto \
 && useradd --system --uid 10001 --gid netcarto --home-dir /var/lib/netcarto --shell /usr/sbin/nologin netcarto \
 && mkdir -p /var/lib/netcarto /etc/netcarto \
 && chown netcarto:netcarto /var/lib/netcarto && chmod 750 /var/lib/netcarto
WORKDIR /opt/netcarto
COPY index.html ./
COPY css css
COPY js js
COPY connecteurs connecteurs
COPY serveur serveur
COPY --from=dependances /opt/netcarto/serveur/node_modules serveur/node_modules
COPY --from=dependances /opt/netcarto/connecteurs/node_modules connecteurs/node_modules
COPY installation/netcarto.toml installation/netcarto.toml
COPY installation/netcarto /usr/local/bin/netcarto
COPY installation/docker/entree.sh /usr/local/bin/netcarto-entree
RUN cp installation/netcarto.toml /etc/netcarto/netcarto.toml \
 && chown root:netcarto /etc/netcarto/netcarto.toml && chmod 640 /etc/netcarto/netcarto.toml \
 && chmod 755 /usr/local/bin/netcarto /usr/local/bin/netcarto-entree
VOLUME ["/var/lib/netcarto", "/etc/netcarto"]
EXPOSE 8443
# Le conteneur démarre en root le temps de préparer les dossiers, puis le serveur tourne sous le compte « netcarto »
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s --retries=3 CMD ["netcarto", "sante"]
ENTRYPOINT ["netcarto-entree"]
