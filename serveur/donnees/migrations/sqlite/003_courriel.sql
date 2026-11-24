-- NetCarto — migration 003 : adresse de courriel des comptes, liens de réinitialisation du mot de passe.

ALTER TABLE utilisateurs ADD COLUMN courriel TEXT NOT NULL DEFAULT '';
-- Une adresse ne sert qu'à un compte ; un compte peut ne pas en avoir
CREATE UNIQUE INDEX ux_utilisateurs_courriel ON utilisateurs (courriel COLLATE NOCASE) WHERE courriel <> '';

-- Le jeton du lien n'est pas stocké : seule son empreinte l'est. Un lien sert une fois, dans un délai court.
CREATE TABLE reinitialisations (
  jeton           TEXT PRIMARY KEY,
  utilisateur_id  TEXT NOT NULL REFERENCES utilisateurs (id) ON DELETE CASCADE,
  cree_le         INTEGER NOT NULL,
  expire_le       INTEGER NOT NULL,
  origine         TEXT NOT NULL DEFAULT ''     -- « courriel » (demande de l'utilisateur) ou « administrateur »
) STRICT;
CREATE INDEX ix_reinitialisations_utilisateur ON reinitialisations (utilisateur_id);
