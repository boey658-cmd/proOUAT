-- Affectation manuelle : serveur Discord cible + division (panel admin).
ALTER TABLE teams ADD COLUMN target_guild_id TEXT;
ALTER TABLE teams ADD COLUMN target_division_number INTEGER;
