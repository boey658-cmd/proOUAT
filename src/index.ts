/**
 * Point d'entrée de l'application : base de données, migrations, client Discord, jobs.
 */
import 'dotenv/config';

import { openDatabase, runMigrations, closeDatabase } from './db/index.js';
import { createAndConnectClient, destroyClient } from './discord/client.js';
import { stopJobs } from './bootstrap/index.js';
import { getDiscordGuildId1, getDiscordGuildId2 } from './config/index.js';

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

  const guildId1 = getDiscordGuildId1();
  const guildId2 = getDiscordGuildId2();
  if (!guildId1 && !guildId2) {
    console.warn(
      '[config] DISCORD_GUILD_ID_1 et DISCORD_GUILD_ID_2 non définis : /creationchaneldiv, /syncdiv et le bouton "Créer la team" refuseront toute exécution.'
    );
  }

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection]', reason);
  });

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
