/**
 * Audit READ-ONLY Discord ↔ SQLite (teams, team_discord_state, discord_resources).
 * Aucune écriture BDD ni Discord.
 */

import type { Client, Guild, Role } from 'discord.js';
import { ChannelType, type GuildBasedChannel } from 'discord.js';
import * as teamsRepo from '../../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../../db/repositories/teamDiscordState.js';
import * as discordResourcesRepo from '../../db/repositories/discordResources.js';
import type { TeamRow } from '../../db/types.js';
import { formatDivisionChannelName, formatDivisionRoleName, getDivisionCategoryName } from '../divisions/utils.js';
import { slugifyChannelName, slugifyRoleName } from '../discord/resources/slugify.js';

export type AuditTeamStatus =
  | 'OK'
  | 'MISSING_ROLE'
  | 'MISSING_CHANNEL'
  | 'MISSING_CATEGORY'
  | 'MISSING_MULTIPLE'
  | 'ROLE_RECOVERABLE_BY_NAME'
  | 'CHANNEL_RECOVERABLE_BY_NAME'
  | 'CATEGORY_RECOVERABLE_BY_NAME'
  | 'AMBIGUOUS_ROLE_MATCH'
  | 'AMBIGUOUS_CHANNEL_MATCH'
  | 'AMBIGUOUS_CATEGORY_MATCH'
  | 'STATE_RESOURCES_MISMATCH'
  | 'ORPHAN_DB_REFERENCE'
  | 'NO_DISCORD_STATE';

export interface AuditTeamLine {
  teamId: number;
  teamApiId: string;
  teamName: string;
  status: AuditTeamStatus;
  detail: string;
  /** Indices pour /ouat check (n’altère pas le détail ni le statut de /ouat audit). */
  checkHints?: {
    /** Seul écart notable : catégorie OK sur Discord mais ligne catégorie absente dans discord_resources (sr, sc, sk tous renseignés et OK côté Discord). */
    categoryResourceGapOnly: boolean;
    /** Tri liste principale (plus petit = plus urgent). */
    priority: number;
  };
}

export interface AuditTotals {
  total: number;
  ok: number;
  missingRole: number;
  missingChannel: number;
  missingCategory: number;
  missingMultiple: number;
  recoverableByName: number;
  ambiguous: number;
  noDiscordState: number;
  mismatchInternal: number;
  orphanDb: number;
}

export interface DiscordDbAuditResult {
  auditedGuildId: string;
  divisionFilter: number | null;
  lines: AuditTeamLine[];
  totals: AuditTotals;
  reportText: string;
}

/** Statuts considérés comme « problématiques » pour /ouat check. */
export function isAuditProblemStatus(status: AuditTeamStatus): boolean {
  return status !== 'OK';
}

/**
 * Texte compact pour /ouat check (une ligne lisible par équipe à problème).
 */
export function formatCheckHumanLine(line: AuditTeamLine): string {
  const statusFr: Partial<Record<AuditTeamStatus, string>> = {
    MISSING_ROLE: 'rôle manquant ou invalide sur Discord',
    MISSING_CHANNEL: 'salon texte manquant ou invalide sur Discord',
    MISSING_CATEGORY: 'catégorie manquante ou invalide sur Discord',
    MISSING_MULTIPLE: 'plusieurs ressources manquantes ou invalides',
    ROLE_RECOVERABLE_BY_NAME: 'rôle absent — récupération possible par nom (1 candidat)',
    CHANNEL_RECOVERABLE_BY_NAME: 'salon absent — récupération possible par nom (1 candidat)',
    CATEGORY_RECOVERABLE_BY_NAME: 'catégorie absente — récupération possible par nom (1 candidat)',
    AMBIGUOUS_ROLE_MATCH: 'matching de rôle ambigu (plusieurs noms)',
    AMBIGUOUS_CHANNEL_MATCH: 'matching de salon ambigu (plusieurs noms)',
    AMBIGUOUS_CATEGORY_MATCH: 'matching de catégorie ambigu (plusieurs noms)',
    STATE_RESOURCES_MISMATCH: 'incohérence team_discord_state ↔ discord_resources',
    ORPHAN_DB_REFERENCE: 'référence BDD vers une ressource introuvable sur Discord',
    NO_DISCORD_STATE: 'pas d’état Discord actif en base',
  };
  let label = statusFr[line.status] ?? line.status;
  if (line.checkHints?.categoryResourceGapOnly) {
    label =
      'écart BDD secondaire : catégorie absente de discord_resources (OK sur Discord ; rôle + salon OK)';
  }
  return `• **${line.teamName}** (\`${line.teamApiId}\`) — ${label}\n  └ ${line.detail.slice(0, 280)}${line.detail.length > 280 ? '…' : ''}`;
}

