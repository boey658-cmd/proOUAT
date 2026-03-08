/**
 * Point d'entrée de l'application : base de données, migrations, client Discord, jobs.
 */
import 'dotenv/config';

import { openDatabase, runMigrations, closeDatabase } from './db/index.js';
import { createAndConnectClient, destroyClient } from './discord/client.js';
import { stopJobs } from './bootstrap/index.js';

async function shutdown(): Promise<void> {
  console.info('Arrêt du bot');
  stopJobs();
  await destroyClient();
  closeDatabase();
  process.exit(0);
}

async function main(): Promise<void> {
  openDatabase();
  const applied = runMigrations();
  console.log('Migrations appliquées:', applied);

  process.on('SIGINT', () => {
    shutdown().catch((err) => {
      console.error('Erreur à l\'arrêt:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
  });
  process.on('SIGTERM', () => {
    shutdown().catch((err) => {
      console.error('Erreur à l\'arrêt:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
  });

  await createAndConnectClient();

  // Le client Discord garde le processus actif ; pas d'appel à process.exit().
}

main().catch((err) => {
  console.error('Erreur au démarrage:', err instanceof Error ? err.message : err);
  process.exit(1);
});
