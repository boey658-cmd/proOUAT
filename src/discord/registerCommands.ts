/**
 * Enregistrement des commandes slash auprès de l'API Discord.
 * Descriptions ≤ 100 caractères (limite Discord / validation discord.js), sinon toJSON() peut lever une erreur.
 */

import type { Client, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';

function tryCommandToJSON(
  label: string,
  build: () => RESTPostAPIApplicationCommandsJSONBody
): RESTPostAPIApplicationCommandsJSONBody | null {
  try {
    return build();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[discord] registerCommands: commande rejetée (sérialisation)', {
      command: label,
      message: msg,
    });
    return null;
  }
}

/**
 * Enregistre les commandes slash (global ou par guild).
 */
export async function registerCommands(client: Client<true>): Promise<void> {
  const application = client.application;
  if (!application) return;

  const candidates: (RESTPostAPIApplicationCommandsJSONBody | null)[] = [
    tryCommandToJSON('syncdiv', () =>
      new SlashCommandBuilder()
        .setName('syncdiv')
        .setDescription('Synchronise les divisions et groupes depuis le calendrier du tournoi.')
        .toJSON()
    ),
    tryCommandToJSON('desinscription', () =>
      new SlashCommandBuilder()
        .setName('desinscription')
        .setDescription(
          'Retire une équipe de la base SQLite (oubli DB). Aucune action sur Discord.'
        )
        .addStringOption((opt) =>
          opt
            .setName('team_api_id')
            .setDescription('Identifiant API équipe (team_api_id en base)')
            .setRequired(true)
        )
        .toJSON()
    ),
    tryCommandToJSON('creationchaneldiv', () =>
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
        .toJSON()
    ),
    tryCommandToJSON('stats', () =>
      new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Résumé lecture seule de la base (équipes, joueurs, divisions).')
        .toJSON()
    ),
    tryCommandToJSON('db', () =>
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
        .toJSON()
    ),
  ];

  const commands = candidates.filter(
    (c): c is RESTPostAPIApplicationCommandsJSONBody => c != null
  );

  if (commands.length === 0) {
    console.error('[discord] registerCommands: aucune commande valide, enregistrement annulé');
    return;
  }
  if (commands.length < candidates.length) {
    console.warn('[discord] registerCommands: certaines commandes ont été ignorées', {
      registered: commands.length,
      attempted: candidates.length,
    });
  }

  try {
    await application.commands.set(commands);
  } catch (err) {
    console.error('[discord] registerCommands:', err instanceof Error ? err.message : err);
  }
}
