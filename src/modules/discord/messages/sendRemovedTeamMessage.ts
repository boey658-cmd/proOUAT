/**
 * Envoi du message staff pour une équipe désinscrite / absente du tournoi.
 */

import type { Client, TextChannel } from 'discord.js';
import type { RemovedTeamInfo } from '../../teams/syncTeamsWithDatabase.js';
import { buildTeamRemovedEmbed } from '../embeds/teamRemovedEmbed.js';
import { discordLogger } from '../logger.js';

export interface SendRemovedTeamMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Envoie l'embed "équipe désinscrite" dans le salon donné.
 */
export async function sendRemovedTeamMessage(
  client: Client,
  channelId: string,
  info: RemovedTeamInfo
): Promise<SendRemovedTeamMessageResult> {
  if (!channelId?.trim()) {
    discordLogger.warn('sendRemovedTeamMessage: channelId vide');
    return { success: false, error: 'channelId manquant' };
  }
  if (!info?.team_api_id) {
    discordLogger.warn('sendRemovedTeamMessage: info invalide');
    return { success: false, error: 'info invalide' };
  }

  try {
    const channel = await client.channels.fetch(channelId.trim());
    if (!channel || !channel.isTextBased()) {
      discordLogger.error('sendRemovedTeamMessage: salon introuvable ou non texte', {
        channelId,
      });
      return { success: false, error: 'Salon introuvable ou non texte' };
    }

    const embed = buildTeamRemovedEmbed(info);
    const message = await (channel as TextChannel).send({ embeds: [embed] });

    discordLogger.info('sendRemovedTeamMessage: message envoyé', {
      channelId,
      messageId: message.id,
      team_api_id: info.team_api_id,
    });
    return { success: true, messageId: message.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('sendRemovedTeamMessage: erreur envoi', {
      channelId,
      team_api_id: info.team_api_id,
      message,
    });
    return { success: false, error: message };
  }
}
