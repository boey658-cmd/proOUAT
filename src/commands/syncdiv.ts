/**
 * Commande slash /syncdiv : synchronise les divisions depuis l'API calendrier.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { getAllowedStaffRoleIds } from '../config/index.js';
import { syncDivisionsFromCalendar } from '../modules/divisions/syncDivisionsFromCalendar.js';

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

const MAX_REPLY_LENGTH = 1900;

function formatReply(result: Awaited<ReturnType<typeof syncDivisionsFromCalendar>>): string {
  const lines = [
    `**Sync divisions**`,
    `• Entrées calendrier : ${result.totalEntries}`,
    `• Équipes trouvées en base : ${result.matchedTeams}`,
    `• Équipes mises à jour : ${result.updatedTeams}`,
    `• Sans changement : ${result.skipped}`,
    `• Anomalies (non trouvées) : ${result.anomalies.length}`,
    `• Erreurs : ${result.errors.length}`,
  ];
  if (result.anomalies.length > 0 && result.anomalies.length <= 5) {
    lines.push('', 'Anomalies :');
    result.anomalies.forEach((a) => {
      const name = a.entry.team_name ?? a.entry.team_api_id ?? '?';
      lines.push(`  - ${name} (${a.reason})`);
    });
  } else if (result.anomalies.length > 5) {
    lines.push('', `(${result.anomalies.length} anomalies — voir les logs)`);
  }
  if (result.errors.length > 0 && result.errors.length <= 3) {
    lines.push('', 'Erreurs :');
    result.errors.forEach((e) => lines.push(`  - ${e}`));
  }
  const content = lines.join('\n');
  return content.length > MAX_REPLY_LENGTH
    ? content.slice(0, MAX_REPLY_LENGTH - 3) + '...'
    : content;
}

/**
 * Gère l'exécution de la commande /syncdiv.
 */
export async function handleSyncdivCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!userHasStaffRole(interaction)) {
    await interaction.reply({
      content: "Vous n'avez pas la permission d'utiliser cette commande.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await syncDivisionsFromCalendar();
    const content = formatReply(result);
    await interaction.editReply({ content }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `Erreur lors de la synchronisation : ${message}`,
    }).catch(() => {});
  }
}
