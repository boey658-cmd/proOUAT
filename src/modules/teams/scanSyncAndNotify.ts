/**
 * Orchestration : scan tournoi → sync DB → notification Discord des nouvelles équipes.
 * Une responsabilité : enchaîner les trois étapes et connecter sync à notify.
 */

import type { Client } from 'discord.js';
import { scanTournamentRegistrations } from './scanTournamentRegistrations.js';
import { syncTeamsWithDatabase } from './syncTeamsWithDatabase.js';
import { notifyNewTeams } from '../discord/messages/notifyNewTeams.js';
import { notifyUpdatedTeams } from '../discord/messages/notifyUpdatedTeams.js';
import { notifyRemovedTeams } from '../discord/messages/notifyRemovedTeams.js';
import { notifyReactivatedTeams } from '../discord/messages/notifyReactivatedTeams.js';
import { syncTeamToGoogleSheets } from '../googleSheets/index.js';
import { isGoogleSheetsSyncEnabled } from '../../config/index.js';
import { teamsLogger } from './logger.js';

export interface ScanSyncNotifyResult {
  scanTeams: number;
  scanErrors: number;
  created: number;
  updated: number;
  unchanged: number;
  syncErrors: number;
  notified: number;
  notifyFailed: number;
  updatedNotified: number;
  updatedNotifyFailed: number;
  removedNotified: number;
  removedNotifyFailed: number;
  reactivatedNotified: number;
  reactivatedNotifyFailed: number;
}

/**
 * Lance le scan des inscriptions, synchronise avec la DB, envoie les notifications
 * pour les équipes nouvellement créées dans le salon staff configuré.
 * @param slug - Slug du tournoi
 * @param client - Client Discord (pour envoyer les embeds)
 */
export async function scanSyncAndNotify(
  slug: string,
  client: Client
): Promise<ScanSyncNotifyResult> {
  const result: ScanSyncNotifyResult = {
    scanTeams: 0,
    scanErrors: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    syncErrors: 0,
    notified: 0,
    notifyFailed: 0,
    updatedNotified: 0,
    updatedNotifyFailed: 0,
    removedNotified: 0,
    removedNotifyFailed: 0,
    reactivatedNotified: 0,
    reactivatedNotifyFailed: 0,
  };

  const scanResult = await scanTournamentRegistrations(slug);
  result.scanTeams = scanResult.teams.length;
  result.scanErrors = scanResult.errors.length;

  if (scanResult.teams.length === 0) {
    teamsLogger.info('scanSyncAndNotify: aucune équipe à synchroniser', { slug });
    return result;
  }

  const syncResult = syncTeamsWithDatabase(scanResult.teams);
  result.created = syncResult.created;
  result.updated = syncResult.updated;
  result.unchanged = syncResult.unchanged;
  result.syncErrors = syncResult.errors.length;

  if (syncResult.createdTeams.length > 0) {
    const notifyResult = await notifyNewTeams(client, syncResult.createdTeams);
    result.notified = notifyResult.sent;
    result.notifyFailed = notifyResult.failed;
    if (isGoogleSheetsSyncEnabled()) {
      for (const team of syncResult.createdTeams) {
        await syncTeamToGoogleSheets(team);
      }
    }
  }

  if (syncResult.updatedTeams.length > 0) {
    const updatedResult = await notifyUpdatedTeams(client, syncResult.updatedTeams);
    result.updatedNotified = updatedResult.sent;
    result.updatedNotifyFailed = updatedResult.failed;
  }

  if (syncResult.removedTeams.length > 0) {
    const removedResult = await notifyRemovedTeams(client, syncResult.removedTeams);
    result.removedNotified = removedResult.sent;
    result.removedNotifyFailed = removedResult.failed;
  }

  if (syncResult.reactivatedTeams.length > 0) {
    const reactivatedResult = await notifyReactivatedTeams(client, syncResult.reactivatedTeams);
    result.reactivatedNotified = reactivatedResult.sent;
    result.reactivatedNotifyFailed = reactivatedResult.failed;
  }

  teamsLogger.info('scanSyncAndNotify: fin', { slug, ...result });
  return result;
}
