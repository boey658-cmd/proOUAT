/**
 * Handlers des commandes slash READ-ONLY /stats et /db.
 * Contrôle d'accès strict : un seul utilisateur + guilds autorisés.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getDiscordGuildId1, getDiscordGuildId2 } from '../../config/index.js';
import { ALLOWED_DB_READ_USER_ID } from './constants.js';
import { getStats, getAnomalies, findTeamsByName, getTeamDetail } from './queries.js';

const MAX_FIELD_VALUE = 1024;
const MAX_EMBED_DESCRIPTION = 4096;

function isAllowedUser(interaction: ChatInputCommandInteraction): boolean {
  return interaction.user.id === ALLOWED_DB_READ_USER_ID;
}

function isAllowedGuild(interaction: ChatInputCommandInteraction): boolean {
  const guild = interaction.guild;
  if (!guild) return false;
  const g1 = getDiscordGuildId1();
  const g2 = getDiscordGuildId2();
  if (!g1 && !g2) return true;
  return guild.id === g1 || guild.id === g2;
}

export async function handleStatsCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'Commande utilisable uniquement dans un serveur.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  if (!isAllowedUser(interaction)) {
    await interaction.reply({
      content: 'Cette commande n’est pas autorisée.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  if (!isAllowedGuild(interaction)) {
    await interaction.reply({
      content: 'Cette commande doit être exécutée sur le serveur principal ou secondaire.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const stats = getStats();
    const embed = new EmbedBuilder()
      .setTitle('📊 Stats base de données (lecture seule)')
      .setColor(0x3498db)
      .addFields(
        { name: 'Équipes', value: String(stats.totalTeams), inline: true },
        { name: 'Joueurs (total)', value: String(stats.totalPlayers), inline: true },
        { name: 'Joueurs actifs', value: String(stats.activePlayers), inline: true },
        { name: 'Joueurs partis (left_team)', value: String(stats.leftTeamPlayers), inline: true },
        { name: 'Divisions (distinct)', value: String(stats.divisionCount), inline: true },
        { name: 'Rôles équipe (actifs)', value: String(stats.teamRolesCount), inline: true },
        { name: 'Salons équipe (actifs)', value: String(stats.teamChannelsCount), inline: true }
      )
      .setFooter({ text: 'Lecture seule — aucune modification' });

    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `Erreur lors de la lecture : ${message}`,
    }).catch(() => {});
  }
}

export async function handleDbAnomaliesCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'Commande utilisable uniquement dans un serveur.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  if (!isAllowedUser(interaction)) {
    await interaction.reply({
      content: 'Cette commande n’est pas autorisée.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  if (!isAllowedGuild(interaction)) {
    await interaction.reply({
      content: 'Cette commande doit être exécutée sur le serveur principal ou secondaire.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const anomalies = getAnomalies();
    const embed = new EmbedBuilder()
      .setTitle('🔍 Anomalies (lecture seule)')
      .setColor(anomalies.length > 0 ? 0xe67e22 : 0x2ecc71)
      .setFooter({ text: 'Aucune correction — signalement uniquement' });

    if (anomalies.length === 0) {
      embed.setDescription('Aucune anomalie détectée.');
    } else {
      const byType: Record<string, string[]> = {};
      for (const a of anomalies) {
        if (!byType[a.type]) byType[a.type] = [];
        byType[a.type].push(a.detail);
      }
      const lines: string[] = [];
      for (const [type, details] of Object.entries(byType)) {
        lines.push(`**${type}** (${details.length})`);
        const sample = details.slice(0, 5).map((d) => `• ${d}`);
        lines.push(sample.join('\n'));
        if (details.length > 5) {
          lines.push(`… et ${details.length - 5} autre(s)`);
        }
        lines.push('');
      }
      const text = lines.join('\n').slice(0, MAX_EMBED_DESCRIPTION);
      embed.setDescription(text || 'Anomalies détectées.');
    }

    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `Erreur lors de la lecture : ${message}`,
    }).catch(() => {});
  }
}

export async function handleDbTeamCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'Commande utilisable uniquement dans un serveur.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  if (!isAllowedUser(interaction)) {
    await interaction.reply({
      content: 'Cette commande n’est pas autorisée.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  if (!isAllowedGuild(interaction)) {
    await interaction.reply({
      content: 'Cette commande doit être exécutée sur le serveur principal ou secondaire.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const nameOption = interaction.options.getString('name', true);
  if (!nameOption?.trim()) {
    await interaction.reply({
      content: 'Veuillez fournir un nom d’équipe.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const teams = findTeamsByName(nameOption.trim());
    if (teams.length === 0) {
      await interaction.editReply({
        content: `Aucune équipe trouvée pour « ${nameOption.trim().slice(0, 50)} ».`,
      }).catch(() => {});
      return;
    }
    if (teams.length > 1) {
      const list = teams.map((t) => `- ${t.team_name}`).join('\n');
      await interaction.editReply({
        content: `Plusieurs équipes trouvées :\n${list}\n\nVeuillez préciser le nom.`,
      }).catch(() => {});
      return;
    }

    const team = teams[0];
    const detail = getTeamDetail(team);
    const activePlayers = detail.players.filter(
      (p) => p.status !== 'left_team' && (p.is_staff ?? 0) === 0
    );
    const leftPlayers = detail.players.filter((p) => p.status === 'left_team');
    const staffPlayers = detail.players.filter((p) => (p.is_staff ?? 0) === 1 && p.status !== 'left_team');
    const captain = detail.players.find((p) => (p.is_captain ?? 0) === 1 && p.status !== 'left_team');

    const embed = new EmbedBuilder()
      .setTitle(`Équipe : ${team.team_name}`)
      .setColor(0x9b59b6)
      .addFields(
        { name: 'ID', value: String(team.id), inline: true },
        { name: 'team_api_id', value: team.team_api_id, inline: true },
        { name: 'Statut', value: team.status, inline: true },
        {
          name: 'Division',
          value:
            team.division_number != null && team.division_group
              ? `${team.division_number} / ${team.division_group}`
              : '—',
          inline: true,
        },
        {
          name: 'Capitaine',
          value: captain ? `${captain.lol_pseudo}${captain.discord_user_id ? ` (Discord)` : ''}` : '—',
          inline: true,
        },
        { name: 'Guild actif', value: team.current_guild_id ?? '—', inline: true },
        {
          name: 'Rôle Discord',
          value:
            detail.state?.active_role_id?.trim() ? detail.state.active_role_id : '—',
          inline: false,
        },
        {
          name: 'Salon Discord',
          value:
            detail.state?.active_channel_id?.trim() ? detail.state.active_channel_id : '—',
          inline: false,
        },
        {
          name: 'Joueurs actifs',
          value:
            activePlayers.length === 0
              ? '—'
              : activePlayers
                  .map((p) => p.lol_pseudo + (p.discord_user_id ? ' ✓' : ''))
                  .join(', ')
                  .slice(0, MAX_FIELD_VALUE),
          inline: false,
        },
        {
          name: 'Joueurs partis (left_team)',
          value:
            leftPlayers.length === 0
              ? '—'
              : leftPlayers.map((p) => p.lol_pseudo).join(', ').slice(0, MAX_FIELD_VALUE),
          inline: false,
        }
      )
      .setFooter({
        text: `first_seen: ${team.first_seen_at ?? '—'} | last_synced: ${team.last_synced_at ?? '—'}`,
      });

    if (staffPlayers.length > 0) {
      embed.addFields({
        name: 'Staff actif',
        value: staffPlayers.map((p) => p.lol_pseudo).join(', ').slice(0, MAX_FIELD_VALUE),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `Erreur lors de la lecture : ${message}`,
    }).catch(() => {});
  }
}
