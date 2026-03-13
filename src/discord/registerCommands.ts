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
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Résumé lecture seule de la base (équipes, joueurs, divisions).')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('db')
      .setDescription('Consultation lecture seule de la base.')
      .addSubcommand((sc) =>
        sc
          .setName('anomalies')
          .setDescription('Liste les anomalies détectées (sans correction).')
      )
      .addSubcommand((sc) =>
        sc
          .setName('team')
          .setDescription('Affiche le détail d’une équipe par nom.')
          .addStringOption((opt) =>
            opt
              .setName('name')
              .setDescription('Nom ou partie du nom de l’équipe')
              .setRequired(true)
          )
      )
      .toJSON(),
  ];

  try {
    await application.commands.set(commands);
  } catch (err) {
    console.error('[discord] registerCommands:', err instanceof Error ? err.message : err);
  }
}
