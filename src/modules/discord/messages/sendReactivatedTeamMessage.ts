/**
 * Envoi du message staff pour une équipe réinscrite dans le tournoi.
 */

import type { Client, TextChannel } from 'discord.js';
import type { ReactivatedTeamInfo } from '../../teams/syncTeamsWithDatabase.js';
import { buildTeamReactivatedEmbed } from '../embeds/teamReactivatedEmbed.js';
import { discordLogger } from '../logger.js';

export interface SendReactivatedTeamMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Envoie l'embed "équipe réinscrite" dans le salon donné.
 */
export async function sendReactivatedTeamMessage(
  client: Client,
  channelId: string,
  info: ReactivatedTeamInfo
): Promise<SendReactivatedTeamMessageResult> {
  if (!channelId?.trim()) {
    discordLogger.warn('sendReactivatedTeamMessage: channelId vide');
    return { success: false, error: 'channelId manquant' };
  }
  if (!info?.team_api_id) {
    discordLogger.warn('sendReactivatedTeamMessage: info invalide');
    return { success: false, error: 'info invalide' };
  }

  try {
    const channel = await client.channels.fetch(channelId.trim());
    if (!channel || !channel.isTextBased()) {
      discordLogger.error('sendReactivatedTeamMessage: salon introuvable ou non texte', {
        channelId,
      });
      return { success: false, error: 'Salon introuvable ou non texte' };
    }

    const embed = buildTeamReactivatedEmbed(info);
    const message = await (channel as TextChannel).send({ embeds: [embed] });

    discordLogger.info('sendReactivatedTeamMessage: message envoyé', {
      channelId,
      messageId: message.id,
      team_api_id: info.team_api_id,
    });
    return { success: true, messageId: message.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('sendReactivatedTeamMessage: erreur envoi', {
      channelId,
      team_api_id: info.team_api_id,
      message,
    });
    return { success: false, error: message };
  }
}
