import type { AdminGuildResourcesResponse, AdminTeamRow } from './types';

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

export async function fetchTeams(): Promise<AdminTeamRow[]> {
  const res = await fetch('/admin/teams', { headers: authHeaders() });
  const data = await handleJson<{ teams: AdminTeamRow[] }>(res);
  return data.teams;
}

export async function verifyAllTeams(): Promise<AdminTeamRow[]> {
  const res = await fetch('/admin/teams/verify', {
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
  const res = await fetch(`/admin/guilds/${encodeURIComponent(guildId)}/resources`, {
    headers: authHeaders(),
  });
  return handleJson<AdminGuildResourcesResponse>(res);
}

export async function patchTeam(
  teamId: number,
  body: { role_id: string | null; private_channel_id: string | null }
): Promise<AdminTeamRow> {
  const res = await fetch(`/admin/teams/${teamId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await handleJson<{ team: AdminTeamRow }>(res);
  return data.team;
}
