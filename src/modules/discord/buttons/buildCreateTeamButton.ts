/**
 * Construction du bouton "Créer la team" et de sa ligne de composants.
 * Une responsabilité : produire l'ActionRow avec le bouton pour l'équipe.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { encodeCreateTeamCustomId } from './createTeamButtonCustomId.js';

const BUTTON_LABEL = 'Créer la team';

/**
 * Construit une ActionRow contenant le bouton "Créer la team".
 * @param teamApiId - Identifiant API de l'équipe (pour le customId)
 */
export function buildCreateTeamButton(teamApiId: string): ActionRowBuilder<ButtonBuilder> {
  const customId = encodeCreateTeamCustomId(teamApiId);
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(BUTTON_LABEL)
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}
