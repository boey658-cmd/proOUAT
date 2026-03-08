-- Cache persistant des infos utilisateur API (réduction appels /user/{id}).
-- Utilisé avant l'appel API : si discord_id présent ou données fraîches (TTL), pas d'appel.
CREATE TABLE IF NOT EXISTS user_cache (
  user_api_id TEXT NOT NULL PRIMARY KEY,
  discord_id TEXT,
  username TEXT,
  last_fetched_at TEXT NOT NULL
);
