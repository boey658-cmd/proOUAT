/**
 * Événement interactionCreate : routage des boutons et commandes slash.
 */

import type { Client } from 'discord.js';
import { isCreateTeamCustomId } from '../../modules/discord/buttons/createTeamButtonCustomId.js';
import { handleCreateTeamButton } from '../../modules/discord/interactions/handleCreateTeamButton.js';
import { handleSyncdivCommand } from '../../commands/syncdiv.js';
import { handleCreationchaneldivCommand } from '../../commands/creationchaneldiv.js';

export function registerInteractionCreateEvent(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      if (isCreateTeamCustomId(interaction.customId)) {
        await handleCreateTeamButton(interaction);
      }
      return;
    }
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'syncdiv') {
        await handleSyncdivCommand(interaction);
      } else if (interaction.commandName === 'creationchaneldiv') {
        await handleCreationchaneldivCommand(interaction);
      }
    }
  });
}
