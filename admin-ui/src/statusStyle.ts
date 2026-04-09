import type { CSSProperties } from 'react';
import type { TeamVerificationLevel } from './types';

/** Styles inline MVP pour le badge / la ligne (vert = OK, orange = incomplet, rouge = cassé). */
export function statusBadgeStyle(level: TeamVerificationLevel): CSSProperties {
  switch (level) {
    case 'ok':
      return {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: '#dcfce7',
        color: '#166534',
        border: '1px solid #22c55e',
      };
    case 'warning':
      return {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: '#ffedd5',
        color: '#9a3412',
        border: '1px solid #fb923c',
      };
    case 'unknown':
      return {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: '#e2e8f0',
        color: '#475569',
        border: '1px solid #94a3b8',
      };
    case 'error':
    default:
      return {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: '#fee2e2',
        color: '#991b1b',
        border: '1px solid #ef4444',
      };
  }
}

export function rowBackgroundForStatus(level: TeamVerificationLevel): string {
  switch (level) {
    case 'ok':
      return 'rgba(34, 197, 94, 0.06)';
    case 'warning':
      return 'rgba(251, 146, 60, 0.08)';
    case 'unknown':
      return 'rgba(148, 163, 184, 0.06)';
    case 'error':
    default:
      return 'rgba(239, 68, 68, 0.08)';
  }
}
