/**
 * Configuration Discord (token, client id). Lecture depuis .env uniquement.
 */

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Token du bot Discord (obligatoire pour se connecter).
 */
export function getDiscordToken(): string {
  const token = getEnv('DISCORD_TOKEN');
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new Error('DISCORD_TOKEN doit être défini dans .env');
  }
  return token.trim();
}

/**
 * Client ID de l'application Discord (pour enregistrement des commandes slash).
 */
export function getDiscordClientId(): string {
  const id = getEnv('DISCORD_CLIENT_ID');
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error('DISCORD_CLIENT_ID doit être défini dans .env');
  }
  return id.trim();
}

/**
 * ID du serveur Discord principal (équipes avec rôle/salon déjà créés).
 * Utilisé par /creationchaneldiv pour détecter le contexte.
 */
export function getDiscordGuildId1(): string | null {
  const id = getEnv('DISCORD_GUILD_ID_1');
  if (!id || typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

/**
 * ID du serveur Discord secondaire (création rôle/salon par la commande).
 * Utilisé par /creationchaneldiv pour détecter le contexte.
 */
export function getDiscordGuildId2(): string | null {
  const id = getEnv('DISCORD_GUILD_ID_2');
  if (!id || typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

/**
 * Indique si un guildId est autorisé pour les canaux sensibles (audit, notifications staff).
 * Si les deux guilds principaux sont configurés : seul guildId1 ou guildId2 est accepté.
 * Si aucun n'est configuré : accepte tout (évite de bloquer les déploiements sans commandes).
 */
export function isGuildIdAllowedForChannels(guildId: string): boolean {
  const g1 = getDiscordGuildId1();
  const g2 = getDiscordGuildId2();
  if (!g1 && !g2) return true;
  return g1 === guildId || g2 === guildId;
}
