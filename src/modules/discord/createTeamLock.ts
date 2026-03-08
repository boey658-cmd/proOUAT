/**
 * Lock applicatif anti double-clic / anti concurrence pour la création d'équipe Discord.
 * Clé : teamApiId + guildId.
 * TTL : un lock expiré (ex. après crash) est considéré libéré après LOCK_TTL_MS.
 */

const LOCK_TTL_MS = 3 * 60 * 1000; // 3 minutes

const lockEntries = new Map<string, number>();

function lockKey(teamApiId: string, guildId: string): string {
  return `${teamApiId}:${guildId}`;
}

function isExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}

function purgeExpired(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [key, expiresAt] of lockEntries) {
    if (expiresAt <= now) toDelete.push(key);
  }
  for (const key of toDelete) lockEntries.delete(key);
}

export function isTeamCreationInProgress(teamApiId: string, guildId: string): boolean {
  purgeExpired();
  const expiresAt = lockEntries.get(lockKey(teamApiId, guildId));
  return expiresAt != null && !isExpired(expiresAt);
}

export function markTeamCreationInProgress(teamApiId: string, guildId: string): boolean {
  purgeExpired();
  const key = lockKey(teamApiId, guildId);
  const existing = lockEntries.get(key);
  if (existing != null && !isExpired(existing)) return false;
  lockEntries.set(key, Date.now() + LOCK_TTL_MS);
  return true;
}

export function clearTeamCreationInProgress(teamApiId: string, guildId: string): void {
  lockEntries.delete(lockKey(teamApiId, guildId));
}
