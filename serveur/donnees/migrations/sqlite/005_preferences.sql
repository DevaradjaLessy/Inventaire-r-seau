-- NetCarto — migration 005 : préférences d'affichage de chaque compte (cartes masquées du tableau de bord).
-- Un objet JSON, dont la forme est contrôlée par le serveur avant l'écriture.

ALTER TABLE utilisateurs ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}';
