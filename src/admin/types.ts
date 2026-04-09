/**
 * Types API panel admin équipes (contrat JSON backend ↔ frontend).
 */

/** Flags détaillés de vérification (jamais confondre manquant en base vs introuvable sur Discord). */
export interface TeamVerificationFlags {
  missing_guild_id: boolean;
  missing_role_id: boolean;
  missing_channel_id: boolean;
  role_not_found: boolean;
  channel_not_found: boolean;
}

/**
 * Niveau d’affichage : ok = vert, warning = orange, error = rouge, unknown = pas encore vérifié (GET sans scan).
 */
export type TeamVerificationLevel = 'ok' | 'warning' | 'error' | 'unknown';

export interface TeamVerification {
  level: TeamVerificationLevel;
  /** Libellé court pour l’utilisateur (ex. "Rôle introuvable"). */
  label: string;
  flags: TeamVerificationFlags;
}

/** Ressource Discord pour listes déroulantes (nom + id). */
export interface DiscordPickOption {
  id: string;
  name: string;
}

export interface AdminTeamRow {
  id: number;
  team_api_id: string;
  team_name: string;
  team_status: string;
  guild_id: string | null;
  /** Libellé discret pour le tableau : nom cache + id, ou id seul. */
  guild_label: string;
  role_id: string | null;
  /** Salon privé équipe (équivalent active_channel_id en base). */
  private_channel_id: string | null;
  /** Derniers noms connus (cache mis à jour au scan ou après PATCH). */
  role_name: string | null;
  channel_name: string | null;
  /** ISO 8601 : dernière exécution de POST verify pour cette équipe. */
  last_verified_at: string | null;
  verification: TeamVerification;
}

export interface AdminTeamsResponse {
  teams: AdminTeamRow[];
}

export interface AdminGuildResourcesResponse {
  guild_id: string;
  roles: DiscordPickOption[];
  channels: DiscordPickOption[];
}

export interface PatchTeamBody {
  role_id?: string | null;
  private_channel_id?: string | null;
}

export interface VerifyTeamsResponse {
  teams: AdminTeamRow[];
}
