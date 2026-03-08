/**
 * Création du rôle équipe sur le serveur Discord.
 * Une responsabilité : créer un rôle avec nom sûr, permissions minimales, mentionnable, et optionnellement le positionner.
 */

import type { Guild, Role } from 'discord.js';
import { slugifyRoleName } from './slugify.js';
import { getTeamRolePositionAboveRoleId } from '../../../config/index.js';
import { discordLogger } from '../logger.js';

/**
 * Tente de placer le rôle créé juste au-dessus du rôle cible (même guilde, avec permissions).
 * En cas d'échec : warning, pas d'exception.
 */
async function trySetRolePositionAboveTarget(
  guild: Guild,
  createdRole: Role,
  targetRoleId: string
): Promise<void> {
  if (targetRoleId.trim() === '') return;
  let targetRole: Role | null = null;
  try {
    targetRole = await guild.roles.fetch(targetRoleId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.warn('createTeamRole: rôle cible introuvable pour position', {
      guildId: guild.id,
      targetRoleId,
      message,
    });
    return;
  }
  if (!targetRole) {
    discordLogger.warn('createTeamRole: rôle cible inexistant dans la guilde', {
      guildId: guild.id,
      targetRoleId,
    });
    return;
  }
  if (targetRole.guild.id !== guild.id) {
    discordLogger.warn('createTeamRole: rôle cible sur une autre guilde, skip position', {
      guildId: guild.id,
      targetRoleId,
    });
    return;
  }
  try {
    const position = targetRole.position + 1;
    await createdRole.setPosition(position, { reason: 'Position rôle équipe (au-dessus du rôle cible)' });
    discordLogger.info('createTeamRole: rôle positionné', {
      guildId: guild.id,
      roleId: createdRole.id,
      position,
      targetRoleId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.warn('createTeamRole: impossible de positionner le rôle', {
      guildId: guild.id,
      roleId: createdRole.id,
      targetRoleId,
      message,
    });
  }
}

/**
 * Crée un rôle équipe (nom dérivé du nom d'équipe, sans permissions sensibles, mentionnable).
 * Tente de le placer juste au-dessus du rôle configuré (TEAM_ROLE_POSITION_ABOVE_ROLE_ID) si défini.
 */
export async function createTeamRole(guild: Guild, teamName: string): Promise<string> {
  const name = slugifyRoleName(teamName);
  const role = await guild.roles.create({
    name: name || 'equipe',
    permissions: [],
    mentionable: true,
    reason: 'Création équipe inscription',
  });
  discordLogger.info('createTeamRole: rôle créé', {
    guildId: guild.id,
    roleId: role.id,
    name: role.name,
  });

  const targetRoleId = getTeamRolePositionAboveRoleId();
  if (targetRoleId) {
    await trySetRolePositionAboveTarget(guild, role, targetRoleId);
  }

  return role.id;
}