/** Priorité d’affichage /ouat check : plus petit = plus actionnable en premier. */
export function computeOuatCheckPriority(status: AuditTeamStatus): number {
  switch (status) {
    case 'MISSING_CHANNEL':
      return 1;
    case 'MISSING_ROLE':
      return 2;
    case 'MISSING_CATEGORY':
      return 3;
    case 'MISSING_MULTIPLE':
      return 4;
    case 'NO_DISCORD_STATE':
      return 5;
    case 'ROLE_RECOVERABLE_BY_NAME':
      return 6;
    case 'CHANNEL_RECOVERABLE_BY_NAME':
      return 7;
    case 'CATEGORY_RECOVERABLE_BY_NAME':
      return 8;
    case 'AMBIGUOUS_ROLE_MATCH':
      return 9;
    case 'AMBIGUOUS_CHANNEL_MATCH':
      return 10;
    case 'AMBIGUOUS_CATEGORY_MATCH':
      return 11;
    case 'ORPHAN_DB_REFERENCE':
      return 12;
    case 'STATE_RESOURCES_MISMATCH':
      return 13;
    case 'OK':
      return 99;
    default:
      return 50;
  }
}

/**
 * Sépare les lignes pour /ouat check : liste principale (actionnable) vs secondaire (écart discord_resources catégorie seul).
 */
export function partitionOuatCheckLines(lines: AuditTeamLine[]): {
  main: AuditTeamLine[];
  secondary: AuditTeamLine[];
} {
  const main: AuditTeamLine[] = [];
  const secondary: AuditTeamLine[] = [];
  for (const line of lines) {
    if (line.status === 'OK') continue;
    if (line.checkHints?.categoryResourceGapOnly) {
      secondary.push(line);
      continue;
    }
    main.push(line);
  }
  const byPri = (a: AuditTeamLine, b: AuditTeamLine) =>
    (a.checkHints?.priority ?? 99) - (b.checkHints?.priority ?? 99);
  main.sort(byPri);
  secondary.sort(byPri);
  return { main, secondary };
}

export function buildCheckReport(problemLines: AuditTeamLine[]): string {
  if (problemLines.length === 0) {
    return 'Aucune équipe problématique pour les critères demandés.';
  }
  return problemLines.map(formatCheckHumanLine).join('\n\n');
}

function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function expectedNormalizedRoleNames(team: TeamRow): Set<string> {
  const set = new Set<string>();
  const slug = slugifyRoleName(team.team_name);
  if (slug) {
    set.add(normName(slug.replace(/-/g, ' ').toUpperCase()));
  }
  const dg = (team.division_group ?? '').trim();
  if (team.division_number != null && dg !== '') {
    set.add(normName(formatDivisionRoleName(team.division_number, dg, team.team_name)));
  }
  return set;
}

function expectedNormalizedChannelNames(team: TeamRow): Set<string> {
  const set = new Set<string>();
  set.add(normName(slugifyChannelName(team.team_name)));
  const dg = (team.division_group ?? '').trim();
  if (team.division_number != null && dg !== '') {
    set.add(normName(formatDivisionChannelName(team.division_number, dg, team.team_name)));
  }
  return set;
}

