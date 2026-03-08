/**
 * Job principal d'inscription : scan tournoi → sync DB → notification Discord.
 * Une responsabilité : exécuter le flux complet et retourner un résumé.
 */

import type { Client } from 'discord.js';
import { getTournamentSlug } from '../config/index.js';
import { scanTournamentRegistrations } from '../modules/teams/scanTournamentRegistrations.js';
import { syncTeamsWithDatabase } from '../modules/teams/syncTeamsWithDatabase.js';
import { notifyNewTeams } from '../modules/discord/messages/notifyNewTeams.js';
import { notifyUpdatedTeams } from '../modules/discord/messages/notifyUpdatedTeams.js';
import { notifyRemovedTeams } from '../modules/discord/messages/notifyRemovedTeams.js';
import { notifyReactivatedTeams } from '../modules/discord/messages/notifyReactivatedTeams.js';
import { syncTeamToGoogleSheets } from '../modules/googleSheets/index.js';
import {
  isGoogleSheetsSyncEnabled,
  getGoogleScriptUrl1,
  getGoogleScriptUrl2,
  getRegistrationSyncIntervalMinutes,
  getReactivationNotifyMaxPerRun,
} from '../config/index.js';
import { tryAcquireJobLock, releaseJobLock } from '../core/jobs/jobLock.js';
import { createJobLogger } from '../core/jobs/jobLogger.js';
import { sendAuditLog, buildAuditMessage, AUDIT_PREFIX } from '../audit/index.js';
import { notifyJobSuccess, notifyJobFailure } from '../monitoring/index.js';

const JOB_NAME = 'registrationSync';

export interface RegistrationSyncJobResult {
  scannedTeams: number;
  created: number;
  updated: number;
  unchanged: number;
  notified: number;
  notifyFailed: number;
  updatedNotified: number;
  updatedNotifyFailed: number;
  removedNotified: number;
  removedNotifyFailed: number;
  reactivatedNotified: number;
  reactivatedNotifyFailed: number;
  googleSheetsSent: number;
  googleSheetsFailed: number;
  errors: string[];
  durationMs: number;
  skipped: boolean;
}

/**
 * Exécute le flux complet d'inscription (scan, sync, notify).
 * Utilise un lock pour éviter les exécutions parallèles.
 */
