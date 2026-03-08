/**
 * Enregistrement de tous les événements sur le client Discord.
 */

import type { Client } from 'discord.js';
import { registerReadyEvent } from './ready.js';
import { registerInteractionCreateEvent } from './interactionCreate.js';
import { registerGuildMemberAddEvent } from './guildMemberAdd.js';

/**
 * Charge et enregistre tous les événements sur le client.
 */
export function registerEvents(client: Client): void {
  registerReadyEvent(client);
  registerInteractionCreateEvent(client);
  registerGuildMemberAddEvent(client);
}
