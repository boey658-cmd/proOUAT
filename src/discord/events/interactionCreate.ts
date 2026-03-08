/**
 * Événement interactionCreate : routage des boutons et commandes slash.
 * Try/catch global pour éviter toute erreur non gérée qui ferait remonter une rejection.
 */

import type { Client } from 'discord.js';
import { isCreateTeamCustomId } from '../../modules/discord/buttons/createTeamButtonCustomId.js';
import { handleCreateTeamButton } from '../../modules/discord/interactions/handleCreateTeamButton.js';
import { handleSyncdivCommand } from '../../commands/syncdiv.js';
import { handleCreationchaneldivCommand } from '../../commands/creationchaneldiv.js';

export function registerInteractionCreateEvent(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    try {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[interactionCreate] Erreur non gérée', { message, commandName: interaction.isChatInputCommand() ? interaction.commandName : undefined, customId: interaction.isButton() ? interaction.customId : undefined });
      const i = interaction as { replied?: boolean; deferred?: boolean; reply?: (opts: object) => Promise<unknown>; editReply?: (opts: object) => Promise<unknown> };
      if (typeof i.reply === 'function' && !i.replied && !i.deferred) {
        await i.reply({ content: 'Une erreur est survenue. Réessayez ou contactez le staff.', ephemeral: true }).catch(() => {});
      } else if (typeof i.editReply === 'function' && i.deferred) {
        await i.editReply({ content: 'Une erreur est survenue.' }).catch(() => {});
      }
    }
  });
}
