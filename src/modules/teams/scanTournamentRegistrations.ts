/**
 * Service de scan des inscriptions : récupère le tournoi par slug, extrait les équipes, enrichit chaque équipe.
 * Une responsabilité : orchestrer le flux complet et retourner la liste d'équipes normalisées.
 * Gestion d'erreurs : une équipe en échec n'annule pas le scan ; les erreurs sont collectées.
 */

import { getTournament, getTournamentByTournamentId } from '../api/index.js';
import { getOptionalTournamentId } from '../../config/index.js';
import { extractTeamRefsFromTournament } from './extractors.js';
import { buildEnrichedTeam } from './buildEnrichedTeam.js';
import type { NormalizedTeam } from './types.js';
import { teamsLogger } from './logger.js';

export interface ScanResult {
  /** Équipes normalisées récupérées avec succès. */
  teams: NormalizedTeam[];
  /** Erreurs rencontrées (par équipe ou tournoi). */
  errors: ScanError[];
}

export interface ScanError {
  /** Contexte (tournoi ou teamId). */
  context: string;
  /** Identifiant concerné (slug ou team id). */
  id: string | number;
  /** Message d'erreur. */
  message: string;
}

/**
 * Lance le scan complet des inscriptions pour un tournoi.
 * 1. Récupère le tournoi par slug
 * 2. Extrait la liste des équipes inscrites
 * 3. Pour chaque équipe : récupère joueurs + infos utilisateur, normalise
 * @param slug - Slug du tournoi (ex. depuis config)
 * @returns Liste d'équipes normalisées et erreurs éventuelles
 */
export async function scanTournamentRegistrations(slug: string): Promise<ScanResult> {
  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    throw new Error('scanTournamentRegistrations: slug requis et non vide');
  }

  const slugTrim = slug.trim();
  const result: ScanResult = { teams: [], errors: [] };

  const tournamentId = getOptionalTournamentId();
  teamsLogger.info('scanTournamentRegistrations: démarrage', {
    slug: slugTrim,
    tournamentId: tournamentId || undefined,
  });

  let rawTournament: unknown;
  try {
    if (tournamentId && tournamentId.trim() !== '') {
      rawTournament = await getTournamentByTournamentId(tournamentId);
      teamsLogger.info('scanTournamentRegistrations: tournoi récupéré via clasification', {
        tournamentId,
      });
    } else {
      rawTournament = await getTournament(slugTrim);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    teamsLogger.error('scanTournamentRegistrations: erreur récupération tournoi', {
      slug: slugTrim,
      tournamentId: tournamentId || undefined,
      message,
    });
    result.errors.push({ context: 'tournament', id: tournamentId || slugTrim, message });
    return result;
  }

  const teamRefs = extractTeamRefsFromTournament(rawTournament);
  if (teamRefs.length === 0) {
    teamsLogger.warn('scanTournamentRegistrations: aucune équipe extraite du tournoi', {
      slug: slugTrim,
    });
    return result;
  }

  teamsLogger.info('scanTournamentRegistrations: équipes à traiter', {
    slug: slugTrim,
    count: teamRefs.length,
  });

  for (const ref of teamRefs) {
    try {
      const team = await buildEnrichedTeam(ref.id, ref.name);
      result.teams.push(team);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      teamsLogger.error('scanTournamentRegistrations: erreur enrichissement équipe', {
        teamId: ref.id,
        message,
      });
      result.errors.push({
        context: 'team',
        id: ref.id,
        message,
      });
    }
  }

  teamsLogger.info('scanTournamentRegistrations: fin', {
    slug: slugTrim,
    teamsOk: result.teams.length,
    errors: result.errors.length,
  });

  return result;
}
