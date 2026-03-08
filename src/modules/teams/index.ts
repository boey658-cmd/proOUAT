/**
 * Export central du module teams (scan des inscriptions).
 */

export type { NormalizedTeam, NormalizedPlayer, TeamRef, PlayerRef } from './types.js';
export { scanTournamentRegistrations } from './scanTournamentRegistrations.js';
export type { ScanResult, ScanError } from './scanTournamentRegistrations.js';
export { buildEnrichedTeam } from './buildEnrichedTeam.js';
export { syncTeamsWithDatabase } from './syncTeamsWithDatabase.js';
export type {
  SyncResult,
  SyncError,
  TeamUpdateDiff,
  RemovedTeamInfo,
  ReactivatedTeamInfo,
  TeamUpdatePlayerChange,
  TeamUpdateDiscordIdChange,
} from './syncTeamsWithDatabase.js';
export { scanSyncAndNotify } from './scanSyncAndNotify.js';
export type { ScanSyncNotifyResult } from './scanSyncAndNotify.js';
export {
  normalizeTeamName,
  normalizeLolPseudo,
  buildNormalizedTeam,
  buildNormalizedPlayer,
} from './normalizer.js';
export {
  extractTeamRefsFromTournament,
  extractTeamNameFromTeam,
  extractPlayerRefsFromTeam,
  extractDiscordIdFromUser,
  extractUsernameFromUser,
  isValidTeamName,
  resolveTeamDisplayName,
} from './extractors.js';
export { teamsLogger } from './logger.js';
