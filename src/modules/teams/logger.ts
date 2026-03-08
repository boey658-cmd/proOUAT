/**
 * Logger dédié au module teams. Une responsabilité : centraliser les logs du scan.
 * Remplaçable par un logger applicatif (pino) plus tard.
 */

const PREFIX = '[teams]';

function formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
  const parts = [PREFIX, level, message];
  if (context && Object.keys(context).length > 0) {
    parts.push(JSON.stringify(context));
  }
  return parts.join(' ');
}

export const teamsLogger = {
  info(message: string, context?: Record<string, unknown>): void {
    console.info(formatMessage('info', message, context));
  },
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(formatMessage('warn', message, context));
  },
  error(message: string, context?: Record<string, unknown>): void {
    console.error(formatMessage('error', message, context));
  },
  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(formatMessage('debug', message, context));
    }
  },
};
