-- NetCarto — migration 004 : interventions planifiées (qui fait quoi, sur quel objet, quand).

CREATE TABLE interventions (
  id           TEXT PRIMARY KEY,
  ref          TEXT,                              -- objet visé (équipement, port, prise, baie, pièce…), ou rien
  titre        TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  date_prevue  TEXT NOT NULL DEFAULT '',          -- AAAA-MM-JJ, ou vide
  charge       TEXT NOT NULL DEFAULT '',          -- personne chargée de l'intervention
  statut       TEXT NOT NULL CHECK (statut IN ('planned', 'doing', 'done')),
  auteur       TEXT NOT NULL DEFAULT '',
  cree_le      INTEGER NOT NULL,
  fait_le      INTEGER
) STRICT;
CREATE INDEX ix_interventions_statut ON interventions (statut);
