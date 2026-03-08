/**
 * Envoi du message staff pour une nouvelle équipe (embed + bouton "Créer la team").
 * Une responsabilité : envoyer l'embed et le bouton dans le salon configuré.
 */

import type { Client, Guild, TextChannel } from 'discord.js';
import type { NormalizedTeam, NormalizedPlayer } from '../../teams/types.js';
import type { SendNewTeamMessageResult } from '../types.js';
import { buildNewTeamEmbed } from '../embeds/newTeamEmbed.js';
import { buildCreateTeamButton } from '../buttons/buildCreateTeamButton.js';
import { discordLogger } from '../logger.js';
import * as teamsRepo from '../../../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../../../db/repositories/teamDiscordState.js';

/**
 * Enrichit l'équipe avec la présence Discord sur le serveur (discord_member_found).
 * Utilise le guild du salon pour vérifier si chaque joueur (discord_user_id) est membre.
 */
async function enrichTeamWithPresence(
  team: NormalizedTeam,
  guild: Guild
): Promise<NormalizedTeam> {
  const enrichedPlayers: NormalizedPlayer[] = await Promise.all(
    team.players.map(async (p): Promise<NormalizedPlayer> => {
      const discordId = p.discord_user_id?.trim();
      if (!discordId) {
        return { ...p, discord_member_found: false };
      }
      try {
        const member = await guild.members.fetch(discordId);
        const found = member !== null && String(member.id) === String(discordId);
        return { ...p, discord_member_found: found };
      } catch {
        return { ...p, discord_member_found: false };
      }
    })
  );
  return { ...team, players: enrichedPlayers };
}

/**
 * Envoie l'embed nouvelle équipe dans le salon donné.
 * @param client - Client Discord (prêt)
 * @param channelId - ID du salon (staff nouvelles équipes)
 * @param normalizedTeam - Équipe normalisée
 * @returns Résultat (success, messageId ou error)
 */
export async function sendNewTeamMessage(
  client: Client,
  channelId: string,
  normalizedTeam: NormalizedTeam
): Promise<SendNewTeamMessageResult> {
  if (!channelId || channelId.trim() === '') {
    discordLogger.warn('sendNewTeamMessage: channelId vide');
    return { success: false, error: 'channelId manquant' };
  }
  if (!normalizedTeam?.team_api_id) {
    discordLogger.warn('sendNewTeamMessage: équipe invalide');
    return { success: false, error: 'équipe invalide' };
  }

  try {
    const channel = await client.channels.fetch(channelId.trim());
    if (!channel || !channel.isTextBased()) {
      discordLogger.error('sendNewTeamMessage: salon introuvable ou non texte', {
        channelId,
      });
      return { success: false, error: 'Salon introuvable ou non texte' };
    }

    const textChannel = channel as TextChannel;
    const guildId = textChannel.guildId ?? null;
    let teamForEmbed = normalizedTeam;
    if (guildId) {
      try {
        const guild = await client.guilds.fetch(guildId);
        teamForEmbed = await enrichTeamWithPresence(normalizedTeam, guild);
      } catch (err) {
        discordLogger.warn('sendNewTeamMessage: impossible de récupérer le guild pour présence', {
          guildId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const embed = buildNewTeamEmbed(teamForEmbed, {
      detectedAt: new Date(),
    });
    let showButton = true;
    if (guildId) {
      const team = teamsRepo.findTeamByApiId(normalizedTeam.team_api_id);
      if (team) {
        const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
        if (state?.active_guild_id === guildId && (state.active_role_id || state.active_channel_id)) {
          showButton = false;
          discordLogger.info('sendNewTeamMessage: équipe a déjà des ressources, pas de bouton', {
            team_api_id: normalizedTeam.team_api_id,
            guildId,
          });
        }
      }
    }
    const components = showButton ? [buildCreateTeamButton(normalizedTeam.team_api_id)] : [];
    const message = await textChannel.send({
      embeds: [embed],
      components,
    });

    discordLogger.info('sendNewTeamMessage: message envoyé', {
      channelId,
      messageId: message.id,
      team_api_id: normalizedTeam.team_api_id,
    });
    return { success: true, messageId: message.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discordLogger.error('sendNewTeamMessage: erreur envoi', {
      channelId,
      team_api_id: normalizedTeam.team_api_id,
      message,
    });
    return { success: false, error: message };
  }
}
