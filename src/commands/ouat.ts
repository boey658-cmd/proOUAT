/**
 * Commandes slash /ouat — audit (lecture seule) et liaisons manuelles (SQLite uniquement).
 * Aucune création ni suppression de ressource Discord.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { AttachmentBuilder, ChannelType } from 'discord.js';
import { getAllowedStaffRoleIds, getDiscordGuildId1, getDiscordGuildId2 } from '../config/index.js';
import * as teamsRepo from '../db/repositories/teams.js';
import {
  runDiscordDbAuditReadOnly,
  partitionOuatCheckLines,
  buildCheckReport,
} from '../modules/ouatventure/discordDbAudit.js';
import {
  buildOuatOverviewReport,
  type OuatOverviewVue,
} from '../modules/ouatventure/commands/ouatOverview.js';
import {
  applyOuatAddChannel,
  applyOuatAddRole,
  applyOuatRemoveChannel,
  applyOuatRemoveRole,
} from '../modules/ouatventure/ouatManualLink.js';

function userHasStaffRole(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member;
  if (!member || !('roles' in member)) return false;
  const allowed = getAllowedStaffRoleIds();
  if (allowed.length === 0) return false;
  const roles = member.roles;
  const memberRoleIds = new Set(
    'cache' in roles ? roles.cache.keys() : (roles as string[] ?? [])
  );
  return allowed.some((id) => memberRoleIds.has(id));
}

async function ensureStaffGuild(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!userHasStaffRole(interaction)) {
    await interaction
      .reply({
        content: "Vous n'avez pas la permission d'utiliser cette commande.",
        ephemeral: true,
      })
      .catch(() => {});
    return false;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction
      .reply({ content: 'Cette commande doit être exécutée sur un serveur.', ephemeral: true })
      .catch(() => {});
    return false;
  }
  const guildId1 = getDiscordGuildId1();
  const guildId2 = getDiscordGuildId2();
  if (guild.id !== guildId1 && guild.id !== guildId2) {
    await interaction
      .reply({
        content:
          'Serveur non autorisé. Vérifiez DISCORD_GUILD_ID_1 et DISCORD_GUILD_ID_2 dans la configuration.',
        ephemeral: true,
      })
      .catch(() => {});
    return false;
  }
  return true;
}

/** /ouat audit */
export async function handleOuatAuditCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await ensureStaffGuild(interaction))) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const divisionOpt = interaction.options.getInteger('division');
  const division = divisionOpt != null && divisionOpt >= 1 ? divisionOpt : null;

  try {
    const result = await runDiscordDbAuditReadOnly(interaction.client, guild, { division });

    const summaryLines = [
      '**Audit Discord ↔ BDD** (lecture seule — aucune modification)',
      `Serveur : \`${result.auditedGuildId}\`${result.divisionFilter != null ? ` · Division : **${result.divisionFilter}**` : ''}`,
      '',
      `**Équipes analysées :** ${result.totals.total}`,
      `OK: **${result.totals.ok}** · Sans state: **${result.totals.noDiscordState}** · Mismatch BDD: **${result.totals.mismatchInternal}**`,
      `Manquants (IDs) — rôles: **${result.totals.missingRole}** · salons: **${result.totals.missingChannel}** · catég.: **${result.totals.missingCategory}** · \`MISSING_MULTIPLE\`: **${result.totals.missingMultiple}**`,
      `Récupérables (nom): **${result.totals.recoverableByName}** · Ambiguës: **${result.totals.ambiguous}** · Orphelin DB ref: **${result.totals.orphanDb}**`,
    ];

    const summary = summaryLines.join('\n');
    const fenced = `${summary}\n\n\`\`\`\n${result.reportText}\n\`\`\``;

    if (fenced.length <= 2000) {
      await interaction.editReply({ content: fenced }).catch(() => {});
      return;
    }

    const buf = Buffer.from(result.reportText, 'utf8');
    const file = new AttachmentBuilder(buf, { name: `ouat-audit-${guild.id}-${Date.now()}.txt` });
    await interaction.editReply({
      content: `${summary}\n\nRapport complet en fichier joint.`,
      files: [file],
    }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `Erreur lors de l'audit (lecture seule) : ${message}`,
    }).catch(() => {});
  }
}

const OVERVIEW_VUES: OuatOverviewVue[] = ['tout', 'roles', 'salons', 'categories', 'problemes'];

/** /ouat overview */
export async function handleOuatOverviewCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await ensureStaffGuild(interaction))) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const divisionOpt = interaction.options.getInteger('division');
  const division = divisionOpt != null && divisionOpt >= 1 ? divisionOpt : null;
  const vueRaw = interaction.options.getString('vue');
  const vue: OuatOverviewVue =
    vueRaw != null && (OVERVIEW_VUES as string[]).includes(vueRaw) ? (vueRaw as OuatOverviewVue) : 'tout';

  try {
    const text = await buildOuatOverviewReport(guild, { division, vue });
    if (text.length <= 2000) {
      await interaction.editReply({ content: text }).catch(() => {});
      return;
    }
    const buf = Buffer.from(text, 'utf8');
    const file = new AttachmentBuilder(buf, { name: `ouat-overview-${guild.id}-${Date.now()}.txt` });
    await interaction.editReply({
      content: 'Résumé trop long — voir le fichier joint (lecture seule).',
      files: [file],
    }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({ content: `Erreur : ${message}` }).catch(() => {});
  }
}

