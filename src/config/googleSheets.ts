/**
 * Configuration Google Sheets (Apps Script). Lecture depuis .env uniquement.
 */

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * URL du premier script Apps Script (doGet/doPost avec /exec).
 * DOC 1 : reçoit { equipe, joueurs }.
 */
export function getGoogleScriptUrl1(): string | null {
  const url = getEnv('GOOGLE_SCRIPT_URL_1');
  if (!url || typeof url !== 'string' || url.trim() === '') return null;
  return url.trim();
}

/**
 * URL du second script Apps Script (doGet/doPost avec /exec).
 * DOC 2 : reçoit { equipe }.
 */
export function getGoogleScriptUrl2(): string | null {
  const url = getEnv('GOOGLE_SCRIPT_URL_2');
  if (!url || typeof url !== 'string' || url.trim() === '') return null;
  return url.trim();
}

/**
 * Active la synchronisation des nouvelles équipes vers Google Sheets.
 */
export function isGoogleSheetsSyncEnabled(): boolean {
  const raw = getEnv('ENABLE_GOOGLE_SHEETS_SYNC');
  if (raw == null || raw === '') return false;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}
