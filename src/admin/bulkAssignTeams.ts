/**
 * POST /admin/teams/bulk-assign — affectation serveur + division pour une liste de noms collés.
 */

import type { TeamRow } from '../db/types.js';
import {
  findTeamsByExactTeamName,
  findTeamsByNormalizedTeamName,
  updateTeam,
} from '../db/repositories/teams.js';
import { normalizeTeamName } from '../modules/teams/normalizer.js';
import { getDatabase } from '../db/database.js';
import { isAllowedAdminTargetGuildId } from './targetGuilds.js';
import { getTargetDivisionMax, getTargetDivisionMin } from './targetDivision.js';
import { isValidDiscordSnowflake } from './verifyTeamDiscord.js';
import { parseBulkTeamNamesFromText } from './parseBulkTeamNames.js';
import type {
  BulkAssignAmbiguousName,
  BulkAssignTeamsRequestBody,
  BulkAssignTeamsResponse,
  BulkAssignUpdatedTeamBrief,
} from './types.js';

export type BulkAssignParseResult =
  | { ok: true; data: BulkAssignTeamsRequestBody }
  | { ok: false; status: number; error: string };

function parseRequestBody(body: unknown): BulkAssignParseResult {
  if (body === null || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Body JSON attendu' };
  }
  const o = body as Record<string, unknown>;
  const gid = typeof o.target_guild_id === 'string' ? o.target_guild_id.trim() : '';
  if (!gid || !isValidDiscordSnowflake(gid)) {
    return { ok: false, status: 400, error: 'target_guild_id : snowflake Discord invalide' };
  }
  if (!isAllowedAdminTargetGuildId(gid)) {
    return { ok: false, status: 403, error: 'target_guild_id : serveur non autorisé' };
  }
  const divRaw = o.target_division_number;
  let div: number;
  if (typeof divRaw === 'number' && Number.isInteger(divRaw)) {
    div = divRaw;
  } else if (typeof divRaw === 'string') {
    const n = Number.parseInt(divRaw.trim(), 10);
    if (!Number.isFinite(n)) {
      return { ok: false, status: 400, error: 'target_division_number invalide' };
    }
    div = n;
  } else {
    return { ok: false, status: 400, error: 'target_division_number requis (entier)' };
  }
  const dmin = getTargetDivisionMin();
  const dmax = getTargetDivisionMax();
  if (!Number.isInteger(div) || div < dmin || div > dmax) {
    return {
      ok: false,
      status: 400,
      error: `target_division_number doit être entre ${dmin} et ${dmax}`,
    };
  }
  if (o.team_names_text !== undefined && typeof o.team_names_text !== 'string') {
    return { ok: false, status: 400, error: 'team_names_text doit être une chaîne' };
  }
  const team_names_text = typeof o.team_names_text === 'string' ? o.team_names_text : '';
  return {
    ok: true,
    data: { target_guild_id: gid, target_division_number: div, team_names_text },
  };
}

function matchTeamsForPastedName(trimmed: string): { kind: 'unique'; row: TeamRow } | { kind: 'none' } | { kind: 'ambiguous'; rows: TeamRow[] } {
  const exact = findTeamsByExactTeamName(trimmed);
  if (exact.length > 1) return { kind: 'ambiguous', rows: exact };
  if (exact.length === 1) return { kind: 'unique', row: exact[0]! };

  const norm = normalizeTeamName(trimmed);
  if (norm === '') return { kind: 'none' };

  const byNorm = findTeamsByNormalizedTeamName(norm);
  if (byNorm.length > 1) return { kind: 'ambiguous', rows: byNorm };
  if (byNorm.length === 1) return { kind: 'unique', row: byNorm[0]! };
  return { kind: 'none' };
}

export function bulkAssignTeamsByPastedNames(body: unknown): { ok: true; result: BulkAssignTeamsResponse } | { ok: false; status: number; error: string } {
  const parsed = parseRequestBody(body);
  if (!parsed.ok) return parsed;

  const { target_guild_id, target_division_number, team_names_text } = parsed.data;
  const parsedNames = parseBulkTeamNamesFromText(team_names_text);

  const not_found_names: string[] = [];
  const ambiguous_names: BulkAssignAmbiguousName[] = [];
  const uniqueById = new Map<number, TeamRow>();

  for (const name of parsedNames) {
    const m = matchTeamsForPastedName(name);
    if (m.kind === 'none') {
      not_found_names.push(name);
      continue;
    }
    if (m.kind === 'ambiguous') {
      ambiguous_names.push({
        input: name,
        matching_ids: m.rows.map((r) => r.id),
      });
      continue;
    }
    if (!uniqueById.has(m.row.id)) {
      uniqueById.set(m.row.id, m.row);
    }
  }

  const rowsToUpdate = [...uniqueById.values()];
  const run = () => {
    for (const row of rowsToUpdate) {
      updateTeam(row.id, {
        target_guild_id,
        target_division_number,
      });
    }
  };

  getDatabase().transaction(run)();

  const updated_teams: BulkAssignUpdatedTeamBrief[] = rowsToUpdate.map((row) => ({
    id: row.id,
    team_name: row.team_name,
    team_api_id: row.team_api_id,
  }));

  const result: BulkAssignTeamsResponse = {
    updated_count: updated_teams.length,
    updated_teams,
    not_found_names,
    ambiguous_names,
    parsed_names: parsedNames,
  };
  return { ok: true, result };
}
