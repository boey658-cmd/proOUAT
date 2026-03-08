/**
 * Export central du module divisions.
 */

export * from './types.js';
export { syncDivisionsFromCalendar } from './syncDivisionsFromCalendar.js';
export { extractDivisionEntries } from './extractors.js';
export { divisionsLogger } from './logger.js';
export {
  formatDivisionRoleName,
  formatDivisionChannelName,
  getDivisionCategoryName,
  groupNumberToLetter,
  groupLabelToLetter,
  groupLabelToSortKey,
} from './utils.js';
export {
  createDivisionCategoryIfNotExists,
  type CreateDivisionCategoryResult,
} from './createDivisionStructure.js';
export { renameTeamResources, type RenameTeamResourcesResult } from './renameTeamResources.js';
export {
  moveTeamChannelToCategory,
  reorderDivisionChannels,
  type MoveTeamChannelResult,
  type MoveTeamChannelLogContext,
} from './moveTeamChannels.js';
export {
  createTeamResourcesForTeam,
  createTeamResourcesForDivisionOnGuild,
  type CreateTeamResourcesForTeamResult,
} from './createTeamResourcesForGuild.js';
export {
  createOrSyncTeamVoiceChannel,
  type CreateOrSyncTeamVoiceChannelParams,
  type CreateOrSyncTeamVoiceChannelResult,
} from './createOrSyncTeamVoiceChannel.js';
