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
  guild_id: string | null;
  guild_label: string;
  role_id: string | null;
  private_channel_id: string | null;
  role_name: string | null;
  channel_name: string | null;
  last_verified_at: string | null;
  verification: TeamVerification;
}

export interface AdminGuildResourcesResponse {
  guild_id: string;
  roles: DiscordPickOption[];
  channels: DiscordPickOption[];
}

export type StatusFilter = 'all' | 'ok' | 'warning' | 'error' | 'unknown';
