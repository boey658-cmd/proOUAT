/**
 * Requêtes lecture pour le panel admin (équipes + état Discord + vérif persistée).
 */

import { getDatabase } from '../database.js';

/** Ligne issue du JOIN teams + team_discord_state pour l’admin. */
export interface AdminTeamJoinRow {
  team_id: number;
  team_api_id: string;
  team_name: string;
  team_status: string;
  current_guild_id: string | null;
  active_guild_id: string | null;
  active_role_id: string | null;
  active_channel_id: string | null;
  verification_level: string | null;
  verification_label: string | null;
  verification_issues: string | null;
  last_verified_at: string | null;
  cached_guild_name: string | null;
  cached_role_name: string | null;
  cached_channel_name: string | null;
}

const SELECT_ADMIN_JOIN = `
    SELECT
      t.id AS team_id,
      t.team_api_id AS team_api_id,
      t.team_name AS team_name,
      t.status AS team_status,
      t.current_guild_id AS current_guild_id,
      s.active_guild_id AS active_guild_id,
      s.active_role_id AS active_role_id,
      s.active_channel_id AS active_channel_id,
      s.verification_level AS verification_level,
      s.verification_label AS verification_label,
      s.verification_issues AS verification_issues,
      s.last_verified_at AS last_verified_at,
      s.cached_guild_name AS cached_guild_name,
      s.cached_role_name AS cached_role_name,
      s.cached_channel_name AS cached_channel_name
    FROM teams t
    LEFT JOIN team_discord_state s ON s.team_id = t.id
`;

/** Liste toutes les équipes avec l’état Discord associé (LEFT JOIN). */
export function findAllTeamsWithDiscordState(): AdminTeamJoinRow[] {
  const db = getDatabase();
  const stmt = db.prepare(`${SELECT_ADMIN_JOIN} ORDER BY t.id`);
  return stmt.all() as AdminTeamJoinRow[];
}

/** Une équipe + état Discord (pour opérations ciblées). */
export function findAdminTeamJoinByTeamId(teamId: number): AdminTeamJoinRow | null {
  const db = getDatabase();
  const row = db
    .prepare(`${SELECT_ADMIN_JOIN} WHERE t.id = ?`)
    .get(teamId) as AdminTeamJoinRow | undefined;
  return row ?? null;
}
