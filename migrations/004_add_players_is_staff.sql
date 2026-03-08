-- Distinguer joueurs et staff dans la table players pour la synchro des rôles Discord.
-- is_staff = 0 : joueur, is_staff = 1 : staff (même logique d’attribution de rôle).
ALTER TABLE players ADD COLUMN is_staff INTEGER NOT NULL DEFAULT 0;
