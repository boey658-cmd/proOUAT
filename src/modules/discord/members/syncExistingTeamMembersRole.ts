/**
 * Synchronisation immédiate des membres déjà présents sur le serveur après création rôle équipe.
 * Réutilise syncMemberTeamRole pour chaque membre trouvé.
 */

import type { Guild } from 'discord.js';
import * as playersRepo from '../../../db/repositories/players.js';
import { syncMemberTeamRole } from './syncMemberTeamRole.js';
import { discordLogger } from '../logger.js';

export interface SyncExistingTeamMembersResult {
  foundOnServer: number;
  roleAdded: number;
  failed: number;
}

/**
 * Pour chaque joueur de l'équipe avec discord_user_id, vérifie s'il est sur le guild et lui attribue le rôle équipe.
 * À appeler après persistTeamDiscordResources (état actif à jour).
 */
export async function syncExistingTeamMembersRole(
  teamId: number,
  guild: Guild
): Promise<SyncExistingTeamMembersResult> {
  const result: SyncExistingTeamMembersResult = {
    foundOnServer: 0,
    roleAdded: 0,
    failed: 0,
  };

  const players = playersRepo.findPlayersByTeamId(teamId);
  const withDiscordId = players.filter(
    (p) => p.discord_user_id != null && String(p.discord_user_id).trim() !== ''
  );

  if (withDiscordId.length === 0) {
    discordLogger.info('syncExistingTeamMembersRole: aucun joueur avec discord_user_id', {
      teamId,
      guildId: guild.id,
    });
    return result;
  }

  for (const player of withDiscordId) {
    const discordUserId = String(player.discord_user_id!).trim();
    try {
      const member = await guild.members.fetch(discordUserId).catch(() => null);
      if (!member) continue;

      result.foundOnServer++;
      const syncResult = await syncMemberTeamRole(member);
      if (syncResult.success) {
        result.roleAdded++;
      } else {
        result.failed++;
      }
    } catch {
      result.failed++;
    }
  }

  discordLogger.info('syncExistingTeamMembersRole: fin', {
    teamId,
    guildId: guild.id,
    foundOnServer: result.foundOnServer,
    roleAdded: result.roleAdded,
    failed: result.failed,
  });

  return result;
}
