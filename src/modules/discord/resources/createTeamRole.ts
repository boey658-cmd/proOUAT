/**
 * Création du rôle équipe sur le serveur Discord.
 * Une responsabilité : créer un rôle avec nom sûr et permissions minimales.
 */

import type { Guild } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { slugifyRoleName } from './slugify.js';
import { discordLogger } from '../logger.js';

/**
 * Crée un rôle équipe (nom dérivé du nom d'équipe, sans permissions sensibles).
 */
export async function createTeamRole(guild: Guild, teamName: string): Promise<string> {
  const name = slugifyRoleName(teamName);
  const role = await guild.roles.create({
    name: name || 'equipe',
    permissions: [],
    reason: 'Création équipe inscription',
  });
  discordLogger.info('createTeamRole: rôle créé', {
    guildId: guild.id,
    roleId: role.id,
    name: role.name,
  });
  return role.id;
}
