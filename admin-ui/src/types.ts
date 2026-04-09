/** Aligné sur src/admin/types.ts (API JSON). */

export interface TeamVerificationFlags {
  missing_guild_id: boolean;
  missing_role_id: boolean;
  missing_channel_id: boolean;
  role_not_found: boolean;
  channel_not_found: boolean;
}

export type TeamVerificationLevel = 'ok' | 'warning' | 'error' | 'unknown';

export interface TeamVerification {
  level: TeamVerificationLevel;
  label: string;
  flags: TeamVerificationFlags;
}

export interface DiscordPickOption {
  id: string;
  name: string;
}

export interface AdminTeamRow {
  id: number;
  team_api_id: string;
  team_name: string;
  team_status: string;
  target_guild_id: string | null;
  target_division_number: number | null;
  target_guild_label: string;
  guild_label: string;
  role_id: string | null;
  private_channel_id: string | null;
  role_name: string | null;
  channel_name: string | null;
  last_verified_at: string | null;
  verification: TeamVerification;
}

export interface AdminTargetGuildsMetaResponse {
  guilds: { id: string; label: string }[];
  division_min: number;
  division_max: number;
}

export interface AdminGuildResourcesResponse {
  guild_id: string;
  roles: DiscordPickOption[];
  channels: DiscordPickOption[];
}

export type StatusFilter = 'all' | 'ok' | 'warning' | 'error' | 'unknown';

export interface BulkAssignUpdatedTeamBrief {
  id: number;
  team_name: string;
  team_api_id: string;
}

export interface BulkAssignAmbiguousName {
  input: string;
  matching_ids: number[];
}

export interface BulkAssignTeamsResponse {
  updated_count: number;
  updated_teams: BulkAssignUpdatedTeamBrief[];
  not_found_names: string[];
  ambiguous_names: BulkAssignAmbiguousName[];
  parsed_names: string[];
}
