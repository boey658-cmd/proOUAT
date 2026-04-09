import type { AdminGuildResourcesResponse, AdminTeamRow, AdminTargetGuildsMetaResponse } from './types';
import { normalizeTargetGuildIdForApi } from './targetGuildApi';

function authHeaders(): HeadersInit {
  const token = import.meta.env.VITE_ADMIN_API_TOKEN ?? '';
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
}

async function handleJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    throw new Error(err || `HTTP ${res.status}`);
  }
  return body as T;
}

export async function fetchTargetGuildsMeta(): Promise<AdminTargetGuildsMetaResponse> {
  const res = await fetch('/admin/meta/target-guilds', { headers: authHeaders() });
  return handleJson<AdminTargetGuildsMetaResponse>(res);
}

export interface TeamListFilters {
  targetGuildId?: string;
  targetDivisionNumber?: number;
}

export async function fetchTeams(filters?: TeamListFilters): Promise<AdminTeamRow[]> {
  const q = new URLSearchParams();
  const targetGuildId = normalizeTargetGuildIdForApi(filters?.targetGuildId);
  if (targetGuildId) q.set('target_guild_id', targetGuildId);
  if (filters?.targetDivisionNumber !== undefined) {
    q.set('target_division_number', String(filters.targetDivisionNumber));
  }
  const path = q.toString() ? `/admin/teams?${q}` : '/admin/teams';
  const res = await fetch(path, { headers: authHeaders() });
  const data = await handleJson<{ teams: AdminTeamRow[] }>(res);
  return data.teams;
}

export async function verifyAllTeams(scope: {
  targetGuildId: string;
  targetDivisionNumber?: number;
}): Promise<AdminTeamRow[]> {
  const gid = normalizeTargetGuildIdForApi(scope.targetGuildId);
  if (!gid) {
    throw new Error('Cible serveur invalide pour la vérification globale');
  }
  const q = new URLSearchParams({ target_guild_id: gid });
  if (scope.targetDivisionNumber !== undefined) {
    q.set('target_division_number', String(scope.targetDivisionNumber));
  }
  const res = await fetch(`/admin/teams/verify?${q}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  const data = await handleJson<{ teams: AdminTeamRow[] }>(res);
  return data.teams;
}

export async function verifyOneTeam(teamId: number): Promise<AdminTeamRow> {
  const res = await fetch(`/admin/teams/${teamId}/verify`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  const data = await handleJson<{ team: AdminTeamRow }>(res);
  return data.team;
}

export async function fetchGuildResources(guildId: string): Promise<AdminGuildResourcesResponse> {
  const gid = normalizeTargetGuildIdForApi(guildId);
  if (!gid) {
    throw new Error('Identifiant de serveur Discord invalide');
  }
  const res = await fetch(`/admin/guilds/${encodeURIComponent(gid)}/resources`, {
    headers: authHeaders(),
  });
  return handleJson<AdminGuildResourcesResponse>(res);
}

export interface PatchTeamPayload {
  target_guild_id?: string | null;
  target_division_number?: number | null;
  role_id?: string | null;
  private_channel_id?: string | null;
}

function buildSafePatchBody(body: PatchTeamPayload): PatchTeamPayload {
  const out: PatchTeamPayload = {};
  if (body.target_guild_id !== undefined) {
    if (body.target_guild_id === null) {
      out.target_guild_id = null;
    } else {
      const g = normalizeTargetGuildIdForApi(body.target_guild_id);
      if (g !== undefined) out.target_guild_id = g;
    }
  }
  if (body.target_division_number !== undefined) {
    out.target_division_number = body.target_division_number;
  }
  if (body.role_id !== undefined) out.role_id = body.role_id;
  if (body.private_channel_id !== undefined) out.private_channel_id = body.private_channel_id;
  return out;
}

export async function patchTeam(teamId: number, body: PatchTeamPayload): Promise<AdminTeamRow> {
  const res = await fetch(`/admin/teams/${teamId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(buildSafePatchBody(body)),
  });
  const data = await handleJson<{ team: AdminTeamRow }>(res);
  return data.team;
}
