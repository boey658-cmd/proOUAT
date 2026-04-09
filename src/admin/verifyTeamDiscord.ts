/**
 * Vérification des liaisons équipe ↔ Discord (rôle + salon privé).
 * Règles : flags séparés ; error si ID en base mais absent du serveur ; warning si ID manquant en base.
 */

import type { Guild, Role, GuildChannel } from 'discord.js';
import type {
  TeamVerification,
  TeamVerificationFlags,
  TeamVerificationLevel,
} from './types.js';

const SNOWFLAKE_RE = /^\d{17,20}$/;

export function isValidDiscordSnowflake(id: string): boolean {
  return SNOWFLAKE_RE.test(id.trim());
}

function emptyId(id: string | null | undefined): boolean {
  return id == null || String(id).trim() === '';
}

/**
 * Calcule flags + niveau + libellé pour une ligne équipe.
 * @param guild Guilde résolue côté Discord.js, ou null si le bot ne voit pas la guilde / pas d’ID.
 */
export function verifyTeamDiscordRow(input: {
  guild: Guild | null;
  guildIdFromDb: string | null;
  roleId: string | null;
  channelId: string | null;
}): TeamVerification {
  const { guild, guildIdFromDb, roleId, channelId } = input;

  const flags: TeamVerificationFlags = {
    missing_guild_id: emptyId(guildIdFromDb),
    missing_role_id: emptyId(roleId),
    missing_channel_id: emptyId(channelId),
    role_not_found: false,
    channel_not_found: false,
  };

  // Pas d’ID guilde en base : on ne peut pas rattacher la config au bon serveur.
  if (flags.missing_guild_id) {
    return finalize(flags, 'error', 'Guilde non définie');
  }

  if (!guild) {
    // ID présent mais guilde introuvable pour ce client (bot hors serveur, mauvais ID, etc.).
    return finalize(flags, 'error', 'Guilde introuvable pour le bot');
  }

  const rid = roleId?.trim() ?? '';
  const cid = channelId?.trim() ?? '';

  if (rid && !isValidDiscordSnowflake(rid)) {
    flags.role_not_found = true;
  } else if (rid) {
    const role: Role | null = guild.roles.cache.get(rid) ?? null;
    if (!role) flags.role_not_found = true;
  }

  if (cid && !isValidDiscordSnowflake(cid)) {
    flags.channel_not_found = true;
  } else if (cid) {
    const ch = guild.channels.cache.get(cid) as GuildChannel | undefined;
    if (!ch) flags.channel_not_found = true;
  }

  const level = computeLevel(flags);
  const label = buildLabel(flags, level);
  return { level, label, flags };
}

function computeLevel(flags: TeamVerificationFlags): 'ok' | 'warning' | 'error' {
  if (flags.role_not_found || flags.channel_not_found) return 'error';
  if (flags.missing_role_id || flags.missing_channel_id) return 'warning';
  return 'ok';
}

function buildLabel(flags: TeamVerificationFlags, level: 'ok' | 'warning' | 'error'): string {
  if (level === 'ok') return 'OK';

  const parts: string[] = [];

  // Priorité : erreurs « cassées » (ID en base mais pas sur Discord), puis avertissements champs vides.
  if (flags.role_not_found && flags.channel_not_found) {
    parts.push('Rôle + salon introuvables');
  } else {
    if (flags.role_not_found) parts.push('Rôle introuvable');
    if (flags.channel_not_found) parts.push('Salon introuvable');
  }

  if (flags.missing_role_id) parts.push('Rôle non défini');
  if (flags.missing_channel_id) parts.push('Salon non défini');

  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  return unique.join(' · ');
}

function finalize(
  flags: TeamVerificationFlags,
  level: TeamVerificationLevel,
  label: string
): TeamVerification {
  return { level, label, flags };
}

/** Résout nom rôle / salon pour affichage tableau (best-effort). */
export function resolveDiscordDisplayNames(guild: Guild | null, roleId: string | null, channelId: string | null): {
  role_name: string | null;
  channel_name: string | null;
} {
  if (!guild) return { role_name: null, channel_name: null };
  const rid = roleId?.trim() ?? '';
  const cid = channelId?.trim() ?? '';
  const role = rid ? (guild.roles.cache.get(rid) ?? null) : null;
  const ch = cid ? (guild.channels.cache.get(cid) ?? null) : null;
  return {
    role_name: role?.name ?? null,
    channel_name: ch && 'name' in ch ? (ch.name as string) : null,
  };
}
