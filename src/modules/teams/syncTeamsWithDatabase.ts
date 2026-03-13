/**
 * Synchronisation des équipes normalisées avec la base de données.
 * Compare avec les données existantes, crée les nouvelles équipes/joueurs, met à jour ou marque les changements.
 * Une responsabilité : persistance cohérente des NormalizedTeam[] (aucune logique Discord).
 */

import { getDatabase } from '../../db/database.js';
import * as teamsRepo from '../../db/repositories/teams.js';
import * as playersRepo from '../../db/repositories/players.js';
import type { NormalizedTeam, NormalizedPlayer } from './types.js';
import type { PlayerRow } from '../../db/types.js';
import { teamsLogger } from './logger.js';

/** Détail d'un joueur ajouté ou retiré (pour embed staff). */
export interface TeamUpdatePlayerChange {
  lol_pseudo: string;
  discord_user_id?: string | null;
}

/** Changement de Discord ID pour un joueur (pour embed staff). */
export interface TeamUpdateDiscordIdChange {
  lol_pseudo: string;
  old_discord_id: string | null;
  new_discord_id: string | null;
}

/** Diff lisible pour une équipe mise à jour (notification staff). */
export interface TeamUpdateDiff {
  team_api_id: string;
  team_name: string;
  old_team_name?: string;
  playersAdded: TeamUpdatePlayerChange[];
  playersRemoved: TeamUpdatePlayerChange[];
  discordIdChanges: TeamUpdateDiscordIdChange[];
}

/** Équipe absente du scan (désinscrite / disparue du tournoi). */
export interface RemovedTeamInfo {
  team_api_id: string;
  team_name: string;
  team_id: number;
  detectedAt: string;
}

/** Équipe précédemment désinscrite qui réapparaît dans le scan (réinscrite). */
export interface ReactivatedTeamInfo {
  team_api_id: string;
  team_name: string;
  team_id: number;
  detectedAt: string;
  playerCount: number;
}

export interface SyncResult {
  /** Nombre d'équipes créées. */
  created: number;
  /** Équipes nouvellement créées (pour notification Discord). */
  createdTeams: NormalizedTeam[];
  /** Nombre d'équipes mises à jour (changements détectés). */
  updated: number;
  /** Détails des équipes mises à jour (pour notification staff). */
  updatedTeams: TeamUpdateDiff[];
  /** Nombre d'équipes sans changement (last_seen_at seulement). */
  unchanged: number;
  /** Équipes en base mais absentes du scan (désinscrites). */
  removedTeams: RemovedTeamInfo[];
  /** Nombre d'équipes réinscrites (étaient archived, réapparaissent dans le scan). */
  reactivated: number;
  /** Équipes réinscrites (pour notification staff). */
  reactivatedTeams: ReactivatedTeamInfo[];
  /** Erreurs rencontrées par équipe. */
  errors: SyncError[];
}

export interface SyncError {
  team_api_id: string;
  message: string;
}

export interface SyncOptions {
  /** Si true, ne pas calculer ni appliquer les suppressions (removed) pour ce run (ex. scan dégradé). */
  skipRemovals?: boolean;
}

function now(): string {
  return new Date().toISOString();
}

/** Snapshot minimal pour logs debug (équipe + joueurs). */
function buildDbSnapshotForDebug(
  team: ReturnType<typeof teamsRepo.findTeamById>,
  players: ReturnType<typeof playersRepo.findPlayersByTeamId>
): Record<string, unknown> {
  if (!team) return { team: null, players: [] };
  return {
    team_name: team.team_name,
    normalized_team_name: team.normalized_team_name,
    status: team.status,
    last_synced_at: team.last_synced_at,
    players: (players ?? []).map((p) => ({
      id: p.id,
      player_api_id: p.player_api_id,
      lol_pseudo: p.lol_pseudo,
      normalized_lol_pseudo: p.normalized_lol_pseudo,
      discord_user_id: p.discord_user_id ?? null,
      status: p.status,
      is_staff: p.is_staff ?? 0,
    })),
  };
}

/** Snapshot minimal du payload normalisé pour logs debug. */
function buildNormalizedSnapshotForDebug(normalized: NormalizedTeam): Record<string, unknown> {
  return {
    team_name: normalized.team_name,
    normalized_team_name: normalized.normalized_team_name,
    players: (normalized.players ?? []).map((p) => ({
      player_api_id: p.player_api_id ?? null,
      lol_pseudo: p.lol_pseudo,
      normalized_lol_pseudo: p.normalized_lol_pseudo,
      discord_user_id: p.discord_user_id ?? null,
      is_captain: p.is_captain,
    })),
    staff_count: (normalized.staff ?? []).length,
  };
}

