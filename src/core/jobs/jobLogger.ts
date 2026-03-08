/**
 * Logger dédié aux jobs (début, fin, durée, résumé, erreurs).
 */

const PREFIX = '[job]';

function formatMessage(
  jobName: string,
  level: string,
  message: string,
  context?: Record<string, unknown>
): string {
  const parts = [PREFIX, jobName, level, message];
  if (context && Object.keys(context).length > 0) {
    parts.push(JSON.stringify(context));
  }
  return parts.join(' ');
}

export function createJobLogger(jobName: string) {
  return {
    info(message: string, context?: Record<string, unknown>): void {
      console.info(formatMessage(jobName, 'info', message, context));
    },
    warn(message: string, context?: Record<string, unknown>): void {
      console.warn(formatMessage(jobName, 'warn', message, context));
    },
    error(message: string, context?: Record<string, unknown>): void {
      console.error(formatMessage(jobName, 'error', message, context));
    },
  };
}