function expectedNormalizedCategoryNames(team: TeamRow): Set<string> {
  const set = new Set<string>();
  if (team.division_number != null && team.division_number > 0) {
    set.add(normName(getDivisionCategoryName(team.division_number)));
  }
  return set;
}

async function resolveGuild(
  client: Client,
  guildId: string,
  cache: Map<string, Guild>
): Promise<Guild | null> {
  const existing = cache.get(guildId);
  if (existing) return existing;
  const g = await client.guilds.fetch(guildId).catch(() => null);
  if (g) cache.set(guildId, g);
  return g;
}

type ExistsKind = 'ok' | 'missing' | 'wrong_type' | 'wrong_guild';

async function roleExistsOnGuild(guild: Guild, roleId: string | null | undefined): Promise<ExistsKind> {
  const id = roleId?.trim() ?? '';
  if (!id) return 'missing';
  const role: Role | null = await guild.roles.fetch(id).catch(() => null);
  if (!role) return 'missing';
  if (role.guild.id !== guild.id) return 'wrong_guild';
  return 'ok';
}

async function channelExistsOnGuild(
  guild: Guild,
  channelId: string | null | undefined,
  expect: 'text' | 'category'
): Promise<ExistsKind> {
  const id = channelId?.trim() ?? '';
  if (!id) return 'missing';
  const ch: GuildBasedChannel | null = (await guild.channels.fetch(id).catch(() => null)) as GuildBasedChannel | null;
  if (!ch) return 'missing';
  const gid = 'guildId' in ch ? (ch as { guildId: string }).guildId : guild.id;
  if (gid !== guild.id) return 'wrong_guild';
  if (expect === 'text' && ch.type !== ChannelType.GuildText) return 'wrong_type';
  if (expect === 'category' && ch.type !== ChannelType.GuildCategory) return 'wrong_type';
  return 'ok';
}

function countActiveByType(resources: ReturnType<typeof discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild>) {
  return {
    role: resources.filter((r) => r.resource_type === 'role'),
    channel: resources.filter((r) => r.resource_type === 'channel'),
    category: resources.filter((r) => r.resource_type === 'category'),
  };
}

function findRoleNameMatches(guild: Guild, names: Set<string>): Role[] {
  if (names.size === 0) return [];
  const out: Role[] = [];
  for (const [, r] of guild.roles.cache) {
    if (names.has(normName(r.name))) out.push(r);
  }
  return out;
}

function findTextChannelNameMatches(guild: Guild, names: Set<string>): GuildBasedChannel[] {
  if (names.size === 0) return [];
  const out: GuildBasedChannel[] = [];
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildText) continue;
    if ('name' in ch && names.has(normName((ch as { name: string }).name))) out.push(ch as GuildBasedChannel);
  }
  return out;
}

function findCategoryNameMatches(guild: Guild, names: Set<string>): GuildBasedChannel[] {
  if (names.size === 0) return [];
  const out: GuildBasedChannel[] = [];
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildCategory) continue;
    if ('name' in ch && names.has(normName((ch as { name: string }).name))) out.push(ch as GuildBasedChannel);
  }
  return out;
}

function isEmptyState(state: ReturnType<typeof teamDiscordStateRepo.findTeamDiscordStateByTeamId>): boolean {
  if (!state) return true;
  const r = state.active_role_id?.trim() ?? '';
  const c = state.active_channel_id?.trim() ?? '';
  const k = state.active_category_id?.trim() ?? '';
  return !r && !c && !k;
}

/** Priorité : premier élément de la liste gagne. */
function pickFinalStatus(candidates: AuditTeamStatus[]): AuditTeamStatus {
  const order: AuditTeamStatus[] = [
    'NO_DISCORD_STATE',
    'AMBIGUOUS_ROLE_MATCH',
    'AMBIGUOUS_CHANNEL_MATCH',
    'AMBIGUOUS_CATEGORY_MATCH',
    'STATE_RESOURCES_MISMATCH',
    'ORPHAN_DB_REFERENCE',
    'ROLE_RECOVERABLE_BY_NAME',
    'CHANNEL_RECOVERABLE_BY_NAME',
    'CATEGORY_RECOVERABLE_BY_NAME',
    'MISSING_MULTIPLE',
    'MISSING_ROLE',
    'MISSING_CHANNEL',
    'MISSING_CATEGORY',
    'OK',
  ];
  const set = new Set(candidates);
  for (const s of order) {
    if (set.has(s)) return s;
  }
  return 'OK';
}

