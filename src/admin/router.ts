/**
 * Routes HTTP /admin/* — panel équipes (lecture, PATCH, vérification Discord).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';
import { getAdminApiToken } from '../config/adminApi.js';
import { isGuildIdAllowedForChannels } from '../config/discord.js';
import { findTeamById } from '../db/repositories/teams.js';
import {
  findTeamDiscordStateByTeamId,
  mergeUpsertTeamDiscordState,
  findOtherTeamIdWithActiveChannelId,
  findOtherTeamIdWithActiveRoleId,
  updateTeamDiscordCachedDisplay,
} from '../db/repositories/teamDiscordState.js';
import { findAdminTeamJoinByTeamId } from '../db/repositories/adminTeams.js';
import type { PatchTeamBody } from './types.js';
import {
  loadAdminTeamRowsFromDatabase,
  verifyAllTeamsAndPersist,
  verifyOneTeamAndPersist,
} from './service.js';
import { resolveEffectiveGuildIdForTeam } from './effectiveGuild.js';
import {
  isValidDiscordSnowflake,
  resolveDiscordDisplayNames,
} from './verifyTeamDiscord.js';
import { mapJoinRowToAdminTeamRow } from './mapDbToAdminTeamRow.js';

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = getAdminApiToken();
  if (!expected) {
    res.status(503).json({ error: 'ADMIN_API_TOKEN non configuré' });
    return;
  }
  const hdr = req.headers.authorization;
  if (hdr !== `Bearer ${expected}`) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }
  next();
}

function parseTeamIdParam(req: Request): number | null {
  const raw = req.params.teamId;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** undefined = champ absent du JSON ; null = explicitement vidé. */
function normalizeOptionalSnowflake(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t === '' ? null : t;
}

