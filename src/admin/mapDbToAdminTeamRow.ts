/**
 * Construit la réponse API admin depuis une ligne JOIN SQL (sans appel Discord).
 */

import type { AdminTeamJoinRow } from '../db/repositories/adminTeams.js';
import type { AdminTeamRow, TeamVerificationFlags, TeamVerificationLevel } from './types.js';
import { resolveEffectiveGuildId } from './effectiveGuild.js';

const EMPTY_FLAGS: TeamVerificationFlags = {
  missing_guild_id: false,
  missing_role_id: false,
  missing_channel_id: false,
  role_not_found: false,
  channel_not_found: false,
};

export function parseVerificationIssuesJson(raw: string | null): TeamVerificationFlags {
  if (!raw?.trim()) return { ...EMPTY_FLAGS };
  try {
    const o = JSON.parse(raw) as Partial<TeamVerificationFlags>;
    return {
      missing_guild_id: Boolean(o.missing_guild_id),
      missing_role_id: Boolean(o.missing_role_id),
      missing_channel_id: Boolean(o.missing_channel_id),
      role_not_found: Boolean(o.role_not_found),
      channel_not_found: Boolean(o.channel_not_found),
    };
  } catch {
    return { ...EMPTY_FLAGS };
  }
}

export function normalizeStoredVerificationLevel(
  raw: string | null | undefined
): TeamVerificationLevel {
  if (raw === 'ok' || raw === 'warning' || raw === 'error' || raw === 'unknown') return raw;
  return 'unknown';
}

export function buildGuildLabel(guildId: string | null, cachedName: string | null): string {
  if (!guildId) return '—';
  const name = cachedName?.trim();
  if (name) return `${name} (${guildId})`;
  return guildId;
}

export function mapJoinRowToAdminTeamRow(row: AdminTeamJoinRow): AdminTeamRow {
  const guildId = resolveEffectiveGuildId(row.active_guild_id, row.current_guild_id);
  const level = normalizeStoredVerificationLevel(row.verification_level);
  const flags = parseVerificationIssuesJson(row.verification_issues);
  const label =
    row.verification_label?.trim() ||
    (level === 'unknown'
      ? 'Jamais vérifié'
      : level === 'ok'
        ? 'OK'
        : '—');

  return {
    id: row.team_id,
    team_api_id: row.team_api_id,
    team_name: row.team_name,
    team_status: row.team_status,
    guild_id: guildId,
    guild_label: buildGuildLabel(guildId, row.cached_guild_name ?? null),
    role_id: row.active_role_id,
    private_channel_id: row.active_channel_id,
    role_name: row.cached_role_name ?? null,
    channel_name: row.cached_channel_name ?? null,
    last_verified_at: row.last_verified_at ?? null,
    verification: { level, label, flags },
  };
}
