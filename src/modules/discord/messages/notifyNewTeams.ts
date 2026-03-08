/**
 * Notification des nouvelles équipes : envoi des embeds dans le salon staff configuré.
 * Une responsabilité : orchestrer l'envoi pour plusieurs équipes (channel depuis config).
 */

import type { Client } from 'discord.js';
import type { NormalizedTeam } from '../../teams/types.js';
import { getStaffNewTeamChannelId, getDiscordNotificationDelayMs } from '../../../config/index.js';
import { sendNewTeamMessage } from './sendNewTeamMessage.js';
import { discordLogger } from '../logger.js';

export interface NotifyNewTeamsResult {
  sent: number;
  failed: number;
}

/**
 * Envoie un message staff pour chaque nouvelle équipe dans le salon configuré.
 * Si STAFF_NEW_TEAM_CHANNEL_ID (ou NEW_TEAM_CHANNEL_ID) n'est pas défini, aucun envoi.
 */
export async function notifyNewTeams(
  client: Client,
  normalizedTeams: NormalizedTeam[]
): Promise<NotifyNewTeamsResult> {
  const result: NotifyNewTeamsResult = { sent: 0, failed: 0 };
  if (!normalizedTeams?.length) return result;

  const channelId = getStaffNewTeamChannelId();
  if (!channelId) {
    discordLogger.warn('notifyNewTeams: salon non configuré (STAFF_NEW_TEAM_CHANNEL_ID / NEW_TEAM_CHANNEL_ID)');
    return result;
  }

  discordLogger.info('notifyNewTeams: envoi des notifications', {
    count: normalizedTeams.length,
    channelId,
  });

  const delayMs = getDiscordNotificationDelayMs();
  for (const team of normalizedTeams) {
    const sendResult = await sendNewTeamMessage(client, channelId, team);
    if (sendResult.success) result.sent++;
    else result.failed++;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  discordLogger.info('notifyNewTeams: fin', { sent: result.sent, failed: result.failed });
  return result;
}