function playerStatus(p: NormalizedPlayer): 'active' | 'missing_discord_id' {
  return p.discord_user_id && p.discord_user_id.trim() !== '' ? 'active' : 'missing_discord_id';
}

/** Clé stable pour associer un joueur normalisé à un joueur en base (api_id prioritaire, sinon pseudo normalisé). */
function playerKey(p: NormalizedPlayer): string {
  if (p.player_api_id && p.player_api_id.trim() !== '') return `api:${p.player_api_id}`;
  return `pseudo:${p.normalized_lol_pseudo}`;
}

/** Trouve un joueur en base correspondant au joueur normalisé (par player_api_id ou normalized_lol_pseudo). */
function findMatchingExistingPlayer(
  existing: PlayerRow[],
  normalized: NormalizedPlayer
): PlayerRow | null {
  const key = normalized.player_api_id?.trim();
  if (key) {
    const byApi = existing.find((e) => e.player_api_id === key);
    if (byApi) return byApi;
  }
  return existing.find((e) => e.normalized_lol_pseudo === normalized.normalized_lol_pseudo) ?? null;
}

/** Insère une équipe et tous ses joueurs. */
function insertTeamAndPlayers(normalized: NormalizedTeam): number {
  const ts = now();
  const teamId = teamsRepo.insertTeam({
    team_api_id: normalized.team_api_id,
    team_name: normalized.team_name,
    normalized_team_name: normalized.normalized_team_name,
    status: 'new',
    first_seen_at: ts,
    last_seen_at: ts,
    last_synced_at: ts,
    division_number: null,
    division_group: null,
    current_guild_id: null,
    notes: null,
    created_at: ts,
    updated_at: ts,
  });
  for (const p of normalized.players) {
    playersRepo.insertPlayer({
      player_api_id: p.player_api_id ?? null,
      team_id: teamId,
      lol_pseudo: p.lol_pseudo,
      normalized_lol_pseudo: p.normalized_lol_pseudo,
      discord_user_id: p.discord_user_id ?? null,
      discord_username_snapshot: p.discord_username_snapshot ?? null,
      status: playerStatus(p),
      is_captain: p.is_captain ? 1 : 0,
      is_staff: 0,
      created_at: ts,
      updated_at: ts,
    });
  }
  const staffList = normalized.staff ?? [];
  for (const s of staffList) {
    playersRepo.insertPlayer({
      player_api_id: `staff-${s.player_api_id ?? ''}`,
      team_id: teamId,
      lol_pseudo: s.lol_pseudo,
      normalized_lol_pseudo: s.normalized_lol_pseudo,
      discord_user_id: s.discord_user_id ?? null,
      discord_username_snapshot: s.discord_username_snapshot ?? null,
      status: playerStatus(s),
      is_captain: 0,
      is_staff: 1,
      created_at: ts,
      updated_at: ts,
    });
  }
  return teamId;
}

