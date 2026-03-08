/**
 * Création des rôles et salons d'équipes sur le serveur secondaire (serveur 2).
 * Une responsabilité : créer catégorie division, rôle, salon, permissions, persistance et passage en actif.
 */

import type { Guild } from 'discord.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getAllowedStaffRoleIds } from '../../config/index.js';
import * as discordResourcesRepo from '../../db/repositories/discordResources.js';
import * as teamDiscordStateRepo from '../../db/repositories/teamDiscordState.js';
import * as teamsRepo from '../../db/repositories/teams.js';
import type { TeamRow } from '../../db/types.js';
import { createDivisionCategoryIfNotExists } from './createDivisionStructure.js';
import { createOrSyncTeamVoiceChannel } from './createOrSyncTeamVoiceChannel.js';
import { formatDivisionRoleName, formatDivisionChannelName, getDivisionCategoryName, groupLabelToSortKey } from './utils.js';
import { divisionsLogger } from './logger.js';
import type { DiscordLimitsCheck } from '../discord/resources/checkDiscordLimits.js';
import { checkDiscordLimits } from '../discord/resources/checkDiscordLimits.js';

export interface CreateTeamResourcesForTeamResult {
  teamId: number;
  teamName: string;
  roleCreated: boolean;
  channelCreated: boolean;
  voiceChannelSynced: boolean;
  roleId: string | null;
  channelId: string | null;
  categoryId: string;
  warnings: string[];
  error?: string;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Marque comme inactives toutes les ressources de l'équipe sur d'autres guilds.
 */
function markOtherGuildResourcesInactive(teamId: number, currentGuildId: string): void {
  const resources = discordResourcesRepo.findDiscordResourcesByTeamId(teamId);
  for (const r of resources) {
    if (r.discord_guild_id !== currentGuildId && r.is_active === 1) {
      discordResourcesRepo.markDiscordResourceInactive(r.id);
      divisionsLogger.info('createTeamResourcesForGuild: ressource marquée inactive', {
        teamId,
        resourceId: r.id,
        guildId: r.discord_guild_id,
      });
    }
  }
}

/**
 * Crée le rôle et le salon pour une équipe sur le serveur (serveur 2), enregistre en base et met à jour l'état actif.
 */
export async function createTeamResourcesForTeam(
  guild: Guild,
  team: TeamRow,
  divisionNumber: number,
  divisionGroup: string,
  categoryId: string,
  limits: DiscordLimitsCheck
): Promise<CreateTeamResourcesForTeamResult> {
  const result: CreateTeamResourcesForTeamResult = {
    teamId: team.id,
    teamName: team.team_name,
    roleCreated: false,
    channelCreated: false,
    voiceChannelSynced: false,
    roleId: null,
    channelId: null,
    categoryId,
    warnings: [],
  };

  const roleName = formatDivisionRoleName(divisionNumber, divisionGroup, team.team_name);
  const channelName = formatDivisionChannelName(divisionNumber, divisionGroup, team.team_name);

  let roleId: string | null = null;

  if (limits.canCreateRole) {
    try {
      const role = await guild.roles.create({
        name: roleName.slice(0, 100),
        permissions: [],
        reason: 'Création division /creationchaneldiv (serveur secondaire)',
      });
      roleId = role.id;
      result.roleCreated = true;
      result.roleId = roleId;
      divisionsLogger.info('createTeamResourcesForTeam: rôle créé', {
        teamId: team.id,
        roleId,
        roleName,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`Rôle : ${message}`);
      divisionsLogger.error('createTeamResourcesForTeam: erreur création rôle', {
        teamId: team.id,
        message,
      });
    }
  } else {
    result.warnings.push('Limite rôles atteinte, rôle non créé');
    divisionsLogger.warn('createTeamResourcesForTeam: limite rôles', { teamId: team.id });
  }

  if (!limits.canCreateChannel) {
    result.error = 'Limite salons atteinte';
    result.warnings.push('Limite salons atteinte, salon non créé');
    divisionsLogger.warn('createTeamResourcesForTeam: limite salons', { teamId: team.id });
    return result;
  }

  try {
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
    if (roleId) {
      permissionOverwrites.push({
        id: roleId,
        allow: PermissionFlagsBits.ViewChannel,
        deny: 0n,
        type: 0,
      });
    }
    for (const sid of staffRoleIds) {
      if (sid && sid !== roleId) {
        permissionOverwrites.push({
          id: sid,
          allow: PermissionFlagsBits.ViewChannel,
          deny: 0n,
          type: 0,
        });
      }
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: permissionOverwrites.map((p) => ({
        id: p.id,
        allow: p.allow,
        deny: p.deny,
        type: p.type,
      })),
      reason: 'Création division /creationchaneldiv (serveur secondaire)',
    });

    result.channelCreated = true;
    result.channelId = channel.id;
    divisionsLogger.info('createTeamResourcesForTeam: salon créé', {
      teamId: team.id,
      channelId: channel.id,
      channelName,
    });

    const ts = now();
    const categoryName = getDivisionCategoryName(divisionNumber);

    const categoryAlreadyStored = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
      guild.id,
      'category',
      categoryId
    );
    if (!categoryAlreadyStored) {
      discordResourcesRepo.insertDiscordResource({
        team_id: team.id,
        discord_guild_id: guild.id,
        resource_type: 'category',
        discord_resource_id: categoryId,
        resource_name: categoryName,
        is_active: 1,
        metadata_json: null,
        created_at: ts,
        updated_at: ts,
      });
    }

    discordResourcesRepo.insertDiscordResource({
      team_id: team.id,
      discord_guild_id: guild.id,
      resource_type: 'channel',
      discord_resource_id: channel.id,
      resource_name: team.team_name,
      is_active: 1,
      metadata_json: null,
      created_at: ts,
      updated_at: ts,
    });

    if (roleId) {
      discordResourcesRepo.insertDiscordResource({
        team_id: team.id,
        discord_guild_id: guild.id,
        resource_type: 'role',
        discord_resource_id: roleId,
        resource_name: team.team_name,
        is_active: 1,
        metadata_json: null,
        created_at: ts,
        updated_at: ts,
      });
    }

    markOtherGuildResourcesInactive(team.id, guild.id);

    teamDiscordStateRepo.upsertTeamDiscordState(team.id, {
      active_guild_id: guild.id,
      active_role_id: roleId,
      active_channel_id: channel.id,
      active_category_id: categoryId,
    });

    teamsRepo.updateTeam(team.id, {
      current_guild_id: guild.id,
      status: 'active',
    });

    divisionsLogger.info('createTeamResourcesForTeam: ressources enregistrées', {
      teamId: team.id,
      guildId: guild.id,
      roleId,
      channelId: channel.id,
    });

    const voiceResult = await createOrSyncTeamVoiceChannel({
      guild,
      categoryId,
      channelName,
      teamRoleId: roleId,
      logContext: {
        teamId: team.id,
        team_api_id: team.team_api_id,
        teamName: team.team_name,
      },
    });
    if (voiceResult.success) result.voiceChannelSynced = true;
    else if (voiceResult.error) result.warnings.push(`Vocal : ${voiceResult.error}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    result.warnings.push(`Salon / base : ${message}`);
    divisionsLogger.error('createTeamResourcesForTeam: erreur', {
      teamId: team.id,
      message,
    });
  }

  return result;
}

/**
 * Crée les ressources (catégories, rôles, salons) pour toutes les équipes de la division sur le serveur secondaire.
 */
export async function createTeamResourcesForDivisionOnGuild(
  guild: Guild,
  teams: TeamRow[],
  divisionNumber: number
): Promise<{
  rolesCreated: number;
  channelsCreated: number;
  results: CreateTeamResourcesForTeamResult[];
  limits: DiscordLimitsCheck;
}> {
  const limits = checkDiscordLimits(guild);

  if (limits.roleLimitReached) {
    divisionsLogger.warn('createTeamResourcesForDivisionOnGuild: limite rôles atteinte', {
      guildId: guild.id,
      current: limits.currentRoleCount,
      threshold: limits.currentRoleCount,
    });
  }
  if (limits.channelLimitReached) {
    divisionsLogger.warn('createTeamResourcesForDivisionOnGuild: limite salons atteinte', {
      guildId: guild.id,
      current: limits.currentChannelCount,
    });
  }

  const results: CreateTeamResourcesForTeamResult[] = [];

  const sortedTeams = [...teams].sort((a, b) => {
    const groupA = groupLabelToSortKey((a.division_group ?? '').trim());
    const groupB = groupLabelToSortKey((b.division_group ?? '').trim());
    if (groupA !== groupB) return groupA - groupB;
    return (a.team_name ?? '').localeCompare(b.team_name ?? '', undefined, { sensitivity: 'base' });
  });

  const { categoryId } = await createDivisionCategoryIfNotExists(guild, divisionNumber);

  for (const team of sortedTeams) {
    const divisionGroup = (team.division_group ?? '').trim() || '?';
    const res = await createTeamResourcesForTeam(
      guild,
      team,
      divisionNumber,
      divisionGroup,
      categoryId,
      limits
    );
    results.push(res);
  }

  const rolesCreated = results.filter((r) => r.roleCreated).length;
  const channelsCreated = results.filter((r) => r.channelCreated).length;

  return { rolesCreated, channelsCreated, results, limits };
}
