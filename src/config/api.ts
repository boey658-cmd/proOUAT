/**
 * Configuration des appels API métier.
 * Aucune valeur métier hardcodée : tout provient de l'environnement.
 */

const DEFAULT_TIMEOUT_MS = 15000;

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * URL de base de l'API (ex. https://api.leamateur.pro).
 * Priorité : API_BASE_URL puis API_BASE_URL_1 (rétrocompat).
 */
export function getApiBaseUrl(): string {
  const url = getEnv('API_BASE_URL') ?? getEnv('API_BASE_URL_1');
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error('API_BASE_URL (ou API_BASE_URL_1) doit être défini');
  }
  return url.replace(/\/+$/, '');
}

/**
 * Slug du tournoi pour l'endpoint /tournaments/{slug} (ex. "OUATventure Saison 20").
 * Utilisé par le métier pour appeler getTournament(slug).
 */
export function getTournamentSlug(): string {
  const slug = getEnv('TOURNAMENT_SLUG');
  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    throw new Error('TOURNAMENT_SLUG doit être défini');
  }
  return slug.trim();
}

/**
 * Identifiant du tournoi pour l'endpoint /calendar/byTournament/{id}.
 * Priorité : TOURNAMENT_ID puis CALENDAR_TOURNAMENT_ID.
 */
export function getTournamentId(): string {
  const id = getEnv('TOURNAMENT_ID') ?? getEnv('CALENDAR_TOURNAMENT_ID');
  if (id === undefined || id === null || String(id).trim() === '') {
    throw new Error('TOURNAMENT_ID (ou CALENDAR_TOURNAMENT_ID) doit être défini');
  }
  return String(id).trim();
}

/**
 * Identifiant du tournoi si défini (optionnel, pour le flux clasification + tournaments).
 */
export function getOptionalTournamentId(): string | null {
  const id = getEnv('TOURNAMENT_ID') ?? getEnv('CALENDAR_TOURNAMENT_ID');
  if (id === undefined || id === null || String(id).trim() === '') return null;
  return String(id).trim();
}

/**
 * Timeout des requêtes HTTP en millisecondes.
 */
export function getRequestTimeoutMs(): number {
  const raw = getEnv('REQUEST_TIMEOUT_MS');
  if (raw == null || raw === '') return DEFAULT_TIMEOUT_MS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_TIMEOUT_MS;
  return n;
}

const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;

/**
 * Nombre de tentatives (retry) en cas d'erreur 429 (rate limit).
 */
export function getRequestRetryCount(): number {
  const raw = getEnv('REQUEST_RETRY_COUNT');
  if (raw == null || raw === '') return DEFAULT_RETRY_COUNT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_RETRY_COUNT;
  return n;
}

/**
 * Délai de base en ms pour le backoff (exponentiel) en cas de 429.
 */
export function getRequestRetryBaseDelayMs(): number {
  const raw = getEnv('REQUEST_RETRY_BASE_DELAY_MS');
  if (raw == null || raw === '') return DEFAULT_RETRY_BASE_DELAY_MS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_RETRY_BASE_DELAY_MS;
  return n;
}

const DEFAULT_USER_API_CACHE_TTL_MS = 120000; // 2 min

/**
 * TTL du cache mémoire pour getUserById (ms).
 */
export function getUserApiCacheTtlMs(): number {
  const raw = getEnv('USER_API_CACHE_TTL_MS');
  if (raw == null || raw === '') return DEFAULT_USER_API_CACHE_TTL_MS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_USER_API_CACHE_TTL_MS;
  return n;
}

/**
 * TTL du cache DB pour getUserById (ms). 0 = pas de critère de fraîcheur, on ne s'appuie que sur la présence de discord_id.
 * Si > 0 : une entrée en base avec last_fetched_at dans la fenêtre peut être réutilisée sans rappel API.
 */
export function getUserApiDbCacheTtlMs(): number {
  const raw = getEnv('USER_API_DB_CACHE_TTL_MS');
  if (raw == null || raw === '') return 0;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

const DEFAULT_USER_API_MAX_CONCURRENT = 3;

/**
 * Nombre max d'appels /user/{id} en parallèle dans buildEnrichedTeam.
 */
export function getUserApiMaxConcurrent(): number {
  const raw = getEnv('USER_API_MAX_CONCURRENT');
  if (raw == null || raw === '') return DEFAULT_USER_API_MAX_CONCURRENT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_USER_API_MAX_CONCURRENT;
  return n;
}

const DEFAULT_USER_API_MIN_DELAY_MS = 250;
const DEFAULT_USER_API_MAX_CONCURRENCY = 1;

/**
 * Délai minimum (ms) entre le début de deux appels API user réels (throttle gros volume).
 */
export function getUserApiMinDelayMs(): number {
  const raw = getEnv('USER_API_MIN_DELAY_MS');
  if (raw == null || raw === '') return DEFAULT_USER_API_MIN_DELAY_MS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_USER_API_MIN_DELAY_MS;
  return n;
}

/**
 * Nombre max d'appels HTTP /user/{id} réels en parallèle (throttle gros volume).
 */
export function getUserApiMaxConcurrency(): number {
  const raw = getEnv('USER_API_MAX_CONCURRENCY');
  if (raw == null || raw === '') return DEFAULT_USER_API_MAX_CONCURRENCY;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_USER_API_MAX_CONCURRENCY;
  return n;
}

const DEFAULT_TEAM_API_MIN_DELAY_MS = 150;

/**
 * Délai minimum (ms) entre le début de deux appels GET /team/{id} (éviter 429 sur gros scan).
 */
export function getTeamApiMinDelayMs(): number {
  const raw = getEnv('TEAM_API_MIN_DELAY_MS');
  if (raw == null || raw === '') return DEFAULT_TEAM_API_MIN_DELAY_MS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_TEAM_API_MIN_DELAY_MS;
  return n;
}
