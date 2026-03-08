/**
 * Repository players : CRUD et requêtes par team_id, discord_user_id, player_api_id.
 * Une responsabilité : accès données table players.
 */

import { getDatabase } from '../database.js';
import type { PlayerRow, PlayerStatus, PlayerInsert } from '../types.js';

function now(): string {
  return new Date().toISOString();
}

export function insertPlayer(row: PlayerInsert): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO players (
      player_api_id, team_id, lol_pseudo, normalized_lol_pseudo,
      discord_user_id, discord_username_snapshot, status, is_captain,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    row.player_api_id ?? null,
    row.team_id,
    row.lol_pseudo,
    row.normalized_lol_pseudo,
    row.discord_user_id ?? null,
    row.discord_username_snapshot ?? null,
    row.status,
    row.is_captain ?? 0,
    row.created_at,
    row.updated_at
  );
  return info.lastInsertRowid as number;
}

export function findPlayerById(id: number): PlayerRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM players WHERE id = ?');
  return (stmt.get(id) as PlayerRow | undefined) ?? null;
}

export function findPlayersByTeamId(teamId: number): PlayerRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY id');
  return stmt.all(teamId) as PlayerRow[];
}

export function findPlayerByDiscordUserId(discordUserId: string): PlayerRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM players WHERE discord_user_id = ? LIMIT 1');
  return (stmt.get(discordUserId) as PlayerRow | undefined) ?? null;
}

export function findPlayerByApiIdAndTeam(playerApiId: string, teamId: number): PlayerRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM players WHERE player_api_id = ? AND team_id = ? LIMIT 1');
  return (stmt.get(playerApiId, teamId) as PlayerRow | undefined) ?? null;
}

export function updatePlayer(
  id: number,
  updates: Partial<Pick<PlayerRow, 'lol_pseudo' | 'normalized_lol_pseudo' | 'discord_user_id' | 'discord_username_snapshot' | 'status' | 'is_captain'>>
): void {
  const db = getDatabase();
  const updatedAt = now();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [updatedAt];

  if (updates.lol_pseudo !== undefined) {
    fields.push('lol_pseudo = ?');
    values.push(updates.lol_pseudo);
  }
  if (updates.normalized_lol_pseudo !== undefined) {
    fields.push('normalized_lol_pseudo = ?');
    values.push(updates.normalized_lol_pseudo);
  }
  if (updates.discord_user_id !== undefined) {
    fields.push('discord_user_id = ?');
    values.push(updates.discord_user_id);
  }
  if (updates.discord_username_snapshot !== undefined) {
    fields.push('discord_username_snapshot = ?');
    values.push(updates.discord_username_snapshot);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.is_captain !== undefined) {
    fields.push('is_captain = ?');
    values.push(updates.is_captain);
  }

  if (fields.length === 1) return;
  values.push(id);
  const stmt = db.prepare(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function deletePlayersByTeamId(teamId: number): number {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM players WHERE team_id = ?');
  const info = stmt.run(teamId);
  return info.changes;
}

export function findPlayersByStatus(teamId: number, status: PlayerStatus): PlayerRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM players WHERE team_id = ? AND status = ? ORDER BY id');
  return stmt.all(teamId, status) as PlayerRow[];
}
