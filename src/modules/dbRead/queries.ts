/**
 * Requêtes READ-ONLY pour la consultation DB.
 * Utilise uniquement les méthodes find* des repositories (aucun INSERT/UPDATE/DELETE).
 */

import * as teamsRepo from '../../db/repositories/teams.js';
import * as playersRepo from '../../db/repositories/players.js';
import * as teamDiscordStateRepo from '../../db/repositories/teamDiscordState.js';
import * as divisionAssignmentsRepo from '../../db/repositories/divisionAssignments.js';
import * as discordResourcesRepo from '../../db/repositories/discordResources.js';
import type { TeamRow, PlayerRow } from '../../db/types.js';

export interface StatsResult {
  totalTeams: number;
  totalPlayers: number;
  activePlayers: number;
  leftTeamPlayers: number;
  divisionCount: number;
  teamRolesCount: number;
  teamChannelsCount: number;
}

export function getStats(): StatsResult {
  const teams = teamsRepo.findAllTeams();
  let totalPlayers = 0;
  let activePlayers = 0;
  let leftTeamPlayers = 0;
  let teamRolesCount = 0;
  let teamChannelsCount = 0;

  for (const team of teams) {
    const players = playersRepo.findPlayersByTeamId(team.id);
    totalPlayers += players.length;
    for (const p of players) {
      if (p.status === 'left_team') leftTeamPlayers++;
      else activePlayers++;
    }
    const resources = discordResourcesRepo.findDiscordResourcesByTeamId(team.id);
    for (const r of resources) {
      if (r.is_active !== 1) continue;
      if (r.resource_type === 'role') teamRolesCount++;
      if (r.resource_type === 'channel') teamChannelsCount++;
    }
  }

  const assignments = divisionAssignmentsRepo.findAllDivisionAssignments();
  const divisionNumbers = new Set(assignments.map((a) => a.division_number));
  const divisionCount = divisionNumbers.size;

  return {
    totalTeams: teams.length,
    totalPlayers,
    activePlayers,
    leftTeamPlayers,
    divisionCount,
    teamRolesCount,
    teamChannelsCount,
  };
}

export interface AnomalyItem {
  type: string;
  detail: string;
}

export function getAnomalies(): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];
  const teams = teamsRepo.findAllTeams();
  const teamIds = new Set(teams.map((t) => t.id));

  for (const team of teams) {
    const players = playersRepo.findPlayersByTeamId(team.id);
    const activePlayers = players.filter((p) => p.status !== 'left_team' && (p.is_staff ?? 0) === 0);
    const captains = players.filter((p) => (p.is_captain ?? 0) === 1 && p.status !== 'left_team');

    if (activePlayers.length === 0) {
      anomalies.push({
        type: 'équipe_sans_joueur_actif',
        detail: `Équipe id=${team.id} (${team.team_name}) n'a aucun joueur actif.`,
      });
    }
    if (captains.length === 0) {
      anomalies.push({
        type: 'équipe_sans_capitaine',
        detail: `Équipe id=${team.id} (${team.team_name}) n'a pas de capitaine actif.`,
      });
    }

    const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
    if (team.status !== 'archived' && team.status !== 'new') {
      if (!state?.active_role_id || state.active_role_id.trim() === '') {
        anomalies.push({
          type: 'équipe_sans_rôle_discord',
          detail: `Équipe id=${team.id} (${team.team_name}) : pas de rôle Discord actif.`,
        });
      }
      if (!state?.active_channel_id || state.active_channel_id.trim() === '') {
        anomalies.push({
          type: 'équipe_sans_channel_discord',
          detail: `Équipe id=${team.id} (${team.team_name}) : pas de salon Discord actif.`,
        });
      }
    }
  }

  const allAssignments = divisionAssignmentsRepo.findAllDivisionAssignments();
  const assignedTeamIds = new Set(allAssignments.map((a) => a.team_id));
  for (const team of teams) {
    if (team.division_number != null && team.division_number > 0 && !assignedTeamIds.has(team.id)) {
      anomalies.push({
        type: 'division_sans_assignment',
        detail: `Équipe id=${team.id} (${team.team_name}) a division_number mais pas dans division_assignments.`,
      });
    }
  }

  return anomalies;
}

export interface TeamDetailResult {
  team: TeamRow;
  players: PlayerRow[];
  state: ReturnType<typeof teamDiscordStateRepo.findTeamDiscordStateByTeamId>;
  divisionAssignment: ReturnType<typeof divisionAssignmentsRepo.findDivisionAssignmentByTeamId>;
  resources: ReturnType<typeof discordResourcesRepo.findDiscordResourcesByTeamId>;
}

/** Recherche par nom (contient, insensible à la casse). Retourne la première équipe trouvée ou null. */
export function findTeamByName(name: string): TeamRow | null {
  const matches = findTeamsByName(name);
  return matches.length > 0 ? matches[0] : null;
}

/** Recherche par nom : toutes les équipes correspondantes, max 10 (pour affichage multi-résultat). */
export function findTeamsByName(name: string): TeamRow[] {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const teams = teamsRepo.findAllTeams();
  const matches = teams.filter(
    (t) =>
      t.normalized_team_name.includes(lower) ||
      t.team_name.toLowerCase().includes(lower)
  );
  return matches.slice(0, 10);
}

export function getTeamDetail(team: TeamRow): TeamDetailResult {
  const players = playersRepo.findPlayersByTeamId(team.id);
  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const divisionAssignment = divisionAssignmentsRepo.findDivisionAssignmentByTeamId(team.id);
  const resources = discordResourcesRepo.findDiscordResourcesByTeamId(team.id);
  return { team, players, state, divisionAssignment, resources };
}
