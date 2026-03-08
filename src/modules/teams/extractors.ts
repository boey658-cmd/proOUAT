/**
 * Extracteurs : récupération des données utiles depuis les réponses API brutes.
 * Une responsabilité : parser des payloads inconnus sans hardcoder une structure unique.
 * Gestion des erreurs : retourne tableaux vides ou null au lieu de lancer.
 */

import type { TeamRef, PlayerRef } from './types.js';
import { teamsLogger } from './logger.js';

/** Clés possibles pour la liste d'équipes dans la réponse tournoi (tournamentTeams = structure API réelle). */
const TOURNAMENT_TEAM_KEYS = ['tournamentTeams', 'teams', 'registeredTeams', 'inscriptions', 'teamIds', 'equipes'] as const;

/** Clés possibles pour l'id d'une équipe dans un élément. */
const TEAM_ID_KEYS = ['id', 'teamId', 'team_id', 'equipeId'] as const;

/** Clés possibles pour la liste de joueurs dans la réponse équipe (players + staffs, filtrer leave === null). */
const TEAM_PLAYER_KEYS = ['players', 'staffs', 'Players', 'Staffs', 'members', 'roster', 'joueurs', 'membersList'] as const;

/** Identifiant utilisateur principal (API équipe : chaque entrée contient userId). */
const PLAYER_ID_KEYS = ['userId', 'user_id', 'id', 'playerId', 'joueurId', 'memberId'] as const;

/** Pseudo LoL : priorité summonerName > nickname > fallback (item ou item.user). */
const PSEUDO_KEYS = ['summonerName', 'nickname', 'pseudo', 'lolPseudo', 'lol_pseudo', 'username', 'name'] as const;

/** ID Discord dans la réponse API user : data.discord en priorité, fallback discordId. */
const DISCORD_ID_KEYS = ['discord', 'discordId', 'discord_id', 'discordUserId', 'discord_user_id'] as const;

/** Ordre des clés pour extraire le nom d'équipe (priorité : name, teamName, team_name, displayName, title, label). */
const TEAM_NAME_KEYS = ['name', 'teamName', 'team_name', 'displayName', 'title', 'label'] as const;

/** Valeurs considérées comme placeholder / invalides pour un nom d'équipe. */
const INVALID_TEAM_NAME_VALUES = new Set([
  '',
  'undefined',
  'null',
  'possibly undefined',
  'possibly-undefined',
  'POSSIBLY UNDEFINED',
  'POSSIBLY-UNDEFINED',
]);

/**
 * Retourne true si le nom est valide (non vide, pas un placeholder type "possibly undefined").
 */
export function isValidTeamName(name: string | null | undefined): name is string {
  if (name == null || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  const lower = trimmed.toLowerCase();
  if (INVALID_TEAM_NAME_VALUES.has(lower)) return false;
  if (INVALID_TEAM_NAME_VALUES.has(trimmed)) return false;
  return true;
}

/**
 * Retourne true si la chaîne est exploitable comme nom (non null/undefined, non vide après trim).
 * N'utilise pas de liste noire : tout nom non vide est accepté.
 */
function isUsableTeamName(s: string | null | undefined): s is string {
  if (s == null || typeof s !== 'string') return false;
  return s.trim().length > 0;
}

/**
 * Résout le nom d'affichage d'une équipe avec priorité :
 * 1. fromTeamPayload (réponse API équipe)
 * 2. fromTournamentRef (payload tournoi)
 * 3. fallback : Team-{teamApiId} uniquement si aucun nom exploitable
 */
export function resolveTeamDisplayName(
  teamApiId: string,
  fromTeamPayload: string | null,
  fromTournamentRef: string | undefined
): string {
  const id = String(teamApiId).trim() || '?';
  if (isUsableTeamName(fromTeamPayload)) return String(fromTeamPayload).trim();
  if (isUsableTeamName(fromTournamentRef)) return String(fromTournamentRef).trim();
  return `Team-${id}`;
}

function getFirstStringOrNumber(obj: unknown, keys: readonly string[]): string | number | null {
  if (obj === null || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (v !== undefined && v !== null) {
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (typeof v === 'string') return v;
    }
  }
  return null;
}

function getOptionalBoolean(obj: unknown, keys: readonly string[]): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (v === true || v === false) return v;
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return false;
}

