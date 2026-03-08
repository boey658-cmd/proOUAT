/**
 * Module de monitoring : alertes audit au démarrage et sur échecs consécutifs des jobs.
 */

export {
  notifyJobSuccess,
  notifyJobFailure,
} from './jobFailureMonitor.js';
export type { MonitoredJobId } from './jobFailureMonitor.js';
export { sendBotStartedAudit } from './botStartedAudit.js';
