/**
 * Envoi des logs d'audit dans le salon Discord configuré (AUDIT_LOG_CHANNEL_ID).
 * Messages lisibles par le staff, sans jargon technique. Les erreurs d'envoi sont loguées en console uniquement.
 */

import type { Client, TextChannel } from 'discord.js';
import { getAuditLogChannelId, isGuildIdAllowedForChannels } from '../config/index.js';

const PREFIX = '[audit]';

function logAuditError(message: string, reason?: string): void {
  const parts = [PREFIX, 'error', message];
  if (reason) parts.push(reason);
  console.error(parts.join(' '));
}

/**
 * Envoie un message texte dans le salon d'audit.
 * Ne lance pas d'exception : si le salon est absent ou l'envoi échoue, un log console est émis.
 */
export async function sendAuditLog(
  client: Client | null,
  message: string
): Promise<boolean> {
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return false;
  }

  const channelId = getAuditLogChannelId();
  if (!channelId) {
    return false;
  }

  if (!client) {
    logAuditError('sendAuditLog: client Discord absent');
    return false;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      logAuditError('sendAuditLog: salon introuvable ou non texte', channelId);
      return false;
    }
    const channelGuildId = (channel as TextChannel).guildId ?? null;
    if (channelGuildId && !isGuildIdAllowedForChannels(channelGuildId)) {
      logAuditError('sendAuditLog: salon audit hors serveurs autorisés (DISCORD_GUILD_ID_1/2)', channelGuildId);
      return false;
    }
    const content = message.trim();
    const textChannel = channel as TextChannel;
    if (content.length > 2000) {
      await textChannel.send(content.slice(0, 1997) + '…');
    } else {
      await textChannel.send(content);
    }
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logAuditError('sendAuditLog: envoi échoué', reason);
    return false;
  }
}

export interface AuditEmbedOptions {
  title: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
}

/**
 * Envoie un embed dans le salon d'audit (résumés structurés).
 * Même gestion d'erreurs que sendAuditLog.
 */
export async function sendAuditLogEmbed(
  client: Client | null,
  options: AuditEmbedOptions
): Promise<boolean> {
  const channelId = getAuditLogChannelId();
  if (!channelId) return false;
  if (!client) {
    logAuditError('sendAuditLogEmbed: client Discord absent');
    return false;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      logAuditError('sendAuditLogEmbed: salon introuvable ou non texte', channelId);
      return false;
    }
    const channelGuildId = (channel as TextChannel).guildId ?? null;
    if (channelGuildId && !isGuildIdAllowedForChannels(channelGuildId)) {
      logAuditError('sendAuditLogEmbed: salon audit hors serveurs autorisés (DISCORD_GUILD_ID_1/2)', channelGuildId);
      return false;
    }

    const textChannel = channel as TextChannel;
    const embed: {
      title: string;
      description?: string;
      color?: number;
      fields?: { name: string; value: string; inline?: boolean }[];
      footer?: { text: string };
      timestamp?: string;
    } = {
      title: options.title,
      timestamp: new Date().toISOString(),
    };
    if (options.description) embed.description = options.description;
    if (options.color != null) embed.color = options.color;
    if (options.fields?.length) embed.fields = options.fields;
    if (options.footer) embed.footer = { text: options.footer };

    await textChannel.send({ embeds: [embed] });
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logAuditError('sendAuditLogEmbed: envoi échoué', reason);
    return false;
  }
}
