/**
 * Envoi du message staff pour une équipe modifiée (embed sans bouton).
 */

import type { Client, TextChannel } from 'discord.js';
import type { TeamUpdateDiff } from '../../teams/syncTeamsWithDatabase.js';
import { buildTeamUpdatedEmbed } from '../embeds/teamUpdatedEmbed.js';
import { isGuildIdAllowedForChannels } from '../../../config/index.js';
import { discordLogger } from '../logger.js';

export interface SendUpdatedTeamMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Envoie l'embed "équipe modifiée" dans le salon donné.
 */
export async function sendUpdatedTeamMessage(
  client: Client,
  channelId: string,
  diff: TeamUpdateDiff
): Promise<SendUpdatedTeamMessageResult> {
  if (!channelId?.trim()) {
    discordLogger.warn('sendUpdatedTeamMessage: channelId vide');
    return { success: false, error: 'channelId manquant' };
  }
  if (!diff?.team_api_id) {
    discordLogger.warn('sendUpdatedTeamMessage: diff invalide');
    return { success: false, error: 'diff invalide' };
  }

  try {
    const channel = await client.channels.fetch(channelId.trim());
    if (!channel || !channel.isTextBased()) {
      discordLogger.error('sendUpdatedTeamMessage: salon introuvable ou non texte', {
        channelId,
      });
      return { success: false, error: 'Salon introuvable ou non texte' };
    }
    const guildId = (channel as TextChannel).guildId ?? null;
    if (guildId && !isGuildIdAllowedForChannels(guildId)) {
      discordLogger.warn('sendUpdatedTeamMessage: salon hors serveurs autorisés', { channelId, guildId });
      return { success: false, error: 'Salon hors serveurs autorisés' };
    }

    const embed = buildTeamUpdatedEmbed(diff);
    const message = await (channel as TextChannel).send({ embeds: [embed] });

    discordLogger.info('sendUpdatedTeamMessage: message envoyé', {
      channelId,
      messageId: message.id,
      team_api_id: diff.team_api_id,
    });
    return { success: true, messageId: message.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('sendUpdatedTeamMessage: erreur envoi', {
      channelId,
      team_api_id: diff.team_api_id,
      message,
    });
    return { success: false, error: message };
  }
}
