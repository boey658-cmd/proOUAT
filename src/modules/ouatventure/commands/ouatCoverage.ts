/**
 * Diagnostic OUAT « coverage » : pourquoi collectTeamsForGuild exclut des équipes.
 * Lecture seule SQLite — aucune écriture BDD ni Discord.
 */

import * as teamsRepo from '../../../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../../../db/repositories/teamDiscordState.js';
import * as discordResourcesRepo from '../../../db/repositories/discordResources.js';
import type { TeamRow } from '../../../db/types.js';
import { collectTeamsForGuild } from './ouatOverview.js';

export interface OuatCoverageOptions {
  guildId: string;
  guildName: string;
  division: number | null;
}

/** Détail lorsque l’équipe est dans le périmètre (non archivée + division) mais sans lien guild. */
function explainNoGuildLink(team: TeamRow, guildId: string): string {
  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const onGuild = discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild(team.id, guildId);
  const parts: string[] = [];

  if (!state) {
    parts.push('aucun team_discord_state');
  } else {
    const ag = state.active_guild_id?.trim() ?? '';
    if (!ag) parts.push('active_guild_id absent ou vide');
    else if (ag !== guildId) parts.push('active_guild_id ≠ serveur audité');
  }

  const cg = (team.current_guild_id ?? '').trim();
  if (!cg) parts.push('current_guild_id absent ou vide');
  else if (cg !== guildId) parts.push('current_guild_id ≠ serveur audité');

  if (onGuild.length === 0) {
    parts.push('aucune ligne discord_resources active pour ce serveur');
  }

  return parts.length > 0 ? parts.join(' · ') : 'aucun lien guild détecté';
}

/**
 * Rapport texte : compteurs + liste des équipes non retenues par collectTeamsForGuild avec raison.
 */
export function buildOuatCoverageReport(opts: OuatCoverageOptions): string {
  const { guildId, guildName, division } = opts;

  const all = teamsRepo.findAllTeams();
  const totalDb = all.length;

  const archived = all.filter((t) => t.status === 'archived');
  const nonArchived = all.filter((t) => t.status !== 'archived');
  const totalArchived = archived.length;
  const totalNonArchived = nonArchived.length;

  const retained = collectTeamsForGuild(guildId, division);
  const retainedSet = new Set(retained.map((t) => t.id));

  const inScopeNonArchived =
    division == null
      ? nonArchived
      : nonArchived.filter((t) => t.division_number === division);
  const totalInScopeNonArchived = inScopeNonArchived.length;

  const sortTeams = (rows: TeamRow[]) =>
    [...rows].sort((a, b) => a.team_name.localeCompare(b.team_name, 'fr', { sensitivity: 'base' }));

  const out: string[] = [
    'OUAT COVERAGE (lecture seule)',
    '',
    `Serveur : ${guildName} (${guildId})`,
    division != null ? `Filtre division : ${division}` : 'Filtre division : (aucun — toutes divisions non archivées dans le périmètre)',
    '',
    '--- Compteurs ---',
    `Teams en base (toutes) : ${totalDb}`,
    `Non archivées : ${totalNonArchived}`,
    `Archivées : ${totalArchived}`,
    `Non archivées dans le périmètre division : ${totalInScopeNonArchived}`,
    `Retenues (collectTeamsForGuild, même logique qu’overview/links) : ${retained.length}`,
    `Écart « périmètre non archivé − retenues » : ${totalInScopeNonArchived - retained.length} (équipes sans critère de liaison vers ce serveur)`,
    '',
    '--- Détail des non-retenues ---',
    'Les commandes overview/links n’incluent pas les archivées, ni (si filtre) les autres divisions.',
    'Chaque ligne explique pourquoi l’équipe ne compte pas dans « retenues ».',
    '',
  ];

  const excludedLines: string[] = [];

  const push = (team: TeamRow, reason: string) => {
    excludedLines.push(`- ${team.team_name} (api ${team.team_api_id}) → ${reason}`);
  };

  for (const t of sortTeams(archived)) {
    push(t, 'archived (exclue par collectTeamsForGuild comme overview/links)');
  }

  if (division != null) {
    const horsDivision = nonArchived.filter((t) => t.division_number !== division);
    for (const t of sortTeams(horsDivision)) {
      push(
        t,
        `filtrée par division (hors division ${division} ; division équipe : ${t.division_number ?? '∅'})`
      );
    }
  }

  for (const t of sortTeams(inScopeNonArchived)) {
    if (retainedSet.has(t.id)) continue;
    push(t, explainNoGuildLink(t, guildId));
  }

  if (excludedLines.length === 0) {
    excludedLines.push('(Aucune exclusion : toutes les équipes non archivées du périmètre sont retenues.)');
  }

  out.push(...excludedLines);
  return out.join('\n').trimEnd();
}
