/**
 * Construction de l'embed Discord pour une nouvelle équipe.
 * Une responsabilité : produire un EmbedBuilder à partir d'une NormalizedTeam.
 */

import { EmbedBuilder } from 'discord.js';
import type { NormalizedTeam, NormalizedPlayer } from '../../teams/types.js';
import type { NewTeamEmbedOptions, PlayerPresenceStatus } from '../types.js';

/** Bleu clair */
const EMBED_COLOR = 0x5dade2;
const MAX_FIELD_VALUE_LENGTH = 1024;
const DEFAULT_TITLE = '🔥 Nouvelle équipe inscrite !';

/**
 * Détermine le statut d'affichage d'un joueur (présent / absent / discord id manquant).
 */
export function getPlayerPresenceStatus(player: NormalizedPlayer): PlayerPresenceStatus {
  if (!player.discord_user_id || player.discord_user_id.trim() === '') {
    return 'discord_id_missing';
  }
  if (player.discord_presence_on_guild === true || player.discord_member_found === true) {
    return 'present';
  }
  return 'absent';
}

/**
 * Icône du statut pour l'embed (✅ présent, ❌ absent, ❓ discord id manquant).
 */
export function getPlayerPresenceIcon(status: PlayerPresenceStatus): string {
  switch (status) {
    case 'present':
      return '✅';
    case 'absent':
      return '❌';
    case 'discord_id_missing':
      return '❓';
    default:
      return '❓';
  }
}

/**
 * Libellé lisible du statut (conservé pour usage éventuel).
 */
export function getPlayerPresenceLabel(status: PlayerPresenceStatus): string {
  switch (status) {
    case 'present':
      return 'Présent sur le serveur';
    case 'absent':
      return 'Absent du serveur';
    case 'discord_id_missing':
      return 'Discord ID manquant';
    default:
      return 'Inconnu';
  }
}

function getDisplayName(p: NormalizedPlayer): string {
  return (p.lol_pseudo?.trim() && p.lol_pseudo.trim().length > 0)
    ? p.lol_pseudo.trim()
    : `Joueur ${p.player_api_id ?? '?'}`;
}

/**
 * Une ligne joueur : ✅ SummonerName — Discord: 123456789 ou ❓ SummonerName — Discord ID manquant.
 */
function formatPlayerLine(p: NormalizedPlayer): string {
  const status = getPlayerPresenceStatus(p);
  const icon = getPlayerPresenceIcon(status);
  const displayName = getDisplayName(p);
  if (p.discord_user_id?.trim()) {
    return `${icon} ${displayName} — Discord: ${p.discord_user_id.trim()}`;
  }
  return `${icon} ${displayName} — Discord ID manquant`;
}

/**
 * Champ Joueurs (X) : liste avec icônes.
 */
function formatPlayersField(team: NormalizedTeam): string {
  if (!team.players?.length) {
    return '*Aucun joueur*';
  }
  const lines = team.players.map(formatPlayerLine);
  const value = lines.join('\n');
  if (value.length > MAX_FIELD_VALUE_LENGTH) {
    return value.slice(0, MAX_FIELD_VALUE_LENGTH - 3) + '...';
  }
  return value;
}

/**
 * Champ Staff (X) : liste avec icônes (même format que joueurs).
 */
function formatStaffField(team: NormalizedTeam): string {
  const staff = team.staff;
  if (!staff?.length) {
    return '*Aucun staff*';
  }
  const lines = staff.map(formatPlayerLine);
  const value = lines.join('\n');
  if (value.length > MAX_FIELD_VALUE_LENGTH) {
    return value.slice(0, MAX_FIELD_VALUE_LENGTH - 3) + '...';
  }
  return value;
}

/**
 * Construit l'embed Discord pour une nouvelle équipe.
 */
export function buildNewTeamEmbed(
  normalizedTeam: NormalizedTeam,
  options?: NewTeamEmbedOptions
): EmbedBuilder {
  const detectedAt = options?.detectedAt
    ? new Date(options.detectedAt)
    : new Date();

  const fields: { name: string; value: string; inline: boolean }[] = [
    {
      name: '👥 Équipe',
      value: `**${normalizedTeam.team_name}**`,
      inline: false,
    },
    {
      name: `👥 Joueurs (${normalizedTeam.players?.length ?? 0})`,
      value: formatPlayersField(normalizedTeam),
      inline: false,
    },
  ];
  if (normalizedTeam.staff?.length) {
    fields.push({
      name: `👔 Staff (${normalizedTeam.staff.length})`,
      value: formatStaffField(normalizedTeam),
      inline: false,
    });
  }
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(options?.title ?? DEFAULT_TITLE)
    .setTimestamp(detectedAt)
    .addFields(fields);

  const footerParts: string[] = ['État: non créée (rôle/salon)'];
  if (options?.tournamentName?.trim()) {
    footerParts.unshift(`Tournoi: ${options.tournamentName.trim()}`);
  }
  embed.setFooter({ text: footerParts.join(' • ') });

  if (options?.thumbnailUrl?.trim()) {
    embed.setThumbnail(options.thumbnailUrl.trim());
  }

  return embed;
}
