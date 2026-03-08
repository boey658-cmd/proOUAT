/**
 * Événement ready : appelé quand le bot est connecté et prêt.
 */

import type { Client } from 'discord.js';
import { sendBotStartedAudit } from '../../monitoring/index.js';

export function registerReadyEvent(client: Client): void {
  client.once('ready', async (c) => {
    console.log('Bot logged in');
    await sendBotStartedAudit(c);
  });
}
