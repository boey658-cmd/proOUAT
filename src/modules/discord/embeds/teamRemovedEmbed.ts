/**
 * Embed Discord pour une équipe désinscrite / absente du tournoi.
 */

import { EmbedBuilder } from 'discord.js';
import type { RemovedTeamInfo } from '../../teams/syncTeamsWithDatabase.js';

const EMBED_COLOR = 0xe74c3c; // Rouge

/**
 * Construit l'embed pour une équipe qui n'apparaît plus dans le scan tournoi.
 */
export function buildTeamRemovedEmbed(info: RemovedTeamInfo): EmbedBuilder {
  const detectedAt = new Date(info.detectedAt);
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('⚠️ Équipe désinscrite / absente du tournoi')
    .setTimestamp(detectedAt)
    .addFields(
      {
        name: '👥 Équipe',
        value: `**${info.team_name}**`,
        inline: false,
      },
      {
        name: '🆔 team_api_id',
        value: `\`${info.team_api_id}\``,
        inline: true,
      },
      {
        name: '📅 Détection',
        value: `Cette équipe n'apparaît plus dans le tournoi.\nDétecté le ${detectedAt.toLocaleString('fr-FR')}.`,
        inline: false,
      }
    )
    .setFooter({
      text: `ID base: ${info.team_id} — Rôles/salons Discord et données SQLite non supprimés automatiquement.`,
    });
}
