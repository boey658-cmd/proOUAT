/**
 * Helper pour construire les messages d'audit : indicateur visuel + préfixe module + message.
 * Utilisé partout pour homogénéiser les messages envoyés dans le salon audit.
 */

export type AuditLevel = 'info' | 'success' | 'warn' | 'error';

const ICONS: Record<AuditLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '❌',
};

/** Préfixes de module pour identifier l'origine du message. */
export const AUDIT_PREFIX = {
  REGISTRATION_SYNC: '[Registration Sync]',
  DIVISIONS: '[Divisions]',
  CREATION_TEAM: '[Création Team]',
  DISCORD_RESOURCES: '[Discord Resources]',
  MONITORING: '[Monitoring]',
  BOT: '[Bot]',
} as const;

/**
 * Construit un message d'audit lisible : indicateur + préfixe + message.
 * Normalise les espaces multiples.
 */
export function buildAuditMessage(
  level: AuditLevel,
  prefix: string,
  message: string
): string {
  const icon = ICONS[level];
  const text = `${icon} ${prefix} ${message}`.replace(/\s+/g, ' ').trim();
  return text;
}
