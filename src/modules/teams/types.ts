/**
 * Types métier du module teams : structure normalisée exploitable par la base de données.
 * Aucune dépendance aux réponses API brutes.
 */

/** Joueur normalisé (prêt pour persistance ou comparaison). */
export interface NormalizedPlayer {
  /** Identifiant joueur dans l'API métier. */
  player_api_id: string | null;
  /** Pseudo LoL affiché. */
  lol_pseudo: string;
  /** Pseudo LoL normalisé (comparaison, unicité). */
  normalized_lol_pseudo: string;
  /** ID Discord si connu. */
  discord_user_id: string | null;
  /** Snapshot du nom Discord au moment du scan (optionnel). */
  discord_username_snapshot: string | null;
  /** Présent sur le serveur Discord cible (rempli par un autre module). */
  discord_presence_on_guild?: boolean;
  /** Membre trouvé sur le guild (rempli par un autre module). */
  discord_member_found?: boolean;
  /** Capitaine d'équipe. */
  is_captain: boolean;
}

/** Équipe normalisée (prête pour persistance ou comparaison). */
export interface NormalizedTeam {
  /** Identifiant équipe dans l'API métier. */
  team_api_id: string;
  /** Nom d'équipe affiché. */
  team_name: string;
  /** Nom d'équipe normalisé. */
  normalized_team_name: string;
  /** Liste des joueurs normalisés (hors staff). */
  players: NormalizedPlayer[];
  /** Liste du staff normalisé (optionnel, séparé des joueurs). */
  staff?: NormalizedPlayer[];
}

/** Référence vers une équipe extraite du payload tournoi. */
export interface TeamRef {
  id: string | number;
  name?: string;
}

/** Référence vers un joueur extraite du payload équipe. */
export interface PlayerRef {
  id: string | number;
  pseudo?: string;
  isCaptain?: boolean;
}
