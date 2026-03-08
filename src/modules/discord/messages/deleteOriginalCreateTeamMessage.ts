/**
 * Suppression du message d'origine "Créer la team" du salon staff après création réussie.
 * Le message ne doit plus apparaître dans le salon principal (uniquement dans l'archive).
 */

import type { Message, MessageComponentInteraction } from 'discord.js';
import { discordLogger } from '../logger.js';

/**
 * Supprime complètement le message d'origine du salon staff.
 * À appeler après archivage réussi.
 */
export async function deleteOriginalCreateTeamMessage(
  interaction: MessageComponentInteraction
): Promise<{ success: boolean; error?: string }> {
  try {
    const message = interaction.message;
    if (!message || !('delete' in message)) {
      discordLogger.warn('deleteOriginalCreateTeamMessage: message non supprimable', {
        messageId: interaction.message?.id,
      });
      return { success: false, error: 'Message non supprimable' };
    }

    await (message as Message).delete();

    discordLogger.info('deleteOriginalCreateTeamMessage: message original supprimé', {
      messageId: message.id,
      channelId: message.channelId,
    });
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    discordLogger.warn('deleteOriginalCreateTeamMessage: suppression impossible', {
      messageId: interaction.message?.id,
      channelId: interaction.channelId,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}
