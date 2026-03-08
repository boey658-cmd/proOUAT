/**
 * Recherche ou création de la catégorie équipe (S21, S21-2, S21-3...).
 * Une responsabilité : fournir une catégorie avec de la place pour un nouveau salon.
 */

import type { Guild } from 'discord.js';
import { ChannelType } from 'discord.js';
import {
  getCategoryTeamBaseName,
  getCategoryMaxChannelsSafeLimit,
} from '../../../config/index.js';
import { discordLogger } from '../logger.js';

export interface FindOrCreateTeamCategoryResult {
  categoryId: string;
  categoryName: string;
}

/**
 * Trouve ou crée une catégorie équipe (baseName, baseName-2, baseName-3...) avec de la place.
 */
export async function findOrCreateTeamCategory(guild: Guild): Promise<FindOrCreateTeamCategoryResult> {
  const baseName = getCategoryTeamBaseName();
  const maxChannels = getCategoryMaxChannelsSafeLimit();

  const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory);
  const basePattern = new RegExp(`^${escapeRegex(baseName)}(?:-(\\d+))?$`, 'i');
  const matching: { name: string; sortKey: number; channelCount: number; id: string }[] = [];

  for (const [, cat] of categories) {
    const m = cat.name.match(basePattern);
    if (!m) continue;
    const sortKey = m[1] ? parseInt(m[1], 10) : 1;
    const children = guild.channels.cache.filter(
      (ch) => ch.parentId === cat.id
    ).size;
    matching.push({
      name: cat.name,
      sortKey: isNaN(sortKey) ? 1 : sortKey,
      channelCount: children,
      id: cat.id,
    });
  }
  matching.sort((a, b) => a.sortKey - b.sortKey);

  for (const cat of matching) {
    if (cat.channelCount < maxChannels) {
      discordLogger.info('findOrCreateTeamCategory: catégorie disponible', {
        guildId: guild.id,
        categoryId: cat.id,
        name: cat.name,
        channelCount: cat.channelCount,
      });
      return { categoryId: cat.id, categoryName: cat.name };
    }
  }

  const nextSuffix = matching.length === 0 ? 1 : Math.max(...matching.map((m) => m.sortKey)) + 1;
  const newName = nextSuffix === 1 ? baseName : `${baseName}-${nextSuffix}`;
  const created = await guild.channels.create({
    name: newName,
    type: ChannelType.GuildCategory,
  });
  discordLogger.info('findOrCreateTeamCategory: catégorie créée', {
    guildId: guild.id,
    categoryId: created.id,
    name: newName,
  });
  return { categoryId: created.id, categoryName: newName };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
