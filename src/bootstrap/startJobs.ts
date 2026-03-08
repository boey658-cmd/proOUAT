/**
 * Démarrage du scheduler des jobs (inscription toutes les N minutes).
 * Une responsabilité : planifier runRegistrationSyncJob si le flag est activé.
 */

import type { Client } from 'discord.js';
import {
  getRegistrationSyncIntervalMinutes,
  isAutomaticRegistrationSyncEnabled,
} from '../config/index.js';
import { runRegistrationSyncJob } from '../jobs/runRegistrationSyncJob.js';
import { createJobLogger } from '../core/jobs/jobLogger.js';

const LOGGER = createJobLogger('scheduler');
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Démarre le job d'inscription à intervalle régulier si ENABLE_AUTOMATIC_REGISTRATION_SYNC est activé.
 * À appeler après que le client Discord soit connecté.
 */
export function startJobs(client: Client): void {
  if (!isAutomaticRegistrationSyncEnabled()) {
    LOGGER.info('Scheduler désactivé (ENABLE_AUTOMATIC_REGISTRATION_SYNC)');
    return;
  }

  const intervalMinutes = getRegistrationSyncIntervalMinutes();
  const intervalMs = intervalMinutes * 60 * 1000;

  LOGGER.info('Démarrage du scheduler', {
    intervalMinutes,
    job: 'registrationSync',
  });
  console.log('Scheduler started');
  console.log('Registration sync job ready');

  runRegistrationSyncJob(client).catch((err) => {
    LOGGER.error('Erreur première exécution', {
      message: err instanceof Error ? err.message : String(err),
    });
  });

  intervalId = setInterval(() => {
    runRegistrationSyncJob(client).catch((err) => {
      LOGGER.error('Erreur job planifié', {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
}

/**
 * Arrête le scheduler (utile pour tests ou shutdown propre).
 */
export function stopJobs(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    LOGGER.info('Scheduler arrêté');
  }
}
