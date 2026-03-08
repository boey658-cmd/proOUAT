/**
 * Repository user_cache : lecture/écriture du cache persistant utilisateur API.
 * Une responsabilité : éviter les appels /user/{id} redondants.
 */

import { getDatabase } from '../database.js';
import type { UserCacheRow, UserCacheInsert } from '../types.js';

function now(): string {
  return new Date().toISOString();
}

export function findUserCacheByApiId(userApiId: string): UserCacheRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM user_cache WHERE user_api_id = ?');
  return (stmt.get(userApiId) as UserCacheRow | undefined) ?? null;
}

export function upsertUserCache(row: UserCacheInsert): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO user_cache (user_api_id, discord_id, username, last_fetched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_api_id) DO UPDATE SET
      discord_id = excluded.discord_id,
      username = excluded.username,
      last_fetched_at = excluded.last_fetched_at
  `);
  stmt.run(
    row.user_api_id,
    row.discord_id ?? null,
    row.username ?? null,
    row.last_fetched_at
  );
}

export function saveUserCacheAfterFetch(
  userApiId: string,
  discordId: string | null,
  username: string | null
): void {
  upsertUserCache({
    user_api_id: userApiId,
    discord_id: discordId,
    username: username,
    last_fetched_at: now(),
  });
}
