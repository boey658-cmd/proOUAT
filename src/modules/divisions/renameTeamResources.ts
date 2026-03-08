/**
 * Renommage des rôles et salons existants avec le préfixe division/groupe (serveur 1).
 * Une responsabilité : renommer rôle et salon selon "1A - Team Alpha" / "1a-team-alpha".
 */

import type { Guild, GuildBasedChannel, Role } from 'discord.js';
import type { TeamDiscordStateRow } from '../../db/types.js';
import type { TeamRow } from '../../db/types.js';
import { formatDivisionRoleName, formatDivisionChannelName } from './utils.js';
import { divisionsLogger } from './logger.js';

export interface RenameTeamResourcesResult {
  roleRenamed: boolean;
  channelRenamed: boolean;
  warnings: string[];
}

/**
 * Renomme le rôle et le salon d'une équipe avec le préfixe division/groupe.
 * Gère les cas : rôle+channel, channel sans rôle (warning), rôle sans channel (warning), aucun (warning).
 */
export async function renameTeamResources(
  guild: Guild,
  team: TeamRow,
  state: TeamDiscordStateRow | null,
  divisionNumber: number,
  divisionGroup: string
): Promise<RenameTeamResourcesResult> {
  const result: RenameTeamResourcesResult = {
    roleRenamed: false,
    channelRenamed: false,
    warnings: [],
  };

  const roleName = formatDivisionRoleName(divisionNumber, divisionGroup, team.team_name);
  const channelName = formatDivisionChannelName(divisionNumber, divisionGroup, team.team_name);

  const hasRole = state?.active_role_id && state.active_guild_id === guild.id;
  const hasChannel = state?.active_channel_id && state.active_guild_id === guild.id;

  if (!hasRole && !hasChannel) {
    result.warnings.push(
      `${team.team_name} : aucune ressource Discord sur ce serveur (rôle et salon manquants)`
    );
    divisionsLogger.error('renameTeamResources: aucune ressource', {
      teamId: team.id,
      teamName: team.team_name,
      guildId: guild.id,
    });
    return result;
  }

  if (hasRole && !hasChannel) {
    result.warnings.push(
      `${team.team_name} : rôle présent mais salon manquant`
    );
    divisionsLogger.warn('renameTeamResources: rôle sans salon', {
      teamId: team.id,
      teamName: team.team_name,
      guildId: guild.id,
    });
  }

  if (hasChannel && !hasRole) {
    result.warnings.push(
      `${team.team_name} : salon présent mais rôle manquant`
    );
    divisionsLogger.warn('renameTeamResources: salon sans rôle', {
      teamId: team.id,
      team_api_id: team.team_api_id,
      teamName: team.team_name,
      guildId: guild.id,
      channelId: state?.active_channel_id,
      causePossible: 'limite de rôles du serveur ou permission manquante',
    });
  }

  if (hasRole && state!.active_role_id) {
    const roleId = state!.active_role_id;
    let role: Role | null = null;
    try {
      role = await guild.roles.fetch(roleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`${team.team_name} : erreur renommage rôle — ${message}`);
      const causeHint = /missing access|missing permissions/i.test(message)
        ? 'vérifier Manage Roles sur le serveur'
        : undefined;
      divisionsLogger.error('renameTeamResources: opération échouée', {
        teamId: team.id,
        team_api_id: team.team_api_id,
        teamName: team.team_name,
        guildId: guild.id,
        roleId,
        operation: 'fetch',
        message,
        ...(causeHint ? { causePossible: causeHint } : {}),
      });
    }
    if (role) {
      try {
        await role.setName(roleName, 'Renommage division /creationchaneldiv');
        try {
          await role.edit({ mentionable: true });
        } catch (mentionErr) {
          const msg = mentionErr instanceof Error ? mentionErr.message : String(mentionErr);
          divisionsLogger.warn('renameTeamResources: rôle non rendu mentionnable', {
            teamId: team.id,
            roleId: role.id,
            message: msg,
          });
        }
        result.roleRenamed = true;
        divisionsLogger.info('renameTeamResources: rôle renommé', {
          teamId: team.id,
          team_api_id: team.team_api_id,
          roleId: role.id,
          newName: roleName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.warnings.push(`${team.team_name} : erreur renommage rôle — ${message}`);
        const causeHint = /missing access|missing permissions/i.test(message)
          ? 'vérifier Manage Roles sur le serveur'
          : undefined;
        divisionsLogger.error('renameTeamResources: opération échouée', {
          teamId: team.id,
          team_api_id: team.team_api_id,
          guildId: guild.id,
          roleId: role.id,
          operation: 'setName',
          message,
          ...(causeHint ? { causePossible: causeHint } : {}),
        });
      }
    } else if (hasRole) {
      result.warnings.push(`${team.team_name} : rôle introuvable sur le serveur`);
    }
  }

  if (hasChannel && state!.active_channel_id) {
    const channelId = state!.active_channel_id;
    let channel: GuildBasedChannel | null = null;
    try {
      channel = await guild.channels.fetch(channelId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`${team.team_name} : erreur renommage salon — ${message}`);
      const causeHint = /missing access|missing permissions/i.test(message)
        ? 'vérifier View Channel + Manage Channels sur le salon'
        : undefined;
      divisionsLogger.error('renameTeamResources: opération échouée', {
        teamId: team.id,
        team_api_id: team.team_api_id,
        teamName: team.team_name,
        guildId: guild.id,
        channelId,
        operation: 'fetch',
        message,
        ...(causeHint ? { causePossible: causeHint } : {}),
      });
    }
    if (channel && 'setName' in channel) {
      const ch = channel as GuildBasedChannel & { name: string; parentId: string | null; setName: (name: string, reason?: string) => Promise<unknown> };
      const chName = ch.name;
      const parentId = ch.parentId ?? null;
      try {
        await ch.setName(channelName, 'Renommage division /creationchaneldiv');
        result.channelRenamed = true;
        divisionsLogger.info('renameTeamResources: salon renommé', {
          teamId: team.id,
          team_api_id: team.team_api_id,
          channelId: channel.id,
          channelName: chName,
          parentId,
          newName: channelName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.warnings.push(`${team.team_name} : erreur renommage salon — ${message}`);
        const causeHint = /missing access|missing permissions/i.test(message)
          ? 'vérifier Manage Channels sur le salon'
          : undefined;
        divisionsLogger.error('renameTeamResources: opération échouée', {
          teamId: team.id,
          team_api_id: team.team_api_id,
          guildId: guild.id,
          channelId: channel.id,
          channelName: chName,
          parentId,
          operation: 'setName',
          message,
          ...(causeHint ? { causePossible: causeHint } : {}),
        });
      }
    } else if (hasChannel) {
      result.warnings.push(`${team.team_name} : salon introuvable ou non modifiable`);
    }
  }

  return result;
}
