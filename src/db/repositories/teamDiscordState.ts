/**
 * Repository team_discord_state : état actif des ressources Discord par équipe.
 */

import { getDatabase } from '../database.js';
import type { TeamDiscordStateRow } from '../types.js';

function now(): string {
  return new Date().toISOString();
}

export function findTeamDiscordStateByTeamId(teamId: number): TeamDiscordStateRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM team_discord_state WHERE team_id = ?');
  return (stmt.get(teamId) as TeamDiscordStateRow | undefined) ?? null;
}

export function upsertTeamDiscordState(
  teamId: number,
  data: {
    active_guild_id: string | null;
    active_role_id: string | null;
    active_channel_id: string | null;
    active_category_id: string | null;
  }
): void {
  const db = getDatabase();
  const ts = now();
  const stmt = db.prepare(`
    INSERT INTO team_discord_state (team_id, active_guild_id, active_role_id, active_channel_id, active_category_id, last_membership_sync_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT (team_id) DO UPDATE SET
      active_guild_id = excluded.active_guild_id,
      active_role_id = excluded.active_role_id,
      active_channel_id = excluded.active_channel_id,
      active_category_id = excluded.active_category_id,
      updated_at = excluded.updated_at
  `);
  stmt.run(
    teamId,
    data.active_guild_id,
    data.active_role_id,
    data.active_channel_id,
    data.active_category_id,
    ts,
    ts
  );
}
