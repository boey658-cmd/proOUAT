/**
 * Enregistrement des commandes slash auprès de l'API Discord.
 * Descriptions ≤ 100 caractères (limite Discord / validation discord.js), sinon toJSON() peut lever une erreur.
 */

import type { Client, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { ChannelType, SlashCommandBuilder } from 'discord.js';

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
    tryCommandToJSON('ouat', () =>
      new SlashCommandBuilder()
        .setName('ouat')
        .setDescription('Outils OUATventure : audit lecture seule et liaisons manuelles (SQLite).')
        .addSubcommand((sc) =>
          sc
            .setName('audit')
            .setDescription('Audit Discord↔BDD (lecture seule).')
            .addIntegerOption((opt) =>
              opt
                .setName('division')
                .setDescription('Filtrer par numéro de division (optionnel).')
                .setMinValue(1)
                .setRequired(false)
            )
        )
        .addSubcommand((sc) =>
          sc
            .setName('check')
            .setDescription('Lister uniquement les équipes problématiques (lecture seule).')
            .addIntegerOption((opt) =>
              opt
                .setName('division')
                .setDescription('Filtrer par numéro de division (optionnel).')
                .setMinValue(1)
                .setRequired(false)
            )
        )
        .addSubcommand((sc) =>
          sc
            .setName('overview')
            .setDescription('Résumé lisible des équipes (rôle, salon, cat.) sans ID technique.')
            .addIntegerOption((opt) =>
              opt
                .setName('division')
                .setDescription('Filtrer par numéro de division (optionnel).')
                .setMinValue(1)
                .setRequired(false)
            )
            .addStringOption((opt) =>
              opt
                .setName('vue')
                .setDescription('Limiter les blocs affichés (filtre affichage).')
                .setRequired(false)
                .addChoices(
                  { name: 'Tout afficher', value: 'tout' },
                  { name: 'Rôles uniquement', value: 'roles' },
                  { name: 'Salons uniquement', value: 'salons' },
                  { name: 'Catégories uniquement', value: 'categories' },
                  { name: 'Critiques (salon/rôle absent)', value: 'problemes' }
                )
            )
        )
        .addSubcommand((sc) =>
          sc
            .setName('links')
            .setDescription('Liaisons team ↔ Discord (IDs + noms, lecture seule).')
            .addIntegerOption((opt) =>
              opt
                .setName('division')
                .setDescription('Filtrer par numéro de division (optionnel).')
                .setMinValue(1)
                .setRequired(false)
            )
            .addStringOption((opt) =>
              opt
                .setName('vue')
                .setDescription('Filtrer les équipes listées.')
                .setRequired(false)
                .addChoices(
                  { name: 'Toutes', value: 'all' },
                  { name: 'Problèmes uniquement', value: 'problems' },
                  { name: 'OK uniquement', value: 'ok' },
                  { name: 'Souci rôle', value: 'roles' },
                  { name: 'Souci salon', value: 'channels' }
                )
            )
            .addStringOption((opt) =>
              opt
                .setName('team_api_id')
                .setDescription('Cibler une seule équipe (team_api_id en base).')
                .setRequired(false)
            )
        )
        .addSubcommandGroup((group) =>
          group
            .setName('add')
            .setDescription('Lier une ressource Discord existante (écriture SQLite uniquement).')
            .addSubcommand((sc) =>
              sc
                .setName('channel')
                .setDescription('Attacher un salon texte existant à une équipe (BDD).')
                .addStringOption((opt) =>
                  opt
                    .setName('team_api_id')
                    .setDescription('Identifiant API équipe (team_api_id en base)')
                    .setRequired(true)
                )
                .addChannelOption((opt) =>
                  opt
                    .setName('salon')
                    .setDescription('Salon texte à lier')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
                )
                .addBooleanOption((opt) =>
                  opt
                    .setName('remplacer')
                    .setDescription('Si vrai, remplace le salon actif au lieu de refuser.')
                    .setRequired(false)
                )
            )
            .addSubcommand((sc) =>
              sc
                .setName('role')
                .setDescription('Attacher un rôle existant à une équipe (BDD).')
                .addStringOption((opt) =>
                  opt
                    .setName('team_api_id')
                    .setDescription('Identifiant API équipe (team_api_id en base)')
                    .setRequired(true)
                )
                .addRoleOption((opt) =>
                  opt.setName('role').setDescription('Rôle Discord à lier').setRequired(true)
                )
                .addBooleanOption((opt) =>
                  opt
                    .setName('remplacer')
                    .setDescription('Si vrai, remplace le rôle actif au lieu de refuser.')
                    .setRequired(false)
                )
            )
        )
        .addSubcommandGroup((group) =>
          group
            .setName('remove')
            .setDescription('Détacher salon ou rôle actif en base (sans toucher à Discord).')
            .addSubcommand((sc) =>
              sc
                .setName('channel')
                .setDescription('Retirer le salon actif de team_discord_state (BDD).')
                .addStringOption((opt) =>
                  opt
                    .setName('team_api_id')
                    .setDescription('Identifiant API équipe (team_api_id en base)')
                    .setRequired(true)
                )
            )
            .addSubcommand((sc) =>
              sc
                .setName('role')
                .setDescription('Retirer le rôle actif de team_discord_state (BDD).')
                .addStringOption((opt) =>
                  opt
                    .setName('team_api_id')
                    .setDescription('Identifiant API équipe (team_api_id en base)')
                    .setRequired(true)
                )
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