/** Compare et met à jour une équipe existante : nom, joueurs ajoutés/partis/mis à jour. Retourne hadChanges et un diff pour la notification staff. */
function updateTeamAndPlayers(
  existingTeamId: number,
  normalized: NormalizedTeam
): { hadChanges: boolean; diff: TeamUpdateDiff | null } {
  const ts = now();
  const allMembers = playersRepo.findPlayersByTeamId(existingTeamId);
  const existingPlayersAll = allMembers.filter((r) => (r.is_staff ?? 0) === 0);
  const existingStaffAll = allMembers.filter((r) => (r.is_staff ?? 0) === 1);
  const existingActivePlayers = existingPlayersAll.filter((r) => r.status !== 'left_team');
  const existingActiveStaff = existingStaffAll.filter((r) => r.status !== 'left_team');
  const currentKeys = new Set(normalized.players.map(playerKey));
  const currentStaffKeys = new Set(
    (normalized.staff ?? []).map((s) => `staff-${s.player_api_id ?? ''}`)
  );

  let nameChanged = false;
  let oldTeamName: string | undefined;
  const existingRow = teamsRepo.findTeamById(existingTeamId);
  if (existingRow) {
    nameChanged =
      existingRow.team_name !== normalized.team_name ||
      existingRow.normalized_team_name !== normalized.normalized_team_name;
    if (nameChanged) oldTeamName = existingRow.team_name;
  }

  const newPlayers: NormalizedPlayer[] = [];
  const leftPlayerRows: PlayerRow[] = [];
  const toUpdate: { row: PlayerRow; normalized: NormalizedPlayer }[] = [];

  for (const p of normalized.players) {
    const match = findMatchingExistingPlayer(existingActivePlayers, p);
    if (match) toUpdate.push({ row: match, normalized: p });
    else newPlayers.push(p);
  }
  const matchedPlayerRowIds = new Set(toUpdate.map((t) => t.row.id));
  for (const row of existingActivePlayers) {
    if (matchedPlayerRowIds.has(row.id)) continue;
    const key = row.player_api_id ? `api:${row.player_api_id}` : `pseudo:${row.normalized_lol_pseudo}`;
    if (!currentKeys.has(key)) leftPlayerRows.push(row);
  }

  const playerUpdates: { row: PlayerRow; normalized: NormalizedPlayer; updates: Parameters<typeof playersRepo.updatePlayer>[1] }[] = [];
  for (const { row, normalized } of toUpdate) {
    const updates: Parameters<typeof playersRepo.updatePlayer>[1] = {};
    if (row.lol_pseudo !== normalized.lol_pseudo) updates.lol_pseudo = normalized.lol_pseudo;
    if (row.normalized_lol_pseudo !== normalized.normalized_lol_pseudo)
      updates.normalized_lol_pseudo = normalized.normalized_lol_pseudo;
    if ((row.discord_user_id ?? '') !== (normalized.discord_user_id ?? ''))
      updates.discord_user_id = normalized.discord_user_id ?? null;
    if ((row.discord_username_snapshot ?? '') !== (normalized.discord_username_snapshot ?? ''))
      updates.discord_username_snapshot = normalized.discord_username_snapshot ?? null;
    const newStatus = playerStatus(normalized);
    if (row.status !== newStatus) updates.status = newStatus;
    if ((row.is_captain ? 1 : 0) !== (normalized.is_captain ? 1 : 0))
      updates.is_captain = normalized.is_captain ? 1 : 0;
    if (Object.keys(updates).length > 0) playerUpdates.push({ row, normalized, updates });
  }

  const newStaffList = (normalized.staff ?? []).filter(
    (s) => !existingActiveStaff.some((e) => e.player_api_id === `staff-${s.player_api_id ?? ''}`)
  );
  const leftStaffRows = existingActiveStaff.filter((r) => !currentStaffKeys.has(r.player_api_id ?? ''));

  const hasContentChange =
    nameChanged ||
    newPlayers.length > 0 ||
    leftPlayerRows.length > 0 ||
    playerUpdates.length > 0 ||
    newStaffList.length > 0 ||
    leftStaffRows.length > 0;

  const discordIdChanges: TeamUpdateDiscordIdChange[] = playerUpdates
    .filter(({ updates }) => updates.discord_user_id !== undefined)
    .map(({ row, normalized }) => ({
      lol_pseudo: normalized.lol_pseudo,
      old_discord_id: row.discord_user_id ?? null,
      new_discord_id: normalized.discord_user_id ?? null,
    }));

  const diff: TeamUpdateDiff | null =
    hasContentChange || nameChanged
      ? {
          team_api_id: normalized.team_api_id,
          team_name: normalized.team_name,
          ...(oldTeamName !== undefined && { old_team_name: oldTeamName }),
          playersAdded: newPlayers.map((p) => ({
            lol_pseudo: p.lol_pseudo,
            discord_user_id: p.discord_user_id ?? null,
          })),
          playersRemoved: leftPlayerRows.map((r) => ({
            lol_pseudo: r.lol_pseudo,
            discord_user_id: r.discord_user_id ?? null,
          })),
          discordIdChanges,
        }
      : null;

  if (hasContentChange || nameChanged) {
    teamsLogger.info('syncTeamsWithDatabase: [DEBUG] détection update — avant persistance', {
      team_id: existingTeamId,
      team_api_id: normalized.team_api_id,
      comparaison: {
        joueurs_actifs_comparés: existingActivePlayers.length,
        staff_actifs_comparés: existingActiveStaff.length,
        joueurs_left_team_ignorés: existingPlayersAll.length - existingActivePlayers.length,
        staff_left_team_ignorés: existingStaffAll.length - existingActiveStaff.length,
        leftPlayersCount_final: leftPlayerRows.length,
        leftStaffCount_final: leftStaffRows.length,
      },
      snapshot_db_avant: buildDbSnapshotForDebug(existingRow, allMembers),
      snapshot_normalized: buildNormalizedSnapshotForDebug(normalized),
      differences: {
        nameChanged,
        newPlayersCount: newPlayers.length,
        leftPlayersCount: leftPlayerRows.length,
        playerUpdatesCount: playerUpdates.length,
        newStaffCount: newStaffList.length,
        leftStaffCount: leftStaffRows.length,
      },
    });
  }

  if (nameChanged) {
    teamsRepo.updateTeam(existingTeamId, {
      team_name: normalized.team_name,
      normalized_team_name: normalized.normalized_team_name,
      status: 'changed',
      last_seen_at: ts,
      last_synced_at: ts,
    });
  } else if (hasContentChange) {
    teamsRepo.updateTeam(existingTeamId, {
      status: 'changed',
      last_seen_at: ts,
      last_synced_at: ts,
    });
  } else {
    teamsRepo.updateLastSeenAt(existingTeamId, ts);
  }

  for (const row of leftPlayerRows) {
    playersRepo.updatePlayer(row.id, { status: 'left_team' });
  }
  for (const p of newPlayers) {
    playersRepo.insertPlayer({
      player_api_id: p.player_api_id ?? null,
      team_id: existingTeamId,
      lol_pseudo: p.lol_pseudo,
      normalized_lol_pseudo: p.normalized_lol_pseudo,
      discord_user_id: p.discord_user_id ?? null,
      discord_username_snapshot: p.discord_username_snapshot ?? null,
      status: playerStatus(p),
      is_captain: p.is_captain ? 1 : 0,
      is_staff: 0,
      created_at: ts,
      updated_at: ts,
    });
  }
  for (const { row, updates } of playerUpdates) {
    playersRepo.updatePlayer(row.id, updates);
  }

  for (const row of leftStaffRows) {
    playersRepo.updatePlayer(row.id, { status: 'left_team' });
  }
  for (const s of newStaffList) {
    playersRepo.insertPlayer({
      player_api_id: `staff-${s.player_api_id ?? ''}`,
      team_id: existingTeamId,
      lol_pseudo: s.lol_pseudo,
      normalized_lol_pseudo: s.normalized_lol_pseudo,
      discord_user_id: s.discord_user_id ?? null,
      discord_username_snapshot: s.discord_username_snapshot ?? null,
      status: playerStatus(s),
      is_captain: 0,
      is_staff: 1,
      created_at: ts,
      updated_at: ts,
    });
  }

  if (hasContentChange || nameChanged) {
    const rereadTeam = teamsRepo.findTeamById(existingTeamId);
    const rereadPlayers = playersRepo.findPlayersByTeamId(existingTeamId);
    teamsLogger.info('syncTeamsWithDatabase: [DEBUG] équipe mise à jour — relu en base après update', {
      team_id: existingTeamId,
      team_api_id: normalized.team_api_id,
      snapshot_db_apres_update: buildDbSnapshotForDebug(rereadTeam, rereadPlayers),
    });
  }

  return { hadChanges: hasContentChange || nameChanged, diff };
}

