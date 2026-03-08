/**
 * Repository discord_resources : CRUD et requêtes par team, guild, type.
 * Une responsabilité : accès données table discord_resources.
 */

import { getDatabase } from '../database.js';
import type { DiscordResourceRow, DiscordResourceType, DiscordResourceInsert } from '../types.js';

function now(): string {
  return new Date().toISOString();
}

export function insertDiscordResource(row: DiscordResourceInsert): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO discord_resources (
      team_id, discord_guild_id, resource_type, discord_resource_id,
      resource_name, is_active, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    row.team_id,
    row.discord_guild_id,
    row.resource_type,
    row.discord_resource_id,
    row.resource_name,
    row.is_active,
    row.metadata_json ?? null,
    row.created_at,
    row.updated_at
  );
  return info.lastInsertRowid as number;
}

export function findDiscordResourceById(id: number): DiscordResourceRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM discord_resources WHERE id = ?');
  return (stmt.get(id) as DiscordResourceRow | undefined) ?? null;
}

export function findDiscordResourcesByTeamId(teamId: number): DiscordResourceRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM discord_resources WHERE team_id = ? ORDER BY id');
  return stmt.all(teamId) as DiscordResourceRow[];
}

export function findActiveDiscordResourcesByTeamAndGuild(
  teamId: number,
  discordGuildId: string
): DiscordResourceRow[] {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT * FROM discord_resources WHERE team_id = ? AND discord_guild_id = ? AND is_active = 1 ORDER BY id'
  );
  return stmt.all(teamId, discordGuildId) as DiscordResourceRow[];
}

export function findDiscordResourceByGuildAndTypeAndId(
  discordGuildId: string,
  resourceType: DiscordResourceType,
  discordResourceId: string
): DiscordResourceRow | null {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT * FROM discord_resources WHERE discord_guild_id = ? AND resource_type = ? AND discord_resource_id = ? LIMIT 1'
  );
  return (stmt.get(discordGuildId, resourceType, discordResourceId) as DiscordResourceRow | undefined) ?? null;
}

export function markDiscordResourceInactive(id: number): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE discord_resources SET is_active = 0, updated_at = ? WHERE id = ?');
  stmt.run(now(), id);
}

export function findActiveResourcesByGuildAndType(
  discordGuildId: string,
  resourceType: DiscordResourceType
): DiscordResourceRow[] {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT * FROM discord_resources WHERE discord_guild_id = ? AND resource_type = ? AND is_active = 1 ORDER BY id'
  );
  return stmt.all(discordGuildId, resourceType) as DiscordResourceRow[];
}

export function updateDiscordResource(
  id: number,
  updates: Partial<Pick<DiscordResourceRow, 'resource_name' | 'is_active' | 'metadata_json'>>
): void {
  const db = getDatabase();
  const updatedAt = now();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [updatedAt];

  if (updates.resource_name !== undefined) {
    fields.push('resource_name = ?');
    values.push(updates.resource_name);
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active);
  }
  if (updates.metadata_json !== undefined) {
    fields.push('metadata_json = ?');
    values.push(updates.metadata_json);
  }

  if (fields.length === 1) return;
  values.push(id);
  const stmt = db.prepare(`UPDATE discord_resources SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}
