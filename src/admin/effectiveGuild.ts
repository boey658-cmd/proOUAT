/**
 * Guilde effective pour une équipe : une seule règle métier (active_guild_id puis current_guild_id).
 */

import type { TeamRow } from '../db/types.js';
import type { TeamDiscordStateRow } from '../db/types.js';

export function resolveEffectiveGuildId(
  activeGuildId: string | null | undefined,
  currentGuildId: string | null | undefined
): string | null {
  const a = (activeGuildId ?? '').trim();
  const c = (currentGuildId ?? '').trim();
  if (a) return a;
  if (c) return c;
  return null;
}

/**
 * À utiliser partout où l’on a la ligne `teams` + l’état Discord optionnel.
 */
export function resolveEffectiveGuildIdForTeam(
  team: Pick<TeamRow, 'current_guild_id'>,
  discordState: Pick<TeamDiscordStateRow, 'active_guild_id'> | null | undefined
): string | null {
  return resolveEffectiveGuildId(discordState?.active_guild_id ?? null, team.current_guild_id);
}
