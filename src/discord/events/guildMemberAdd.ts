/**
 * Événement guildMemberAdd : attribution automatique du rôle équipe au membre qui rejoint.
 */

import type { Client } from 'discord.js';
import { handleGuildMemberJoin } from '../../modules/discord/members/handleGuildMemberJoin.js';

export function registerGuildMemberAddEvent(client: Client): void {
  client.on('guildMemberAdd', async (member) => {
    await handleGuildMemberJoin(member);
  });
}
