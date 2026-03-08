/**
 * API Tournoi : récupère les informations d'un tournoi par slug ou par ID (flux clasification).
 * Une responsabilité : GET /tournaments/{slug} ou GET /clasification/byTournament/{id} puis /tournaments/{name}.
 */

import { getApiClient } from './client.js';

const TOURNAMENTS_PATH = '/tournaments';
const CLASIFICATION_PATH = '/clasification/byTournament';

const NAME_KEYS = ['name', 'title', 'tournamentName', 'label'] as const;

function extractTournamentName(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  for (const key of NAME_KEYS) {
    const v = o[key];
    if (v !== undefined && v !== null && typeof v === 'string' && v.trim() !== '') {
      return v.trim();
    }
  }
  const inner = o['data'];
  if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
    const name = extractTournamentName(inner);
    if (name) return name;
  }
  return null;
}

/**
 * Récupère les informations du tournoi pour un slug donné.
 * @param slug - Identifiant texte du tournoi (ex. "OUATventure Saison 20")
 * @returns Données brutes du tournoi (équipes inscrites, etc.)
 * @throws En cas d'erreur HTTP, timeout ou réponse invalide
 */
export async function getTournament(slug: string): Promise<unknown> {
  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    throw new Error('getTournament: slug requis et non vide');
  }
  const encodedSlug = encodeURIComponent(slug.trim());
  const url = `${TOURNAMENTS_PATH}/${encodedSlug}`;

  try {
    const client = getApiClient();
    const response = await client.get<unknown>(url);

    const data = response.data;
    if (data === undefined || data === null) {
      console.error('[tournamentApi] Réponse vide', { slug, status: response.status });
      throw new Error('Réponse API tournoi vide');
    }
    if (typeof data !== 'object' || Array.isArray(data)) {
      console.error('[tournamentApi] Format de réponse invalide', { slug, type: typeof data });
      throw new Error('Format de réponse API tournoi invalide');
    }

    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined;
    console.error('[tournamentApi] Erreur getTournament', { slug, message, status });
    throw err;
  }
}

/**
 * Récupère le tournoi via le flux API réel : GET /clasification/byTournament/{id} pour le nom,
 * puis GET /tournaments/{encodedName} pour le payload complet (dont tournamentTeams).
 * @param tournamentId - Identifiant du tournoi (ex. depuis TOURNAMENT_ID)
 * @returns Données brutes du tournoi (équipes inscrites, etc.)
 */
export async function getTournamentByTournamentId(tournamentId: string | number): Promise<unknown> {
  const id = String(tournamentId).trim();
  if (!id) {
    throw new Error('getTournamentByTournamentId: tournamentId requis');
  }

  const client = getApiClient();
  const clasificationUrl = `${CLASIFICATION_PATH}/${encodeURIComponent(id)}`;

  let clasificationData: unknown;
  try {
    const res = await client.get<unknown>(clasificationUrl);
    clasificationData = res.data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tournamentApi] Erreur clasification/byTournament', { tournamentId: id, message });
    throw err;
  }

  const name = extractTournamentName(clasificationData);
  if (!name) {
    console.error('[tournamentApi] Nom du tournoi introuvable dans clasification', {
      tournamentId: id,
      keys: clasificationData && typeof clasificationData === 'object'
        ? Object.keys(clasificationData as Record<string, unknown>)
        : [],
    });
    throw new Error('Impossible d\'extraire le nom du tournoi depuis /clasification/byTournament');
  }

  return getTournament(name);
}
