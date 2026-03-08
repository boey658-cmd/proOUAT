/**
 * Notification staff des équipes modifiées : envoi des embeds dans le salon staff.
 */

import type { Client } from 'discord.js';
import type { TeamUpdateDiff } from '../../teams/syncTeamsWithDatabase.js';
import { getStaffNewTeamChannelId, getDiscordNotificationDelayMs } from '../../../config/index.js';
import { sendUpdatedTeamMessage } from './sendUpdatedTeamMessage.js';
import { discordLogger } from '../logger.js';

export interface NotifyUpdatedTeamsResult {
  sent: number;
  failed: number;
}

/**
 * Envoie un message staff pour chaque équipe modifiée (même salon que les nouvelles équipes).
 */
export async function notifyUpdatedTeams(
  client: Client,
  diffs: TeamUpdateDiff[]
): Promise<NotifyUpdatedTeamsResult> {
  const result: NotifyUpdatedTeamsResult = { sent: 0, failed: 0 };
  if (!diffs?.length) return result;

  const channelId = getStaffNewTeamChannelId();
  if (!channelId) {
    discordLogger.warn('notifyUpdatedTeams: salon non configuré (STAFF_NEW_TEAM_CHANNEL_ID / NEW_TEAM_CHANNEL_ID)');
    return result;
  }

  discordLogger.info('notifyUpdatedTeams: envoi des notifications', {
    count: diffs.length,
    channelId,
  });

  const delayMs = getDiscordNotificationDelayMs();
  for (const diff of diffs) {
    const sendResult = await sendUpdatedTeamMessage(client, channelId, diff);
    if (sendResult.success) result.sent++;
    else result.failed++;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  discordLogger.info('notifyUpdatedTeams: fin', { sent: result.sent, failed: result.failed });
  return result;
}
