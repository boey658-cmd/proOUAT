/**
 * Repository pending_actions : CRUD et requêtes par status, next_attempt_at.
 * Une responsabilité : accès données table pending_actions.
 */

import { getDatabase } from '../database.js';
import type { PendingActionRow, PendingActionStatus, PendingActionInsert } from '../types.js';

function now(): string {
  return new Date().toISOString();
}

export function insertPendingAction(row: PendingActionInsert): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO pending_actions (
      team_id, action_type, payload_json, status,
      attempt_count, next_attempt_at, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    row.team_id ?? null,
    row.action_type,
    row.payload_json,
    row.status,
    row.attempt_count ?? 0,
    row.next_attempt_at ?? null,
    row.last_error ?? null,
    row.created_at,
    row.updated_at
  );
  return info.lastInsertRowid as number;
}

export function findPendingActionById(id: number): PendingActionRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM pending_actions WHERE id = ?');
  return (stmt.get(id) as PendingActionRow | undefined) ?? null;
}

export function findPendingActionsByTeamId(teamId: number): PendingActionRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM pending_actions WHERE team_id = ? ORDER BY id');
  return stmt.all(teamId) as PendingActionRow[];
}

export function findPendingActionsDueForRetry(limit = 50): PendingActionRow[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM pending_actions
    WHERE status IN ('pending', 'blocked')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY next_attempt_at ASC
    LIMIT ?
  `);
  return stmt.all(now(), limit) as PendingActionRow[];
}

export function findPendingActionsByStatus(status: PendingActionStatus): PendingActionRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM pending_actions WHERE status = ? ORDER BY id');
  return stmt.all(status) as PendingActionRow[];
}

export function updatePendingActionStatus(
  id: number,
  status: PendingActionStatus,
  options?: { lastError?: string; nextAttemptAt?: string | null; attemptCount?: number }
): void {
  const db = getDatabase();
  const updatedAt = now();
  const stmt = db.prepare(`
    UPDATE pending_actions SET
      status = ?,
      last_error = COALESCE(?, last_error),
      next_attempt_at = COALESCE(?, next_attempt_at),
      attempt_count = COALESCE(?, attempt_count),
      updated_at = ?
    WHERE id = ?
  `);
  stmt.run(
    status,
    options?.lastError ?? null,
    options?.nextAttemptAt ?? null,
    options?.attemptCount ?? null,
    updatedAt,
    id
  );
}

export function setPendingActionProcessing(id: number, attemptCount: number): void {
  const db = getDatabase();
  const stmt = db.prepare(
    'UPDATE pending_actions SET status = ?, attempt_count = ?, updated_at = ? WHERE id = ?'
  );
  stmt.run('processing', attemptCount, now(), id);
}

export function setPendingActionDone(id: number): void {
  updatePendingActionStatus(id, 'done');
}

export function setPendingActionFailed(
  id: number,
  lastError: string,
  nextAttemptAt: string | null
): void {
  const row = findPendingActionById(id);
  const attemptCount = row ? row.attempt_count + 1 : 1;
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE pending_actions SET
      status = 'failed',
      last_error = ?,
      next_attempt_at = ?,
      attempt_count = ?,
      updated_at = ?
    WHERE id = ?
  `);
  stmt.run(lastError, nextAttemptAt, attemptCount, now(), id);
}

export function setPendingActionBlocked(id: number, lastError: string): void {
  const db = getDatabase();
  const stmt = db.prepare(
    'UPDATE pending_actions SET status = ?, last_error = ?, updated_at = ? WHERE id = ?'
  );
  stmt.run('blocked', lastError, now(), id);
}
