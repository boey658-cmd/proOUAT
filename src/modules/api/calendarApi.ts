/**
 * API Calendrier : récupère les divisions et groupes d'un tournoi par son ID.
 * Une responsabilité : GET /calendar/byTournament/{tournamentId}.
 * Aucune valeur métier hardcodée : tournamentId fourni en paramètre.
 */

import { getApiClient } from './client.js';

const ENDPOINT_PATH = '/calendar/byTournament';

/**
 * Récupère les divisions et groupes du tournoi pour un identifiant donné.
 * @param tournamentId - Identifiant du tournoi (nombre ou chaîne)
 * @returns Données brutes (divisions, groupes, équipes)
 * @throws En cas d'erreur HTTP, timeout ou réponse invalide
 */
export async function getCalendarByTournamentId(tournamentId: string | number): Promise<unknown> {
  const id = tournamentId === undefined || tournamentId === null
    ? ''
    : String(tournamentId).trim();
  if (id === '') {
    throw new Error('getCalendarByTournamentId: tournamentId requis');
  }

  const url = `${ENDPOINT_PATH}/${encodeURIComponent(id)}`;

  try {
    const client = getApiClient();
    const response = await client.get<unknown>(url);

    const data = response.data;
    if (data === undefined || data === null) {
      console.error('[calendarApi] Réponse vide', { tournamentId: id, status: response.status });
      throw new Error('Réponse API calendrier vide');
    }
    if (typeof data !== 'object') {
      console.error('[calendarApi] Format de réponse invalide', { tournamentId: id, type: typeof data });
      throw new Error('Format de réponse API calendrier invalide');
    }
    // Accepte objet ou tableau (selon le format réel de l'API)
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined;
    console.error('[calendarApi] Erreur getCalendarByTournamentId', { tournamentId: id, message, status });
    throw err;
  }
}
