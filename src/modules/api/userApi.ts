/**
 * API Utilisateur : récupère les informations d'un joueur par son ID.
 * Une responsabilité : GET /user/{userId}.
 * Robustesse : retry avec backoff sur 429, cache mémoire TTL, cache DB persistant, compteur d'appels réels.
 */

import { getApiClient } from './client.js';
import {
  getRequestRetryCount,
  getRequestRetryBaseDelayMs,
  getUserApiCacheTtlMs,
  getUserApiDbCacheTtlMs,
  getUserApiMinDelayMs,
  getUserApiMaxConcurrency,
} from '../../config/index.js';
import { findUserCacheByApiId, saveUserCacheAfterFetch } from '../../db/repositories/userCache.js';
import type { UserCacheRow } from '../../db/types.js';

const ENDPOINT_PATH = '/user';
const PREFIX = '[userApi]';

let userApiCallCount = 0;
let statsFromMemory = 0;
let statsFromDb = 0;
let statsFromApi = 0;
let statsFailed = 0;

/** Throttle des appels réels : délai min entre deux départs + concurrence max. */
let lastRealStartTime = 0;
let concurrentRealCalls = 0;
const waitQueue: Array<() => void> = [];
let throttleConfigLogged = false;

function logThrottleConfigOnce(): void {
  if (throttleConfigLogged) return;
  throttleConfigLogged = true;
  const minDelay = getUserApiMinDelayMs();
  const maxConc = getUserApiMaxConcurrency();
  log('info', 'userApi throttle actif (appels réels)', { minDelayMs: minDelay, maxConcurrency: maxConc });
}

async function acquireRealCallSlot(): Promise<void> {
  const maxConc = getUserApiMaxConcurrency();
  if (concurrentRealCalls < maxConc) {
    concurrentRealCalls++;
    const minDelay = getUserApiMinDelayMs();
    const waitMs = lastRealStartTime + minDelay - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    lastRealStartTime = Date.now();
    logThrottleConfigOnce();
    return;
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve));
  return acquireRealCallSlot();
}

function releaseRealCallSlot(): void {
  concurrentRealCalls--;
  const next = waitQueue.shift();
  if (next) next();
}

async function withRealCallThrottle<T>(fn: () => Promise<T>): Promise<T> {
  await acquireRealCallSlot();
  try {
    return await fn();
  } finally {
    releaseRealCallSlot();
  }
}

function isDebugLog(): boolean {
  return process.env.LOG_LEVEL === 'debug';
}

function log(level: string, message: string, context?: Record<string, unknown>): void {
  const parts = [PREFIX, level, message];
  if (context && Object.keys(context).length > 0) {
    parts.push(JSON.stringify(context));
  }
  console.info(parts.join(' '));
}

function getStatusFromError(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { status?: number } }).response;
    return response?.status;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse la réponse API (data ou data.data).
 */
function parseResponse(data: unknown, userId: string): unknown {
  if (data === undefined || data === null) {
    throw new Error('Réponse API utilisateur vide');
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Format de réponse API utilisateur invalide');
  }
  const obj = data as Record<string, unknown>;
  const inner = obj['data'];
  if (inner !== null && inner !== undefined && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner;
  }
  return data;
}

/** Cache mémoire userId -> { data, expiresAt }. */
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached(id: string): unknown | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(id);
    return null;
  }
  return entry.data;
}

function setCached(id: string, data: unknown): void {
  const ttl = getUserApiCacheTtlMs();
  cache.set(id, { data, expiresAt: Date.now() + ttl });
}

function getFirstString(obj: unknown, keys: readonly string[]): string | null {
  if (obj === null || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (v !== undefined && v !== null && typeof v === 'string' && v.trim() !== '') return v.trim();
    if (v !== undefined && v !== null && typeof v === 'number' && !Number.isNaN(v)) return String(v);
  }
  return null;
}

function buildPayloadFromRow(row: UserCacheRow): unknown {
  return {
    discord: row.discord_id ?? undefined,
    username: row.username ?? undefined,
  };
}

function isDbRowUsable(row: UserCacheRow, ttlMs: number): boolean {
  if (row.discord_id != null && String(row.discord_id).trim() !== '') return true;
  if (ttlMs <= 0) return false;
  const fetchedAt = Date.parse(row.last_fetched_at);
  if (Number.isNaN(fetchedAt)) return false;
  return fetchedAt + ttlMs > Date.now();
}

/**
 * Appel HTTP avec retry sur 429 (backoff exponentiel).
 */
async function fetchUserByIdRaw(id: string): Promise<unknown> {
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
        log('warn', 'retry sur 429', {
          userId: id,
          attempt,
          nextAttemptInMs: delayMs,
        });
        await sleep(delayMs);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(PREFIX, 'Erreur getUserById', { userId: id, message, status });
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Retourne le nombre d'appels API réels depuis le dernier reset, puis remet le compteur à zéro.
 */
export function getAndResetUserApiCallCount(): number {
  const n = userApiCallCount;
  userApiCallCount = 0;
  return n;
}

export interface UserApiCycleStats {
  fromMemory: number;
  fromDb: number;
  fromApi: number;
  failed: number;
}

/**
 * Retourne les stats du cycle en cours (servis cache mémoire, cache DB, API, échecs) puis remet à zéro.
 */
export function getAndResetUserApiStats(): UserApiCycleStats {
  const out: UserApiCycleStats = {
    fromMemory: statsFromMemory,
    fromDb: statsFromDb,
    fromApi: statsFromApi,
    failed: statsFailed,
  };
  statsFromMemory = 0;
  statsFromDb = 0;
  statsFromApi = 0;
  statsFailed = 0;
  return out;
}

/**
 * Récupère les informations d'un utilisateur (ex. ID Discord).
 * Ordre : cache mémoire → cache DB (si discord_id ou données fraîches) → API.
 * @param userId - Identifiant du joueur (nombre ou chaîne)
 * @returns Données brutes de l'utilisateur (forme attendue par extractors)
 * @throws En cas d'erreur HTTP (hors 429 retentée), timeout ou réponse invalide
 */
export async function getUserById(userId: string | number): Promise<unknown> {
  const id =
    userId === undefined || userId === null ? '' : String(userId).trim();
  if (id === '') {
    throw new Error('getUserById: userId requis');
  }

  const cached = getCached(id);
  if (cached !== null) {
    statsFromMemory++;
    if (isDebugLog()) {
      log('debug', 'user servi depuis cache', { userId: id });
    }
    return cached;
  }

  const dbRow = findUserCacheByApiId(id);
  const ttlMs = getUserApiDbCacheTtlMs();
  if (dbRow !== null && isDbRowUsable(dbRow, ttlMs)) {
    const payload = buildPayloadFromRow(dbRow);
    setCached(id, payload);
    statsFromDb++;
    if (isDebugLog()) {
      log('debug', 'user servi depuis cache DB', { userId: id });
    }
    return payload;
  }

  try {
    const data = await withRealCallThrottle(() => fetchUserByIdRaw(id));
    const discordId = getFirstString(data, ['discord', 'discordId', 'discord_id', 'discordUserId', 'discord_user_id']);
    const username = getFirstString(data, ['username', 'name', 'discordUsername', 'pseudo', 'displayName']);
    saveUserCacheAfterFetch(id, discordId, username);
    setCached(id, data);
    userApiCallCount++;
    statsFromApi++;
    if (isDebugLog()) {
      log('debug', 'appel API', { userId: id, appelsReels: userApiCallCount });
    }
    return data;
  } catch (err) {
    statsFailed++;
    throw err;
  }
}
