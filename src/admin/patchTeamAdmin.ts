/**
 * PATCH /admin/teams/:id — validation centralisée (cible serveur + division + rôle/salon).
 */

import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';
import { findTeamById, updateTeam } from '../db/repositories/teams.js';
import {
  findTeamDiscordStateByTeamId,
  mergeUpsertTeamDiscordState,
  findOtherTeamIdWithActiveChannelId,
  findOtherTeamIdWithActiveRoleId,
  updateTeamDiscordCachedDisplay,
} from '../db/repositories/teamDiscordState.js';
import { findAdminTeamJoinByTeamId } from '../db/repositories/adminTeams.js';
import type { AdminTeamRow, PatchTeamBody } from './types.js';
import { mapJoinRowToAdminTeamRow } from './mapDbToAdminTeamRow.js';
import { isAllowedAdminTargetGuildId } from './targetGuilds.js';
import {
  getTargetDivisionMax,
  getTargetDivisionMin,
  isValidTargetDivisionNumber,
  parseOptionalTargetDivision,
} from './targetDivision.js';
import { isValidDiscordSnowflake, resolveDiscordDisplayNames } from './verifyTeamDiscord.js';

function normalizeOptionalSnowflake(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t === '' ? null : t;
}

export type PatchAdminTeamResult =
  | { ok: true; team: AdminTeamRow }
  | { ok: false; status: number; error: string };

export async function patchAdminTeam(
  client: Client<true>,
  teamId: number,
  body: PatchTeamBody
): Promise<PatchAdminTeamResult> {
  const team = findTeamById(teamId);
  if (!team) {
    return { ok: false, status: 404, error: 'Équipe introuvable en base' };
  }

  const cur = findTeamDiscordStateByTeamId(teamId);
  const nextTarget = normalizeOptionalSnowflake(body.target_guild_id);
  const nextDivision = parseOptionalTargetDivision(body.target_division_number);
  const nextRole = normalizeOptionalSnowflake(body.role_id);
  const nextChannel = normalizeOptionalSnowflake(body.private_channel_id);

  if (
    nextTarget === undefined &&
    nextDivision === undefined &&
    nextRole === undefined &&
    nextChannel === undefined
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Aucun champ à mettre à jour : target_guild_id, target_division_number, role_id, private_channel_id',
    };
  }

  if (nextDivision !== undefined && nextDivision !== null && !isValidTargetDivisionNumber(nextDivision)) {
    return {
      ok: false,
      status: 400,
      error: `target_division_number doit être un entier entre ${getTargetDivisionMin()} et ${getTargetDivisionMax()} (ou null)`,
    };
  }

  const mergedTarget =
    nextTarget === undefined ? (team.target_guild_id?.trim() ?? null) : nextTarget;

  if (mergedTarget && !isValidDiscordSnowflake(mergedTarget)) {
    return { ok: false, status: 400, error: 'target_guild_id : snowflake Discord invalide' };
  }
  if (mergedTarget && !isAllowedAdminTargetGuildId(mergedTarget)) {
    return {
      ok: false,
      status: 403,
      error: 'target_guild_id : serveur non autorisé (guilds du .env du bot)',
    };
  }

  const needDiscordPatch = nextRole !== undefined || nextChannel !== undefined;
  if (needDiscordPatch && !mergedTarget) {
    return {
      ok: false,
      status: 400,
      error: 'Définissez target_guild_id avant d’assigner un rôle ou un salon',
    };
  }

  const finalRole = nextRole === undefined ? (cur?.active_role_id ?? null) : nextRole;
  const finalChannel = nextChannel === undefined ? (cur?.active_channel_id ?? null) : nextChannel;

  if (finalRole !== null && !isValidDiscordSnowflake(finalRole)) {
    return { ok: false, status: 400, error: 'role_id : snowflake Discord invalide' };
  }
  if (finalChannel !== null && !isValidDiscordSnowflake(finalChannel)) {
    return { ok: false, status: 400, error: 'private_channel_id : snowflake Discord invalide' };
  }

  if (needDiscordPatch && mergedTarget) {
    let guild;
    try {
      guild =
        client.guilds.cache.get(mergedTarget) ?? (await client.guilds.fetch(mergedTarget));
    } catch {
      return {
        ok: false,
        status: 400,
        error: 'Impossible de charger le serveur cible : le bot en est-il membre ?',
      };
    }

    if (finalRole !== null) {
      await guild.roles.fetch().catch(() => undefined);
      const role = guild.roles.cache.get(finalRole);
      if (!role) {
        return {
          ok: false,
          status: 400,
          error: `Le rôle ${finalRole} n’existe pas sur le serveur cible`,
        };
      }
      const other = findOtherTeamIdWithActiveRoleId(finalRole, teamId);
      if (other != null) {
        return {
          ok: false,
          status: 409,
          error: `Conflit : ce rôle est déjà l’actif pour l’équipe n°${other}`,
        };
      }
    }

    if (finalChannel !== null) {
      await guild.channels.fetch().catch(() => undefined);
      const ch = guild.channels.cache.get(finalChannel);
      if (!ch) {
        return {
          ok: false,
          status: 400,
          error: `Le salon ${finalChannel} n’existe pas sur le serveur cible`,
        };
      }
      if (ch.type !== ChannelType.GuildText) {
        return {
          ok: false,
          status: 400,
          error: 'Le salon privé doit être un salon texte',
        };
      }
      const other = findOtherTeamIdWithActiveChannelId(finalChannel, teamId);
      if (other != null) {
        return {
          ok: false,
          status: 409,
          error: `Conflit : ce salon est déjà l’actif pour l’équipe n°${other}`,
        };
      }
    }

    mergeUpsertTeamDiscordState(teamId, {
      active_guild_id: mergedTarget,
      active_role_id: finalRole,
      active_channel_id: finalChannel,
    });

    const names = resolveDiscordDisplayNames(guild, finalRole, finalChannel);
    updateTeamDiscordCachedDisplay(teamId, {
      cached_guild_name: guild.name ?? null,
      cached_role_name: names.role_name,
      cached_channel_name: names.channel_name,
    });
  } else if (nextTarget !== undefined) {
    mergeUpsertTeamDiscordState(teamId, { active_guild_id: mergedTarget });
    if (mergedTarget) {
      try {
        const guild =
          client.guilds.cache.get(mergedTarget) ??
          (await client.guilds.fetch(mergedTarget));
        const names = resolveDiscordDisplayNames(
          guild,
          cur?.active_role_id ?? null,
          cur?.active_channel_id ?? null
        );
        updateTeamDiscordCachedDisplay(teamId, {
          cached_guild_name: guild.name ?? null,
          cached_role_name: names.role_name,
          cached_channel_name: names.channel_name,
        });
      } catch {
        /* cache facultatif si guilde inaccessible */
      }
    }
  }

  if (nextTarget !== undefined || nextDivision !== undefined) {
    updateTeam(teamId, {
      ...(nextTarget !== undefined ? { target_guild_id: nextTarget } : {}),
      ...(nextDivision !== undefined ? { target_division_number: nextDivision } : {}),
    });
  }

  const join = findAdminTeamJoinByTeamId(teamId);
  if (!join) {
    return { ok: false, status: 500, error: 'Impossible de relire l’équipe après sauvegarde' };
  }
  return { ok: true, team: mapJoinRowToAdminTeamRow(join) };
}
