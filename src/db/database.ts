/**
 * Connexion SQLite unique. WAL activé pour de meilleures perfs en lecture/écriture concurrente.
 * Une responsabilité : ouvrir la base et exposer l'instance.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_DB_PATH = './data/tournament.db';

function getDatabasePath(): string {
  const envPath = process.env.DATABASE_PATH;
  if (envPath) return envPath;
  return DEFAULT_DB_PATH;
}

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let db: Database.Database | null = null;

/**
 * Ouvre la base SQLite et active le mode WAL.
 * Idempotent : rappeler open() si déjà ouvert retourne la même instance.
 */
export function openDatabase(databasePath?: string): Database.Database {
  if (db) return db;
  const resolvedPath = databasePath ?? getDatabasePath();
  ensureDirectoryExists(resolvedPath);
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  return db;
}

/**
 * Retourne l'instance ouverte. Lance si openDatabase() n'a pas encore été appelé.
 */
export function getDatabase(): Database.Database {
  if (!db) return openDatabase();
  return db;
}

/**
 * Ferme la connexion. À appeler au shutdown.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
