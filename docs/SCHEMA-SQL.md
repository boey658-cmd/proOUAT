# Schéma SQLite complet

Migrations versionnées. WAL activé après création de la base.

---

## Migration 001 — Tables initiales

```sql
-- guilds
CREATE TABLE guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_guild_id TEXT NOT NULL UNIQUE,
  name TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('primary', 'secondary')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- teams
CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_api_id TEXT NOT NULL UNIQUE,
  team_name TEXT NOT NULL,
  normalized_team_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'active', 'changed', 'archived')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_synced_at TEXT,
  division_number INTEGER,
  division_group TEXT,
  current_guild_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_teams_team_api_id ON teams(team_api_id);
CREATE INDEX idx_teams_division_number ON teams(division_number);
CREATE INDEX idx_teams_current_guild_id ON teams(current_guild_id);
CREATE INDEX idx_teams_normalized_team_name ON teams(normalized_team_name);

-- players
CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_api_id TEXT,
  team_id INTEGER NOT NULL,
  lol_pseudo TEXT NOT NULL,
  normalized_lol_pseudo TEXT NOT NULL,
  discord_user_id TEXT,
  discord_username_snapshot TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'missing_discord_id', 'left_team', 'pending_join')),
  is_captain INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX idx_players_team_id ON players(team_id);
CREATE INDEX idx_players_discord_user_id ON players(discord_user_id);
CREATE INDEX idx_players_player_api_id ON players(player_api_id);

-- team_snapshots
CREATE TABLE team_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  team_name_snapshot TEXT NOT NULL,
  players_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX idx_team_snapshots_team_id ON team_snapshots(team_id);

-- discord_resources
CREATE TABLE discord_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  discord_guild_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('role', 'channel', 'category')),
  discord_resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  UNIQUE (discord_guild_id, resource_type, discord_resource_id)
);
CREATE INDEX idx_discord_resources_team_id ON discord_resources(team_id);
CREATE INDEX idx_discord_resources_guild_type ON discord_resources(discord_guild_id, resource_type);

-- team_discord_state
CREATE TABLE team_discord_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL UNIQUE,
  active_guild_id TEXT,
  active_role_id TEXT,
  active_channel_id TEXT,
  active_category_id TEXT,
  last_membership_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- division_assignments
CREATE TABLE division_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL UNIQUE,
  division_number INTEGER NOT NULL,
  division_group TEXT NOT NULL,
  source_payload_json TEXT,
  synced_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- pending_actions
CREATE TABLE pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  action_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed', 'blocked')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX idx_pending_actions_status ON pending_actions(status);
CREATE INDEX idx_pending_actions_next_attempt ON pending_actions(next_attempt_at);

-- staff_messages
CREATE TABLE staff_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  discord_guild_id TEXT,
  channel_id TEXT,
  message_id TEXT,
  message_type TEXT NOT NULL CHECK (message_type IN ('new_team', 'team_changed', 'warning', 'limit_reached')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX idx_staff_messages_team_id ON staff_messages(team_id);

-- audit_logs
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('bot', 'staff', 'system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- job_locks
CREATE TABLE job_locks (
  job_name TEXT PRIMARY KEY,
  locked_at TEXT NOT NULL,
  lock_owner TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- app_settings
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## Activation WAL

À exécuter après création des tables (dans le code d'init DB) :

```sql
PRAGMA journal_mode=WAL;
```

---

## Contraintes et index

- Toutes les dates en ISO 8601 (TEXT).
- `is_active` / `is_captain` : 0 ou 1 (INTEGER).
- Contraintes CHECK pour les énumérations (status, kind, resource_type, etc.).
- Index sur les clés étrangères et colonnes de filtrage (guild_id, team_id, status, created_at).
