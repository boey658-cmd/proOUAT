/**
 * Construction et parsing du customId du bouton "Créer la team".
 * Une responsabilité : format sécurisé et structuré (prefix + team_api_id).
 */

const PREFIX = 'createteam:';
const MAX_PAYLOAD_LENGTH = 89; // 100 - len(PREFIX)

/**
 * Construit le customId du bouton (sans caractères dangereux, longueur limitée).
 */
export function encodeCreateTeamCustomId(teamApiId: string): string {
  if (!teamApiId || typeof teamApiId !== 'string') return '';
  const safe = teamApiId.trim().replace(/:/g, '-').slice(0, MAX_PAYLOAD_LENGTH);
  return PREFIX + safe;
}

/**
 * Vérifie si un customId correspond au bouton "Créer la team".
 */
export function isCreateTeamCustomId(customId: string): boolean {
  return typeof customId === 'string' && customId.startsWith(PREFIX);
}

/**
 * Extrait le team_api_id depuis le customId. Retourne null si invalide.
 */
export function decodeCreateTeamCustomId(customId: string): string | null {
  if (!isCreateTeamCustomId(customId)) return null;
  const payload = customId.slice(PREFIX.length).trim();
  return payload.length > 0 ? payload : null;
}