export function createAdminRouter(client: Client<true>): Router {
  const r = Router();

  r.use(requireAdmin);

  /** Liste équipes + dernier état de vérification persisté (aucun appel Discord). */
  r.get('/teams', (_req: Request, res: Response) => {
    try {
      const teams = loadAdminTeamRowsFromDatabase();
      res.json({ teams });
    } catch (e) {
      console.error('[admin] GET /teams', e);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /** Rôles + salons texte (salon privé = texte uniquement côté PATCH). */
  r.get('/guilds/:guildId/resources', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? '').trim();
    if (!isValidDiscordSnowflake(guildId)) {
      res.status(400).json({ error: 'guildId invalide (attendu : snowflake Discord)' });
      return;
    }
    if (!isGuildIdAllowedForChannels(guildId)) {
      res.status(403).json({ error: 'Guilde non autorisée pour ce bot' });
      return;
    }
    try {
      const guild =
        client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
      await guild.roles.fetch().catch(() => undefined);
      const roles = guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .map((role) => ({ id: role.id, name: role.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

      const channels = guild.channels.cache
        .filter((ch) => ch.type === ChannelType.GuildText)
        .map((ch) => ({ id: ch.id, name: ch.name ?? ch.id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

      res.json({ guild_id: guild.id, roles, channels });
    } catch (e) {
      console.error('[admin] GET /guilds/:guildId/resources', e);
      res.status(404).json({ error: 'Guilde introuvable pour ce bot' });
    }
  });

  r.patch('/teams/:teamId', async (req: Request, res: Response) => {
    const teamId = parseTeamIdParam(req);
    if (!teamId) {
      res.status(400).json({ error: 'Identifiant d’équipe invalide' });
      return;
    }
    const team = findTeamById(teamId);
    if (!team) {
      res.status(404).json({ error: 'Équipe introuvable en base' });
      return;
    }

    const body = req.body as PatchTeamBody;
    const nextRole = normalizeOptionalSnowflake(body.role_id);
    const nextChannel = normalizeOptionalSnowflake(body.private_channel_id);
    if (nextRole === undefined && nextChannel === undefined) {
      res.status(400).json({ error: 'Aucun champ à mettre à jour : envoyez role_id et/ou private_channel_id' });
      return;
    }

    const cur = findTeamDiscordStateByTeamId(teamId);
    const effectiveGuildId = resolveEffectiveGuildIdForTeam(team, cur);

    if (!effectiveGuildId) {
      res.status(400).json({
        error:
          'Guilde effective introuvable : renseignez current_guild_id sur l’équipe ou active_guild_id dans l’état Discord',
      });
      return;
    }
    if (!isValidDiscordSnowflake(effectiveGuildId)) {
      res.status(400).json({ error: 'Guilde effective : snowflake Discord invalide en base' });
      return;
    }

    if (!isGuildIdAllowedForChannels(effectiveGuildId)) {
      res.status(403).json({ error: 'Cette guilde n’est pas autorisée pour ce bot' });
      return;
    }

    const roleVal = nextRole === undefined ? (cur?.active_role_id ?? null) : nextRole;
    const channelVal =
      nextChannel === undefined ? (cur?.active_channel_id ?? null) : nextChannel;

    if (roleVal !== null && !isValidDiscordSnowflake(roleVal)) {
      res.status(400).json({ error: 'role_id : snowflake Discord invalide après nettoyage' });
      return;
    }
    if (channelVal !== null && !isValidDiscordSnowflake(channelVal)) {
      res.status(400).json({ error: 'private_channel_id : snowflake Discord invalide après nettoyage' });
      return;
    }

    let guild;
    try {
      guild =
        client.guilds.cache.get(effectiveGuildId) ??
        (await client.guilds.fetch(effectiveGuildId));
    } catch {
      res.status(400).json({
        error: 'Impossible de charger la guilde Discord : vérifiez que le bot est membre du serveur',
      });
      return;
    }

    const finalRole = roleVal;
    const finalChannel = channelVal;

    if (finalRole !== null) {
      await guild.roles.fetch().catch(() => undefined);
      const role = guild.roles.cache.get(finalRole);
      if (!role) {
        res.status(400).json({
          error: `Le rôle ${finalRole} n’existe pas sur la guilde ${effectiveGuildId}`,
        });
        return;
      }
      const other = findOtherTeamIdWithActiveRoleId(finalRole, teamId);
      if (other != null) {
        res.status(409).json({
          error: `Conflit : ce rôle est déjà associé à l’équipe n°${other}`,
        });
        return;
      }
    }

    if (finalChannel !== null) {
      await guild.channels.fetch().catch(() => undefined);
      const ch = guild.channels.cache.get(finalChannel);
      if (!ch) {
        res.status(400).json({
          error: `Le salon ${finalChannel} n’existe pas sur la guilde ${effectiveGuildId}`,
        });
        return;
      }
      if (ch.type !== ChannelType.GuildText) {
        res.status(400).json({
          error: 'Le salon privé équipe doit être un salon texte (types vocaux ou autres exclus)',
        });
        return;
      }
      const other = findOtherTeamIdWithActiveChannelId(finalChannel, teamId);
      if (other != null) {
        res.status(409).json({
          error: `Conflit : ce salon est déjà associé à l’équipe n°${other}`,
        });
        return;
      }
    }

    mergeUpsertTeamDiscordState(teamId, {
      active_guild_id: effectiveGuildId,
      active_role_id: finalRole,
      active_channel_id: finalChannel,
    });

    const names = resolveDiscordDisplayNames(guild, finalRole, finalChannel);
    updateTeamDiscordCachedDisplay(teamId, {
      cached_guild_name: guild.name ?? null,
      cached_role_name: names.role_name,
      cached_channel_name: names.channel_name,
    });

    const join = findAdminTeamJoinByTeamId(teamId);
    if (!join) {
      res.status(500).json({ error: 'Erreur interne : impossible de relire l’équipe après sauvegarde' });
      return;
    }

    res.json({ team: mapJoinRowToAdminTeamRow(join) });
  });

  r.post('/teams/verify', async (_req: Request, res: Response) => {
    try {
      const teams = await verifyAllTeamsAndPersist(client);
      res.json({ teams });
    } catch (e) {
      console.error('[admin] POST /teams/verify', e);
      res.status(500).json({ error: 'Erreur serveur pendant la vérification' });
    }
  });

  r.post('/teams/:teamId/verify', async (req: Request, res: Response) => {
    const teamId = parseTeamIdParam(req);
    if (!teamId) {
      res.status(400).json({ error: 'Identifiant d’équipe invalide' });
      return;
    }
    try {
      const one = await verifyOneTeamAndPersist(client, teamId);
      if (!one) {
        res.status(404).json({ error: 'Équipe introuvable en base' });
        return;
      }
      res.json({ team: one });
    } catch (e) {
      console.error('[admin] POST /teams/:teamId/verify', e);
      res.status(500).json({ error: 'Erreur serveur pendant la vérification' });
    }
  });

  return r;
}
