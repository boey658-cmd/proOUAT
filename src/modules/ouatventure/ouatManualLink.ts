/**
 * Liaisons / déliaisons manuelles OUAT — écritures SQLite uniquement.
 * Interdit : toute création ou suppression sur Discord (aucun .delete(), etc.).
 */

import { getDatabase } from '../../db/database.js';
import * as teamsRepo from '../../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../../db/repositories/teamDiscordState.js';
import * as discordResourcesRepo from '../../db/repositories/discordResources.js';
import type { TeamRow } from '../../db/types.js';
import { discordLogger } from '../discord/logger.js';

function now(): string {
  return new Date().toISOString();
}

export type OuatLinkResult = { ok: true; message: string } | { ok: false; error: string };

function refuseIfResourceOwnedByOtherTeam(
  guildId: string,
  kind: 'channel' | 'role',
  resourceId: string,
  teamId: number
): OuatLinkResult | null {
  const row = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(guildId, kind, resourceId);
  if (row && row.team_id !== teamId) {
    return {
      ok: false,
      error: `Ressource déjà enregistrée dans discord_resources pour l'équipe id=${row.team_id} (guild \`${guildId}\`).`,
    };
  }
  return null;
}

/**
 * Attache un salon texte existant (vérifs Discord faites en amont).
 */
export function applyOuatAddChannel(params: {
  team: TeamRow;
  guildId: string;
  channelId: string;
  channelName: string;
  parentCategoryId: string | null;
  replace: boolean;
}): OuatLinkResult {
  const { team, guildId, channelId, channelName, parentCategoryId, replace } = params;

  const other = teamDiscordStateRepo.findOtherTeamIdWithActiveChannelId(channelId, team.id);
  if (other != null) {
    return {
      ok: false,
      error: `Ce salon est déjà l'actif de l'équipe id=${other} dans team_discord_state.`,
    };
  }

  const refConflict = refuseIfResourceOwnedByOtherTeam(guildId, 'channel', channelId, team.id);
  if (refConflict) return refConflict;

  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const existingCh = state?.active_channel_id?.trim() ?? '';
  if (existingCh && existingCh !== channelId && !replace) {
    return {
      ok: false,
      error: `L'équipe a déjà un salon actif (\`${existingCh}\`). Pour remplacer, utilisez l'option \`remplacer\` cochée.`,
    };
  }

  try {
    getDatabase().transaction(() => {
      if (existingCh && existingCh !== channelId) {
        const oldRes = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
          guildId,
          'channel',
          existingCh
        );
        if (oldRes && oldRes.team_id === team.id && oldRes.is_active === 1) {
          discordResourcesRepo.markDiscordResourceInactive(oldRes.id);
        }
      }

      const existingRow = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
        guildId,
        'channel',
        channelId
      );
      const ts = now();
      if (existingRow) {
        if (existingRow.team_id !== team.id) {
          throw new Error('Conflit discord_resources (équipe différente)');
        }
        discordResourcesRepo.updateDiscordResource(existingRow.id, {
          is_active: 1,
          resource_name: team.team_name,
        });
      } else {
        discordResourcesRepo.insertDiscordResource({
          team_id: team.id,
          discord_guild_id: guildId,
          resource_type: 'channel',
          discord_resource_id: channelId,
          resource_name: team.team_name,
          is_active: 1,
          metadata_json: null,
          created_at: ts,
          updated_at: ts,
        });
      }

      const patch: Parameters<typeof teamDiscordStateRepo.mergeUpsertTeamDiscordState>[1] = {
        active_guild_id: guildId,
        active_channel_id: channelId,
      };
      if (parentCategoryId) {
        patch.active_category_id = parentCategoryId;
      }
      teamDiscordStateRepo.mergeUpsertTeamDiscordState(team.id, patch);
      teamsRepo.updateTeam(team.id, { current_guild_id: guildId, status: 'active' });
    })();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    discordLogger.error('ouatManualLink: add channel transaction', { teamId: team.id, message: msg });
    return { ok: false, error: msg };
  }

  discordLogger.info('ouatManualLink: salon lié (BDD)', { teamId: team.id, channelId, guildId });
  return {
    ok: true,
    message: `Salon **${channelName}** (\`${channelId}\`) lié à **${team.team_name}** — SQLite uniquement.`,
  };
}

/**
 * Attache un rôle existant (vérifs Discord faites en amont).
 */
