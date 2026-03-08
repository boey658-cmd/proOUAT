/**
 * Création ou synchronisation du salon vocal d'une équipe (même nom que le salon texte, même catégorie, permissions staff + rôle équipe).
 * Une responsabilité : créer le vocal s'il n'existe pas, sinon renommer/déplacer/mettre à jour les permissions si nécessaire.
 */

import type { Guild, VoiceChannel } from 'discord.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getAllowedStaffRoleIds } from '../../config/index.js';
import { divisionsLogger } from './logger.js';

export interface CreateOrSyncTeamVoiceChannelParams {
  guild: Guild;
  categoryId: string;
  channelName: string;
  teamRoleId: string | null;
  logContext: {
    teamId: number;
    team_api_id: string;
    teamName: string;
  };
}

export interface CreateOrSyncTeamVoiceChannelResult {
  success: boolean;
  created?: boolean;
  renamed?: boolean;
  moved?: boolean;
  permissionsUpdated?: boolean;
  alreadyConform?: boolean;
  voiceChannelId?: string;
  error?: string;
}

const VOICE_ALLOW = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak;
const REASON = 'Division /creationchaneldiv — vocal équipe';

function buildPermissionOverwrites(
  guild: Guild,
  teamRoleId: string | null,
  staffRoleIds: string[]
): { id: string; allow: bigint; deny: bigint; type: 0 | 1 }[] {
  const permissionOverwrites: { id: string; allow: bigint; deny: bigint; type: 0 | 1 }[] = [];

  const everyoneRole = guild.roles.everyone;
  if (everyoneRole) {
    permissionOverwrites.push({
      id: everyoneRole.id,
      allow: 0n,
      deny: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect,
      type: 0,
    });
  }
  if (teamRoleId && teamRoleId.trim() !== '') {
    permissionOverwrites.push({
      id: teamRoleId,
      allow: VOICE_ALLOW,
      deny: 0n,
      type: 0,
    });
  }
  for (const sid of staffRoleIds) {
    if (sid && sid.trim() !== '' && sid !== teamRoleId) {
      permissionOverwrites.push({
        id: sid,
        allow: VOICE_ALLOW,
        deny: 0n,
        type: 0,
      });
    }
  }

  return permissionOverwrites;
}

/**
 * Retourne true si les overwrites du canal correspondent exactement à ceux attendus.
 */
function permissionsMatch(
  guild: Guild,
  channel: VoiceChannel,
  teamRoleId: string | null,
  staffRoleIds: string[]
): boolean {
  const expectedList = buildPermissionOverwrites(guild, teamRoleId, staffRoleIds);
  const expectedMap = new Map(expectedList.map((p) => [p.id, { allow: p.allow, deny: p.deny }]));
  const permissionOverwrites = channel.permissionOverwrites.cache;
  if (permissionOverwrites.size !== expectedMap.size) return false;
  for (const [id, overwrite] of permissionOverwrites) {
    const expected = expectedMap.get(id);
    if (expected === undefined) return false;
    if (overwrite.allow.bitfield !== expected.allow || overwrite.deny.bitfield !== expected.deny)
      return false;
  }
  return true;
}

/**
 * Trouve un salon vocal dans la catégorie portant exactement le nom donné.
 */
function findVoiceChannelInCategoryByName(
  guild: Guild,
  categoryId: string,
  channelName: string
): VoiceChannel | null {
  const channels = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildVoice &&
      c.parentId === categoryId &&
      (c as VoiceChannel).name === channelName
  );
  const first = channels.first();
  return (first as VoiceChannel) ?? null;
}

/**
 * Crée ou synchronise le salon vocal pour une équipe : même nom que le salon texte, même catégorie, permissions staff + rôle équipe.
 * Ne recrée pas si un vocal existe déjà dans la catégorie avec le bon nom ; met à jour nom / parent / permissions si besoin.
 */
export async function createOrSyncTeamVoiceChannel(
  params: CreateOrSyncTeamVoiceChannelParams
): Promise<CreateOrSyncTeamVoiceChannelResult> {
  const { guild, categoryId, channelName, teamRoleId, logContext } = params;
  const { teamId, team_api_id, teamName } = logContext;
  const baseLog = {
    teamId,
    team_api_id,
    teamName,
    guildId: guild.id,
    categoryId,
  };

  const staffRoleIds = getAllowedStaffRoleIds();
  const permissionOverwrites = buildPermissionOverwrites(guild, teamRoleId, staffRoleIds);

  const existing = findVoiceChannelInCategoryByName(guild, categoryId, channelName);

  if (existing) {
    let renamed = false;
    let moved = false;
    let permissionsUpdated = false;

    if (existing.name !== channelName) {
      try {
        await existing.setName(channelName, REASON);
        renamed = true;
        divisionsLogger.info('createOrSyncTeamVoiceChannel: vocal renommé', {
          ...baseLog,
          channelId: existing.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        divisionsLogger.error('createOrSyncTeamVoiceChannel: erreur renommage vocal', {
          ...baseLog,
          channelId: existing.id,
          message,
        });
        return { success: false, error: message, voiceChannelId: existing.id };
      }
    }

    if (existing.parentId !== categoryId) {
      try {
        await existing.setParent(categoryId, { lockPermissions: false, reason: REASON });
        moved = true;
        divisionsLogger.info('createOrSyncTeamVoiceChannel: vocal déplacé', {
          ...baseLog,
          channelId: existing.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        divisionsLogger.error('createOrSyncTeamVoiceChannel: erreur déplacement vocal', {
          ...baseLog,
          channelId: existing.id,
          message,
        });
        return { success: false, error: message, voiceChannelId: existing.id };
      }
    }

    if (!permissionsMatch(guild, existing, teamRoleId, staffRoleIds)) {
      try {
        await existing.permissionOverwrites.set(
          permissionOverwrites.map((p) => ({
            id: p.id,
            allow: p.allow,
            deny: p.deny,
            type: p.type,
          })),
          REASON
        );
        permissionsUpdated = true;
        divisionsLogger.info('createOrSyncTeamVoiceChannel: permissions vocal mises à jour', {
          ...baseLog,
          channelId: existing.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        divisionsLogger.error('createOrSyncTeamVoiceChannel: erreur permissions vocal', {
          ...baseLog,
          channelId: existing.id,
          message,
        });
        return { success: false, error: message, voiceChannelId: existing.id };
      }
    }

    if (!renamed && !moved && !permissionsUpdated) {
      divisionsLogger.info('createOrSyncTeamVoiceChannel: vocal déjà conforme', {
        ...baseLog,
        channelId: existing.id,
      });
      return {
        success: true,
        alreadyConform: true,
        voiceChannelId: existing.id,
      };
    }

    return {
      success: true,
      voiceChannelId: existing.id,
      renamed: renamed || undefined,
      moved: moved || undefined,
      permissionsUpdated: permissionsUpdated || undefined,
    };
  }

  try {
    const voiceChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      permissionOverwrites: permissionOverwrites.map((p) => ({
        id: p.id,
        allow: p.allow,
        deny: p.deny,
        type: p.type,
      })),
      reason: REASON,
    });

    divisionsLogger.info('createOrSyncTeamVoiceChannel: vocal créé', {
      ...baseLog,
      channelId: voiceChannel.id,
    });

    return {
      success: true,
      created: true,
      voiceChannelId: voiceChannel.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    divisionsLogger.error('createOrSyncTeamVoiceChannel: erreur création vocal', {
      ...baseLog,
      message,
    });
    return { success: false, error: message };
  }
}
