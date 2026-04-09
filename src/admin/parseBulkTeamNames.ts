/**
 * Extraction d’une liste plate de noms depuis un collage (Sheets / Excel / texte).
 * Séparateurs : tabulation, retour ligne, virgule, point-virgule.
 * Déduplication par clé normalisée (identique à normalizeTeamName), ordre conservé.
 */

import { normalizeTeamName } from '../modules/teams/normalizer.js';

const SPLIT_RE = /[\t\n\r,;]+/u;

export function parseBulkTeamNamesFromText(raw: string): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  const parts = raw.split(SPLIT_RE);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (t === '') continue;
    const key = normalizeTeamName(t);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
