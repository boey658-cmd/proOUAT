/**
 * Envoie un message d'audit une seule fois au démarrage du bot (connexion Discord établie).
 */

import type { Client } from 'discord.js';
import { sendAuditLog } from '../audit/sendAuditLog.js';
import { buildAuditMessage, AUDIT_PREFIX } from '../audit/buildAuditMessage.js';

/**
 * Envoie dans le salon audit : ℹ️ [Bot] Bot démarré — connexion Discord établie
 */
export async function sendBotStartedAudit(client: Client): Promise<void> {
  await sendAuditLog(
    client,
    buildAuditMessage('info', AUDIT_PREFIX.BOT, 'Bot démarré — connexion Discord établie')
  );
}
