/**
 * Synchronisation des divisions et groupes depuis l'API calendrier vers la base.
 * Une responsabilité : appeler l'API, extraire, rapprocher avec les équipes, mettre à jour teams et division_assignments.
 */

import { getCalendarByTournamentId } from '../api/index.js';
import { getTournamentId } from '../../config/index.js';
import * as teamsRepo from '../../db/repositories/teams.js';
import * as divisionAssignmentsRepo from '../../db/repositories/divisionAssignments.js';
import { normalizeTeamName } from '../teams/normalizer.js';
import { extractDivisionEntries } from './extractors.js';
import type {
  CalendarDivisionEntry,
  SyncDivisionsResult,
  DivisionAnomaly,
} from './types.js';
import { divisionsLogger } from './logger.js';

/**
 * Résout l'équipe en base à partir d'une entrée calendrier (team_api_id prioritaire, sinon nom normalisé).
 */
function resolveTeam(entry: CalendarDivisionEntry): ReturnType<typeof teamsRepo.findTeamByApiId> {
  if (entry.team_api_id && entry.team_api_id.trim() !== '') {
    const byId = teamsRepo.findTeamByApiId(entry.team_api_id);
    if (byId) return byId;
  }
  if (entry.team_name && entry.team_name.trim() !== '') {
    const normalized = normalizeTeamName(entry.team_name);
    if (normalized) return teamsRepo.findTeamByNormalizedName(normalized);
  }
  return null;
}

/**
 * Synchronise les divisions depuis l'API calendrier et met à jour la base.
 * @param tournamentId - ID du tournoi (optionnel, utilise la config si absent)
 */
export async function syncDivisionsFromCalendar(
  tournamentId?: string | number
): Promise<SyncDivisionsResult> {
  const result: SyncDivisionsResult = {
    totalEntries: 0,
    matchedTeams: 0,
    updatedTeams: 0,
    skipped: 0,
    anomalies: [],
    errors: [],
  };

  const id = tournamentId ?? getTournamentId();
  divisionsLogger.info('syncDivisionsFromCalendar: début', { tournamentId: id });

  let data: unknown;
  try {
    data = await getCalendarByTournamentId(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    divisionsLogger.error('syncDivisionsFromCalendar: erreur API', { message });
    return result;
  }

  const entries = extractDivisionEntries(data);
  result.totalEntries = entries.length;

  if (entries.length === 0) {
    divisionsLogger.info('syncDivisionsFromCalendar: aucune entrée');
    return result;
  }

  const syncedAt = new Date().toISOString();

  for (const entry of entries) {
    const team = resolveTeam(entry);
    if (!team) {
      const hasId = entry.team_api_id != null && entry.team_api_id.trim() !== '';
      const hasName = entry.team_name != null && entry.team_name.trim() !== '';
      const reason =
        !hasId && !hasName
          ? 'équipe non trouvée : entrée sans team_api_id ni team_name'
          : `équipe non trouvée en base (team_api_id=${entry.team_api_id ?? 'null'}, team_name=${entry.team_name ?? 'null'})`;
      result.anomalies.push({ entry, reason });
      continue;
    }

    result.matchedTeams++;

    const divisionChanged =
      team.division_number !== entry.division_number ||
      (team.division_group ?? '') !== entry.division_group;

    if (!divisionChanged) {
      result.skipped++;
      continue;
    }

    try {
      teamsRepo.updateTeam(team.id, {
        division_number: entry.division_number,
        division_group: entry.division_group,
      });
      divisionAssignmentsRepo.upsertDivisionAssignment({
        team_id: team.id,
        division_number: entry.division_number,
        division_group: entry.division_group,
        source_payload_json: null,
        synced_at: syncedAt,
      });
      result.updatedTeams++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${team.team_api_id}: ${message}`);
      divisionsLogger.error('syncDivisionsFromCalendar: erreur mise à jour équipe', {
        teamId: team.id,
        message,
      });
    }
  }

  if (result.anomalies.length > 0) {
    divisionsLogger.warn('syncDivisionsFromCalendar: anomalies', {
      count: result.anomalies.length,
      samples: result.anomalies.slice(0, 3).map((a) => ({
        team: a.entry.team_name ?? a.entry.team_api_id,
        reason: a.reason,
      })),
    });
  }

  divisionsLogger.info('syncDivisionsFromCalendar: fin', {
    totalEntries: result.totalEntries,
    matchedTeams: result.matchedTeams,
    updatedTeams: result.updatedTeams,
    skipped: result.skipped,
    anomalies: result.anomalies.length,
    errors: result.errors.length,
  });

  return result;
}