/** /ouat check */
export async function handleOuatCheckCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await ensureStaffGuild(interaction))) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const divisionOpt = interaction.options.getInteger('division');
  const division = divisionOpt != null && divisionOpt >= 1 ? divisionOpt : null;

  try {
    const result = await runDiscordDbAuditReadOnly(interaction.client, guild, { division });
    const { main, secondary } = partitionOuatCheckLines(result.lines);
    const nonOk = result.lines.filter((l) => l.status !== 'OK').length;
    const intro = [
      '**Contrôle ciblé** (lecture seule)',
      `Serveur \`${guild.id}\` · **${main.length}** équipe(s) **à traiter en priorité** · **${secondary.length}** écart(s) BDD secondaire(s) (non bloquants) · ${nonOk} hors \`OK\` / ${result.lines.length} analysée(s).`,
      '',
    ].join('\n');

    const bodyMain =
      main.length === 0
        ? '**À traiter (priorité)** : aucune équipe dans cette catégorie.'
        : `**À traiter (priorité)** — tri : salon → rôle → catégorie → …\n\n${buildCheckReport(main)}`;

    const bodySecondary =
      secondary.length === 0
        ? ''
        : `\n\n---\n**Cohérence BDD secondaire** (historique \`discord_resources\` / catégorie ; pas d’action critique si tout est OK sur Discord)\n\n${buildCheckReport(secondary)}`;

    const full = `${intro}\n\n${bodyMain}${bodySecondary}`;

    if (full.length <= 2000) {
      await interaction.editReply({ content: full }).catch(() => {});
      return;
    }

    const buf = Buffer.from(full, 'utf8');
    const file = new AttachmentBuilder(buf, { name: `ouat-check-${guild.id}-${Date.now()}.txt` });
    await interaction.editReply({
      content: `${intro}\n\nDétail en fichier (message trop long).`,
      files: [file],
    }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({ content: `Erreur : ${message}` }).catch(() => {});
  }
}

/** /ouat add channel */
export async function handleOuatAddChannelCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await ensureStaffGuild(interaction))) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const teamApiId = interaction.options.getString('team_api_id', true).trim();
  const replace = interaction.options.getBoolean('remplacer') ?? false;
  const channelOpt = interaction.options.getChannel('salon', true);
  const channel = await guild.channels.fetch(channelOpt.id).catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({
      content: 'Salon introuvable ou ce n’est pas un salon **texte** (GuildText).',
    }).catch(() => {});
    return;
  }

  if (channel.guildId !== guild.id) {
    await interaction.editReply({
      content: 'Le salon doit appartenir au serveur sur lequel la commande est exécutée.',
    }).catch(() => {});
    return;
  }

  const team = teamsRepo.findTeamByApiId(teamApiId);
  if (!team) {
    await interaction.editReply({
      content: `Aucune équipe avec \`team_api_id\` \`${teamApiId}\`.`,
    }).catch(() => {});
    return;
  }
  if (team.status === 'archived') {
    await interaction.editReply({
      content: 'Équipe archivée : liaison refusée.',
    }).catch(() => {});
    return;
  }

  let parentCategoryId: string | null = null;
  if (channel.parentId) {
    const parent = await guild.channels.fetch(channel.parentId).catch(() => null);
    if (parent?.type === ChannelType.GuildCategory) {
      parentCategoryId = parent.id;
    }
  }

  const res = applyOuatAddChannel({
    team,
    guildId: guild.id,
    channelId: channel.id,
    channelName: channel.name ?? channel.id,
    parentCategoryId,
    replace,
  });

  await interaction
    .editReply({ content: res.ok ? res.message : res.error })
    .catch(() => {});
}

/** /ouat add role */
export async function handleOuatAddRoleCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await ensureStaffGuild(interaction))) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const teamApiId = interaction.options.getString('team_api_id', true).trim();
  const replace = interaction.options.getBoolean('remplacer') ?? false;
  const roleOpt = interaction.options.getRole('role', true);
  const role = await guild.roles.fetch(roleOpt.id).catch(() => null);

  if (!role || role.guild.id !== guild.id) {
    await interaction.editReply({
      content: 'Rôle introuvable ou il n’appartient pas au serveur courant.',
    }).catch(() => {});
    return;
  }

  const team = teamsRepo.findTeamByApiId(teamApiId);
  if (!team) {
    await interaction.editReply({
      content: `Aucune équipe avec \`team_api_id\` \`${teamApiId}\`.`,
    }).catch(() => {});
    return;
  }
  if (team.status === 'archived') {
    await interaction.editReply({
      content: 'Équipe archivée : liaison refusée.',
    }).catch(() => {});
    return;
  }

  const res = applyOuatAddRole({
    team,
    guildId: guild.id,
    roleId: role.id,
    roleName: role.name,
    replace,
  });

  await interaction
    .editReply({ content: res.ok ? res.message : res.error })
    .catch(() => {});
}

/** /ouat remove channel */
export async function handleOuatRemoveChannelCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await ensureStaffGuild(interaction))) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const teamApiId = interaction.options.getString('team_api_id', true).trim();

  const team = teamsRepo.findTeamByApiId(teamApiId);
  if (!team) {
    await interaction.editReply({
      content: `Aucune équipe avec \`team_api_id\` \`${teamApiId}\`.`,
    }).catch(() => {});
    return;
  }

  const res = applyOuatRemoveChannel(team, guild.id);
  await interaction.editReply({ content: res.ok ? res.message : res.error }).catch(() => {});
}

/** /ouat remove role */
export async function handleOuatRemoveRoleCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await ensureStaffGuild(interaction))) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

  const teamApiId = interaction.options.getString('team_api_id', true).trim();

  const team = teamsRepo.findTeamByApiId(teamApiId);
  if (!team) {
    await interaction.editReply({
      content: `Aucune équipe avec \`team_api_id\` \`${teamApiId}\`.`,
    }).catch(() => {});
    return;
  }

  const res = applyOuatRemoveRole(team, guild.id);
  await interaction.editReply({ content: res.ok ? res.message : res.error }).catch(() => {});
}
