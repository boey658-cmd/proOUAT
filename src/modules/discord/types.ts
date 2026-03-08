/**
 * Types du module Discord (embeds, options, messages).
 */

import type { NormalizedTeam } from '../teams/types.js';

/** Statut d'un joueur pour l'affichage dans l'embed nouvelle équipe. */
export type PlayerPresenceStatus =
  | 'present'
  | 'absent'
  | 'discord_id_missing';

/** Options pour la construction de l'embed nouvelle équipe. */
export interface NewTeamEmbedOptions {
  /** Date/heure de détection (affichée dans l'embed). */
  detectedAt?: Date | string;
  /** Titre personnalisé (optionnel). */
  title?: string;
  /** Nom du tournoi pour le footer (optionnel). */
  tournamentName?: string;
  /** URL du logo équipe pour la thumbnail (optionnel). */
  thumbnailUrl?: string;
}

/** Résultat de l'envoi d'un message nouvelle équipe. */
export interface SendNewTeamMessageResult {
  /** Message envoyé avec succès. */
  success: boolean;
  /** ID du message Discord si envoyé. */
  messageId?: string;
  /** Message d'erreur si échec. */
  error?: string;
}
