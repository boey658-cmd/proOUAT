/**
 * Embed Discord pour une équipe réinscrite dans le tournoi (retour après désinscription).
 */

import { EmbedBuilder } from 'discord.js';
import type { ReactivatedTeamInfo } from '../../teams/syncTeamsWithDatabase.js';

const EMBED_COLOR = 0x27ae60; // Vert

/**
 * Construit l'embed pour une équipe qui réapparaît dans le scan après avoir été désinscrite.
 */
export function buildTeamReactivatedEmbed(info: ReactivatedTeamInfo): EmbedBuilder {
  const detectedAt = new Date(info.detectedAt);
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('✅ Équipe réinscrite dans le tournoi')
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
        name: '👤 Joueurs',
        value: `${info.playerCount} joueur(s)`,
        inline: true,
      },
      {
        name: '📅 Détection',
        value: `Équipe revenue dans le tournoi.\nDétecté le ${detectedAt.toLocaleString('fr-FR')}.`,
        inline: false,
      }
    )
    .setFooter({ text: `ID base: ${info.team_id}` });
}
