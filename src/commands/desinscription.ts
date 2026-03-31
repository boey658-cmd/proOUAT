/**
 * Commande slash /desinscription : oubli complet de l'équipe en base (seul flux de retrait réel).
 * Aucune suppression sur Discord. Même logique que forgetTeamAndRemoveFromDb.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { getAllowedStaffRoleIds, getDiscordGuildId1, getDiscordGuildId2 } from '../config/index.js';
import * as teamsRepo from '../db/repositories/teams.js';
import { forgetTeamAndRemoveFromDb } from '../modules/teams/syncTeamsWithDatabase.js';
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

export async function handleDesinscriptionCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!userHasStaffRole(interaction)) {
    await interaction
      .reply({
        content: "Vous n'avez pas la permission d'utiliser cette commande.",
        ephemeral: true,
      })
      .catch(() => {});
    return;
  }

  const teamApiIdRaw = interaction.options.getString('team_api_id', true).trim();
  if (!teamApiIdRaw) {
    await interaction
      .reply({
        content: 'team_api_id requis.',
        ephemeral: true,
      })
      .catch(() => {});
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

  const team = teamsRepo.findTeamByApiId(teamApiIdRaw);
  if (!team) {
    await interaction.editReply({
      content: `Aucune équipe en base avec team_api_id \`${teamApiIdRaw}\`.`,
    }).catch(() => {});
    return;
  }

  const label = `${team.team_name} (${team.team_api_id})`;
  forgetTeamAndRemoveFromDb(team);

  const client = interaction.client;
  await sendAuditLog(
    client,
    buildAuditMessage(
      'info',
      AUDIT_PREFIX.REGISTRATION_SYNC,
      `Désinscription manuelle — équipe retirée de la base : ${label}`
    )
  );

  await interaction.editReply({
    content: `Équipe retirée de la base (oubli SQLite). Discord inchangé. ${label}`,
  }).catch(() => {});
}
