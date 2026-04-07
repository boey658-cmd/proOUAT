/**
 * Résumé OUAT « overview » : lecture seule teams + team_discord_state + cache guild.
 * Aucune écriture BDD ni Discord.
 */

import type { Guild } from 'discord.js';
import { ChannelType } from 'discord.js';
import * as teamsRepo from '../../../db/repositories/teams.js';
import * as teamDiscordStateRepo from '../../../db/repositories/teamDiscordState.js';
import * as discordResourcesRepo from '../../../db/repositories/discordResources.js';
import type { TeamRow } from '../../../db/types.js';

export type OuatOverviewVue = 'tout' | 'roles' | 'salons' | 'categories' | 'problemes';

export interface OuatOverviewOptions {
  division: number | null;
  vue: OuatOverviewVue;
}

type SliceOk = 'ok' | 'not_set' | 'bad';

interface ClassifiedTeam {
  name: string;
  role: SliceOk;
  channel: SliceOk;
  category: SliceOk;
  bucket: 'ok' | 'partiel' | 'probleme';
}

function collectTeamsForGuild(guildId: string, divisionFilter: number | null): TeamRow[] {
  const all = teamsRepo.findAllTeams().filter((t) => t.status !== 'archived');
  const divFiltered =
    divisionFilter != null ? all.filter((t) => t.division_number === divisionFilter) : all;
  const map = new Map<number, TeamRow>();
  for (const t of divFiltered) {
    const state = teamDiscordStateRepo.findTeamDiscordStateByTeamId(t.id);
    const onGuild = discordResourcesRepo.findActiveDiscordResourcesByTeamAndGuild(t.id, guildId);
    const hasLink =
      state?.active_guild_id === guildId ||
      (t.current_guild_id ?? '') === guildId ||
      onGuild.length > 0;
    if (hasLink) map.set(t.id, t);
  }
  return [...map.values()].sort((a, b) =>
    a.team_name.localeCompare(b.team_name, 'fr', { sensitivity: 'base' })
  );
}

function sliceRole(guild: Guild, id: string | null | undefined): SliceOk {
  const raw = id?.trim() ?? '';
  if (!raw) return 'not_set';
  const role = guild.roles.cache.get(raw);
  if (!role || role.guild.id !== guild.id) return 'bad';
  return 'ok';
}

function sliceTextChannel(guild: Guild, id: string | null | undefined): SliceOk {
  const raw = id?.trim() ?? '';
  if (!raw) return 'not_set';
  const ch = guild.channels.cache.get(raw);
  if (!ch) return 'bad';
  if (ch.guildId !== guild.id) return 'bad';
  if (ch.type !== ChannelType.GuildText) return 'bad';
  return 'ok';
}

function sliceCategory(guild: Guild, id: string | null | undefined): SliceOk {
  const raw = id?.trim() ?? '';
  if (!raw) return 'not_set';
  const ch = guild.channels.cache.get(raw);
  if (!ch) return 'bad';
  if (ch.guildId !== guild.id) return 'bad';
  if (ch.type !== ChannelType.GuildCategory) return 'bad';
  return 'ok';
}

function classifyTeam(team: TeamRow, guild: Guild): ClassifiedTeam {
  const st = teamDiscordStateRepo.findTeamDiscordStateByTeamId(team.id);
  const role = sliceRole(guild, st?.active_role_id);
  const channel = sliceTextChannel(guild, st?.active_channel_id);
  const category = sliceCategory(guild, st?.active_category_id);

  const channelCritical = channel === 'bad';
  const roleCritical = role === 'bad';
  const hasProbleme = channelCritical || roleCritical;
  const hasPartiel =
    !hasProbleme &&
    (role === 'not_set' ||
      channel === 'not_set' ||
      category === 'not_set' ||
      category === 'bad');

  let bucket: ClassifiedTeam['bucket'];
  if (hasProbleme) bucket = 'probleme';
  else if (hasPartiel) bucket = 'partiel';
  else bucket = 'ok';

  return {
    name: team.team_name?.trim() || `Équipe #${team.id}`,
    role,
    channel,
    category,
    bucket,
  };
}

function showSection(vue: OuatOverviewVue, section: 'crit_channel' | 'crit_role' | 'warn_channel' | 'warn_role' | 'warn_cat'): boolean {
  if (vue === 'tout') return true;
  if (vue === 'problemes') return section === 'crit_channel' || section === 'crit_role';
  if (vue === 'roles') return section === 'crit_role' || section === 'warn_role';
  if (vue === 'salons') return section === 'crit_channel' || section === 'warn_channel';
  if (vue === 'categories') return section === 'warn_cat';
  return true;
}

/**
 * Précharge les caches guild pour limiter les incohérences « absent » dues à un cache vide.
 */
export async function prefetchGuildDiscordCaches(guild: Guild): Promise<void> {
  await Promise.all([guild.roles.fetch().catch(() => {}), guild.channels.fetch().catch(() => {})]);
}

/**
 * Construit le texte complet du rapport overview (à envoyer ou mettre en pièce jointe).
 */
export async function buildOuatOverviewReport(guild: Guild, opts: OuatOverviewOptions): Promise<string> {
  await prefetchGuildDiscordCaches(guild);

  const teams = collectTeamsForGuild(guild.id, opts.division);
  const rows = teams.map((t) => classifyTeam(t, guild));

  let nOk = 0;
  let nPartiel = 0;
  let nProbleme = 0;
  for (const r of rows) {
    if (r.bucket === 'ok') nOk++;
    else if (r.bucket === 'partiel') nPartiel++;
    else nProbleme++;
  }

  const lines: string[] = [
    'OUAT OVERVIEW',
    '',
    `✅ OK : ${nOk}`,
    `⚠️ Partiel : ${nPartiel}`,
    `❌ Problèmes : ${nProbleme}`,
    `Total : ${rows.length}`,
  ];
  if (opts.division != null) {
    lines.push(`Filtre division : ${opts.division}`);
  }
  lines.push('');

  const critChannels: string[] = [];
  const critRoles: string[] = [];
  const warnChannels: string[] = [];
  const warnRoles: string[] = [];
  const warnCats: string[] = [];

  for (const r of rows) {
    if (r.channel === 'bad') critChannels.push(`- ${r.name} → salon absent`);
    if (r.role === 'bad') critRoles.push(`- ${r.name} → rôle absent`);
    if (r.channel === 'not_set') warnChannels.push(`- ${r.name} → salon non renseigné`);
    if (r.role === 'not_set') warnRoles.push(`- ${r.name} → rôle non renseigné`);
    if (r.category === 'not_set') warnCats.push(`- ${r.name} → catégorie non renseignée`);
    else if (r.category === 'bad') warnCats.push(`- ${r.name} → catégorie absente`);
  }

  const blocks: { title: string; body: string[]; key: Parameters<typeof showSection>[1] }[] = [
    { title: '❌ Salons manquants', body: critChannels, key: 'crit_channel' },
    { title: '❌ Rôles manquants', body: critRoles, key: 'crit_role' },
    { title: '⚠️ Salons non configurés', body: warnChannels, key: 'warn_channel' },
    { title: '⚠️ Rôles non configurés', body: warnRoles, key: 'warn_role' },
    { title: '⚠️ Catégories (optionnel)', body: warnCats, key: 'warn_cat' },
  ];

  for (const b of blocks) {
    if (b.body.length === 0 || !showSection(opts.vue, b.key)) continue;
    lines.push(b.title, '', ...b.body, '');
  }

  return lines.join('\n').trimEnd();
}
