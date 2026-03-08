/**
 * Configuration des limites Discord et rôles staff. Lecture depuis .env uniquement.
 */

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * IDs des rôles Discord autorisés à utiliser les actions staff (boutons, commandes).
 * Format .env : virgules, ex. "123,456,789"
 */
export function getAllowedStaffRoleIds(): string[] {
  const raw = getEnv('ALLOWED_STAFF_ROLE_IDS');
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Nom de base des catégories équipe (ex. S21 → S21, S21-2, S21-3...).
 */
export function getCategoryTeamBaseName(): string {
  const name = getEnv('CATEGORY_TEAM_BASE_NAME');
  if (name && typeof name === 'string' && name.trim() !== '') return name.trim();
  return 'S21';
}

/**
 * Nombre max de salons par catégorie avant d'utiliser une catégorie suivante.
 */
export function getCategoryMaxChannelsSafeLimit(): number {
  const raw = getEnv('CATEGORY_MAX_CHANNELS_SAFE_LIMIT');
  if (raw == null || raw === '') return 50;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return 50;
  return n;
}

/**
 * Seuil sous lequel on considère qu'on peut encore créer des rôles.
 */
export function getDiscordRoleLimitSafeThreshold(): number {
  const raw = getEnv('DISCORD_ROLE_LIMIT_SAFE_THRESHOLD');
  if (raw == null || raw === '') return 240;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return 240;
  return n;
}

/**
 * Seuil sous lequel on considère qu'on peut encore créer des salons.
 */
export function getDiscordChannelLimitSafeThreshold(): number {
  const raw = getEnv('DISCORD_CHANNEL_LIMIT_SAFE_THRESHOLD');
  if (raw == null || raw === '') return 480;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return 480;
  return n;
}
