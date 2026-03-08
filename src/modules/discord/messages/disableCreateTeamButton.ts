/**
 * Désactivation du bouton "Créer la team" sur le message d'origine (éviter double clic).
 */

import type { Message, MessageComponentInteraction } from 'discord.js';
import { discordLogger } from '../logger.js';

/**
 * Supprime les composants (boutons) du message d'origine pour empêcher un nouveau clic.
 */
export async function disableCreateTeamButton(
  interaction: MessageComponentInteraction
): Promise<{ success: boolean; error?: string }> {
  try {
    const message = interaction.message;
    if (!message || !('edit' in message)) {
      discordLogger.warn('disableCreateTeamButton: message non éditable');
      return { success: false, error: 'Message non éditable' };
    }

    await (message as Message).edit({ components: [] });

    discordLogger.info('disableCreateTeamButton: bouton supprimé', {
      messageId: message.id,
      channelId: message.channelId,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('disableCreateTeamButton: erreur Discord', {
      messageId: interaction.message?.id,
      message,
    });
    return { success: false, error: message };
  }
}
