/**
 * Verrou en mémoire pour empêcher l'exécution parallèle d'un même job.
 * Le lock n'est libéré que par releaseJobLock (dans un finally). Pas de vol du lock sur TTL
 * pour éviter de lancer un second run tant que le premier n'a pas terminé (gros tournois).
 */

import { getJobLockTtlSeconds } from '../../config/index.js';

const locks = new Map<string, number>();

function isLockExpired(lockedAt: number): boolean {
  const ttlMs = getJobLockTtlSeconds() * 1000;
  return Date.now() - lockedAt > ttlMs;
}

/**
 * Tente d'acquérir le verrou pour le job. Retourne true si acquis, false si déjà pris.
 * Le lock n'est jamais volé sur expiration : tant qu'il existe, aucun nouveau run ne démarre.
 * (Libération uniquement dans releaseJobLock après fin réelle du job.)
 */
export function tryAcquireJobLock(jobName: string): boolean {
  if (locks.has(jobName)) return false;
  locks.set(jobName, Date.now());
  return true;
}

/**
 * Relâche le verrou pour le job.
 */
export function releaseJobLock(jobName: string): void {
  locks.delete(jobName);
}

/**
 * Indique si le job est actuellement verrouillé (et non expiré).
 */
export function isJobLocked(jobName: string): boolean {
  const lockedAt = locks.get(jobName);
  if (lockedAt == null) return false;
  if (isLockExpired(lockedAt)) {
    locks.delete(jobName);
    return false;
  }
  return true;
}
