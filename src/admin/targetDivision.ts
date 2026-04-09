/**
 * Plage des divisions cibles (admin). Configurable via .env.
 */

function getEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function getTargetDivisionMin(): number {
  return getEnvInt('ADMIN_TARGET_DIVISION_MIN', 1);
}

export function getTargetDivisionMax(): number {
  return getEnvInt('ADMIN_TARGET_DIVISION_MAX', 12);
}

export function isValidTargetDivisionNumber(n: number | null): boolean {
  if (n === null) return true;
  const min = getTargetDivisionMin();
  const max = getTargetDivisionMax();
  return Number.isInteger(n) && n >= min && n <= max;
}

export function parseOptionalTargetDivision(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return null;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }
  return undefined;
}
