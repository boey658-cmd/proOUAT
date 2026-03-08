/**
 * Déplacement des salons d'équipes dans la catégorie de division (serveur 1).
 * Une responsabilité : déplacer un salon existant dans une catégorie.
 * Réordonnancement : texte 1A/1B/1C/1D puis vocaux 1A/1B/1C/1D, en une seule opération bulk.
 */

import type { Guild, GuildBasedChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import { groupLabelToSortKey } from './utils.js';
import { divisionsLogger } from './logger.js';

export interface MoveTeamChannelResult {
  success: boolean;
  error?: string;
}

export interface MoveTeamChannelLogContext {
  teamId: number;
  team_api_id: string;
  teamName: string;
}

function logCtx(ctx: MoveTeamChannelLogContext | undefined) {
  return ctx
    ? { teamId: ctx.teamId, teamApiId: ctx.team_api_id, teamName: ctx.teamName }
    : {};
}

/**
 * Déplace le salon d'une équipe dans la catégorie de division.
 * Ne fait rien si le salon n'existe pas ou n'est pas déplaçable.
 */
export async function moveTeamChannelToCategory(
  guild: Guild,
  channelId: string,
  categoryId: string,
  logContext?: MoveTeamChannelLogContext
): Promise<MoveTeamChannelResult> {
  const baseLog = {
    guildId: guild.id,
    channelId,
    categoryId,
    ...logCtx(logContext),
  };

  let channel: GuildBasedChannel | null;
  try {
    channel = await guild.channels.fetch(channelId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const causeHint =
      /missing access|missing permissions/i.test(message)
        ? 'vérifier View Channel + Manage Channels sur le salon et la catégorie'
        : undefined;
    divisionsLogger.error('moveTeamChannelToCategory: opération échouée', {
      ...baseLog,
      operation: 'fetch',
      message,
      ...(causeHint ? { causePossible: causeHint } : {}),
    });
    return { success: false, error: message };
  }

  if (!channel) {
    divisionsLogger.warn('moveTeamChannelToCategory: salon introuvable', baseLog);
    return { success: false, error: 'Salon introuvable' };
  }

  const channelName = 'name' in channel ? (channel as { name: string }).name : undefined;
  const parentId = 'parentId' in channel ? (channel as { parentId: string | null }).parentId ?? null : null;

  if (!('setParent' in channel)) {
    divisionsLogger.warn('moveTeamChannelToCategory: salon non déplaçable', {
      ...baseLog,
      channelName,
      parentId,
    });
    return { success: false, error: 'Salon non déplaçable' };
  }

  try {
    await (channel as { setParent: (id: string, opts?: { lockPermissions?: boolean; reason?: string }) => Promise<unknown> }).setParent(categoryId, {
      lockPermissions: false,
      reason: 'Déplacement division /creationchaneldiv',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const causeHint =
      /missing access|missing permissions/i.test(message)
        ? 'vérifier View Channel + Manage Channels sur le salon et la catégorie'
        : undefined;
    divisionsLogger.error('moveTeamChannelToCategory: opération échouée', {
      ...baseLog,
      channelName,
      parentId,
      operation: 'setParent',
      message,
      ...(causeHint ? { causePossible: causeHint } : {}),
    });
    return { success: false, error: message };
  }

  divisionsLogger.info('moveTeamChannelToCategory: salon déplacé', {
    ...baseLog,
    channelName,
    parentId,
  });
  return { success: true };
}

/** Extrait la lettre de groupe du nom de salon (ex. "1A-hsd-atlas" → "A"). */
function getGroupLetterFromChannelName(channel: GuildBasedChannel): string {
  const name = 'name' in channel ? (channel as { name: string }).name : '';
  const match = /^\d+([A-Da-d])/.exec(name);
  return match ? match[1].toUpperCase() : '?';
}

/** Tri : groupe (1A, 1B, 1C, 1D) puis nom. */
function sortChannelsByGroupThenName(a: GuildBasedChannel, b: GuildBasedChannel): number {
  const nameA = 'name' in a ? (a as { name: string }).name : '';
  const nameB = 'name' in b ? (b as { name: string }).name : '';
  const groupA = groupLabelToSortKey(getGroupLetterFromChannelName(a));
  const groupB = groupLabelToSortKey(getGroupLetterFromChannelName(b));
  if (groupA !== groupB) return groupA - groupB;
  return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
}

/**
 * Réordonne les salons d'une catégorie division : textes 1A→1B→1C→1D (par nom), puis vocaux 1A→1B→1C→1D (par nom).
 * Une seule opération bulk (setPositions) pour éviter lenteur et bugs des setPosition salon par salon.
 * À appeler après avoir déplacé tous les salons (et créé les vocaux) dans la catégorie.
 */
export async function reorderDivisionChannels(
  guild: Guild,
  categoryId: string,
  divisionNumber: number
): Promise<void> {
  const channelsInCategory = guild.channels.cache.filter((ch) => ch.parentId === categoryId);
  const list = [...channelsInCategory.values()];

  const textChannels = list.filter((ch) => ch.type === ChannelType.GuildText);
  const voiceChannels = list.filter((ch) => ch.type === ChannelType.GuildVoice);
  const otherChannels = list.filter(
    (ch) => ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice
  );

  const countText = textChannels.length;
  const countVoice = voiceChannels.length;
  const countTotal = list.length;

  divisionsLogger.info('reorderDivisionChannels: début', {
    divisionNumber,
    categoryId,
    guildId: guild.id,
    countText,
    countVoice,
    countTotal,
  });

  if (countTotal === 0) {
    divisionsLogger.info('reorderDivisionChannels: fin', {
      divisionNumber,
      categoryId,
      countReordered: 0,
    });
    return;
  }

  textChannels.sort(sortChannelsByGroupThenName);
  voiceChannels.sort(sortChannelsByGroupThenName);
  const ordered = [...textChannels, ...voiceChannels, ...otherChannels];

  const category = guild.channels.cache.get(categoryId);
  const basePosition =
    category && 'position' in category
      ? (category as { position: number }).position + 1
      : 0;

  const channelPositions = ordered.map((ch, i) => ({
    channel: ch.id,
    position: basePosition + i,
  }));

  try {
    await guild.channels.setPositions(channelPositions);
    divisionsLogger.info('reorderDivisionChannels: fin', {
      divisionNumber,
      categoryId,
      countReordered: countTotal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    divisionsLogger.error('reorderDivisionChannels: erreur setPositions', {
      divisionNumber,
      categoryId,
      guildId: guild.id,
      countTotal,
      message,
    });
  }
}
