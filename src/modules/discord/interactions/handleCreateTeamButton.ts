/**
 * Gestion de l'interaction du bouton "Créer la team".
 * Anti double-clic / concurrence : lock par teamApiId + guildId, revalidation DB, archivage, désactivation du bouton.
 */

import type { ButtonInteraction } from 'discord.js';
import { decodeCreateTeamCustomId } from '../buttons/createTeamButtonCustomId.js';
import { getAllowedStaffRoleIds, getDiscordGuildId1, getDiscordGuildId2 } from '../../../config/index.js';
import * as teamsRepo from '../../../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../../../db/repositories/teamDiscordState.js';
import { checkDiscordLimits } from '../resources/checkDiscordLimits.js';
import { findOrCreateTeamCategory } from '../resources/findOrCreateTeamCategory.js';
import { createTeamRole } from '../resources/createTeamRole.js';
import { createTeamChannel } from '../resources/createTeamChannel.js';
import { persistTeamDiscordResources } from '../resources/persistTeamDiscordResources.js';
import { syncExistingTeamMembersRole } from '../members/syncExistingTeamMembersRole.js';
import {
  isTeamCreationInProgress,
  markTeamCreationInProgress,
  clearTeamCreationInProgress,
} from '../createTeamLock.js';
import { archiveCreatedTeamMessage } from '../messages/archiveCreatedTeamMessage.js';
import { deleteOriginalCreateTeamMessage } from '../messages/deleteOriginalCreateTeamMessage.js';
import { discordLogger } from '../logger.js';
import { sendAuditLog, buildAuditMessage, AUDIT_PREFIX } from '../../../audit/index.js';

export interface HandleCreateTeamResult {
  success: boolean;
  message: string;
  degradedMode?: boolean;
}

function userHasStaffRole(interaction: ButtonInteraction): boolean {
  const member = interaction.member;
  if (!member || !('roles' in member)) return false;
  const allowed = getAllowedStaffRoleIds();
  if (allowed.length === 0) return false;
  const roles = member.roles;
  const memberRoleIds = new Set(
    'cache' in roles ? roles.cache.keys() : (roles as string[] ?? [])
  );
  return allowed.some((id) => memberRoleIds.has(id));
}

function isTeamAlreadyCreatedOnGuild(teamId: number, guildId: string): boolean {
  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(teamId);
  return (
    state?.active_guild_id === guildId &&
    (state.active_role_id != null || state.active_channel_id != null)
  );
}

/**
 * Traite le clic sur le bouton "Créer la team".
 */
