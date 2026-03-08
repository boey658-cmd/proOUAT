/**
 * Notification staff des équipes réinscrites : envoi des embeds dans le salon staff.
 */

import type { Client } from 'discord.js';
import type { ReactivatedTeamInfo } from '../../teams/syncTeamsWithDatabase.js';
import { getStaffNewTeamChannelId, getDiscordNotificationDelayMs } from '../../../config/index.js';
import { sendReactivatedTeamMessage } from './sendReactivatedTeamMessage.js';
import { discordLogger } from '../logger.js';

export interface NotifyReactivatedTeamsResult {
  sent: number;
  failed: number;
}

/**
 * Envoie un message staff pour chaque équipe réinscrite (même salon que les nouvelles équipes).
 */
export async function notifyReactivatedTeams(
  client: Client,
  reactivated: ReactivatedTeamInfo[]
): Promise<NotifyReactivatedTeamsResult> {
  const result: NotifyReactivatedTeamsResult = { sent: 0, failed: 0 };
  if (!reactivated?.length) return result;

  const channelId = getStaffNewTeamChannelId();
  if (!channelId) {
    discordLogger.warn('notifyReactivatedTeams: salon non configuré (STAFF_NEW_TEAM_CHANNEL_ID / NEW_TEAM_CHANNEL_ID)');
    return result;
  }

  discordLogger.info('notifyReactivatedTeams: envoi des notifications', {
    count: reactivated.length,
    channelId,
  });

  const delayMs = getDiscordNotificationDelayMs();
  for (const info of reactivated) {
    const sendResult = await sendReactivatedTeamMessage(client, channelId, info);
    if (sendResult.success) result.sent++;
    else result.failed++;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  discordLogger.info('notifyReactivatedTeams: fin', { sent: result.sent, failed: result.failed });
  return result;
}