/** Retourne true si l'élément est un joueur actif (leave === null ou absent). */
function isActiveMember(item: unknown): boolean {
  if (item === null || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  const leave = o['leave'];
  return leave === null || leave === undefined;
}

/**
 * Récupère l'id joueur depuis l'élément ou depuis un sous-objet (user, member).
 */
function getPlayerIdFromItem(item: unknown): string | number | null {
  const direct = getFirstStringOrNumber(item, [...PLAYER_ID_KEYS]);
  if (direct !== null) return direct;
  if (item === null || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const user = o['user'];
  if (user !== null && typeof user === 'object' && !Array.isArray(user)) {
    const fromUser = getFirstStringOrNumber(user, [...PLAYER_ID_KEYS]);
    if (fromUser !== null) return fromUser;
  }
  const member = o['member'];
  if (member !== null && typeof member === 'object' && !Array.isArray(member)) {
    const fromMember = getFirstStringOrNumber(member, [...PLAYER_ID_KEYS]);
    if (fromMember !== null) return fromMember;
  }
  return null;
}

/**
 * Récupère le pseudo depuis l'élément ou depuis user.
 */
function getPseudoFromItem(item: unknown): string | number | null {
  const direct = getFirstStringOrNumber(item, [...PSEUDO_KEYS]);
  if (direct !== null) return direct;
  if (item === null || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const user = o['user'];
  if (user !== null && typeof user === 'object' && !Array.isArray(user)) {
    const fromUser = getFirstStringOrNumber(user, [...PSEUDO_KEYS]);
    if (fromUser !== null) return fromUser;
  }
  return null;
}

/**
 * Extrait la liste des références équipes depuis la réponse API tournoi.
 * Essaie plusieurs clés courantes pour rester compatible avec plusieurs APIs.
 */
export function extractTeamRefsFromTournament(data: unknown): TeamRef[] {
  if (data === null || typeof data !== 'object') {
    teamsLogger.debug('extractTeamRefsFromTournament: payload non-object', { type: typeof data });
    return [];
  }
  const obj = data as Record<string, unknown>;

  for (const key of TOURNAMENT_TEAM_KEYS) {
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      const refs: TeamRef[] = [];
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        const id = getFirstStringOrNumber(item, [...TEAM_ID_KEYS]);
        if (id !== null) {
          const name = getFirstStringOrNumber(item, [...TEAM_NAME_KEYS]);
          refs.push({ id, name: name != null ? String(name) : undefined });
        } else {
          teamsLogger.debug('extractTeamRefsFromTournament: élément sans id ignoré', { index: i });
        }
      }
      if (refs.length > 0) {
        teamsLogger.info('extractTeamRefsFromTournament: équipes extraites', { key, count: refs.length });
        return refs;
      }
    }
    if (key === 'teamIds' && (typeof raw === 'string' || typeof raw === 'number')) {
      return [{ id: raw }];
    }
  }

  teamsLogger.warn('extractTeamRefsFromTournament: aucune liste d’équipes trouvée', {
    keys: Object.keys(obj),
  });
  return [];
}

/**
 * Retourne la première valeur non vide (après trim) parmi les clés, ou null.
 */
function getFirstNonEmptyString(obj: unknown, keys: readonly string[]): string | null {
  if (obj === null || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (v !== undefined && v !== null) {
      const s = typeof v === 'string' ? v : String(v);
      if (s.trim().length > 0) return s.trim();
    }
  }
  return null;
}

/**
 * Extrait le nom de l'équipe depuis la réponse API équipe.
 * Ordre des clés : name, teamName, team_name, displayName, title, label.
 * Les infos peuvent être à la racine ou dans data (payload : { data: {...}, players, staffs }).
 */
export function extractTeamNameFromTeam(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const fromRoot = getFirstNonEmptyString(obj, [...TEAM_NAME_KEYS]);
  if (fromRoot != null) return fromRoot;
  const inner = obj['data'];
  if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
    const fromData = getFirstNonEmptyString(inner, [...TEAM_NAME_KEYS]);
    if (fromData != null) return fromData;
  }
  return null;
}

const ARRAY_KEYS = ['players', 'staffs', 'members', 'roster', 'tournamentPlayers'] as const;

function getArrayLengthsAt(obj: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of ARRAY_KEYS) {
    const v = obj[key];
    if (Array.isArray(v)) out[key] = v.length;
  }
  return out;
}

function getFirstElementKeys(arr: unknown[]): string[] | null {
  const first = arr[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) return null;
  return Object.keys(first as Record<string, unknown>);
}

/**
 * Diagnostic temporaire : résumé de la structure du payload équipe quand aucun membre actif n'est trouvé.
 */
