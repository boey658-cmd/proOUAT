/**
 * Données admin : lecture BDD seule, ou scan Discord + persistance (POST verify).
 */

import type { Client, Guild } from 'discord.js';
import {
  findAllTeamsWithDiscordState,
  findAdminTeamJoinByTeamId,
} from '../db/repositories/adminTeams.js';
import { upsertTeamVerificationSnapshot } from '../db/repositories/teamDiscordState.js';
import type { AdminTeamRow } from './types.js';
import { mapJoinRowToAdminTeamRow } from './mapDbToAdminTeamRow.js';
import { resolveEffectiveGuildId } from './effectiveGuild.js';
import { resolveDiscordDisplayNames, verifyTeamDiscordRow } from './verifyTeamDiscord.js';

async function resolveGuild(
  client: Client<true>,
  cache: Map<string, Guild | null>,
  guildId: string | null
): Promise<Guild | null> {
  if (!guildId) return null;
  if (cache.has(guildId)) return cache.get(guildId) ?? null;
  try {
    const cached = client.guilds.cache.get(guildId);
    const g = cached ?? ((await client.guilds.fetch(guildId)) as Guild);
    cache.set(guildId, g);
    return g;
  } catch {
    cache.set(guildId, null);
    return null;
  }
}

/** GET /admin/teams : pas d’appel Discord. */
export function loadAdminTeamRowsFromDatabase(): AdminTeamRow[] {
  return findAllTeamsWithDiscordState().map(mapJoinRowToAdminTeamRow);
}

function persistScanResult(
  teamId: number,
  input: {
    verification: ReturnType<typeof verifyTeamDiscordRow>;
    guild: Guild | null;
    roleId: string | null;
    channelId: string | null;
  }
): void {
  const { verification, guild, roleId, channelId } = input;
  const names = resolveDiscordDisplayNames(guild, roleId, channelId);
  upsertTeamVerificationSnapshot(teamId, {
    verification_level: verification.level,
    verification_label: verification.label,
    verification_issues: JSON.stringify(verification.flags),
    last_verified_at: new Date().toISOString(),
    cached_guild_name: guild?.name ?? null,
    cached_role_name: names.role_name,
    cached_channel_name: names.channel_name,
  });
}

/** POST /admin/teams/verify — scan Discord + mise à jour du cache vérif. */
export async function verifyAllTeamsAndPersist(client: Client<true>): Promise<AdminTeamRow[]> {
  const raw = findAllTeamsWithDiscordState();
  const guildCache = new Map<string, Guild | null>();

  for (const row of raw) {
    const guildId = resolveEffectiveGuildId(row.active_guild_id, row.current_guild_id);
    const guild = await resolveGuild(client, guildCache, guildId);
    const verification = verifyTeamDiscordRow({
      guild,
      guildIdFromDb: guildId,
      roleId: row.active_role_id,
      channelId: row.active_channel_id,
    });
    persistScanResult(row.team_id, {
      verification,
      guild,
      roleId: row.active_role_id,
      channelId: row.active_channel_id,
    });
  }

  return loadAdminTeamRowsFromDatabase();
}

/** POST /admin/teams/:id/verify */
export async function verifyOneTeamAndPersist(
  client: Client<true>,
  teamId: number
): Promise<AdminTeamRow | null> {
  const row = findAdminTeamJoinByTeamId(teamId);
  if (!row) return null;

  const guildCache = new Map<string, Guild | null>();
  const guildId = resolveEffectiveGuildId(row.active_guild_id, row.current_guild_id);
  const guild = await resolveGuild(client, guildCache, guildId);
  const verification = verifyTeamDiscordRow({
    guild,
    guildIdFromDb: guildId,
    roleId: row.active_role_id,
    channelId: row.active_channel_id,
  });
  persistScanResult(teamId, { verification, guild, roleId: row.active_role_id, channelId: row.active_channel_id });

  const refreshed = findAdminTeamJoinByTeamId(teamId);
  return refreshed ? mapJoinRowToAdminTeamRow(refreshed) : null;
}
