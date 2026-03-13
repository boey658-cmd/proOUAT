/**
 * Commande slash /creationchaneldiv : organise les équipes d'une division (catégories, renommage, création).
 * Serveur 1 : renommer + déplacer les ressources existantes.
 * Serveur 2 : créer catégories, rôles et salons, enregistrer en base.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { getAllowedStaffRoleIds, getDiscordGuildId1, getDiscordGuildId2 } from '../config/index.js';
import * as teamsRepo from '../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../db/repositories/teamDiscordState.js';
import { createDivisionCategoryIfNotExists } from '../modules/divisions/createDivisionStructure.js';
import { renameTeamResources } from '../modules/divisions/renameTeamResources.js';
import { moveTeamChannelToCategory, reorderDivisionChannels } from '../modules/divisions/moveTeamChannels.js';
import { createTeamResourcesForDivisionOnGuild } from '../modules/divisions/createTeamResourcesForGuild.js';
import { createOrSyncTeamVoiceChannel } from '../modules/divisions/createOrSyncTeamVoiceChannel.js';
import { groupLabelToSortKey, formatDivisionChannelName } from '../modules/divisions/utils.js';
import { divisionsLogger } from '../modules/divisions/logger.js';
import { sendAuditLog, buildAuditMessage, AUDIT_PREFIX } from '../audit/index.js';

function userHasStaffRole(interaction: ChatInputCommandInteraction): boolean {
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

const MAX_REPLY_LENGTH = 1900;

function truncateReply(text: string): string {
  if (text.length <= MAX_REPLY_LENGTH) return text;
  return text.slice(0, MAX_REPLY_LENGTH - 3) + '...';
}

/**
 * Gère l'exécution de la commande /creationchaneldiv.
 */
