/**
 * Embed Discord pour une équipe modifiée (changements joueurs, nom, Discord ID).
 */

import { EmbedBuilder } from 'discord.js';
import type { TeamUpdateDiff } from '../../teams/syncTeamsWithDatabase.js';

const EMBED_COLOR = 0xf4d03f; // Jaune / orange
const MAX_FIELD_VALUE = 1024;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 3) + '...';
}

function formatPlayerLine(p: { lol_pseudo: string; discord_user_id?: string | null }): string {
  const pseudo = p.lol_pseudo?.trim() || '?';
  if (p.discord_user_id?.trim()) {
    return `${pseudo} — Discord: ${p.discord_user_id.trim()}`;
  }
  return `${pseudo} — Discord ID manquant`;
}

/**
 * Construit l'embed pour une équipe mise à jour (diff lisible).
 */
export function buildTeamUpdatedEmbed(diff: TeamUpdateDiff): EmbedBuilder {
  const title = '📝 Équipe modifiée';
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(title)
    .setTimestamp(new Date());

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (diff.old_team_name !== undefined && diff.old_team_name !== diff.team_name) {
    fields.push({
      name: '👥 Nom équipe',
      value: `**Ancien :** ${diff.old_team_name}\n**Nouveau :** ${diff.team_name}`,
      inline: false,
    });
  } else {
    fields.push({
      name: '👥 Équipe',
      value: `**${diff.team_name}**\n\`team_api_id: ${diff.team_api_id}\``,
      inline: false,
    });
  }

  if (diff.playersRemoved.length > 0) {
    const value = diff.playersRemoved.map(formatPlayerLine).join('\n');
    fields.push({
      name: '➖ Joueurs retirés',
      value: truncate(value, MAX_FIELD_VALUE) || '*Aucun*',
      inline: false,
    });
  }

  if (diff.playersAdded.length > 0) {
    const value = diff.playersAdded.map(formatPlayerLine).join('\n');
    fields.push({
      name: '➕ Joueurs ajoutés',
      value: truncate(value, MAX_FIELD_VALUE) || '*Aucun*',
      inline: false,
    });
  }

  if (diff.discordIdChanges.length > 0) {
    const lines = diff.discordIdChanges.map(
      (c) =>
        `${c.lol_pseudo}: ${c.old_discord_id ?? '—'} → ${c.new_discord_id ?? '—'}`
    );
    fields.push({
      name: '🆔 Discord ID modifié',
      value: truncate(lines.join('\n'), MAX_FIELD_VALUE) || '*Aucun*',
      inline: false,
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: 'Équipe',
      value: diff.team_name,
      inline: false,
    });
  }

  embed.addFields(fields);
  embed.setFooter({ text: `team_api_id: ${diff.team_api_id}` });
  return embed;
}