export function applyOuatAddRole(params: {
  team: TeamRow;
  guildId: string;
  roleId: string;
  roleName: string;
  replace: boolean;
}): OuatLinkResult {
  const { team, guildId, roleId, roleName, replace } = params;

  const other = teamDiscordStateRepo.findOtherTeamIdWithActiveRoleId(roleId, team.id);
  if (other != null) {
    return {
      ok: false,
      error: `Ce rôle est déjà l'actif de l'équipe id=${other} dans team_discord_state.`,
    };
  }

  const refConflict = refuseIfResourceOwnedByOtherTeam(guildId, 'role', roleId, team.id);
  if (refConflict) return refConflict;

  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const existingRl = state?.active_role_id?.trim() ?? '';
  if (existingRl && existingRl !== roleId && !replace) {
    return {
      ok: false,
      error: `L'équipe a déjà un rôle actif (\`${existingRl}\`). Pour remplacer, utilisez l'option \`remplacer\` cochée.`,
    };
  }

  try {
    getDatabase().transaction(() => {
      if (existingRl && existingRl !== roleId) {
        const oldRes = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
          guildId,
          'role',
          existingRl
        );
        if (oldRes && oldRes.team_id === team.id && oldRes.is_active === 1) {
          discordResourcesRepo.markDiscordResourceInactive(oldRes.id);
        }
      }

      const existingRow = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(
        guildId,
        'role',
        roleId
      );
      const ts = now();
      if (existingRow) {
        if (existingRow.team_id !== team.id) {
          throw new Error('Conflit discord_resources (équipe différente)');
        }
        discordResourcesRepo.updateDiscordResource(existingRow.id, {
          is_active: 1,
          resource_name: team.team_name,
        });
      } else {
        discordResourcesRepo.insertDiscordResource({
          team_id: team.id,
          discord_guild_id: guildId,
          resource_type: 'role',
          discord_resource_id: roleId,
          resource_name: team.team_name,
          is_active: 1,
          metadata_json: null,
          created_at: ts,
          updated_at: ts,
        });
      }

      teamDiscordStateRepo.mergeUpsertTeamDiscordState(team.id, {
        active_guild_id: guildId,
        active_role_id: roleId,
      });
      teamsRepo.updateTeam(team.id, { current_guild_id: guildId, status: 'active' });
    })();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    discordLogger.error('ouatManualLink: add role transaction', { teamId: team.id, message: msg });
    return { ok: false, error: msg };
  }

  discordLogger.info('ouatManualLink: rôle lié (BDD)', { teamId: team.id, roleId, guildId });
  return {
    ok: true,
    message: `Rôle **${roleName}** (\`${roleId}\`) lié à **${team.team_name}** — SQLite uniquement.`,
  };
}

/**
 * Détache le salon actif (BDD uniquement).
 */
export function applyOuatRemoveChannel(team: TeamRow, interactionGuildId: string): OuatLinkResult {
  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const ch = state?.active_channel_id?.trim() ?? '';
  if (!ch) {
    return {
      ok: false,
      error: "Aucun salon actif enregistré pour cette équipe dans team_discord_state.",
    };
  }

  const guildId = state?.active_guild_id?.trim() || interactionGuildId;

  try {
    getDatabase().transaction(() => {
      const res = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(guildId, 'channel', ch);
      if (res && res.team_id === team.id && res.is_active === 1) {
        discordResourcesRepo.markDiscordResourceInactive(res.id);
      }
      teamDiscordStateRepo.mergeUpsertTeamDiscordState(team.id, { active_channel_id: null });
    })();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    discordLogger.error('ouatManualLink: remove channel', { teamId: team.id, message: msg });
    return { ok: false, error: msg };
  }

  discordLogger.info('ouatManualLink: salon détaché (BDD)', { teamId: team.id, channelId: ch, guildId });
  return {
    ok: true,
    message: `Salon actif \`${ch}\` détaché de **${team.team_name}** (SQLite). Le salon Discord n'a pas été modifié.`,
  };
}

/**
 * Détache le rôle actif (BDD uniquement).
 */
export function applyOuatRemoveRole(team: TeamRow, interactionGuildId: string): OuatLinkResult {
  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const rl = state?.active_role_id?.trim() ?? '';
  if (!rl) {
    return {
      ok: false,
      error: "Aucun rôle actif enregistré pour cette équipe dans team_discord_state.",
    };
  }

  const guildId = state?.active_guild_id?.trim() || interactionGuildId;

  try {
    getDatabase().transaction(() => {
      const res = discordResourcesRepo.findDiscordResourceByGuildAndTypeAndId(guildId, 'role', rl);
      if (res && res.team_id === team.id && res.is_active === 1) {
        discordResourcesRepo.markDiscordResourceInactive(res.id);
      }
      teamDiscordStateRepo.mergeUpsertTeamDiscordState(team.id, { active_role_id: null });
    })();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    discordLogger.error('ouatManualLink: remove role', { teamId: team.id, message: msg });
    return { ok: false, error: msg };
  }

  discordLogger.info('ouatManualLink: rôle détaché (BDD)', { teamId: team.id, roleId: rl, guildId });
  return {
    ok: true,
    message: `Rôle actif \`${rl}\` détaché de **${team.team_name}** (SQLite). Le rôle Discord n'a pas été modifié.`,
  };
}