export async function handleCreationchaneldivCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!userHasStaffRole(interaction)) {
    await interaction.reply({
      content: "Vous n'avez pas la permission d'utiliser cette commande.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const divisionOption = interaction.options.getInteger('division', true);
  const divisionNumber = divisionOption;

  if (divisionNumber < 1) {
    await interaction.reply({
      content: 'Le numéro de division doit être au moins 1.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({
      content: 'Cette commande doit être exécutée sur un serveur.',
    }).catch(() => {});
    return;
  }

  const guildId1 = getDiscordGuildId1();
  const guildId2 = getDiscordGuildId2();

  if (guild.id !== guildId1 && guild.id !== guildId2) {
    await interaction.editReply({
      content:
        'Cette commande doit être exécutée sur le serveur principal (1) ou secondaire (2). Vérifiez DISCORD_GUILD_ID_1 et DISCORD_GUILD_ID_2.',
    }).catch(() => {});
    return;
  }

  const isServer1 = guild.id === guildId1;

  let teams = teamsRepo.findTeamsByDivision(divisionNumber);
  teams = teams.filter(
    (t) =>
      t.status !== 'archived' &&
      t.division_number != null &&
      t.division_group != null &&
      String(t.division_group).trim() !== ''
  );

  if (teams.length === 0) {
    await interaction.editReply({
      content: `Aucune équipe en base pour la division ${divisionNumber} (ou division/groupe non renseignés).`,
    }).catch(() => {});
    return;
  }

  const allWarnings: string[] = [];
  const allErrors: string[] = [];
  let rolesCreated = 0;
  let channelsCreated = 0;
  let channelsMoved = 0;
  let voiceChannelsSynced = 0;

  const client = interaction.client;
  await sendAuditLog(
    client,
    buildAuditMessage(
      'info',
      AUDIT_PREFIX.DIVISIONS,
      `Division ${divisionNumber} — Création / organisation démarrée (${teams.length} équipes).`
    )
  );

  try {
    if (isServer1) {
      const sortedTeams = [...teams].sort((a, b) => {
        const divA = a.division_number ?? 0;
        const divB = b.division_number ?? 0;
        if (divA !== divB) return divA - divB;
        const groupA = groupLabelToSortKey((a.division_group ?? '').trim());
        const groupB = groupLabelToSortKey((b.division_group ?? '').trim());
        if (groupA !== groupB) return groupA - groupB;
        return (a.team_name ?? '').localeCompare(b.team_name ?? '', undefined, { sensitivity: 'base' });
      });

      const { categoryId } = await createDivisionCategoryIfNotExists(guild, divisionNumber);

      for (const team of sortedTeams) {
        const divisionGroup = (team.division_group ?? '?').trim();
        const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);

        const renameResult = await renameTeamResources(
          guild,
          team,
          state,
          divisionNumber,
          divisionGroup
        );

        allWarnings.push(...renameResult.warnings);

        if (renameResult.channelRenamed && state?.active_channel_id) {
          const moveResult = await moveTeamChannelToCategory(
            guild,
            state.active_channel_id,
            categoryId,
            { teamId: team.id, team_api_id: team.team_api_id, teamName: team.team_name }
          );
          if (moveResult.success) channelsMoved++;
          else if (moveResult.error) allWarnings.push(`${team.team_name} : déplacement — ${moveResult.error}`);
        }

        const voiceChannelName = formatDivisionChannelName(divisionNumber, divisionGroup, team.team_name);
        const voiceResult = await createOrSyncTeamVoiceChannel({
          guild,
          categoryId,
          channelName: voiceChannelName,
          teamRoleId: state?.active_role_id ?? null,
          logContext: { teamId: team.id, team_api_id: team.team_api_id, teamName: team.team_name },
        });
        if (voiceResult.success) voiceChannelsSynced++;
        else if (voiceResult.error) allWarnings.push(`${team.team_name} : vocal — ${voiceResult.error}`);
      }

      await reorderDivisionChannels(guild, categoryId, divisionNumber);

      divisionsLogger.info('creationchaneldiv: serveur 1 terminé', {
        divisionNumber,
        guildId: guild.id,
        teamsProcessed: teams.length,
        channelsMoved,
        voiceChannelsSynced,
        warnings: allWarnings.length,
      });
    } else {
      const { rolesCreated: r, channelsCreated: c, results } =
        await createTeamResourcesForDivisionOnGuild(guild, teams, divisionNumber);

      rolesCreated = r;
      channelsCreated = c;
      voiceChannelsSynced = results.filter((res) => res.voiceChannelSynced).length;

      for (const res of results) {
        allWarnings.push(...res.warnings);
        if (res.error) allErrors.push(`${res.teamName} : ${res.error}`);
      }

      divisionsLogger.info('creationchaneldiv: serveur 2 terminé', {
        divisionNumber,
        guildId: guild.id,
        teamsProcessed: teams.length,
        rolesCreated,
        channelsCreated,
        voiceChannelsSynced,
        warnings: allWarnings.length,
        errors: allErrors.length,
      });
    }

    const lines: string[] = [
      `**Création / organisation division ${divisionNumber}**`,
      `• Équipes traitées : ${teams.length}`,
    ];

    if (isServer1) {
      lines.push(`• Salons déplacés : ${channelsMoved}`);
      lines.push(`• Vocaux créés/synchronisés : ${voiceChannelsSynced}`);
    } else {
      lines.push(`• Rôles créés : ${rolesCreated}`);
      lines.push(`• Salons créés : ${channelsCreated}`);
      lines.push(`• Vocaux créés/synchronisés : ${voiceChannelsSynced}`);
    }

    if (allWarnings.length > 0) {
      lines.push('', '**Avertissements :**');
      const showWarnings = allWarnings.slice(0, 15);
      showWarnings.forEach((w) => lines.push(`  • ${w}`));
      if (allWarnings.length > 15) {
        lines.push(`  … et ${allWarnings.length - 15} autre(s)`);
      }
    }

    if (allErrors.length > 0) {
      lines.push('', '**Erreurs :**');
      const showErrors = allErrors.slice(0, 10);
      showErrors.forEach((e) => lines.push(`  • ${e}`));
      if (allErrors.length > 10) {
        lines.push(`  … et ${allErrors.length - 10} autre(s)`);
      }
    }

    const content = truncateReply(lines.join('\n'));
    await interaction.editReply({ content }).catch(() => {});

    const auditParts = [
      `Commande /creationchaneldiv terminée — division ${divisionNumber}`,
      `— équipes : ${teams.length}`,
    ];
    if (isServer1) {
      auditParts.push(`— salons déplacés : ${channelsMoved}`);
      auditParts.push(`— vocaux synchronisés : ${voiceChannelsSynced}`);
    } else {
      auditParts.push(`— rôles créés : ${rolesCreated}`);
      auditParts.push(`— salons créés : ${channelsCreated}`);
      auditParts.push(`— vocaux synchronisés : ${voiceChannelsSynced}`);
    }
    if (allWarnings.length > 0) auditParts.push(`— warnings : ${allWarnings.length}`);
    if (allErrors.length > 0) auditParts.push(`— erreurs : ${allErrors.length}`);
    await sendAuditLog(
      client,
      buildAuditMessage('success', AUDIT_PREFIX.DIVISIONS, auditParts.join(' '))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    divisionsLogger.error('creationchaneldiv: erreur', {
      divisionNumber,
      guildId: guild.id,
      message,
    });
    await interaction.editReply({
      content: `Erreur lors de l'exécution : ${message}`,
    }).catch(() => {});
    await sendAuditLog(
      client,
      buildAuditMessage(
        'error',
        AUDIT_PREFIX.DIVISIONS,
        `Division ${divisionNumber} — Erreur lors de l'exécution — ${message}`
      )
    );
  }
}
