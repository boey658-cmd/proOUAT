/**
 * Enregistrement des commandes slash auprès de l'API Discord.
 */

import type { Client } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';

/**
 * Enregistre les commandes slash (global ou par guild).
 */
export async function registerCommands(client: Client<true>): Promise<void> {
  const application = client.application;
  if (!application) return;

  const commands = [
    new SlashCommandBuilder()
      .setName('syncdiv')
      .setDescription('Synchronise les divisions et groupes depuis le calendrier du tournoi.')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('creationchaneldiv')
      .setDescription('Organise les équipes de la division (catégories, renommage ou création rôle/salon).')
      .addIntegerOption((opt) =>
        opt
          .setName('division')
          .setDescription('Numéro de division (ex. 1)')
          .setRequired(true)
          .setMinValue(1)
      )
      .toJSON(),
  ];

  try {
    await application.commands.set(commands);
  } catch (err) {
    console.error('[discord] registerCommands:', err instanceof Error ? err.message : err);
  }
}
