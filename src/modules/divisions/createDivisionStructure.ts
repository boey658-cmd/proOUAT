/**
 * Création des catégories Discord : une catégorie par division.
 * Une responsabilité : trouver ou créer la catégorie "Division N".
 */

import type { Guild } from 'discord.js';
import { ChannelType } from 'discord.js';
import { getDivisionCategoryName } from './utils.js';
import { divisionsLogger } from './logger.js';

export interface CreateDivisionCategoryResult {
  categoryId: string;
  created: boolean;
}

/**
 * Trouve ou crée la catégorie Discord pour une division (une seule catégorie par division).
 * @param guild - Serveur Discord
 * @param divisionNumber - Numéro de division
 */
export async function createDivisionCategoryIfNotExists(
  guild: Guild,
  divisionNumber: number
): Promise<CreateDivisionCategoryResult> {
  const categoryName = getDivisionCategoryName(divisionNumber);

  const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory);
  const existing = categories.find((c) => c.name === categoryName);

  if (existing) {
    divisionsLogger.info('createDivisionCategoryIfNotExists: catégorie existante', {
      guildId: guild.id,
      categoryId: existing.id,
      categoryName,
    });
    return { categoryId: existing.id, created: false };
  }

  const created = await guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
    reason: 'Création catégorie division /creationchaneldiv',
  });

  divisionsLogger.info('createDivisionCategoryIfNotExists: catégorie créée', {
    guildId: guild.id,
    categoryId: created.id,
    categoryName,
  });

  return { categoryId: created.id, created: true };
}
