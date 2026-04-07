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

/**
 * Fusionne un patch avec l’état existant puis upsert (évite d’écraser des champs non fournis).
 */
export function mergeUpsertTeamDiscordState(
  teamId: number,
  patch: Partial<{
    active_guild_id: string | null;
    active_role_id: string | null;
    active_channel_id: string | null;
    active_category_id: string | null;
  }>
): void {
  const cur = findTeamDiscordStateByTeamId(teamId);
  upsertTeamDiscordState(teamId, {
    active_guild_id:
      patch.active_guild_id !== undefined ? patch.active_guild_id : cur?.active_guild_id ?? null,
    active_role_id:
      patch.active_role_id !== undefined ? patch.active_role_id : cur?.active_role_id ?? null,
    active_channel_id:
      patch.active_channel_id !== undefined ? patch.active_channel_id : cur?.active_channel_id ?? null,
    active_category_id:
      patch.active_category_id !== undefined ? patch.active_category_id : cur?.active_category_id ?? null,
  });
}

/** Autre équipe ayant déjà ce salon comme actif (si aucune : null). */
export function findOtherTeamIdWithActiveChannelId(
  channelId: string,
  excludeTeamId: number
): number | null {
  const id = channelId.trim();
  if (!id) return null;
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT team_id FROM team_discord_state WHERE active_channel_id = ? AND team_id != ? LIMIT 1'
  );
  const row = stmt.get(id, excludeTeamId) as { team_id: number } | undefined;
  return row?.team_id ?? null;
}

/** Autre équipe ayant déjà ce rôle comme actif (si aucune : null). */
export function findOtherTeamIdWithActiveRoleId(roleId: string, excludeTeamId: number): number | null {
  const id = roleId.trim();
  if (!id) return null;
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT team_id FROM team_discord_state WHERE active_role_id = ? AND team_id != ? LIMIT 1'
  );
  const row = stmt.get(id, excludeTeamId) as { team_id: number } | undefined;
  return row?.team_id ?? null;
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
