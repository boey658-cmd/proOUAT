/**
 * Configuration des jobs planifiés. Lecture depuis .env uniquement.
 */

function getEnv(key: string): string | undefined {
  return process.env[key];
}

const DEFAULT_REGISTRATION_SYNC_INTERVAL_MINUTES = 5;

/**
 * Intervalle en minutes entre deux exécutions du job d'inscription.
 * Priorité : REGISTRATION_SYNC_INTERVAL_MINUTES puis SCAN_INTERVAL_MINUTES.
 */
export function getRegistrationSyncIntervalMinutes(): number {
  const raw =
    getEnv('REGISTRATION_SYNC_INTERVAL_MINUTES') ??
    getEnv('SCAN_INTERVAL_MINUTES');
  if (raw == null || raw === '') return DEFAULT_REGISTRATION_SYNC_INTERVAL_MINUTES;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_REGISTRATION_SYNC_INTERVAL_MINUTES;
  return n;
}

/**
 * Active le lancement automatique du job d'inscription au démarrage.
 */
export function isAutomaticRegistrationSyncEnabled(): boolean {
  const raw = getEnv('ENABLE_AUTOMATIC_REGISTRATION_SYNC') ?? getEnv('ENABLE_AUTOMATIC_TEAM_SCAN');
  if (raw == null || raw === '') return false;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

const DEFAULT_REACTIVATION_NOTIFY_MAX_PER_RUN = 20;

/**
 * Nombre max de notifications "équipe réinscrite" envoyées par run.
 * Au-delà (ex. réactivation massive après faux removed), aucune notification individuelle.
 */
export function getReactivationNotifyMaxPerRun(): number {
  const raw = getEnv('REACTIVATION_NOTIFY_MAX_PER_RUN');
  if (raw == null || raw === '') return DEFAULT_REACTIVATION_NOTIFY_MAX_PER_RUN;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_REACTIVATION_NOTIFY_MAX_PER_RUN;
  return n;
}

const DEFAULT_JOB_LOCK_TTL_SECONDS = 300;

/**
 * TTL du lock job en secondes. Au-delà, le lock est considéré expiré et le job peut redémarrer.
 */
export function getJobLockTtlSeconds(): number {
  const raw = getEnv('JOB_LOCK_TTL_SECONDS');
  if (raw == null || raw === '') return DEFAULT_JOB_LOCK_TTL_SECONDS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_JOB_LOCK_TTL_SECONDS;
  return n;
}
