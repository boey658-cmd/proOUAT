/**
 * Gestion de l'événement "membre rejoint le serveur" : attribution automatique du rôle équipe.
 * Une responsabilité : appeler la synchro rôle et logger le résultat.
 */

import type { GuildMember } from 'discord.js';
import { syncMemberTeamRole } from './syncMemberTeamRole.js';
import { discordLogger } from '../logger.js';

/**
 * Appelé quand un membre rejoint un serveur.
 * Récupère le discord_user_id (member.id), cherche le joueur en base,
 * si équipe avec rôle actif sur ce guild → attribue le rôle.
 */
export async function handleGuildMemberJoin(member: GuildMember): Promise<void> {
  const discordUserId = member.id;
  const guildId = member.guild.id;

  discordLogger.info('handleGuildMemberJoin: membre rejoint', {
    discordUserId,
    guildId,
    username: member.user.username,
  });

  try {
    const result = await syncMemberTeamRole(member);
    if (result.success) {
      if (result.reason === 'déjà attribué') {
        discordLogger.info('handleGuildMemberJoin: rôle déjà présent', {
          discordUserId,
          guildId,
          roleId: result.roleId,
        });
      } else {
        discordLogger.info('handleGuildMemberJoin: rôle attribué', {
          discordUserId,
          guildId,
          roleId: result.roleId,
        });
      }
    } else {
      discordLogger.info('handleGuildMemberJoin: aucune action', {
        discordUserId,
        guildId,
        reason: result.reason,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('handleGuildMemberJoin: erreur', {
      discordUserId,
      guildId,
      message,
    });
  }
}
