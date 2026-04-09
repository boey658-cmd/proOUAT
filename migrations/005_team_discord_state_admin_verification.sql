-- Panel admin : persistance du dernier scan de vérification + affichage sans appel Discord sur GET.
ALTER TABLE team_discord_state ADD COLUMN verification_level TEXT DEFAULT 'unknown';
ALTER TABLE team_discord_state ADD COLUMN verification_label TEXT;
ALTER TABLE team_discord_state ADD COLUMN verification_issues TEXT;
ALTER TABLE team_discord_state ADD COLUMN last_verified_at TEXT;
ALTER TABLE team_discord_state ADD COLUMN cached_guild_name TEXT;
ALTER TABLE team_discord_state ADD COLUMN cached_role_name TEXT;
ALTER TABLE team_discord_state ADD COLUMN cached_channel_name TEXT;

UPDATE team_discord_state
SET verification_level = 'unknown'
WHERE verification_level IS NULL;
