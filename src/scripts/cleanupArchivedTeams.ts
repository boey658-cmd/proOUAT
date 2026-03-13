/**
 * Nettoyage one-shot des équipes archivées (anciennes désinscriptions avant la nouvelle logique de purge).
 * Deux modes : --preview (lister les candidats) et --cleanup (purge réelle, même logique que removed).
 * Aucune action sur Discord. Réutilise forgetTeamAndRemoveFromDb (transaction atomique).
 *
 * Usage:
 *   npx tsx src/scripts/cleanupArchivedTeams.ts --preview
 *   npx tsx src/scripts/cleanupArchivedTeams.ts --cleanup
 */

import 'dotenv/config';
import { openDatabase } from '../db/database.js';
import * as teamsRepo from '../db/repositories/teams.js';
import { forgetTeamAndRemoveFromDb } from '../modules/teams/syncTeamsWithDatabase.js';

const MODE_PREVIEW = '--preview';
const MODE_CLEANUP = '--cleanup';

function usage(): void {
  console.error(`
Usage: npx tsx src/scripts/cleanupArchivedTeams.ts <mode>
  --preview   Lister les équipes candidates (status = 'archived'), sans rien modifier.
  --cleanup   Purger en base les équipes archivées (même logique que désinscription actuelle).

Critère de sélection : status = 'archived' (équipes déjà désinscrites avec l'ancienne logique).
Aucune suppression Discord. Une seule transaction par équipe purgée.
`);
}

function runPreview(): void {
  const archived = teamsRepo.findTeamsWithStatusIn(['archived']);
  console.log('Équipes candidates au nettoyage (status = archived):', archived.length);
  if (archived.length === 0) {
    console.log('Aucune équipe archivée trouvée.');
    return;
  }
  console.log('');
  const col = (s: string, w: number) => String(s).padEnd(w).slice(0, w);
  console.log(col('id', 8) + col('team_api_id', 24) + col('team_name', 36) + 'last_seen_at');
  console.log('-'.repeat(8 + 24 + 36 + 25));
  for (const t of archived) {
    console.log(
      col(String(t.id), 8) +
        col(t.team_api_id, 24) +
        col(t.team_name, 36) +
        (t.last_seen_at ?? '')
    );
  }
  console.log('');
  console.log('Total:', archived.length, 'équipe(s). Lancer avec --cleanup pour purger.');
}

function runCleanup(): void {
  const archived = teamsRepo.findTeamsWithStatusIn(['archived']);
  if (archived.length === 0) {
    console.log('Aucune équipe archivée à purger.');
    return;
  }
  console.log('Purge de', archived.length, 'équipe(s) archivée(s)...');
  for (const team of archived) {
    forgetTeamAndRemoveFromDb(team);
    console.log('  purgé:', team.id, team.team_api_id, team.team_name);
  }
  console.log('Terminé.');
}

function main(): void {
  const args = process.argv.slice(2);
  const hasPreview = args.includes(MODE_PREVIEW);
  const hasCleanup = args.includes(MODE_CLEANUP);

  if (args.length !== 1 || (hasPreview && hasCleanup) || (!hasPreview && !hasCleanup)) {
    usage();
    process.exit(1);
  }

  openDatabase();

  if (hasPreview) {
    runPreview();
  } else {
    runCleanup();
  }
}

main();
