/**
 * Notification staff des équipes désinscrites : envoi des embeds dans le salon staff.
 */

import type { Client } from 'discord.js';
import type { RemovedTeamInfo } from '../../teams/syncTeamsWithDatabase.js';
import { getStaffNewTeamChannelId, getDiscordNotificationDelayMs } from '../../../config/index.js';
import { sendRemovedTeamMessage } from './sendRemovedTeamMessage.js';
import { discordLogger } from '../logger.js';

export interface NotifyRemovedTeamsResult {
  sent: number;
  failed: number;
}

/**
 * Envoie un message staff pour chaque équipe désinscrite (même salon que les nouvelles équipes).
 */
export async function notifyRemovedTeams(
  client: Client,
  removed: RemovedTeamInfo[]
): Promise<NotifyRemovedTeamsResult> {
  const result: NotifyRemovedTeamsResult = { sent: 0, failed: 0 };
  if (!removed?.length) return result;

  const channelId = getStaffNewTeamChannelId();
  if (!channelId) {
    discordLogger.warn('notifyRemovedTeams: salon non configuré (STAFF_NEW_TEAM_CHANNEL_ID / NEW_TEAM_CHANNEL_ID)');
    return result;
  }

  discordLogger.info('notifyRemovedTeams: envoi des notifications', {
    count: removed.length,
    channelId,
  });

  const delayMs = getDiscordNotificationDelayMs();
  for (const info of removed) {
    const sendResult = await sendRemovedTeamMessage(client, channelId, info);
    if (sendResult.success) result.sent++;
    else result.failed++;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  discordLogger.info('notifyRemovedTeams: fin', { sent: result.sent, failed: result.failed });
  return result;
}
