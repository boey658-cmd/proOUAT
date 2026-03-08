/**
 * Construction d'une équipe enrichie : récupération équipe + joueurs + infos utilisateur, puis normalisation.
 * Une responsabilité : orchestrer les appels API et produire une NormalizedTeam.
 * Gestion d'erreurs : erreur équipe = throw ; erreur joueur = log et discord_user_id à null.
 * Concurrence des appels /user/{id} limitée pour éviter le rate limit.
 */

import { getTeamById } from '../api/index.js';
import { getUserById, getAndResetUserApiCallCount, getAndResetUserApiStats } from '../api/index.js';
import { getUserApiMaxConcurrent } from '../../config/index.js';
import {
  extractTeamNameFromTeam,
  extractPlayerRefsFromTeam,
  extractDiscordIdFromUser,
  extractUsernameFromUser,
  resolveTeamDisplayName,
} from './extractors.js';
import { buildNormalizedPlayer, buildNormalizedTeam } from './normalizer.js';
import type { NormalizedTeam } from './types.js';
import { teamsLogger } from './logger.js';

/**
 * Exécute fn sur chaque élément avec au plus `limit` appels en parallèle.
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Récupère une équipe par ID, récupère les infos utilisateur de chaque joueur, normalise.
 * @param teamId - Identifiant de l'équipe (API)
 * @param teamNameFallback - Nom d'équipe optionnel si l'API équipe ne le fournit pas
 * @returns Équipe normalisée exploitable par la base de données
 */
export async function buildEnrichedTeam(
  teamId: string | number,
  teamNameFallback?: string
): Promise<NormalizedTeam> {
  const idStr = String(teamId).trim();
  if (!idStr) {
    throw new Error('buildEnrichedTeam: teamId requis');
  }

  getAndResetUserApiCallCount(); // reset compteur pour cette équipe

  teamsLogger.debug('buildEnrichedTeam: récupération équipe', { teamId: idStr });

  const rawTeam = await getTeamById(teamId);
  const fromTeamPayload = extractTeamNameFromTeam(rawTeam);
  const teamName = resolveTeamDisplayName(idStr, fromTeamPayload, teamNameFallback);

  if (idStr === '1809') {
    const raw = rawTeam as Record<string, unknown>;
    const data = raw?.data as Record<string, unknown> | null | undefined;
    teamsLogger.info('buildEnrichedTeam: [teamId 1809] extraction nom', {
      teamId: idStr,
      'rawTeam.name': raw?.name,
      'rawTeam.teamName': raw?.teamName,
      'rawTeam.team_name': raw?.team_name,
      'rawTeam.displayName': raw?.displayName,
      'rawTeam.title': raw?.title,
      'rawTeam.label': raw?.label,
      'rawTeam.data?.name': data?.name,
      'rawTeam.data?.teamName': data?.teamName,
      'rawTeam.data?.displayName': data?.displayName,
      'rawTeam.data?.title': data?.title,
      fromTeamPayload,
      teamNameFallback,
      nomFinal: teamName,
    });
  }

  const playerRefs = extractPlayerRefsFromTeam(rawTeam);

  if (playerRefs.length === 0) {
    teamsLogger.warn('buildEnrichedTeam: aucune liste de joueurs', { teamId: idStr });
  }

  const maxConcurrent = getUserApiMaxConcurrent();
  const normalizedPlayers = await runWithConcurrencyLimit(
    playerRefs,
    maxConcurrent,
    async (ref) => {
      let discordUserId: string | null = null;
      let discordUsername: string | null = null;
      try {
        const rawUser = await getUserById(ref.id);
        discordUserId = extractDiscordIdFromUser(rawUser);
        discordUsername = extractUsernameFromUser(rawUser);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        teamsLogger.error('buildEnrichedTeam: erreur récupération utilisateur', {
          teamId: idStr,
          playerId: ref.id,
          message,
        });
      }
      return buildNormalizedPlayer(ref, discordUserId, discordUsername);
    }
  );

  const appelsUserApi = getAndResetUserApiCallCount();
  const userStats = getAndResetUserApiStats();
  const team = buildNormalizedTeam(idStr, teamName, normalizedPlayers);
  teamsLogger.info('buildEnrichedTeam: synthèse user', {
    teamId: idStr,
    fromMemory: userStats.fromMemory,
    fromDb: userStats.fromDb,
    fromApi: userStats.fromApi,
    failed: userStats.failed,
    appelsUserApi,
  });
  teamsLogger.debug('buildEnrichedTeam: équipe enrichie construite', {
    teamId: idStr,
    playerCount: team.players.length,
    appelsUserApi,
  });
  return team;
}
