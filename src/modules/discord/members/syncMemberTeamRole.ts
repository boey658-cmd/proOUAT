/**
 * Attribution du rôle équipe à un membre si celui-ci appartient à une équipe avec rôle actif sur ce serveur.
 * Une responsabilité : résolution joueur → équipe → rôle actif, puis attribution (rôles existants uniquement).
 * Ne log "rôle attribué" que si le rôle est réellement présent sur le membre après l'opération.
 */

import type { GuildMember } from 'discord.js';
import * as playersRepo from '../../../db/repositories/players.js';
import * as teamDiscordStateRepo from '../../../db/repositories/teamDiscordState.js';
import { discordLogger } from '../logger.js';

export interface SyncMemberTeamRoleResult {
  /** Rôle attribué avec succès (confirmé présent sur le membre). */
  success: boolean;
  /** ID du rôle attribué si succès. */
  roleId?: string;
  /** Raison en cas d'échec ou d'absence d'action. */
  reason?: string;
}

function getBotHighestRolePosition(guild: GuildMember['guild']): number | null {
  const me = guild.members.me;
  if (!me) return null;
  const positions = me.roles.cache.map((r) => r.position);
  return positions.length === 0 ? null : Math.max(...positions);
}

/**
 * Vérifie si le membre appartient à une équipe avec rôle actif sur ce guild et lui attribue le rôle.
 * N'utilise que des rôles déjà créés (pas de création ici).
 * Succès uniquement si le rôle est confirmé présent sur le membre après l'opération.
 */
export async function syncMemberTeamRole(member: GuildMember): Promise<SyncMemberTeamRoleResult> {
  const discordUserId = member.id;
  const guildId = member.guild.id;

  const player = playersRepo.findPlayerByDiscordUserId(discordUserId);
  if (!player) {
    return { success: false, reason: 'joueur non trouvé en base' };
  }

  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(player.team_id);
  if (!state || state.active_guild_id !== guildId) {
    return { success: false, reason: 'équipe sans état actif sur ce serveur' };
  }

  if (!state.active_role_id || state.active_role_id.trim() === '') {
    return { success: false, reason: 'équipe sans rôle actif (mode dégradé)' };
  }

  const roleId = state.active_role_id;
  const role = member.guild.roles.cache.get(roleId) ?? (await member.guild.roles.fetch(roleId).catch(() => null));
  const botHighestPosition = getBotHighestRolePosition(member.guild);
  const targetRolePosition = role?.position ?? null;
  const manageable = role?.editable ?? false;
  const hasRoleBefore = member.roles.cache.has(roleId);

  if (hasRoleBefore) {
    return { success: true, roleId, reason: 'déjà attribué' };
  }

  discordLogger.info('syncMemberTeamRole: avant ajout', {
    guildId,
    memberId: member.id,
    roleId,
    hasRoleBefore,
    botRolePosition: botHighestPosition,
    targetRolePosition,
    manageable,
  });

  try {
    await member.roles.add(roleId, 'Attribution automatique rôle équipe');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('syncMemberTeamRole: erreur lors de member.roles.add', {
      guildId,
      memberId: member.id,
      roleId,
      botRolePosition: botHighestPosition,
      targetRolePosition,
      manageable,
      message,
    });
    return { success: false, reason: message };
  }

  const refreshed = await member.fetch().catch(() => null);
  const memberToCheck = refreshed ?? member;
  const hasRoleAfter = memberToCheck.roles.cache.has(roleId);

  if (hasRoleAfter) {
    discordLogger.info('syncMemberTeamRole: rôle attribué confirmé', {
      guildId,
      memberId: member.id,
      roleId,
      teamId: player.team_id,
    });
    return { success: true, roleId };
  }

  discordLogger.warn('syncMemberTeamRole: rôle non présent après tentative (hiérarchie ou permission)', {
    guildId,
    memberId: member.id,
    roleId,
    botRolePosition: botHighestPosition,
    targetRolePosition,
    manageable,
    refetched: refreshed != null,
  });
  return { success: false, reason: 'rôle non présent après add (vérifier hiérarchie Discord)' };
}
