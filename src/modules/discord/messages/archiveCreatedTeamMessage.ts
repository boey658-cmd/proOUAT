/**
 * Archivage du message "équipe créée" dans le salon historique (sans bouton).
 */

import type { Client } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getStaffArchiveTeamChannelId } from '../../../config/index.js';
import { discordLogger } from '../logger.js';

export interface ArchiveCreatedTeamParams {
  /** Données de l'embed d'origine (ex. message.embeds[0].toJSON()) pour cloner. */
  originalEmbedData: Record<string, unknown> | null;
  /** Nom du serveur Discord. */
  guildName: string;
  /** ID du serveur. */
  guildId: string;
  /** ID du salon créé. */
  channelId: string;
  /** ID du rôle créé (null si mode dégradé). */
  roleId: string | null;
  /** Nom de l'équipe. */
  teamName: string;
}

/**
 * Envoie un embed "équipe créée" dans le salon d'archivage (sans bouton).
 */
export async function archiveCreatedTeamMessage(
  client: Client,
  params: ArchiveCreatedTeamParams
): Promise<{ success: boolean; error?: string }> {
  const archiveChannelId = getStaffArchiveTeamChannelId();
  if (!archiveChannelId) {
    discordLogger.warn('archiveCreatedTeamMessage: salon d\'archivage non configuré (STAFF_ARCHIVE_TEAM_CHANNEL_ID)');
    return { success: false, error: 'Salon d\'archivage non configuré' };
  }

  try {
    const channel = await client.channels.fetch(archiveChannelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      discordLogger.error('archiveCreatedTeamMessage: salon introuvable ou non envoi', {
        archiveChannelId,
      });
      return { success: false, error: 'Salon d\'archivage introuvable' };
    }

    const embed =
      params.originalEmbedData && Object.keys(params.originalEmbedData).length > 0
        ? new EmbedBuilder(params.originalEmbedData as import('discord.js').APIEmbed)
        : new EmbedBuilder()
            .setTitle(`✅ Équipe créée : ${params.teamName}`)
            .setColor(0x5dade2);

    embed.addFields(
      {
        name: 'Statut',
        value: '✅ Salon créé',
        inline: true,
      },
      {
        name: 'Serveur',
        value: `${params.guildName} (\`${params.guildId}\`)`,
        inline: true,
      },
      {
        name: 'Salon',
        value: `<#${params.channelId}>`,
        inline: true,
      },
      {
        name: 'Rôle',
        value: params.roleId ? `<@&${params.roleId}>` : '— (mode dégradé)',
        inline: false,
      }
    );
    embed.setFooter({ text: 'Archivé après création' });
    embed.setTimestamp(new Date());

    await (channel as import('discord.js').TextChannel).send({
      embeds: [embed],
      components: [],
    });

    discordLogger.info('archiveCreatedTeamMessage: message archivé', {
      archiveChannelId,
      teamName: params.teamName,
      guildId: params.guildId,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('archiveCreatedTeamMessage: erreur Discord', {
      archiveChannelId,
      message,
    });
    return { success: false, error: message };
  }
}
