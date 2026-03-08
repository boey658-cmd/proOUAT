/**
 * Types du module divisions (calendrier, sync).
 */

/** Entrée extraite du calendrier (une équipe dans une division/groupe). */
export interface CalendarDivisionEntry {
  /** Identifiant API de l'équipe si disponible. */
  team_api_id: string | null;
  /** Nom d'équipe (affiché). */
  team_name: string | null;
  /** Numéro de division (1-12 typiquement). */
  division_number: number;
  /** Groupe dans la division (A, B, etc.). */
  division_group: string;
}

/** Anomalie : entrée calendrier sans équipe correspondante en base. */
export interface DivisionAnomaly {
  entry: CalendarDivisionEntry;
  reason: string;
}

/** Résultat de la synchronisation des divisions. */
export interface SyncDivisionsResult {
  totalEntries: number;
  matchedTeams: number;
  updatedTeams: number;
  skipped: number;
  anomalies: DivisionAnomaly[];
  errors: string[];
}
