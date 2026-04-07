/**
 * Rapport OUAT « links » : liaisons team_discord_state ↔ Discord (IDs + noms).
 * Lecture seule (BDD + fetch Discord en lecture). Aucune écriture SQLite ni mutation guild.
 */

import type { CategoryChannel, Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import * as teamsRepo from '../../../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../../../db/repositories/teamDiscordState.js';
import * as discordResourcesRepo from '../../../db/repositories/discordResources.js';
import type { TeamRow } from '../../../db/types.js';
import { collectTeamsForGuild, prefetchGuildDiscordCaches } from './ouatOverview.js';

export type OuatLinkTeamStatus =
  | 'OK'
  | 'ROLE_NOT_CONFIGURED'
  | 'ROLE_MISSING_ON_DISCORD'
  | 'CHANNEL_NOT_CONFIGURED'
  | 'CHANNEL_MISSING_ON_DISCORD'
  | 'CATEGORY_NOT_CONFIGURED'
  | 'CATEGORY_MISSING_ON_DISCORD'
  | 'MULTIPLE_ISSUES';

export type OuatLinksVue = 'all' | 'problems' | 'ok' | 'roles' | 'channels';

type IssueCode = Exclude<OuatLinkTeamStatus, 'OK' | 'MULTIPLE_ISSUES'>;

export interface OuatLinksOptions {
  guild: Guild;
  division: number | null;
  vue: OuatLinksVue;
  teamApiId: string | null;
}

interface ResolvedLinkRow {
  linkStatus: OuatLinkTeamStatus;
  issues: IssueCode[];
  lines: string[];
}

function teamLinkedToGuild(team: TeamRow, guildId: string): boolean {
  const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const onGuild = discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild(team.id, guildId);
  return (
    state?.active_guild_id === guildId ||
    (team.current_guild_id ?? '') === guildId ||
    onGuild.length > 0
  );
}

function resolveRole(guild: Guild, raw: string | null | undefined): {
  id: string | null;
  name: string;
  issue: IssueCode | null;
} {
  const id = raw?.trim() || null;
  if (!id) {
    return { id: null, name: 'absent', issue: 'ROLE_NOT_CONFIGURED' };
  }
  const role = guild.roles.cache.get(id);
  if (!role || role.guild.id !== guild.id) {
    return { id, name: 'absent', issue: 'ROLE_MISSING_ON_DISCORD' };
  }
  return { id, name: role.name, issue: null };
}

function resolveTextChannel(guild: Guild, raw: string | null | undefined): {
  id: string | null;
  name: string;
  issue: IssueCode | null;
} {
  const id = raw?.trim() || null;
  if (!id) {
    return { id: null, name: 'absent', issue: 'CHANNEL_NOT_CONFIGURED' };
  }
  const ch = guild.channels.cache.get(id);
  if (!ch || ch.guildId !== guild.id || ch.type !== ChannelType.GuildText) {
    return { id, name: 'absent', issue: 'CHANNEL_MISSING_ON_DISCORD' };
  }
  return { id, name: (ch as TextChannel).name, issue: null };
}

function resolveCategory(guild: Guild, raw: string | null | undefined): {
  id: string | null;
  name: string;
  issue: IssueCode | null;
} {
  const id = raw?.trim() || null;
  if (!id) {
    return { id: null, name: 'absent', issue: 'CATEGORY_NOT_CONFIGURED' };
  }
  const ch = guild.channels.cache.get(id);
  if (!ch || ch.guildId !== guild.id || ch.type !== ChannelType.GuildCategory) {
    return { id, name: 'absent', issue: 'CATEGORY_MISSING_ON_DISCORD' };
  }
  return { id, name: (ch as CategoryChannel).name, issue: null };
}

function buildTeamBlock(team: TeamRow, guild: Guild): ResolvedLinkRow {
  const st = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const role = resolveRole(guild, st?.active_role_id);
  const channel = resolveTextChannel(guild, st?.active_channel_id);
  const category = resolveCategory(guild, st?.active_category_id);

  const issues: IssueCode[] = [];
  if (role.issue) issues.push(role.issue);
  if (channel.issue) issues.push(channel.issue);
  if (category.issue) issues.push(category.issue);

  let linkStatus: OuatLinkTeamStatus;
  if (issues.length === 0) linkStatus = 'OK';
  else if (issues.length === 1) linkStatus = issues[0]!;
  else linkStatus = 'MULTIPLE_ISSUES';

  const res = discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild(team.id, guild.id);
  const nRole = res.filter((r) => r.resource_type === 'role').length;
  const nCh = res.filter((r) => r.resource_type === 'channel').length;
  const nCat = res.filter((r) => r.resource_type === 'category').length;

  const lines: string[] = [
    `Team: ${team.team_name} (${team.id})`,
    `- team_api_id: ${team.team_api_id}`,
    `- role_id: ${role.id ?? 'null'}`,
    `- role_name: ${role.name}`,
    `- channel_id: ${channel.id ?? 'null'}`,
    `- channel_name: ${channel.name}`,
    `- category_id: ${category.id ?? 'null'}`,
    `- category_name: ${category.name}`,
    `- discord_resources_active (guild): role=${nRole} channel=${nCh} category=${nCat}`,
    `- status: ${linkStatus}`,
    '',
  ];

  return { linkStatus, issues, lines };
}

function matchesVue(issues: IssueCode[], linkStatus: OuatLinkTeamStatus, vue: OuatLinksVue): boolean {
  switch (vue) {
    case 'all':
      return true;
    case 'problems':
      return linkStatus !== 'OK';
    case 'ok':
      return linkStatus === 'OK';
    case 'roles':
      return (
        issues.includes('ROLE_NOT_CONFIGURED') || issues.includes('ROLE_MISSING_ON_DISCORD')
      );
    case 'channels':
      return (
        issues.includes('CHANNEL_NOT_CONFIGURED') ||
        issues.includes('CHANNEL_MISSING_ON_DISCORD')
      );
    default:
      return true;
  }
}

/**
 * Texte brut du rapport (IDs inclus). `guild` : serveur sur lequel la commande est exécutée.
 */
export async function buildOuatLinksReport(opts: OuatLinksOptions): Promise<string> {
  await prefetchGuildDiscordCaches(opts.guild);
  const guild = opts.guild;

  let teams: TeamRow[];

  if (opts.teamApiId) {
    const t = teamsRepo.findTeamByApiId(opts.teamApiId.trim());
    if (!t || t.status === 'archived') {
      throw new Error(`Aucune équipe non archivée avec team_api_id « ${opts.teamApiId.trim()} ».`);
    }
    if (opts.division != null && t.division_number !== opts.division) {
      throw new Error(
        `L’équipe ${t.team_name} n’appartient pas à la division ${opts.division} filtrée.`
      );
    }
    if (!teamLinkedToGuild(t, guild.id)) {
      throw new Error(
        `L’équipe « ${t.team_name} » n’est pas liée à ce serveur (state, current_guild_id ou discord_resources).`
      );
    }
    teams = [t];
  } else {
    teams = collectTeamsForGuild(guild.id, opts.division);
  }

  const header: string[] = ['OUAT LINKS', '', `guild_id: ${guild.name} (${guild.id})`, ''];

  if (opts.division != null) {
    header.push(`division_filter: ${opts.division}`, '');
  }
  if (opts.teamApiId) {
    header.push(`team_api_id_filter: ${opts.teamApiId.trim()}`, '');
  }
  header.push(`vue: ${opts.vue}`, '---', '');

  const body: string[] = [];
  for (const team of teams) {
    const block = buildTeamBlock(team, guild);
    if (!matchesVue(block.issues, block.linkStatus, opts.vue)) continue;
    body.push(...block.lines);
  }

  if (body.length === 0) {
    if (teams.length === 0) {
      body.push('(Aucune équipe liée à ce serveur selon les critères OUAT.)', '');
    } else {
      body.push(`(Aucune équipe ne correspond au filtre « ${opts.vue} ».)`, '');
    }
  }

  return [...header, ...body].join('\n').trimEnd();
}
