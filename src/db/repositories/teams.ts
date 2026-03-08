/**
 * Repository teams : CRUD et requêtes par team_api_id, division, guild.
 * Une responsabilité : accès données table teams.
 */

import { getDatabase } from '../database.js';
import type { TeamRow, TeamStatus, TeamInsert } from '../types.js';

function now(): string {
  return new Date().toISOString();
}

export function insertTeam(row: TeamInsert): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO teams (
      team_api_id, team_name, normalized_team_name, status,
      first_seen_at, last_seen_at, last_synced_at,
      division_number, division_group, current_guild_id, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    row.team_api_id,
    row.team_name,
    row.normalized_team_name,
    row.status,
    row.first_seen_at,
    row.last_seen_at,
    row.last_synced_at ?? null,
    row.division_number ?? null,
    row.division_group ?? null,
    row.current_guild_id ?? null,
    row.notes ?? null,
    row.created_at,
    row.updated_at
  );
  return info.lastInsertRowid as number;
}

export function findTeamById(id: number): TeamRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM teams WHERE id = ?');
  return (stmt.get(id) as TeamRow | undefined) ?? null;
}

export function findTeamByApiId(teamApiId: string): TeamRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM teams WHERE team_api_id = ?');
  return (stmt.get(teamApiId) as TeamRow | undefined) ?? null;
}

export function findTeamByNormalizedName(normalizedName: string): TeamRow | null {
  if (!normalizedName || typeof normalizedName !== 'string') return null;
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM teams WHERE normalized_team_name = ? LIMIT 1');
  return (stmt.get(normalizedName.trim()) as TeamRow | undefined) ?? null;
}

export function updateTeam(
  id: number,
  updates: Partial<Pick<TeamRow, 'team_name' | 'normalized_team_name' | 'status' | 'last_seen_at' | 'last_synced_at' | 'division_number' | 'division_group' | 'current_guild_id' | 'notes'>>
): void {
  const db = getDatabase();
  const updatedAt = now();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [updatedAt];

  if (updates.team_name !== undefined) {
    fields.push('team_name = ?');
    values.push(updates.team_name);
  }
  if (updates.normalized_team_name !== undefined) {
    fields.push('normalized_team_name = ?');
    values.push(updates.normalized_team_name);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.last_seen_at !== undefined) {
    fields.push('last_seen_at = ?');
    values.push(updates.last_seen_at);
  }
  if (updates.last_synced_at !== undefined) {
    fields.push('last_synced_at = ?');
    values.push(updates.last_synced_at);
  }
  if (updates.division_number !== undefined) {
    fields.push('division_number = ?');
    values.push(updates.division_number);
  }
  if (updates.division_group !== undefined) {
    fields.push('division_group = ?');
    values.push(updates.division_group);
  }
  if (updates.current_guild_id !== undefined) {
    fields.push('current_guild_id = ?');
    values.push(updates.current_guild_id);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }

  if (fields.length === 1) return;
  values.push(id);
  const stmt = db.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function updateLastSeenAt(id: number, lastSeenAt: string): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE teams SET last_seen_at = ?, updated_at = ? WHERE id = ?');
  stmt.run(lastSeenAt, now(), id);
}

export function findAllTeams(): TeamRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM teams ORDER BY id');
  return stmt.all() as TeamRow[];
}

export function findTeamsByStatus(status: TeamStatus): TeamRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM teams WHERE status = ? ORDER BY id');
  return stmt.all(status) as TeamRow[];
}

/**
 * Retourne les équipes dont le statut est dans la liste donnée (utilise idx_teams_status).
 */
export function findTeamsWithStatusIn(statuses: TeamStatus[]): TeamRow[] {
  if (!statuses?.length) return [];
  const db = getDatabase();
  const placeholders = statuses.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM teams WHERE status IN (${placeholders}) ORDER BY id`);
  return stmt.all(...statuses) as TeamRow[];
}

export function findTeamsByDivision(divisionNumber: number): TeamRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM teams WHERE division_number = ? ORDER BY division_group, id');
  return stmt.all(divisionNumber) as TeamRow[];
}

export function findTeamsByCurrentGuild(guildId: string): TeamRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM teams WHERE current_guild_id = ? ORDER BY id');
  return stmt.all(guildId) as TeamRow[];
}
