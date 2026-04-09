/**
 * API HTTP d’administration (panel équipes). Variables d’environnement optionnelles.
 */

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/** Secret Bearer pour protéger les routes /admin/*. Si absent, le serveur admin ne démarre pas. */
export function getAdminApiToken(): string | null {
  const t = getEnv('ADMIN_API_TOKEN');
  if (!t || typeof t !== 'string' || t.trim() === '') return null;
  return t.trim();
}

/** Port HTTP du panel (défaut 3840). */
export function getAdminHttpPort(): number {
  const raw = getEnv('ADMIN_HTTP_PORT');
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return 3840;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return 3840;
  return n;
}
