/**
 * Export des ressources Discord (limites, catégorie, rôle, salon, persistance).
 */

export { checkDiscordLimits } from './checkDiscordLimits.js';
export type { DiscordLimitsCheck } from './checkDiscordLimits.js';
export { findOrCreateTeamCategory } from './findOrCreateTeamCategory.js';
export type { FindOrCreateTeamCategoryResult } from './findOrCreateTeamCategory.js';
export { createTeamRole } from './createTeamRole.js';
export { createTeamChannel } from './createTeamChannel.js';
export { persistTeamDiscordResources } from './persistTeamDiscordResources.js';
export type { PersistTeamResourcesParams } from './persistTeamDiscordResources.js';
export { slugifyChannelName, slugifyRoleName } from './slugify.js';
