/**
 * Création du salon texte équipe dans une catégorie.
 * Une responsabilité : créer le salon avec permissions minimales (staff + rôle équipe).
 */

import type { Guild } from 'discord.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { slugifyChannelName } from './slugify.js';
import { getAllowedStaffRoleIds } from '../../../config/index.js';
import { discordLogger } from '../logger.js';

/**
 * Crée un salon texte pour l'équipe dans la catégorie donnée.
 * Permissions : rôle équipe (si fourni) et rôles staff peuvent voir le salon.
 */
export async function createTeamChannel(
  guild: Guild,
  categoryId: string,
  teamName: string,
  teamRoleId: string | null
): Promise<string> {
  const name = slugifyChannelName(teamName);
  const staffRoleIds = getAllowedStaffRoleIds();

  const permissionOverwrites: { id: string; allow: bigint; deny: bigint; type: 0 | 1 }[] = [];
  const everyoneRole = guild.roles.everyone;
  if (everyoneRole) {
    permissionOverwrites.push({
      id: everyoneRole.id,
      allow: 0n,
      deny: PermissionFlagsBits.ViewChannel,
      type: 0,
    });
  }
  if (teamRoleId) {
    permissionOverwrites.push({
      id: teamRoleId,
      allow: PermissionFlagsBits.ViewChannel,
      deny: 0n,
      type: 0,
    });
  }
  for (const roleId of staffRoleIds) {
    if (roleId && roleId !== teamRoleId) {
      permissionOverwrites.push({
        id: roleId,
        allow: PermissionFlagsBits.ViewChannel,
        deny: 0n,
        type: 0,
      });
    }
  }

  const channel = await guild.channels.create({
    name: name || 'equipe',
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: permissionOverwrites.map((p) => ({
      id: p.id,
      allow: p.allow,
      deny: p.deny,
      type: p.type,
    })),
    reason: 'Création équipe inscription',
  });
  discordLogger.info('createTeamChannel: salon créé', {
    guildId: guild.id,
    channelId: channel.id,
    name: channel.name,
    categoryId,
  });
  return channel.id;
}
