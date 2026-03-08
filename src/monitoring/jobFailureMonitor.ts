/**
 * Suivi des échecs consécutifs des jobs (registrationSync, syncdiv).
 * Envoie des alertes dans le salon audit selon le nombre d'échecs (1, 2, 3).
 * Compteurs en mémoire uniquement (réinitialisés au redémarrage du bot).
 */

import type { Client } from 'discord.js';
import { sendAuditLog } from '../audit/sendAuditLog.js';
import { buildAuditMessage, AUDIT_PREFIX } from '../audit/buildAuditMessage.js';

export type MonitoredJobId = 'registrationSync' | 'syncdiv';

const FAILURE_COUNTERS: Record<MonitoredJobId, number> = {
  registrationSync: 0,
  syncdiv: 0,
};

const JOB_LABELS: Record<MonitoredJobId, string> = {
  registrationSync: 'Registration Sync',
  syncdiv: 'Sync divisions',
};

const JOB_PREFIXES: Record<MonitoredJobId, string> = {
  registrationSync: AUDIT_PREFIX.REGISTRATION_SYNC,
  syncdiv: AUDIT_PREFIX.DIVISIONS,
};

function getCount(jobId: MonitoredJobId): number {
  return FAILURE_COUNTERS[jobId] ?? 0;
}

function incrementCount(jobId: MonitoredJobId): number {
  const next = getCount(jobId) + 1;
  FAILURE_COUNTERS[jobId] = next;
  return next;
}

function resetCount(jobId: MonitoredJobId): void {
  FAILURE_COUNTERS[jobId] = 0;
}

/**
 * À appeler quand un job se termine avec succès.
 * Remet le compteur d'échecs consécutifs à 0 pour ce job.
 */
export function notifyJobSuccess(
  client: Client,
  jobId: MonitoredJobId
): void {
  resetCount(jobId);
}

/**
 * À appeler quand un job échoue.
 * Incrémente le compteur et envoie un message audit selon le nombre d'échecs :
 * - 1 : ❌ [Job] Échec du job — voir logs serveur
 * - 2 : ⚠️ [Job] 2 échecs consécutifs détectés
 * - 3 : ❌ [Monitoring] Job en échec 3 fois de suite — intervention recommandée
 * - 4+ : aucun message (anti-spam)
 */
export async function notifyJobFailure(
  client: Client,
  jobId: MonitoredJobId,
  _error: unknown
): Promise<void> {
  const count = incrementCount(jobId);
  const prefix = JOB_PREFIXES[jobId];
  const label = JOB_LABELS[jobId];

  if (count === 1) {
    await sendAuditLog(
      client,
      buildAuditMessage('error', prefix, 'Échec du job — voir logs serveur')
    );
    return;
  }
  if (count === 2) {
    await sendAuditLog(
      client,
      buildAuditMessage('warn', prefix, '2 échecs consécutifs détectés')
    );
    return;
  }
  if (count === 3) {
    await sendAuditLog(
      client,
      buildAuditMessage(
        'error',
        AUDIT_PREFIX.MONITORING,
        `${label} en échec 3 fois de suite — intervention recommandée`
      )
    );
  }
  // count >= 4 : ne plus envoyer (anti-spam)
}