export async function handleCreateTeamButton(
  interaction: ButtonInteraction
): Promise<HandleCreateTeamResult> {
  const teamApiId = decodeCreateTeamCustomId(interaction.customId);
  const guild = interaction.guild;
  const userId = interaction.user.id;

  discordLogger.info('handleCreateTeamButton: début', {
    teamApiId: teamApiId ?? '(invalid)',
    userId,
    guildId: guild?.id,
  });

  if (!teamApiId) {
    await interaction.reply({
      content: 'Identifiant équipe invalide.',
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'customId invalide' };
  }

  if (!guild) {
    await interaction.reply({
      content: 'Cette action doit être effectuée sur un serveur.',
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'guild manquant' };
  }

  const guildId1 = getDiscordGuildId1();
  const guildId2 = getDiscordGuildId2();
  if (guild.id !== guildId1 && guild.id !== guildId2) {
    discordLogger.warn('handleCreateTeamButton: guild non autorisé', {
      guildId: guild.id,
      teamApiId,
      userId,
    });
    await interaction.reply({
      content:
        'Cette action doit être effectuée sur le serveur principal (1) ou secondaire (2). Vérifiez DISCORD_GUILD_ID_1 et DISCORD_GUILD_ID_2.',
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'guild non autorisé' };
  }

  if (!userHasStaffRole(interaction)) {
    discordLogger.warn('handleCreateTeamButton: utilisateur non autorisé', {
      userId,
      guildId: guild.id,
      teamApiId,
    });
    await interaction.reply({
      content: "Vous n'avez pas la permission d'effectuer cette action.",
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'non staff' };
  }

  if (isTeamCreationInProgress(teamApiId, guild.id)) {
    discordLogger.warn('handleCreateTeamButton: lock refusé (création déjà en cours)', {
      teamApiId,
      guildId: guild.id,
    });
    await interaction.reply({
      content: 'Création déjà en cours pour cette équipe.',
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'création en cours' };
  }

  const team = teamsRepo.findTeamByApiId(teamApiId);
  if (!team) {
    await interaction.reply({
      content: 'Équipe introuvable en base.',
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'équipe introuvable' };
  }

  if (isTeamAlreadyCreatedOnGuild(team.id, guild.id)) {
    discordLogger.info('handleCreateTeamButton: équipe déjà créée', {
      teamId: team.id,
      guildId: guild.id,
    });
    await interaction.reply({
      content: 'Cette équipe a déjà été créée.',
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'déjà créé' };
  }

  if (!markTeamCreationInProgress(teamApiId, guild.id)) {
    discordLogger.warn('handleCreateTeamButton: lock non acquis (concurrence)', {
      teamApiId,
      guildId: guild.id,
    });
    await interaction.reply({
      content: 'Création déjà en cours pour cette équipe.',
      ephemeral: true,
    }).catch(() => {});
    return { success: false, message: 'création en cours' };
  }

  discordLogger.info('handleCreateTeamButton: lock acquis', {
    teamApiId,
    guildId: guild.id,
  });

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  let roleId: string | null = null;
  const degradedMode = !checkDiscordLimits(guild).canCreateRole;

  try {
    if (isTeamAlreadyCreatedOnGuild(team.id, guild.id)) {
      discordLogger.info('handleCreateTeamButton: équipe déjà créée (revalidation DB)', {
        teamId: team.id,
        guildId: guild.id,
      });
      await interaction.editReply({
        content: 'Cette équipe a déjà été créée.',
      }).catch(() => {});
      clearTeamCreationInProgress(teamApiId, guild.id);
      return { success: false, message: 'déjà créé' };
    }

    const limits = checkDiscordLimits(guild);
    if (!limits.canCreateChannel) {
      discordLogger.warn('handleCreateTeamButton: limite salons atteinte', {
        guildId: guild.id,
        teamApiId,
      });
      await interaction.editReply({
        content: 'Limite de salons du serveur atteinte. La création est bloquée.',
      }).catch(() => {});
      clearTeamCreationInProgress(teamApiId, guild.id);
      return { success: false, message: 'limite salons' };
    }

    const { categoryId, categoryName } = await findOrCreateTeamCategory(guild);

    if (isTeamAlreadyCreatedOnGuild(team.id, guild.id)) {
      discordLogger.info('handleCreateTeamButton: équipe déjà créée avant createRole', {
        teamId: team.id,
        guildId: guild.id,
      });
      await interaction.editReply({ content: 'Cette équipe a déjà été créée.' }).catch(() => {});
      clearTeamCreationInProgress(teamApiId, guild.id);
      return { success: false, message: 'déjà créé' };
    }

    if (limits.canCreateRole) {
      roleId = await createTeamRole(guild, team.team_name);
    } else {
      discordLogger.info('handleCreateTeamButton: mode dégradé (salon uniquement)', {
        guildId: guild.id,
        teamId: team.id,
      });
    }

    const channelId = await createTeamChannel(
      guild,
      categoryId,
      team.team_name,
      roleId
    );

    try {
      persistTeamDiscordResources({
        teamId: team.id,
        guildId: guild.id,
        categoryId,
        channelId,
        roleId,
        teamName: team.team_name,
        categoryName,
      });
    } catch (dbErr) {
      const dbMessage = dbErr instanceof Error ? dbErr.message : String(dbErr);
      discordLogger.error('handleCreateTeamButton: erreur DB (ressources Discord peut-être déjà créées)', {
        teamId: team.id,
        guildId: guild.id,
        channelId,
        roleId: roleId ?? null,
        message: dbMessage,
      });
      clearTeamCreationInProgress(teamApiId, guild.id);
      await interaction.editReply({
        content: `Erreur lors de l'enregistrement : ${dbMessage}. Rôle/salon peuvent avoir été créés sur Discord.`,
      }).catch(() => {});
      return { success: false, message: dbMessage };
    }

    let syncInfo = '';
    if (roleId) {
      const syncResult = await syncExistingTeamMembersRole(team.id, guild);
      syncInfo = ` ${syncResult.foundOnServer} membre(s) sur le serveur, ${syncResult.roleAdded} rôle(s) attribué(s).`;
      if (syncResult.failed > 0) {
        syncInfo += ` ${syncResult.failed} échec(s).`;
      }
    }

    const reply = degradedMode
      ? `Salon créé (mode dégradé). Salon : <#${channelId}>${syncInfo}`
      : `Rôle et salon créés. Salon : <#${channelId}>${syncInfo}`;
    await interaction.editReply({ content: reply }).catch(() => {});

    const originalEmbed = interaction.message?.embeds?.[0];
    const originalEmbedData = originalEmbed
      ? (originalEmbed as unknown as { toJSON(): import('discord.js').APIEmbed }).toJSON() as unknown as Record<string, unknown>
      : null;

    const archiveResult = await archiveCreatedTeamMessage(interaction.client, {
      originalEmbedData,
      guildName: guild.name,
      guildId: guild.id,
      channelId,
      roleId,
      teamName: team.team_name,
    });
    if (archiveResult.success) {
      discordLogger.info('handleCreateTeamButton: message archivé', {
        teamApiId,
        guildId: guild.id,
      });
    } else {
      discordLogger.warn('handleCreateTeamButton: archivage échoué', {
        teamApiId,
        error: archiveResult.error,
      });
    }

    const deleteResult = await deleteOriginalCreateTeamMessage(interaction);
    if (deleteResult.success) {
      discordLogger.info('handleCreateTeamButton: message original supprimé', {
        messageId: interaction.message?.id,
      });
    } else {
      discordLogger.warn('handleCreateTeamButton: suppression message original impossible', {
        messageId: interaction.message?.id,
        error: deleteResult.error,
      });
    }

    clearTeamCreationInProgress(teamApiId, guild.id);

    discordLogger.info('handleCreateTeamButton: succès', {
      teamId: team.id,
      guildId: guild.id,
      channelId,
      roleId: roleId ?? null,
      degradedMode,
    });

    const auditMsg = degradedMode
      ? `Ressources Discord créées pour l'équipe **${team.team_name}** — salon créé (mode dégradé, rôle non créé).`
      : `Ressources Discord créées pour l'équipe **${team.team_name}** — rôle créé, salon créé, catégorie utilisée.`;
    await sendAuditLog(
      interaction.client,
      buildAuditMessage('success', AUDIT_PREFIX.CREATION_TEAM, auditMsg)
    );

    return { success: true, message: reply, degradedMode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('handleCreateTeamButton: erreur Discord', {
      teamApiId,
      guildId: guild.id,
      message,
    });
    clearTeamCreationInProgress(teamApiId, guild.id);
    await interaction.editReply({
      content: `Erreur lors de la création : ${message}`,
    }).catch(() => {});

    const causeHint = /permission|manage|channel/i.test(message)
      ? ' — vérifier permissions Manage Channels'
      : '';
    await sendAuditLog(
      interaction.client,
      buildAuditMessage(
        'error',
        AUDIT_PREFIX.CREATION_TEAM,
        `Échec création ressources Discord pour l'équipe **${team.team_name}** — ${message}${causeHint}`
      )
    );

    return { success: false, message };
  }
}
