/**
 * Types des lignes SQLite (entités brutes).
 * Une responsabilité : définir les shapes des tables.
 */

export type TeamStatus = 'new' | 'active' | 'changed' | 'archived';
export type PlayerStatus = 'active' | 'missing_discord_id' | 'left_team' | 'pending_join';
export type DiscordResourceType = 'role' | 'channel' | 'category';
export type PendingActionStatus = 'pending' | 'processing' | 'done' | 'failed' | 'blocked';

export interface TeamRow {
  id: number;
  team_api_id: string;
  team_name: string;
  normalized_team_name: string;
  status: TeamStatus;
  first_seen_at: string;
  last_seen_at: string;
  last_synced_at: string | null;
  division_number: number | null;
  division_group: string | null;
  current_guild_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerRow {
  id: number;
  player_api_id: string | null;
  team_id: number;
  lol_pseudo: string;
  normalized_lol_pseudo: string;
  discord_user_id: string | null;
  discord_username_snapshot: string | null;
  status: PlayerStatus;
  is_captain: number;
  /** 1 = staff (équipe), 0 = joueur. Utilisé pour la synchro des rôles Discord et les logs. */
  is_staff?: number;
  created_at: string;
  updated_at: string;
}

export interface DiscordResourceRow {
  id: number;
  team_id: number;
  discord_guild_id: string;
  resource_type: DiscordResourceType;
  discord_resource_id: string;
  resource_name: string;
  is_active: number;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface DivisionAssignmentRow {
  id: number;
  team_id: number;
  division_number: number;
  division_group: string;
  source_payload_json: string | null;
  synced_at: string;
}

export interface PendingActionRow {
  id: number;
  team_id: number | null;
  action_type: string;
  payload_json: string;
  status: PendingActionStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamDiscordStateRow {
  id: number;
  team_id: number;
  active_guild_id: string | null;
  active_role_id: string | null;
  active_channel_id: string | null;
  active_category_id: string | null;
  last_membership_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCacheRow {
  user_api_id: string;
  discord_id: string | null;
  username: string | null;
  last_fetched_at: string;
}

/** Types pour les insertions (sans id / champs auto). */
export type TeamInsert = Omit<TeamRow, 'id'>;
export type PlayerInsert = Omit<PlayerRow, 'id'>;
export type DiscordResourceInsert = Omit<DiscordResourceRow, 'id'>;
export type DivisionAssignmentInsert = Omit<DivisionAssignmentRow, 'id'>;
export type PendingActionInsert = Omit<PendingActionRow, 'id'>;
export type TeamDiscordStateInsert = Omit<TeamDiscordStateRow, 'id'>;
export type UserCacheInsert = UserCacheRow;