function collectTeams(auditedGuildId: string, divisionFilter: number | null): TeamRow[] {
  const all = teamsRepo.findAllTeams().filter((t) => t.status !== 'archived');
  const divFiltered =
    divisionFilter != null ? all.filter((t) => t.division_number === divisionFilter) : all;
  const map = new Map<number, TeamRow>();
  for (const t of divFiltered) {
    const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(t.id);
    const onAudited = discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild(t.id, auditedGuildId);
    const hasLink =
      state?.active_guild_id === auditedGuildId ||
      (t.current_guild_id ?? '') === auditedGuildId ||
      onAudited.length > 0;
    if (hasLink) map.set(t.id, t);
  }
  return [...map.values()].sort((a, b) => a.id - b.id);
}

function buildTotals(lines: AuditTeamLine[]): AuditTotals {
  const t: AuditTotals = {
    total: lines.length,
    ok: 0,
    missingRole: 0,
    missingChannel: 0,
    missingCategory: 0,
    missingMultiple: 0,
    recoverableByName: 0,
    ambiguous: 0,
    noDiscordState: 0,
    mismatchInternal: 0,
    orphanDb: 0,
  };
  for (const line of lines) {
    if (line.status === 'OK') t.ok++;
    if (line.status === 'MISSING_ROLE') t.missingRole++;
    if (line.status === 'MISSING_CHANNEL') t.missingChannel++;
    if (line.status === 'MISSING_CATEGORY') t.missingCategory++;
    if (line.status === 'MISSING_MULTIPLE') t.missingMultiple++;
    if (
      line.status === 'ROLE_RECOVERABLE_BY_NAME' ||
      line.status === 'CHANNEL_RECOVERABLE_BY_NAME' ||
      line.status === 'CATEGORY_RECOVERABLE_BY_NAME'
    )
      t.recoverableByName++;
    if (
      line.status === 'AMBIGUOUS_ROLE_MATCH' ||
      line.status === 'AMBIGUOUS_CHANNEL_MATCH' ||
      line.status === 'AMBIGUOUS_CATEGORY_MATCH'
    )
      t.ambiguous++;
    if (line.status === 'NO_DISCORD_STATE') t.noDiscordState++;
    if (line.status === 'STATE_RESOURCES_MISMATCH') t.mismatchInternal++;
    if (line.status === 'ORPHAN_DB_REFERENCE') t.orphanDb++;
  }
  return t;
}

interface TeamSummaryFlags {
  roleMissing: boolean;
  channelMissing: boolean;
  categoryMissing: boolean;
}

function addMissingCounts(t: AuditTotals, f: TeamSummaryFlags): void {
  if (f.roleMissing) t.missingRole++;
  if (f.channelMissing) t.missingChannel++;
  if (f.categoryMissing) t.missingCategory++;
}

/**
 * Exécute l’audit complet READ-ONLY.
 */