function logTeamPayloadStructureDiagnostic(obj: Record<string, unknown>): void {
  const rootKeys = Object.keys(obj);
  const rootLengths = getArrayLengthsAt(obj);

  const summary: Record<string, unknown> = {
    rootKeys,
    rootArrayLengths: rootLengths,
  };

  const team = obj['team'];
  if (team !== null && typeof team === 'object' && !Array.isArray(team)) {
    const t = team as Record<string, unknown>;
    summary.teamKeys = Object.keys(t);
    summary.teamArrayLengths = getArrayLengthsAt(t);
    for (const key of ARRAY_KEYS) {
      const arr = t[key];
      if (Array.isArray(arr) && arr.length > 0) {
        const firstKeys = getFirstElementKeys(arr);
        if (firstKeys) summary[`team.${key}.firstElementKeys`] = firstKeys;
      }
    }
  }

  const data = obj['data'];
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    summary.dataKeys = Object.keys(d);
    summary.dataArrayLengths = getArrayLengthsAt(d);
    for (const key of ARRAY_KEYS) {
      const arr = d[key];
      if (Array.isArray(arr) && arr.length > 0) {
        const firstKeys = getFirstElementKeys(arr);
        if (firstKeys) summary[`data.${key}.firstElementKeys`] = firstKeys;
      }
    }
  }

  for (const key of ARRAY_KEYS) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const firstKeys = getFirstElementKeys(arr);
      if (firstKeys) summary[`root.${key}.firstElementKeys`] = firstKeys;
    }
  }

  teamsLogger.warn('extractPlayerRefsFromTeam: diagnostic structure payload équipe (aucun membre actif)', summary);
}

/**
 * Lit data.players et data.staffs à la racine, filtre leave === null, retourne les entrées actives + comptes.
 */
function getActivePlayersAndStaffs(obj: Record<string, unknown>): {
  items: unknown[];
  activePlayersCount: number;
  activeStaffsCount: number;
} {
  let activePlayersCount = 0;
  let activeStaffsCount = 0;
  const merged: unknown[] = [];

  const players = obj['players'];
  if (Array.isArray(players)) {
    for (const item of players) {
      if (isActiveMember(item)) {
        merged.push(item);
        activePlayersCount++;
      }
    }
  }

  const staffs = obj['staffs'];
  if (Array.isArray(staffs)) {
    for (const item of staffs) {
      if (isActiveMember(item)) {
        merged.push(item);
        activeStaffsCount++;
      }
    }
  }

  return { items: merged, activePlayersCount, activeStaffsCount };
}

/**
 * Extrait la liste des références joueurs depuis la réponse API équipe.
 * Lit en priorité data.players et data.staffs à la racine, filtre leave === null, utilise userId.
 */
export function extractPlayerRefsFromTeam(data: unknown): PlayerRef[] {
  if (data === null || typeof data !== 'object') {
    teamsLogger.debug('extractPlayerRefsFromTeam: payload non-object');
    return [];
  }
  const obj = data as Record<string, unknown>;
  const { items: activeItems, activePlayersCount, activeStaffsCount } = getActivePlayersAndStaffs(obj);

  teamsLogger.info('extractPlayerRefsFromTeam: membres actifs', {
    activePlayersCount,
    activeStaffsCount,
  });

  if (activeItems.length === 0) {
    logTeamPayloadStructureDiagnostic(obj);
    return [];
  }

  const refs: PlayerRef[] = [];
  for (let i = 0; i < activeItems.length; i++) {
    const item = activeItems[i];
    const id = getPlayerIdFromItem(item);
    if (id !== null) {
      const pseudo = getPseudoFromItem(item);
      const isCaptain = getOptionalBoolean(item, ['isCaptain', 'is_captain', 'captain']);
      refs.push({
        id,
        pseudo: pseudo != null ? String(pseudo) : undefined,
        isCaptain,
      });
    }
  }

  return refs;
}

/**
 * Dépaquette data.data si présent (structure API réelle).
 */
function unwrapUserPayload(data: unknown): Record<string, unknown> | null {
  if (data === null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const inner = o['data'];
  if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return o;
}

/**
 * Extrait l'ID Discord depuis la réponse API utilisateur (tolérant à data.data).
 */
export function extractDiscordIdFromUser(data: unknown): string | null {
  const o = unwrapUserPayload(data);
  if (o === null) return null;
  const value = getFirstStringOrNumber(o, [...DISCORD_ID_KEYS]);
  if (value === null) return null;
  const str = String(value).trim();
  if (str === '') return null;
  return str;
}

/**
 * Extrait un nom d'utilisateur (Discord ou pseudo) depuis la réponse API utilisateur (tolérant à data.data).
 */
export function extractUsernameFromUser(data: unknown): string | null {
  const o = unwrapUserPayload(data);
  if (o === null) return null;
  const keys = ['username', 'name', 'discordUsername', 'pseudo', 'displayName'];
  const v = getFirstStringOrNumber(o, keys);
  return v != null ? String(v) : null;
}
