/**
 * Repository division_assignments : upsert et requêtes par team_id, division.
 * Une responsabilité : accès données table division_assignments.
 */

import { getDatabase } from '../database.js';
import type { DivisionAssignmentRow, DivisionAssignmentInsert } from '../types.js';

export function upsertDivisionAssignment(row: DivisionAssignmentInsert): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO division_assignments (team_id, division_number, division_group, source_payload_json, synced_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (team_id) DO UPDATE SET
      division_number = excluded.division_number,
      division_group = excluded.division_group,
      source_payload_json = excluded.source_payload_json,
      synced_at = excluded.synced_at
  `);
  stmt.run(
    row.team_id,
    row.division_number,
    row.division_group,
    row.source_payload_json ?? null,
    row.synced_at
  );
}

export function findDivisionAssignmentByTeamId(teamId: number): DivisionAssignmentRow | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM division_assignments WHERE team_id = ?');
  return (stmt.get(teamId) as DivisionAssignmentRow | undefined) ?? null;
}

export function findDivisionAssignmentsByDivision(divisionNumber: number): DivisionAssignmentRow[] {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT * FROM division_assignments WHERE division_number = ? ORDER BY division_group, team_id'
  );
  return stmt.all(divisionNumber) as DivisionAssignmentRow[];
}

export function findAllDivisionAssignments(): DivisionAssignmentRow[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM division_assignments ORDER BY division_number, division_group, team_id');
  return stmt.all() as DivisionAssignmentRow[];
}
