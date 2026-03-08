/**
 * Système de migrations versionnées.
 * Lit les fichiers .sql dans migrations/, les exécute dans l'ordre, et enregistre les versions appliquées.
 * Une responsabilité : exécuter les migrations et tracer les versions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from './database.js';

const MIGRATIONS_TABLE = 'schema_migrations';
const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

function ensureMigrationsTable(db: ReturnType<typeof getDatabase>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

function getAppliedVersions(db: ReturnType<typeof getDatabase>): Set<string> {
  const stmt = db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE}`);
  const rows = stmt.all() as { version: string }[];
  return new Set(rows.map((r) => r.version));
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function applyMigration(db: ReturnType<typeof getDatabase>, version: string, sql: string): void {
  db.exec(sql);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (version, applied_at) VALUES (?, ?)`
  );
  insert.run(version, now);
}

/**
 * Exécute toutes les migrations non encore appliquées.
 * À appeler au démarrage après openDatabase().
 * @returns Nombre de migrations appliquées
 */
export function runMigrations(): number {
  const db = getDatabase();
  ensureMigrationsTable(db);
  const applied = getAppliedVersions(db);
  const files = getMigrationFiles();
  let count = 0;

  for (const file of files) {
    const version = path.basename(file, '.sql');
    if (applied.has(version)) continue;

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    db.transaction(() => {
      applyMigration(db, version, sql);
    })();
    count++;
  }

  return count;
}
