/**
 * Normalisation des données équipes et joueurs (noms, pseudos).
 * Une responsabilité : règles de normalisation pour comparaison et persistance.
 * Aucune valeur métier hardcodée.
 */

import type { NormalizedPlayer, NormalizedTeam } from './types.js';
import type { PlayerRef } from './types.js';

/**
 * Normalise un nom d'équipe : trim, lowercase, espaces multiples réduits.
 */
export function normalizeTeamName(name: string): string {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Normalise un pseudo LoL : trim, NFC (unicode), espaces multiples réduits.
 */
export function normalizeLolPseudo(pseudo: string): string {
  if (typeof pseudo !== 'string') return '';
  const trimmed = pseudo.trim().replace(/\s+/g, ' ');
  try {
    return trimmed.normalize('NFC');
  } catch {
    return trimmed;
  }
}

/**
 * Construit un joueur normalisé à partir d'une ref et des infos utilisateur.
 */
export function buildNormalizedPlayer(
  ref: PlayerRef,
  discordUserId: string | null,
  discordUsername: string | null
): NormalizedPlayer {
  const rawPseudo = ref.pseudo?.trim();
  const lolPseudo = rawPseudo && rawPseudo.length > 0 ? rawPseudo : `Joueur ${ref.id}`;
  const normalized = normalizeLolPseudo(lolPseudo);
  return {
    player_api_id: String(ref.id),
    lol_pseudo: lolPseudo,
    normalized_lol_pseudo: normalized,
    discord_user_id: discordUserId,
    discord_username_snapshot: discordUsername,
    is_captain: ref.isCaptain ?? false,
  };
}

/**
 * Construit une équipe normalisée à partir de l'id, du nom et de la liste de joueurs.
 * Nom retenu : tout nom non vide (après trim) ; fallback Team-{teamApiId} uniquement si vide/null/undefined.
 */
export function buildNormalizedTeam(
  teamApiId: string,
  teamName: string,
  players: NormalizedPlayer[]
): NormalizedTeam {
  const id = String(teamApiId).trim() || '?';
  const trimmed = teamName != null && typeof teamName === 'string' ? teamName.trim() : '';
  const safeName = trimmed.length > 0 ? trimmed : `Team-${id}`;
  const normalizedTeamName = normalizeTeamName(safeName);
  return {
    team_api_id: id,
    team_name: safeName,
    normalized_team_name: normalizedTeamName,
    players: [...players],
  };
}
