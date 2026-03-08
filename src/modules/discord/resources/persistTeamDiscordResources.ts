/**
 * Persistance en base des ressources Discord créées (rôle, salon, catégorie).
 * Une responsabilité : écrire dans discord_resources et team_discord_state.
 */

import * as discordResourcesRepo from '../../../db/repositories/discordResources.js';
import * as teamDiscordStateRepo from '../../../db/repositories/teamDiscordState.js';
import * as teamsRepo from '../../../db/repositories/teams.js';
import { discordLogger } from '../logger.js';

export interface PersistTeamResourcesParams {
  teamId: number;
  guildId: string;
  categoryId: string;
  channelId: string;
  roleId: string | null;
  teamName: string;
  categoryName: string;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Enregistre les ressources créées en base (discord_resources + team_discord_state).
 * Met à jour teams.current_guild_id et teams.status si besoin.
 */
export function persistTeamDiscordResources(params: PersistTeamResourcesParams): void {
  const { teamId, guildId, categoryId, channelId, roleId, teamName, categoryName } = params;
  const ts = now();

  const categoryResourceName = categoryName || 'S21';
  const categoryAlreadyStored = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
    guildId,
    'category',
    categoryId
  );
  if (!categoryAlreadyStored) {
    discordResourcesRepo.insertDiscordResource({
      team_id: teamId,
      discord_guild_id: guildId,
      resource_type: 'category',
      discord_resource_id: categoryId,
      resource_name: categoryResourceName,
      is_active: 1,
      metadata_json: null,
      created_at: ts,
      updated_at: ts,
    });
  }

  const channelAlreadyStored = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
    guildId,
    'channel',
    channelId
  );
  if (!channelAlreadyStored) {
    discordResourcesRepo.insertDiscordResource({
      team_id: teamId,
      discord_guild_id: guildId,
      resource_type: 'channel',
      discord_resource_id: channelId,
      resource_name: teamName,
      is_active: 1,
      metadata_json: null,
      created_at: ts,
      updated_at: ts,
    });
  }

  if (roleId) {
    const roleAlreadyStored = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
      guildId,
      'role',
      roleId
    );
    if (!roleAlreadyStored) {
      discordResourcesRepo.insertDiscordResource({
        team_id: teamId,
        discord_guild_id: guildId,
        resource_type: 'role',
        discord_resource_id: roleId,
        resource_name: teamName,
        is_active: 1,
        metadata_json: null,
        created_at: ts,
        updated_at: ts,
      });
    }
  }

  teamDiscordStateRepo.upsertTeamDiscordState(teamId, {
    active_guild_id: guildId,
    active_role_id: roleId,
    active_channel_id: channelId,
    active_category_id: categoryId,
  });

  teamsRepo.updateTeam(teamId, {
    current_guild_id: guildId,
    status: 'active',
  });

  discordLogger.info('persistTeamDiscordResources: ressources enregistrées', {
    teamId,
    guildId,
    roleId: roleId ?? null,
    channelId,
    categoryId,
  });
}
