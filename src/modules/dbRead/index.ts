/**
 * Module de consultation READ-ONLY de la base SQLite.
 * Aucune écriture. Accès restreint à un seul utilisateur Discord.
 */

export { ALLOWED_DB_READ_USER_ID } from './constants.js';
export {
  handleStatsCommand,
  handleDbAnomaliesCommand,
  handleDbTeamCommand,
} from './commands.js';
export type { StatsResult, AnomalyItem, TeamDetailResult } from './queries.js';
