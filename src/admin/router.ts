/**
 * Routes HTTP /admin/* — panel équipes (lecture, PATCH, vérification Discord).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';
import { getAdminApiToken } from '../config/adminApi.js';
import { isGuildIdAllowedForChannels } from '../config/discord.js';
import type { PatchTeamBody } from './types.js';
import {
  loadAdminTeamRowsFromDatabase,
  verifyScopedTeamsAndPersist,
  verifyOneTeamAndPersist,
} from './service.js';
import { isValidDiscordSnowflake } from './verifyTeamDiscord.js';
import { patchAdminTeam } from './patchTeamAdmin.js';
import { getTargetGuildOptions, isAllowedAdminTargetGuildId } from './targetGuilds.js';
import { getTargetDivisionMax, getTargetDivisionMin } from './targetDivision.js';
import { bulkAssignTeamsByPastedNames } from './bulkAssignTeams.js';

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

function parseQueryString(q: unknown): string | undefined {
  if (q === undefined || q === null) return undefined;
  const s = Array.isArray(q) ? q[0] : q;
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return t === '' ? undefined : t;
}

function parseQueryInt(q: unknown): number | undefined {
  const s = parseQueryString(q);
  if (s === undefined) return undefined;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseVerifyScope(req: Request): { ok: true; targetGuildId: string; targetDivisionNumber?: number } | { ok: false; error: string } {
  const targetGuildId = parseQueryString(req.query.target_guild_id);
  if (!targetGuildId) {
    return { ok: false, error: 'Query obligatoire : target_guild_id' };
  }
  if (!isValidDiscordSnowflake(targetGuildId)) {
    return { ok: false, error: 'target_guild_id : snowflake invalide' };
  }
  if (!isAllowedAdminTargetGuildId(targetGuildId)) {
    return { ok: false, error: 'target_guild_id : serveur non autorisé' };
  }
  const dn = parseQueryInt(req.query.target_division_number);
  const targetDivisionNumber = dn === undefined ? undefined : dn;
  return { ok: true, targetGuildId, targetDivisionNumber };
}

export function createAdminRouter(client: Client<true>): Router {
  const r = Router();

  r.use(requireAdmin);

  /** Guilds cibles + plage divisions (pour l’UI, sans secret). */
  r.get('/meta/target-guilds', (_req: Request, res: Response) => {
    res.json({
      guilds: getTargetGuildOptions().map((g) => ({ id: g.id, label: g.label })),
      division_min: getTargetDivisionMin(),
      division_max: getTargetDivisionMax(),
    });
  });

  /** Liste équipes filtrées (query optionnelles). */
  r.get('/teams', (req: Request, res: Response) => {
    try {
      const targetGuildId = parseQueryString(req.query.target_guild_id);
      const div = parseQueryInt(req.query.target_division_number);
      if (div !== undefined && !targetGuildId) {
        res.status(400).json({
          error: 'target_division_number sans target_guild_id : précisez le serveur',
        });
        return;
      }
      const filters =
        targetGuildId || div !== undefined
          ? {
              ...(targetGuildId ? { targetGuildId } : {}),
              ...(div !== undefined ? { targetDivisionNumber: div } : {}),
            }
          : undefined;
      const teams = loadAdminTeamRowsFromDatabase(filters);
      res.json({ teams });
    } catch (e) {
      console.error('[admin] GET /teams', e);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /** Affectation en lot : serveur + division à partir d’une liste de noms collés. */
  r.post('/teams/bulk-assign', (req: Request, res: Response) => {
    try {
      const out = bulkAssignTeamsByPastedNames(req.body);
      if (!out.ok) {
        res.status(out.status).json({ error: out.error });
        return;
      }
      res.json(out.result);
    } catch (e) {
      console.error('[admin] POST /teams/bulk-assign', e);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

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
    const result = await patchAdminTeam(client, teamId, req.body as PatchTeamBody);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ team: result.team });
  });

  r.post('/teams/verify', async (req: Request, res: Response) => {
    const scope = parseVerifyScope(req);
    if (!scope.ok) {
      res.status(400).json({ error: scope.error });
      return;
    }
    try {
      const teams = await verifyScopedTeamsAndPersist(client, {
        targetGuildId: scope.targetGuildId,
        targetDivisionNumber: scope.targetDivisionNumber,
      });
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
