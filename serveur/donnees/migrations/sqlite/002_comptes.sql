-- NetCarto — migration 002 : comptes, sessions et journal d'audit (lot 17).

CREATE TABLE utilisateurs (
  id                  TEXT PRIMARY KEY,
  identifiant         TEXT NOT NULL CONSTRAINT ck_utilisateur_identifiant CHECK (length(identifiant) >= 2),
  nom                 TEXT NOT NULL DEFAULT '',
  role                TEXT NOT NULL CONSTRAINT ck_utilisateur_role CHECK (role IN ('lecture', 'technicien', 'administrateur')),
  mot_de_passe        TEXT NOT NULL,              -- empreinte scrypt salée, jamais le mot de passe lui-même
  actif               INTEGER NOT NULL DEFAULT 1,
  echecs              INTEGER NOT NULL DEFAULT 0, -- échecs de connexion consécutifs
  verrouille_jusqu_a  INTEGER,
  cree_le             INTEGER NOT NULL,
  derniere_connexion  INTEGER
) STRICT;
CREATE UNIQUE INDEX ux_utilisateurs_identifiant ON utilisateurs (identifiant COLLATE NOCASE);

-- Le jeton de session n'est pas stocké : seule son empreinte l'est
CREATE TABLE sessions (
  jeton           TEXT PRIMARY KEY,
  utilisateur_id  TEXT NOT NULL REFERENCES utilisateurs (id) ON DELETE CASCADE,
  creee_le        INTEGER NOT NULL,
  vue_le          INTEGER NOT NULL,
  ip              TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX ix_sessions_utilisateur ON sessions (utilisateur_id);

-- Journal d'audit : qui, quand, quoi, valeur avant et après. On y ajoute, on n'y touche plus.
CREATE TABLE audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            INTEGER NOT NULL,
  utilisateur_id  TEXT,
  identifiant     TEXT NOT NULL DEFAULT '',
  action          TEXT NOT NULL,
  collection      TEXT NOT NULL DEFAULT '',
  cle             TEXT NOT NULL DEFAULT '',
  libelle         TEXT NOT NULL DEFAULT '',
  avant           TEXT,
  apres           TEXT,
  lot             INTEGER,
  ip              TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX ix_audit_cle ON audit (collection, cle);
CREATE INDEX ix_audit_identifiant ON audit (identifiant);
CREATE TRIGGER audit_sans_modification BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Le journal d''audit ne se modifie pas.'); END;
CREATE TRIGGER audit_sans_suppression BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Le journal d''audit ne se supprime pas.'); END;
