/**
 * API Équipe : récupère les joueurs d'une équipe par son ID.
 * Une responsabilité : GET /team/{teamId}.
 * Robustesse : retry 429 avec backoff, throttle (délai min entre appels) pour gros scans.
 */

import { getApiClient } from './client.js';
import {
  getRequestRetryCount,
  getRequestRetryBaseDelayMs,
  getTeamApiMinDelayMs,
} from '../../config/index.js';

const ENDPOINT_PATH = '/team';
const PREFIX = '[teamApi]';

let lastTeamCallStartTime = 0;
let throttleConfigLogged = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusFromError(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { status?: number } }).response;
    return response?.status;
  }
  return undefined;
}

function logThrottleConfigOnce(): void {
  if (throttleConfigLogged) return;
  throttleConfigLogged = true;
  console.info(PREFIX, 'throttle actif (appels GET /team)', { minDelayMs: getTeamApiMinDelayMs() });
}

async function acquireTeamCallThrottle(): Promise<void> {
  const minDelay = getTeamApiMinDelayMs();
  const waitMs = lastTeamCallStartTime + minDelay - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  lastTeamCallStartTime = Date.now();
  logThrottleConfigOnce();
}

function parseResponse(data: unknown, teamId: string): unknown {
  if (data === undefined || data === null) {
    throw new Error('Réponse API équipe vide');
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Format de réponse API équipe invalide');
  }
  return data;
}

/**
 * Appel HTTP GET /team/{id} avec retry sur 429 (backoff exponentiel).
 */
async function fetchTeamByIdRaw(id: string): Promise<unknown> {
  const url = `${ENDPOINT_PATH}/${id}`;
  const client = getApiClient();
  const maxAttempts = getRequestRetryCount() + 1;
  const baseDelayMs = getRequestRetryBaseDelayMs();

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.get<unknown>(url);
      return parseResponse(response.data, id);
    } catch (err: unknown) {
      lastErr = err;
      const status = getStatusFromError(err);
      if (status === 429 && attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(PREFIX, 'retry sur 429', { teamId: id, attempt, nextAttemptInMs: delayMs });
        await sleep(delayMs);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(PREFIX, 'Erreur getTeamById', { teamId: id, message, status });
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Récupère les informations d'une équipe (composition, joueurs).
 * Throttle : délai min entre deux appels. Retry : 429 avec backoff.
 * @param teamId - Identifiant de l'équipe (nombre ou chaîne)
 * @returns Données brutes de l'équipe (joueurs, etc.)
 * @throws En cas d'erreur HTTP (hors 429 retentée), timeout ou réponse invalide
 */
export async function getTeamById(teamId: string | number): Promise<unknown> {
  const id =
    teamId === undefined || teamId === null ? '' : String(teamId).trim();
  if (id === '') {
    throw new Error('getTeamById: teamId requis');
  }

  await acquireTeamCallThrottle();
  return fetchTeamByIdRaw(id);
}