export async function runDiscordDbAuditReadOnly(
  client: Client,
  auditedGuild: Guild,
  options: { division?: number | null }
): Promise<DiscordDbAuditResult> {
  const auditedGuildId = auditedGuild.id;
  const divisionFilter = options.division ?? null;
  const teams = collectTeams(auditedGuildId, divisionFilter);
  const guildCache = new Map<string, Guild>([[auditedGuildId, auditedGuild]]);
  const lines: AuditTeamLine[] = [];
  const missByTeamId = new Map<number, TeamSummaryFlags>();

  for (const team of teams) {
    const notes: string[] = [];
    const candidates: AuditTeamStatus[] = [];
    const missFlags: TeamSummaryFlags = { roleMissing: false, channelMissing: false, categoryMissing: false };

    const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
    const emptyState = isEmptyState(state);

    if (emptyState) {
      candidates.push('NO_DISCORD_STATE');
      notes.push('Aucun team_discord_state ou tous les IDs actifs vides.');
    }

    const stateGuildId = state?.active_guild_id?.trim() ?? '';
    const guildKeyForResources = stateGuildId || auditedGuildId;
    const activeRes = discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild(team.id, guildKeyForResources);
    const byType = countActiveByType(activeRes);

    if (stateGuildId && stateGuildId !== auditedGuildId) {
      candidates.push('STATE_RESOURCES_MISMATCH');
      notes.push(
        `active_guild_id (${stateGuildId}) ≠ serveur audité (${auditedGuildId}); vérifications Discord sur le guild du state.`
      );
    }

    for (const typ of ['role', 'channel', 'category'] as const) {
      if (byType[typ].length > 1) {
        candidates.push('STATE_RESOURCES_MISMATCH');
        notes.push(`Plusieurs discord_resources actifs pour type « ${typ} » (${byType[typ].length}).`);
      }
    }

    const sr = state?.active_role_id?.trim() ?? '';
    const sc = state?.active_channel_id?.trim() ?? '';
    const sk = state?.active_category_id?.trim() ?? '';

    const roleIdsRes = new Set(byType.role.map((r) => r.discord_resource_id));
    const channelIdsRes = new Set(byType.channel.map((r) => r.discord_resource_id));
    const categoryIdsRes = new Set(byType.category.map((r) => r.discord_resource_id));

    if (sr && !roleIdsRes.has(sr)) {
      candidates.push('STATE_RESOURCES_MISMATCH');
      notes.push('active_role_id non présent dans discord_resources actifs (clé guild).');
    }
    if (sc && !channelIdsRes.has(sc)) {
      candidates.push('STATE_RESOURCES_MISMATCH');
      notes.push('active_channel_id non présent dans discord_resources actifs (clé guild).');
    }
    if (sk && !categoryIdsRes.has(sk)) {
      candidates.push('STATE_RESOURCES_MISMATCH');
      notes.push('active_category_id non présent dans discord_resources actifs (clé guild).');
    }

    let resourceIdMismatch = false;
    for (const r of byType.role) {
      if (sr && r.discord_resource_id !== sr) {
        resourceIdMismatch = true;
        notes.push(`Ressource role en base (${r.discord_resource_id}) ≠ state (${sr}).`);
        break;
      }
    }
    for (const r of byType.channel) {
      if (sc && r.discord_resource_id !== sc) {
        resourceIdMismatch = true;
        notes.push(`Ressource channel en base (${r.discord_resource_id}) ≠ state (${sc}).`);
        break;
      }
    }
    for (const r of byType.category) {
      if (sk && r.discord_resource_id !== sk) {
        resourceIdMismatch = true;
        notes.push(`Ressource category en base (${r.discord_resource_id}) ≠ state (${sk}).`);
        break;
      }
    }
    if (resourceIdMismatch) candidates.push('STATE_RESOURCES_MISMATCH');

    const resWithoutState =
      (byType.role.length > 0 && !sr) ||
      (byType.channel.length > 0 && !sc) ||
      (byType.category.length > 0 && !sk);
    if (resWithoutState) {
      candidates.push('STATE_RESOURCES_MISMATCH');
      notes.push('Actif dans discord_resources sans colonne correspondante dans team_discord_state.');
    }

    const onAuditedGuild = discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild(team.id, auditedGuildId);
    if (!emptyState && stateGuildId && stateGuildId !== auditedGuildId && onAuditedGuild.length > 0) {
      notes.push(
        `Ressources actives aussi sur le serveur audité (${onAuditedGuild.length} ligne(s)) — incohérence multi-guild possible.`
      );
      if (!candidates.includes('STATE_RESOURCES_MISMATCH')) candidates.push('STATE_RESOURCES_MISMATCH');
    }

    const fetchGuildId = stateGuildId || auditedGuildId;
    const fetchGuild = await resolveGuild(client, fetchGuildId, guildCache);

    let roleSt: ExistsKind = 'missing';
    let chSt: ExistsKind = 'missing';
    let catSt: ExistsKind = 'missing';

    if (!fetchGuild && !emptyState) {
      candidates.push('ORPHAN_DB_REFERENCE');
      notes.push(`Impossible de charger le guild ${fetchGuildId} (bot absent ou ID invalide).`);
    } else if (fetchGuild && !emptyState && state) {
      roleSt = await roleExistsOnGuild(fetchGuild, state.active_role_id);
      chSt = await channelExistsOnGuild(fetchGuild, state.active_channel_id, 'text');
      catSt = await channelExistsOnGuild(fetchGuild, state.active_category_id, 'category');

      if (sr) {
        if (roleSt === 'ok') notes.push('Rôle Discord: OK.');
        else if (roleSt === 'missing') {
          notes.push('Rôle Discord: absent.');
          missFlags.roleMissing = true;
        } else notes.push(`Rôle Discord: ${roleSt}.`);
      } else notes.push('Rôle: aucun ID dans le state.');

      if (sc) {
        if (chSt === 'ok') notes.push('Salon texte: OK.');
        else if (chSt === 'missing') {
          notes.push('Salon texte: absent.');
          missFlags.channelMissing = true;
        } else notes.push(`Salon texte: ${chSt}.`);
      } else notes.push('Salon: aucun ID dans le state.');

      if (sk) {
        if (catSt === 'ok') notes.push('Catégorie: OK.');
        else if (catSt === 'missing') {
          notes.push('Catégorie: absente.');
          missFlags.categoryMissing = true;
        } else notes.push(`Catégorie: ${catSt}.`);
      } else notes.push('Catégorie: aucun ID dans le state.');

      const nMissing =
        (sr && roleSt !== 'ok' ? 1 : 0) + (sc && chSt !== 'ok' ? 1 : 0) + (sk && catSt !== 'ok' ? 1 : 0);
      if (nMissing >= 2) candidates.push('MISSING_MULTIPLE');
      else {
        if (sr && roleSt !== 'ok') candidates.push('MISSING_ROLE');
        if (sc && chSt !== 'ok') candidates.push('MISSING_CHANNEL');
        if (sk && catSt !== 'ok') candidates.push('MISSING_CATEGORY');
      }

      if (sr && sc && sk && roleSt === 'missing' && chSt === 'missing' && catSt === 'missing') {
        candidates.push('ORPHAN_DB_REFERENCE');
        notes.push('Tous les IDs du state sont absents sur Discord.');
      }

      const expR = expectedNormalizedRoleNames(team);
      if (sr && roleSt === 'missing') {
        const m = findRoleNameMatches(fetchGuild, expR);
        if (m.length === 1) {
          candidates.push('ROLE_RECOVERABLE_BY_NAME');
          notes.push(`Candidat rôle unique par nom: ${m[0]!.id}.`);
        } else if (m.length > 1) {
          candidates.push('AMBIGUOUS_ROLE_MATCH');
          notes.push(`${m.length} rôles correspondent au nom attendu (cache).`);
        }
      }

      const expC = expectedNormalizedChannelNames(team);
      if (sc && chSt === 'missing') {
        const m = findTextChannelNameMatches(fetchGuild, expC);
        if (m.length === 1) {
          candidates.push('CHANNEL_RECOVERABLE_BY_NAME');
          notes.push(`Candidat salon texte unique par nom: ${m[0]!.id}.`);
        } else if (m.length > 1) {
          candidates.push('AMBIGUOUS_CHANNEL_MATCH');
          notes.push(`${m.length} salons texte correspondent (cache).`);
        }
      }

      const expK = expectedNormalizedCategoryNames(team);
      if (sk && catSt === 'missing') {
        const m = findCategoryNameMatches(fetchGuild, expK);
        if (m.length === 1) {
          candidates.push('CATEGORY_RECOVERABLE_BY_NAME');
          notes.push(`Candidat catégorie unique par nom: ${m[0]!.id}.`);
        } else if (m.length > 1) {
          candidates.push('AMBIGUOUS_CATEGORY_MATCH');
          notes.push(`${m.length} catégories correspondent (cache).`);
        }
      }
    }

    if (!sr && !sc && !emptyState && state) {
      notes.push('Ni rôle ni salon renseignés dans le state.');
      if (!candidates.includes('MISSING_MULTIPLE')) candidates.push('MISSING_MULTIPLE');
    }

    const uniqueCandidates = [...new Set(candidates)];
    const finalStatus =
      uniqueCandidates.length === 0 ? 'OK' : pickFinalStatus(uniqueCandidates);

    const crossGuildResourcesConflict =
      !emptyState &&
      !!stateGuildId &&
      stateGuildId !== auditedGuildId &&
      onAuditedGuild.length > 0;

    const strongStateResourcesMismatch =
      (!!stateGuildId && stateGuildId !== auditedGuildId) ||
      byType.role.length > 1 ||
      byType.channel.length > 1 ||
      byType.category.length > 1 ||
      (!!sr && !roleIdsRes.has(sr)) ||
      (!!sc && !channelIdsRes.has(sc)) ||
      resourceIdMismatch ||
      resWithoutState ||
      crossGuildResourcesConflict;

    const categoryResourceGapOnly =
      !!sk &&
      !!sr &&
      !!sc &&
      !categoryIdsRes.has(sk) &&
      !strongStateResourcesMismatch &&
      !!fetchGuild &&
      !emptyState &&
      !!state &&
      catSt === 'ok' &&
      chSt === 'ok' &&
      roleSt === 'ok';

    const priority = computeOuatCheckPriority(finalStatus);

    missByTeamId.set(team.id, missFlags);
    lines.push({
      teamId: team.id,
      teamApiId: team.team_api_id,
      teamName: team.team_name,
      status: finalStatus,
      detail: notes.join(' '),
      checkHints: {
        categoryResourceGapOnly,
        priority,
      },
    });
  }

  const rawTotals = buildTotals(lines);
  const totals: AuditTotals = {
    ...rawTotals,
    missingRole: 0,
    missingChannel: 0,
    missingCategory: 0,
  };
  for (const line of lines) {
    const f = missByTeamId.get(line.teamId);
    if (f) addMissingCounts(totals, f);
  }

  const header = [
    `Audit Discord ↔ BDD (lecture seule)`,
    `Serveur audité: ${auditedGuildId}`,
    divisionFilter != null ? `Filtre division: ${divisionFilter}` : 'Filtre division: (aucun)',
    '',
    `Résumé — total: ${teams.length} | OK: ${rawTotals.ok} | sans state: ${rawTotals.noDiscordState} | mismatch BDD: ${rawTotals.mismatchInternal}`,
    `Manquants (IDs attendus) — rôles: ${totals.missingRole} | salons: ${totals.missingChannel} | catégories: ${totals.missingCategory} | statut MISSING_MULTIPLE: ${rawTotals.missingMultiple}`,
    `Récupérables (nom, cache): ${rawTotals.recoverableByName} | Ambiguës: ${rawTotals.ambiguous} | Orphelin DB: ${rawTotals.orphanDb}`,
    '',
    '--- Détail par équipe ---',
  ];
  const body = lines.map(
    (l) =>
      `[${l.status}] id=${l.teamId} api=${l.teamApiId} | ${l.teamName.slice(0, 60)}\n  ${l.detail.slice(0, 400)}${l.detail.length > 400 ? '…' : ''}`
  );
  const reportText = [...header, ...body].join('\n');

  return {
    auditedGuildId,
    divisionFilter,
    lines,
    totals: {
      ...rawTotals,
      missingRole: totals.missingRole,
      missingChannel: totals.missingChannel,
      missingCategory: totals.missingCategory,
    },
    reportText,
  };
}
