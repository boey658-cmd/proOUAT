/**
 * Événement ready : appelé quand le bot est connecté et prêt.
 */

import type { Client } from 'discord.js';

export function registerReadyEvent(client: Client): void {
  client.once('ready', () => {
    console.log('Bot logged in');
  });
}
