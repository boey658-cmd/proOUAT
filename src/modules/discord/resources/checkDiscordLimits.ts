/**
 * Vérification des limites Discord (rôles, salons) avant création.
 * Une responsabilité : indiquer si on peut créer rôle et/ou salon.
 */

import type { Guild } from 'discord.js';
import {
  getDiscordRoleLimitSafeThreshold,
  getDiscordChannelLimitSafeThreshold,
} from '../../../config/index.js';
import { discordLogger } from '../logger.js';

export interface DiscordLimitsCheck {
  canCreateRole: boolean;
  canCreateChannel: boolean;
  roleLimitReached: boolean;
  channelLimitReached: boolean;
  currentRoleCount: number;
  currentChannelCount: number;
}

/**
 * Vérifie si le serveur peut encore accepter un rôle et un salon.
 * Si limite rôles atteinte : canCreateRole = false, mode dégradé (créer seulement le salon) possible.
 * Si limite salons atteinte : canCreateChannel = false, ne rien créer.
 */
export function checkDiscordLimits(guild: Guild): DiscordLimitsCheck {
  const roleThreshold = getDiscordRoleLimitSafeThreshold();
  const channelThreshold = getDiscordChannelLimitSafeThreshold();

  const currentRoleCount = guild.roles.cache.size;
  const currentChannelCount = guild.channels.cache.size;

  const roleLimitReached = currentRoleCount >= roleThreshold;
  const channelLimitReached = currentChannelCount >= channelThreshold;
  const canCreateRole = !roleLimitReached;
  const canCreateChannel = !channelLimitReached;

  if (roleLimitReached) {
    discordLogger.warn('checkDiscordLimits: limite rôles atteinte', {
      guildId: guild.id,
      current: currentRoleCount,
      threshold: roleThreshold,
    });
  }
  if (channelLimitReached) {
    discordLogger.warn('checkDiscordLimits: limite salons atteinte', {
      guildId: guild.id,
      current: currentChannelCount,
      threshold: channelThreshold,
    });
  }

  return {
    canCreateRole,
    canCreateChannel,
    roleLimitReached,
    channelLimitReached,
    currentRoleCount,
    currentChannelCount,
  };
}