/**
 * Synchronise les équipes normalisées avec la base de données.
 * - Nouvelle équipe → insert team + players
 * - Équipe existante → compare joueurs (nouveaux, partis, nom équipe), met à jour en conséquence
 * - Équipes en base mais absentes du scan → remontées dans removedTeams (désinscrites)
 * Chaque équipe est traitée dans une transaction.
 * @param options.skipRemovals - Si true (ex. scan dégradé), aucune équipe ne sera marquée removed ni archivée.
 */
export function syncTeamsWithDatabase(
  normalizedTeams: NormalizedTeam[],
  options?: SyncOptions
): SyncResult {
  const result: SyncResult = {
    created: 0,
    createdTeams: [],
    updated: 0,
    updatedTeams: [],
    unchanged: 0,
    removedTeams: [],
    reactivated: 0,
    reactivatedTeams: [],
    errors: [],
  };

  if (!normalizedTeams || !Array.isArray(normalizedTeams)) {
    teamsLogger.warn('syncTeamsWithDatabase: entrée invalide (tableau attendu)', {
      type: normalizedTeams === null ? 'null' : typeof normalizedTeams,
    });
    return result;
  }

  if (normalizedTeams.length === 0) {
    teamsLogger.debug('syncTeamsWithDatabase: aucune équipe à synchroniser');
    return result;
  }

  const db = getDatabase();
  const scanTeamApiIds = new Set(normalizedTeams.map((t) => (t.team_api_id ?? '').trim()).filter(Boolean));
  /** Nombre d'équipes actives en base avant ce sync (pour protection scan incomplet). */
  const activeCountBeforeSync = teamsRepo.findTeamsWithStatusIn(['new', 'active', 'changed']).length;
  /** Équipes créées dans ce run : ne doivent jamais être comptées comme "updated" (premier scan / doublons). */
  const createdInThisRun = new Set<string>();
  teamsLogger.info('syncTeamsWithDatabase: démarrage', { count: normalizedTeams.length });

  for (const normalized of normalizedTeams) {
    const teamApiId = normalized.team_api_id?.trim?.();
    if (!teamApiId) {
      result.errors.push({ team_api_id: '(vide)', message: 'team_api_id manquant' });
      continue;
    }

    try {
      const ts = now();
      db.transaction(() => {
        const existing = teamsRepo.findTeamByApiId(teamApiId);
        if (!existing) {
          insertTeamAndPlayers(normalized);
          result.created++;
          result.createdTeams.push(normalized);
          createdInThisRun.add(teamApiId);
          teamsLogger.debug('syncTeamsWithDatabase: équipe créée', {
            team_api_id: teamApiId,
            player_count: normalized.players.length,
          });
        } else if (existing.status === 'archived') {
          updateTeamAndPlayers(existing.id, normalized);
          teamsRepo.updateTeam(existing.id, {
            status: 'active',
            team_name: normalized.team_name,
            normalized_team_name: normalized.normalized_team_name,
            last_seen_at: ts,
            last_synced_at: ts,
          });
          result.reactivated++;
          result.reactivatedTeams.push({
            team_api_id: teamApiId,
            team_name: normalized.team_name,
            team_id: existing.id,
            detectedAt: ts,
            playerCount: normalized.players.length,
          });
          teamsLogger.debug('syncTeamsWithDatabase: équipe réinscrite', {
            team_api_id: teamApiId,
            team_id: existing.id,
            player_count: normalized.players.length,
          });
        } else {
          const { hadChanges, diff } = updateTeamAndPlayers(existing.id, normalized);
          if (hadChanges) {
            if (!createdInThisRun.has(teamApiId)) {
              result.updated++;
              if (diff) result.updatedTeams.push(diff);
              teamsLogger.debug('syncTeamsWithDatabase: équipe mise à jour', {
                team_api_id: teamApiId,
                team_id: existing.id,
              });
            }
          } else {
            result.unchanged++;
          }
        }
      })();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ team_api_id: teamApiId, message });
      teamsLogger.error('syncTeamsWithDatabase: erreur sur équipe', {
        team_api_id: teamApiId,
        message,
      });
    }
  }

  const scannedCount = normalizedTeams.length;
  const removalThreshold = 0.8;
  const skipRemovalsByOption = options?.skipRemovals === true;
  const skipRemovalsByProtection =
    activeCountBeforeSync > 0 && scannedCount < activeCountBeforeSync * removalThreshold;
  const runRemovals = !skipRemovalsByOption && !skipRemovalsByProtection;

  if (skipRemovalsByOption) {
    teamsLogger.warn('syncTeamsWithDatabase: suppressions désactivées (scan dégradé)', {
      scannedCount,
    });
  } else if (skipRemovalsByProtection) {
    teamsLogger.warn('Protection de synchronisation activée : nombre d\'équipes scannées trop faible, suppressions ignorées', {
      previousActiveCount: activeCountBeforeSync,
      scannedCount,
      threshold: removalThreshold,
    });
  }

  if (runRemovals) {
    const tsRemoved = now();
    const teamsWithKnownStatus = teamsRepo.findTeamsWithStatusIn(['new', 'active', 'changed']);
    for (const team of teamsWithKnownStatus) {
      if (!scanTeamApiIds.has(team.team_api_id)) {
        result.removedTeams.push({
          team_api_id: team.team_api_id,
          team_name: team.team_name,
          team_id: team.id,
          detectedAt: tsRemoved,
        });
        teamsRepo.updateTeam(team.id, { status: 'archived' });
      }
    }
    if (result.removedTeams.length > 0) {
      teamsLogger.info('syncTeamsWithDatabase: équipes absentes du scan (désinscrites)', {
        count: result.removedTeams.length,
        team_api_ids: result.removedTeams.map((r) => r.team_api_id),
      });
    }
  }

  teamsLogger.info('syncTeamsWithDatabase: fin', {
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    removed: result.removedTeams.length,
    reactivated: result.reactivated,
    errors: result.errors.length,
  });
  return result;
}
