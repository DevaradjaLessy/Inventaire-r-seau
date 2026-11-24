-- NetCarto — migration 001 : schéma initial.
-- Une table par type d'objet, reliées par des clés étrangères.
-- Les tables « utilisateurs » et « audit » arrivent avec la migration du lot 17.

CREATE TABLE meta (
  cle     TEXT PRIMARY KEY,
  valeur  TEXT NOT NULL
) STRICT;

CREATE TABLE vlans (
  id           INTEGER PRIMARY KEY CONSTRAINT ck_vlan_numero CHECK (id BETWEEN 1 AND 4094),
  nom          TEXT NOT NULL CONSTRAINT ck_vlan_nom CHECK (length(nom) > 0),
  couleur      TEXT NOT NULL DEFAULT '',
  sous_reseau  TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE sites (
  id       TEXT PRIMARY KEY,
  nom      TEXT NOT NULL CONSTRAINT ck_site_nom CHECK (length(nom) > 0),
  code     TEXT NOT NULL DEFAULT '',
  adresse  TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE batiments (
  id       TEXT PRIMARY KEY,
  site_id  TEXT NOT NULL REFERENCES sites (id),
  code     TEXT NOT NULL CONSTRAINT ck_batiment_code CHECK (length(code) > 0),
  nom      TEXT NOT NULL CONSTRAINT ck_batiment_nom CHECK (length(nom) > 0)
) STRICT;
CREATE UNIQUE INDEX ux_batiments_code ON batiments (site_id, code COLLATE NOCASE);

CREATE TABLE etages (
  id           TEXT PRIMARY KEY,
  batiment_id  TEXT NOT NULL REFERENCES batiments (id),
  niveau       INTEGER NOT NULL,
  nom          TEXT NOT NULL CONSTRAINT ck_etage_nom CHECK (length(nom) > 0),
  largeur      REAL NOT NULL CONSTRAINT ck_etage_dimensions CHECK (largeur > 0),
  profondeur   REAL NOT NULL CONSTRAINT ck_etage_dimensions CHECK (profondeur > 0),
  image_plan   TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE UNIQUE INDEX ux_etages_niveau ON etages (batiment_id, niveau);

CREATE TABLE pieces (
  id          TEXT PRIMARY KEY,
  etage_id    TEXT NOT NULL REFERENCES etages (id),
  nom         TEXT NOT NULL CONSTRAINT ck_piece_nom CHECK (length(nom) > 0),
  type        TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  largeur     REAL NOT NULL CONSTRAINT ck_piece_dimensions CHECK (largeur > 0),
  profondeur  REAL NOT NULL CONSTRAINT ck_piece_dimensions CHECK (profondeur > 0)
) STRICT;
CREATE INDEX ix_pieces_etage ON pieces (etage_id);

CREATE TABLE catalogue (
  id                TEXT PRIMARY KEY,
  categorie         TEXT NOT NULL CONSTRAINT ck_catalogue_categorie CHECK (categorie IN ('switch', 'router', 'firewall', 'ap', 'passive', 'rack', 'ups', 'server', 'phone', 'camera', 'consumable')),
  marque            TEXT NOT NULL DEFAULT '',
  modele            TEXT NOT NULL CONSTRAINT ck_catalogue_modele CHECK (length(modele) > 0),
  reference         TEXT NOT NULL DEFAULT '',
  gabarit           TEXT NOT NULL,
  montage           TEXT NOT NULL,
  hauteur_u         INTEGER NOT NULL DEFAULT 0 CONSTRAINT ck_catalogue_hauteur CHECK (hauteur_u >= 0),
  niveau            TEXT,
  budget_poe_w      REAL NOT NULL DEFAULT 0,
  conso_poe_w       REAL NOT NULL DEFAULT 0,
  puissance_w       REAL NOT NULL DEFAULT 0,
  firmware          TEXT NOT NULL DEFAULT '',
  caracteristiques  TEXT NOT NULL DEFAULT '{}',
  couleur           TEXT NOT NULL DEFAULT '',
  accent            TEXT NOT NULL DEFAULT '',
  logo              TEXT NOT NULL DEFAULT '',
  image_facade      TEXT NOT NULL DEFAULT '',
  largeur_m         REAL,
  profondeur_m      REAL,
  description       TEXT NOT NULL DEFAULT ''
) STRICT;

-- Groupes de ports d'un modèle : une ligne par groupe, dans l'ordre de la façade
CREATE TABLE catalogue_ports (
  catalogue_id  TEXT NOT NULL REFERENCES catalogue (id) ON DELETE CASCADE,
  ordre         INTEGER NOT NULL,
  type          TEXT NOT NULL CONSTRAINT ck_port_type CHECK (type IN ('rj45', 'sfp', 'sfp+', 'lc')),
  nombre        INTEGER NOT NULL CONSTRAINT ck_groupe_nombre CHECK (nombre > 0),
  debit         REAL NOT NULL DEFAULT 1000,
  poe           INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL CONSTRAINT ck_port_role CHECK (role IN ('access', 'uplink', 'pp')),
  prefixe       TEXT NOT NULL DEFAULT '',
  debut         INTEGER NOT NULL DEFAULT 1,
  noms          TEXT,
  PRIMARY KEY (catalogue_id, ordre)
) STRICT;

CREATE TABLE stock (
  catalogue_id  TEXT PRIMARY KEY REFERENCES catalogue (id),
  disponible    INTEGER NOT NULL DEFAULT 0 CONSTRAINT ck_stock_disponible CHECK (disponible >= 0),
  seuil         INTEGER NOT NULL DEFAULT 0 CONSTRAINT ck_stock_seuil CHECK (seuil >= 0),
  lieu          TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE baies (
  id                 TEXT PRIMARY KEY,
  piece_id           TEXT NOT NULL REFERENCES pieces (id),
  catalogue_id       TEXT NOT NULL REFERENCES catalogue (id),
  nom                TEXT NOT NULL CONSTRAINT ck_baie_nom CHECK (length(nom) > 0),
  hauteur_u          INTEGER NOT NULL CONSTRAINT ck_baie_hauteur CHECK (hauteur_u > 0),
  x                  REAL NOT NULL,
  y                  REAL NOT NULL,
  serie              TEXT NOT NULL DEFAULT '',
  date_installation  TEXT NOT NULL DEFAULT '',
  statut             TEXT NOT NULL CONSTRAINT ck_statut CHECK (statut IN ('active', 'maintenance', 'fault', 'retired'))
) STRICT;
CREATE UNIQUE INDEX ux_baies_nom ON baies (nom COLLATE NOCASE);
CREATE INDEX ix_baies_piece ON baies (piece_id);

CREATE TABLE equipements (
  id                 TEXT PRIMARY KEY,
  catalogue_id       TEXT NOT NULL REFERENCES catalogue (id),
  nom_hote           TEXT NOT NULL CONSTRAINT ck_equipement_nom CHECK (length(nom_hote) > 0),
  baie_id            TEXT REFERENCES baies (id),
  u                  INTEGER,
  piece_id           TEXT REFERENCES pieces (id),
  x                  REAL,
  y                  REAL,
  serie              TEXT NOT NULL DEFAULT '',
  ip                 TEXT NOT NULL DEFAULT '',
  mac                TEXT NOT NULL DEFAULT '',
  firmware           TEXT NOT NULL DEFAULT '',
  date_installation  TEXT NOT NULL DEFAULT '',
  statut             TEXT NOT NULL CONSTRAINT ck_statut CHECK (statut IN ('active', 'maintenance', 'fault', 'retired')),
  niveau             TEXT,
  notes              TEXT NOT NULL DEFAULT '',
  -- Un équipement est en baie (avec sa position en U) ou dans une pièce, jamais les deux
  CONSTRAINT ck_equipement_emplacement CHECK (NOT (baie_id IS NOT NULL AND piece_id IS NOT NULL)),
  CONSTRAINT ck_equipement_u CHECK ((baie_id IS NULL) = (u IS NULL))
) STRICT;
-- Unicité : un équipement hors service libère son adresse IP et son nom
CREATE UNIQUE INDEX ux_equipements_ip  ON equipements (ip) WHERE ip <> '' AND statut <> 'retired';
CREATE UNIQUE INDEX ux_equipements_mac ON equipements (lower(mac)) WHERE mac <> '';
CREATE UNIQUE INDEX ux_equipements_nom ON equipements (nom_hote COLLATE NOCASE) WHERE statut <> 'retired';
CREATE INDEX ix_equipements_baie  ON equipements (baie_id);
CREATE INDEX ix_equipements_piece ON equipements (piece_id);

CREATE TABLE ports (
  id             TEXT PRIMARY KEY,
  equipement_id  TEXT NOT NULL REFERENCES equipements (id),
  idx            INTEGER NOT NULL,
  nom            TEXT NOT NULL CONSTRAINT ck_port_nom CHECK (length(nom) > 0),
  type           TEXT NOT NULL CONSTRAINT ck_port_type CHECK (type IN ('rj45', 'sfp', 'sfp+', 'lc')),
  role           TEXT NOT NULL CONSTRAINT ck_port_role CHECK (role IN ('access', 'uplink', 'pp')),
  debit          REAL NOT NULL DEFAULT 1000,
  etat           TEXT NOT NULL CONSTRAINT ck_port_etat CHECK (etat IN ('up', 'down', 'disabled', 'error')),
  vlan           INTEGER,
  poe_possible   INTEGER NOT NULL DEFAULT 0,
  poe_watts      REAL NOT NULL DEFAULT 0 CONSTRAINT ck_port_poe CHECK (poe_watts >= 0),
  mac            TEXT NOT NULL DEFAULT '',
  connecte       TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE UNIQUE INDEX ux_ports_rang ON ports (equipement_id, idx);
CREATE UNIQUE INDEX ux_ports_nom  ON ports (equipement_id, nom COLLATE NOCASE);

CREATE TABLE prises (
  id        TEXT PRIMARY KEY,
  piece_id  TEXT NOT NULL REFERENCES pieces (id),
  repere    TEXT NOT NULL CONSTRAINT ck_prise_repere CHECK (length(repere) > 0),
  x         REAL NOT NULL,
  y         REAL NOT NULL,
  usage     TEXT NOT NULL CONSTRAINT ck_prise_usage CHECK (usage IN ('data', 'voice', 'ap', 'camera', 'printer'))
) STRICT;
CREATE UNIQUE INDEX ux_prises_repere ON prises (repere COLLATE NOCASE);
CREATE INDEX ix_prises_piece ON prises (piece_id);

-- Chaque extrémité d'un câble est un port ou une prise murale, jamais les deux
CREATE TABLE cables (
  id          TEXT PRIMARY KEY,
  a_port_id   TEXT REFERENCES ports (id),
  a_prise_id  TEXT REFERENCES prises (id),
  b_port_id   TEXT REFERENCES ports (id),
  b_prise_id  TEXT REFERENCES prises (id),
  type        TEXT NOT NULL CONSTRAINT ck_cable_type CHECK (type IN ('cat6a', 'patch', 'om3', 'os2', 'dac')),
  longueur    REAL NOT NULL DEFAULT 0 CONSTRAINT ck_cable_longueur CHECK (longueur >= 0),
  couleur     TEXT NOT NULL DEFAULT '',
  libelle     TEXT NOT NULL DEFAULT '',
  CONSTRAINT ck_cable_extremites CHECK ((a_port_id IS NULL) <> (a_prise_id IS NULL)),
  CONSTRAINT ck_cable_extremites CHECK ((b_port_id IS NULL) <> (b_prise_id IS NULL))
) STRICT;
CREATE INDEX ix_cables_a_port  ON cables (a_port_id);
CREATE INDEX ix_cables_a_prise ON cables (a_prise_id);
CREATE INDEX ix_cables_b_port  ON cables (b_port_id);
CREATE INDEX ix_cables_b_prise ON cables (b_prise_id);

-- Historique affiché dans l'interface (le journal d'audit détaillé arrive avec le lot 17)
CREATE TABLE journal (
  id     TEXT PRIMARY KEY,
  date   INTEGER NOT NULL,
  type   TEXT NOT NULL,
  texte  TEXT NOT NULL,
  ref    TEXT
) STRICT;
CREATE INDEX ix_journal_date ON journal (date);