export async function runRegistrationSyncJob(
  client: Client
): Promise<RegistrationSyncJobResult> {
  const logger = createJobLogger(JOB_NAME);
  const startTime = Date.now();
  const emptyResult = (
    skipped: boolean
  ): RegistrationSyncJobResult => ({
    scannedTeams: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    notified: 0,
    notifyFailed: 0,
    updatedNotified: 0,
    updatedNotifyFailed: 0,
    removedNotified: 0,
    removedNotifyFailed: 0,
    reactivatedNotified: 0,
    reactivatedNotifyFailed: 0,
    googleSheetsSent: 0,
    googleSheetsFailed: 0,
    errors: [],
    durationMs: Date.now() - startTime,
    skipped,
  });

  if (!tryAcquireJobLock(JOB_NAME)) {
    logger.warn('registrationSync ignoré : job déjà en cours');
    return emptyResult(true);
  }

  try {
    const slug = getTournamentSlug();
    logger.info('Début du job');
    await sendAuditLog(
      client,
      buildAuditMessage(
        'info',
        AUDIT_PREFIX.REGISTRATION_SYNC,
        `Début du scan des inscriptions — tournoi : ${slug}`
      )
    );

    const scanResult = await scanTournamentRegistrations(slug);

    const scannedTeams = scanResult.teams.length;
    const errors: string[] = scanResult.errors.map(
      (e) => `[scan] ${e.context}:${e.id} - ${e.message}`
    );

    if (scanResult.teams.length === 0) {
      logger.info('Fin du job (aucune équipe à synchroniser)', {
        scanErrors: scanResult.errors.length,
      });
      const msg =
        scanResult.errors.length > 0
          ? `Fin du scan — 0 équipe à synchroniser (tournoi : ${slug}) — ${scanResult.errors.length} erreur(s) lors du scan.`
          : `Fin du scan — 0 équipe à synchroniser (tournoi : ${slug}).`;
      await sendAuditLog(
        client,
        buildAuditMessage('info', AUDIT_PREFIX.REGISTRATION_SYNC, msg)
      );
      notifyJobSuccess(client, 'registrationSync');
      return {
        ...emptyResult(false),
        errors,
        durationMs: Date.now() - startTime,
      };
    }

    logger.info('Équipes détectées dans le tournoi', {
      count: scannedTeams,
      scanErrors: scanResult.errors.length,
    });

    const totalRefsAttempted = scanResult.teams.length + scanResult.errors.length;
    const scanSuccessRatio =
      totalRefsAttempted > 0 ? scanResult.teams.length / totalRefsAttempted : 1;
    const isScanDegraded = totalRefsAttempted > 0 && scanSuccessRatio < 0.8;
    if (isScanDegraded) {
      logger.warn('Scan dégradé : suppressions désactivées pour ce run', {
        teamsOk: scanResult.teams.length,
        errors: scanResult.errors.length,
        totalRefs: totalRefsAttempted,
      });
      await sendAuditLog(
        client,
        buildAuditMessage(
          'warn',
          AUDIT_PREFIX.REGISTRATION_SYNC,
          `Scan dégradé détecté — suppressions désactivées pour ce run (${scanResult.errors.length} erreur(s) scan).`
        )
      );
    }

    const syncResult = syncTeamsWithDatabase(scanResult.teams, {
      skipRemovals: isScanDegraded,
    });
    syncResult.errors.forEach(
      (e) => errors.push(`[sync] ${e.team_api_id} - ${e.message}`)
    );

    logger.info('Synchronisation base terminée', {
      created: syncResult.created,
      updated: syncResult.updated,
      removed: syncResult.removedTeams.length,
      reactivated: syncResult.reactivated,
    });

    let notified = 0;
    let notifyFailed = 0;
    let googleSheetsSent = 0;
    let googleSheetsFailed = 0;
    if (syncResult.createdTeams.length > 0) {
      const notifyResult = await notifyNewTeams(client, syncResult.createdTeams);
      notified = notifyResult.sent;
      notifyFailed = notifyResult.failed;

      if (isGoogleSheetsSyncEnabled()) {
        const url1 = getGoogleScriptUrl1();
        const url2 = getGoogleScriptUrl2();
        for (const team of syncResult.createdTeams) {
          const gsResult = await syncTeamToGoogleSheets(team);
          const success =
            (url1 ? gsResult.doc1Success : true) &&
            (url2 ? gsResult.doc2Success : true);
          if (success) googleSheetsSent++;
          else googleSheetsFailed++;
        }
      }
    }

    let updatedNotified = 0;
    let updatedNotifyFailed = 0;
    if (syncResult.updatedTeams.length > 0) {
      const updatedResult = await notifyUpdatedTeams(client, syncResult.updatedTeams);
      updatedNotified = updatedResult.sent;
      updatedNotifyFailed = updatedResult.failed;
    }

    let removedNotified = 0;
    let removedNotifyFailed = 0;
    if (syncResult.removedTeams.length > 0) {
      const removedResult = await notifyRemovedTeams(client, syncResult.removedTeams);
      removedNotified = removedResult.sent;
      removedNotifyFailed = removedResult.failed;
    }

    let reactivatedNotified = 0;
    let reactivatedNotifyFailed = 0;
    const reactivationMax = getReactivationNotifyMaxPerRun();
    if (syncResult.reactivatedTeams.length > reactivationMax) {
      logger.warn('Réactivations massives (probable correction scan incomplet précédent), notifications individuelles désactivées', {
        count: syncResult.reactivatedTeams.length,
        max: reactivationMax,
      });
    } else if (syncResult.reactivatedTeams.length > 0) {
      const reactivatedResult = await notifyReactivatedTeams(client, syncResult.reactivatedTeams);
      reactivatedNotified = reactivatedResult.sent;
      reactivatedNotifyFailed = reactivatedResult.failed;
    }

    const durationMs = Date.now() - startTime;
    const summary = {
      scannedTeams,
      created: syncResult.created,
      updated: syncResult.updated,
      unchanged: syncResult.unchanged,
      removed: syncResult.removedTeams.length,
      reactivated: syncResult.reactivated,
      notified,
      notifyFailed,
      updatedNotified,
      updatedNotifyFailed,
      removedNotified,
      removedNotifyFailed,
      reactivatedNotified,
      reactivatedNotifyFailed,
      googleSheetsSent,
      googleSheetsFailed,
      errorsCount: errors.length,
      durationMs,
    };
    logger.info('Fin du job', summary);

    const durationSec = Math.round(durationMs / 1000);
    const auditLine = buildAuditMessage(
      'success',
      AUDIT_PREFIX.REGISTRATION_SYNC,
      [
        'Terminé',
        `— tournoi : ${slug}`,
        `— scannées : ${scannedTeams}`,
        `— créées : ${syncResult.created}`,
        `— mises à jour : ${syncResult.updated}`,
        `— supprimées : ${syncResult.removedTeams.length}`,
        `— réactivées : ${syncResult.reactivated}`,
        `— notifications : ${notified} envoyées`,
        `— Google Sheets : ${googleSheetsSent} succès / ${googleSheetsFailed} échec`,
        `— durée : ${durationSec} s`,
      ].join(' ')
    );
    await sendAuditLog(client, auditLine);
    notifyJobSuccess(client, 'registrationSync');
    if (errors.length > 0) {
      const errPreview = errors.slice(0, 3).join(' ; ');
      await sendAuditLog(
        client,
        buildAuditMessage(
          'error',
          AUDIT_PREFIX.REGISTRATION_SYNC,
          `Erreurs (${errors.length}) — ${errPreview}${errors.length > 3 ? '…' : ''}`
        )
      );
    }

    const intervalMs = getRegistrationSyncIntervalMinutes() * 60 * 1000;
    if (intervalMs > 0 && durationMs > intervalMs * 0.8) {
      logger.warn('Job a dépassé 80% de l\'intervalle', { durationMs, intervalMs });
    }

    return {
      scannedTeams,
      created: syncResult.created,
      updated: syncResult.updated,
      unchanged: syncResult.unchanged,
      notified,
      notifyFailed,
      updatedNotified,
      updatedNotifyFailed,
      removedNotified,
      removedNotifyFailed,
      reactivatedNotified,
      reactivatedNotifyFailed,
      googleSheetsSent,
      googleSheetsFailed,
      errors,
      durationMs,
      skipped: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Erreur globale du job', { message });
    await notifyJobFailure(client, 'registrationSync', err);
    await sendAuditLog(
      client,
      buildAuditMessage(
        'error',
        AUDIT_PREFIX.REGISTRATION_SYNC,
        `Erreur lors du sync inscriptions — ${message}`
      )
    );
    return {
      ...emptyResult(false),
      errors: [message],
      durationMs: Date.now() - startTime,
      updatedNotified: 0,
      updatedNotifyFailed: 0,
      removedNotified: 0,
      removedNotifyFailed: 0,
      reactivatedNotified: 0,
      reactivatedNotifyFailed: 0,
      googleSheetsSent: 0,
      googleSheetsFailed: 0,
    };
  } finally {
    releaseJobLock(JOB_NAME);
  }
}
