/**
 * Synchronisation immédiate des membres déjà présents sur le serveur après création rôle équipe.
 * Traite joueurs et staff (tous deux en base) et leur attribue le rôle équipe.
 */

import type { Guild } from 'discord.js';
import * as playersRepo from '../../../db/repositories/players.js';
import { syncMemberTeamRole } from './syncMemberTeamRole.js';
import { discordLogger } from '../logger.js';

export interface SyncExistingTeamMembersResult {
  foundOnServer: number;
  roleAdded: number;
  failed: number;
  /** Joueurs trouvés sur le serveur. */
  foundPlayers: number;
  /** Staff trouvés sur le serveur. */
  foundStaff: number;
  /** Rôles ajoutés aux joueurs. */
  roleAddedPlayers: number;
  /** Rôles ajoutés au staff. */
  roleAddedStaff: number;
}

/**
 * Pour chaque membre de l'équipe (joueurs + staff) avec discord_user_id, vérifie s'il est sur le guild et lui attribue le rôle équipe.
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
    foundPlayers: 0,
    foundStaff: 0,
    roleAddedPlayers: 0,
    roleAddedStaff: 0,
  };

  const members = playersRepo.findPlayersByTeamId(teamId);
  const withDiscordId = members.filter(
    (p) => p.discord_user_id != null && String(p.discord_user_id).trim() !== ''
  );

  if (withDiscordId.length === 0) {
    discordLogger.info('syncExistingTeamMembersRole: aucun membre (joueur ou staff) avec discord_user_id', {
      teamId,
      guildId: guild.id,
    });
    return result;
  }

  const playerCount = withDiscordId.filter((p) => (p.is_staff ?? 0) === 0).length;
  const staffCount = withDiscordId.filter((p) => (p.is_staff ?? 0) === 1).length;
  discordLogger.info('syncExistingTeamMembersRole: joueurs trouvés', { count: playerCount, teamId, guildId: guild.id });
  if (staffCount > 0) {
    discordLogger.info('syncExistingTeamMembersRole: staff trouvés', { count: staffCount, teamId, guildId: guild.id });
  }

  for (const row of withDiscordId) {
    const discordUserId = String(row.discord_user_id!).trim();
    const isStaff = (row.is_staff ?? 0) === 1;
    const displayName = row.lol_pseudo || row.discord_username_snapshot || discordUserId;

    try {
      const member = await guild.members.fetch(discordUserId).catch(() => null);
      if (!member) {
        discordLogger.info(isStaff ? 'syncExistingTeamMembersRole: staff non trouvé sur le serveur' : 'syncExistingTeamMembersRole: joueur non trouvé sur le serveur', {
          [isStaff ? 'staffName' : 'playerName']: displayName,
          discordUserId,
          teamId,
        });
        result.failed++;
        continue;
      }

      if (isStaff) {
        result.foundStaff++;
      } else {
        result.foundPlayers++;
      }
      result.foundOnServer++;

      const syncResult = await syncMemberTeamRole(member);
      if (syncResult.success) {
        result.roleAdded++;
        if (isStaff) {
          result.roleAddedStaff++;
          discordLogger.info('syncExistingTeamMembersRole: rôle ajouté au staff', {
            memberId: member.id,
            teamId,
            staffName: displayName,
          });
        } else {
          result.roleAddedPlayers++;
        }
      } else {
        result.failed++;
      }
    } catch {
      result.failed++;
      discordLogger.warn('syncExistingTeamMembersRole: erreur lors du sync rôle', {
        [isStaff ? 'staffName' : 'playerName']: displayName,
        discordUserId,
        teamId,
      });
    }
  }

  discordLogger.info('syncExistingTeamMembersRole: fin', {
    teamId,
    guildId: guild.id,
    foundPlayers: result.foundPlayers,
    foundStaff: result.foundStaff,
    roleAddedPlayers: result.roleAddedPlayers,
    roleAddedStaff: result.roleAddedStaff,
    failed: result.failed,
  });

  return result;
}
