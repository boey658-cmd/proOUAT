/**
 * Configuration des salons Discord (channels). Lecture depuis .env uniquement.
 */

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * ID du salon où envoyer les notifications de nouvelles équipes.
 * Priorité : STAFF_NEW_TEAM_CHANNEL_ID puis NEW_TEAM_CHANNEL_ID.
 */
export function getStaffNewTeamChannelId(): string | null {
  const id =
    getEnv('STAFF_NEW_TEAM_CHANNEL_ID') ?? getEnv('NEW_TEAM_CHANNEL_ID');
  if (!id || typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

/**
 * ID du salon où archiver les messages "équipe créée" (sans bouton).
 */
export function getStaffArchiveTeamChannelId(): string | null {
  const id = getEnv('STAFF_ARCHIVE_TEAM_CHANNEL_ID');
  if (!id || typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

/**
 * ID du salon où envoyer les logs d'audit (résumés, erreurs importantes) pour le staff.
 * Si non défini ou vide, les envois d'audit sont ignorés sans erreur.
 */
export function getAuditLogChannelId(): string | null {
  const id = getEnv('AUDIT_LOG_CHANNEL_ID');
  if (!id || typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

/**
 * Délai optionnel en ms entre chaque envoi de notification Discord.
 * 0 = pas de délai (défaut). Si > 0, attendre ce délai entre chaque message.
 */
export function getDiscordNotificationDelayMs(): number {
  const raw = getEnv('DISCORD_NOTIFICATION_DELAY_MS');
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
