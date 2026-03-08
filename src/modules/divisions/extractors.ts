/**
 * Extraction des entrées division/groupe depuis la réponse API calendrier.
 * Une responsabilité : parser le payload sans hardcoder une structure unique.
 */

import type { CalendarDivisionEntry } from './types.js';
import { divisionsLogger } from './logger.js';

const DIVISION_KEYS = ['division', 'divisionNumber', 'division_number', 'divisionId', 'id', 'number'] as const;
const GROUP_KEYS = ['group', 'groupName', 'group_name', 'pool', 'name'] as const;
const TEAM_ID_KEYS = ['teamId', 'team_id', 'id', 'equipeId'] as const;
const TEAM_NAME_KEYS = ['teamName', 'team_name', 'name', 'equipe', 'label'] as const;

/** Clés possibles pour tableaux imbriqués (structure réelle : division -> group[] -> round[] -> calendar[] -> calendarTeam[]). */
const GROUPS_ARRAY_KEYS = ['groups', 'group'] as const;
const ROUNDS_ARRAY_KEYS = ['rounds', 'round'] as const;
const CALENDAR_ARRAY_KEYS = ['calendars', 'calendar'] as const;
const CALENDAR_TEAM_KEYS = ['calendarTeams', 'calendarTeam', 'teams', 'team'] as const;

function getFirstStringOrNumber(obj: unknown, keys: readonly string[]): string | number | null {
  if (obj === null || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (v !== undefined && v !== null) {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (typeof v === 'string') return v.trim() || null;
    }
  }
  return null;
}

function normalizeGroup(value: string | number): string {
  const s = String(value).trim().toUpperCase();
  return s || '?';
}

function normalizeDivisionNumber(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function getArrayFromObject(obj: unknown, keys: readonly string[]): unknown[] {
  if (obj === null || typeof obj !== 'object') return [];
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (Array.isArray(v)) return v;
    if (v !== null && typeof v === 'object') return [v];
  }
  return [];
}

/**
 * Aplatit la structure hiérarchique division -> group[] -> round[] -> calendar[] -> calendarTeam[]
 * en une liste d'entrées (une par équipe).
 */
function flattenDivisionHierarchy(
  divisionItem: unknown,
  divisionIndex: number,
  entries: CalendarDivisionEntry[]
): void {
  if (divisionItem === null || typeof divisionItem !== 'object') return;
  const divObj = divisionItem as Record<string, unknown>;
  const division_number = normalizeDivisionNumber(
    getFirstStringOrNumber(divObj, [...DIVISION_KEYS]) ?? divisionIndex + 1
  );
  const divNum = division_number < 1 ? 1 : division_number;

  const groups = getArrayFromObject(divObj, [...GROUPS_ARRAY_KEYS]);
  if (groups.length === 0) {
    divisionsLogger.warn('extractDivisionEntries: division sans groupes (structure non reconnue)', {
      divisionIndex,
      keys: Object.keys(divObj),
    });
    return;
  }

  for (let g = 0; g < groups.length; g++) {
    const groupItem = groups[g];
    if (groupItem === null || typeof groupItem !== 'object') continue;
    const groupObj = groupItem as Record<string, unknown>;
    const division_group = normalizeGroup(
      getFirstStringOrNumber(groupObj, [...GROUP_KEYS]) ?? String.fromCharCode(65 + g)
    );

    const rounds = getArrayFromObject(groupObj, [...ROUNDS_ARRAY_KEYS]);
    const calendars: unknown[] = [];
    if (rounds.length > 0) {
      for (const roundItem of rounds) {
        calendars.push(...getArrayFromObject(roundItem, [...CALENDAR_ARRAY_KEYS]));
      }
    }
    if (calendars.length === 0) {
      const directCalendar = getArrayFromObject(groupObj, [...CALENDAR_ARRAY_KEYS]);
      if (directCalendar.length > 0) calendars.push(...directCalendar);
    }
    if (calendars.length === 0) {
      divisionsLogger.warn('extractDivisionEntries: groupe sans calendar (structure non reconnue)', {
        divisionIndex,
        groupIndex: g,
        groupKeys: Object.keys(groupObj),
      });
    }

    for (const calItem of calendars) {
      const teams = getArrayFromObject(calItem, [...CALENDAR_TEAM_KEYS]);
      for (const teamItem of teams) {
        const teamIdRaw = getFirstStringOrNumber(teamItem, [...TEAM_ID_KEYS]);
        const teamNameRaw = getFirstStringOrNumber(teamItem, [...TEAM_NAME_KEYS]);
        const team_api_id = teamIdRaw != null ? String(teamIdRaw) : null;
        const team_name = teamNameRaw != null ? String(teamNameRaw) : null;
        if (!team_api_id && !team_name) continue;
        entries.push({
          team_api_id,
          team_name,
          division_number: divNum,
          division_group,
        });
      }
    }
  }
}

/**
 * Extrait la liste des entrées division/groupe depuis la réponse API calendrier.
 * Essaie plusieurs clés possibles (tableau à la racine, ou sous une clé).
 */
export function extractDivisionEntries(data: unknown): CalendarDivisionEntry[] {
  if (data === null || typeof data !== 'object') {
    divisionsLogger.warn('extractDivisionEntries: payload non-object');
    return [];
  }

  const obj = data as Record<string, unknown>;
  let items: unknown[] = [];
  let source = '';

  if (Array.isArray(obj.division)) {
    items = obj.division;
    source = 'division';
  } else if (Array.isArray(obj.divisions)) {
    items = obj.divisions;
    source = 'divisions';
  } else if (Array.isArray(data)) {
    items = data;
    source = 'root';
  } else if (Array.isArray(obj.entries)) {
    items = obj.entries;
    source = 'entries';
  } else if (Array.isArray(obj.teams)) {
    items = obj.teams;
    source = 'teams';
  } else if (Array.isArray(obj.data)) {
    items = obj.data;
    source = 'data';
  } else if (Array.isArray(obj.items)) {
    items = obj.items;
    source = 'items';
  }

  if (items.length === 0) {
    divisionsLogger.warn('extractDivisionEntries: aucune liste trouvée', {
      keys: Object.keys(obj),
      divisionType: obj.division === undefined ? 'undefined' : typeof obj.division,
    });
    return [];
  }

  const entries: CalendarDivisionEntry[] = [];

  if (source === 'division') {
    for (let i = 0; i < items.length; i++) {
      flattenDivisionHierarchy(items[i], i, entries);
    }
  } else {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const divisionRaw = getFirstStringOrNumber(item, [...DIVISION_KEYS]);
      const groupRaw = getFirstStringOrNumber(item, [...GROUP_KEYS]);
      const teamIdRaw = getFirstStringOrNumber(item, [...TEAM_ID_KEYS]);
      const teamNameRaw = getFirstStringOrNumber(item, [...TEAM_NAME_KEYS]);

      const division_number = normalizeDivisionNumber(divisionRaw ?? 0);
      const division_group = normalizeGroup(groupRaw ?? '?');
      const team_api_id = teamIdRaw != null ? String(teamIdRaw) : null;
      const team_name = teamNameRaw != null ? String(teamNameRaw) : null;

      if (division_number < 1 && !team_api_id && !team_name) {
        divisionsLogger.warn('extractDivisionEntries: entrée ignorée (données insuffisantes)', {
          index: i,
        });
        continue;
      }

      entries.push({
        team_api_id,
        team_name,
        division_number: division_number < 1 ? 1 : division_number,
        division_group,
      });
    }
  }

  divisionsLogger.info('extractDivisionEntries: extrait', { source, count: entries.length });
  return entries;
}
