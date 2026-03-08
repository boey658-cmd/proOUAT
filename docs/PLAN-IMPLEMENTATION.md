# Plan d'implémentation par phases

Implémentation pas à pas, sans casser l’état existant. Chaque phase est livrable et testable.

---

## Phase 1 — Fondations (projet, config, core minimal)

**Objectif** : Projet Node.js + TypeScript, config chargée, logger, types de base.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `package.json` | Dépendances : typescript, ts-node, discord.js v14, express, better-sqlite3, axios, zod, node-cron, pino, helmet, express-rate-limit, dotenv, uuid, luxon (ou dayjs), bcrypt, cookie-parser, express-session, ejs. Dev : vitest, eslint, prettier. |
| 2 | `tsconfig.json` | Strict, outDir dist, include src. |
| 3 | `.env.example` | Toutes les variables listées dans la spec (sans valeurs sensibles). |
| 4 | `.gitignore` | node_modules, dist, .env, *.db, *.db-wal, logs. |
| 5 | `src/config/env.ts` | Chargement dotenv, validation des variables requises (zod ou manuel). |
| 6 | `src/config/constants.ts` | Limites Discord, noms catégories, timeouts. |
| 7 | `src/config/guilds.ts` | Mapping GUILD_ID_1/LABEL_1, GUILD_ID_2/LABEL_2. |
| 8 | `src/config/index.ts` | Export config. |
| 9 | `src/core/logger.ts` | Pino JSON, niveaux, masquage secrets. |
| 10 | `src/core/errors.ts` | ApiError, DiscordError, DbError, ValidationError. |
| 11 | `src/core/requestId.ts` | uuid v4 pour corrélation. |
| 12 | `src/types/*` | Types api, team, discord, division, audit. |
| 13 | `src/index.ts` | Point d’entrée : charger config, logger, appeler bootstrap. |

**Critère de fin** : `npm run build` OK, variables lues depuis .env.

---

## Phase 2 — Base de données

**Objectif** : SQLite, migrations, WAL, repositories.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `migrations/001_initial.sql` | Copier le schéma de SCHEMA-SQL.md. |
| 2 | `migrations/run.ts` | Lire les fichiers SQL dans l’ordre, exécuter. |
| 3 | `src/db/index.ts` | Connexion better-sqlite3, PRAGMA WAL. |
| 4 | `src/db/migrate.ts` | Appel du runner de migrations au démarrage. |
| 5 | `src/db/repositories/*.ts` | Un fichier par table : guilds, teams, players, teamSnapshots, discordResources, teamDiscordState, divisionAssignments, pendingActions, staffMessages, auditLogs, jobLocks, appSettings. Méthodes CRUD + requêtes préparées. |
| 6 | `src/bootstrap/initDb.ts` | Ouvrir DB, lancer migrations. |

**Critère de fin** : Au démarrage, DB créée, tables présentes, aucun crash.

---

## Phase 3 — Core (scheduler, locks, utils, sécurité)

**Objectif** : Scheduler des jobs, locks en base, normalisation, hash, vérification staff.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/core/scheduler.ts` | Planification cron (node-cron), enregistrement de jobs par nom. |
| 2 | `src/db/repositories/jobLocks.ts` | acquireLock(jobName, ttlSeconds), releaseLock(jobName). |
| 3 | `src/core/locks.ts` | Acquire avant job, release en finally. |
| 4 | `src/core/utils/normalizeTeamName.ts`, `normalizeLolPseudo.ts`, `normalizeDivisionGroup.ts` | Règles spec (trim, lowercase, NFC, etc.). |
| 5 | `src/core/utils/slugifyChannelName.ts`, `sanitizeRoleName.ts` | Discord-safe, longueur max. |
| 6 | `src/core/utils/sortPlayersStable.ts` | Tri par identifiant stable. |
| 7 | `src/core/utils/snapshotHash.ts` | Hash (équipe + joueurs triés). |
| 8 | `src/core/security/staffCheck.ts` | Vérifier rôle utilisateur dans ALLOWED_STAFF_ROLE_IDS. |
| 9 | `src/core/security/buttonNonce.ts` | Génération / validation customId (team + action + nonce). |
| 10 | `src/core/security/maskSecrets.ts` | Masquer DISCORD_TOKEN, mots de passe, etc. dans logs. |

**Critère de fin** : Utils testables unitairement ; lock pris/relâché correctement.

---

## Phase 4 — Intégrations API et Google Script

**Objectif** : Clients API, validation Zod, envoi vers 2 Google Apps Script.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/modules/integrations/client.ts` | Instance axios, timeout, retries (backoff exponentiel). |
| 2 | `src/modules/integrations/schemas/*.ts` | Schémas Zod : tournament, team, user, calendar. |
| 3 | `src/modules/integrations/tournamentApi.ts` | GET tournaments/OUATventure%20Saison%2020. |
| 4 | `src/modules/integrations/teamApi.ts` | GET team/{teamId}. |
| 5 | `src/modules/integrations/userApi.ts` | GET user/{userId}. |
| 6 | `src/modules/integrations/calendarApi.ts` | GET calendar/byTournament/18. |
| 7 | `src/modules/integrations/googleScript/sendToScript1.ts` | POST equipe + joueurs (format |). |
| 8 | `src/modules/integrations/googleScript/sendToScript2.ts` | POST equipe. |
| 9 | Logger chaque appel (endpoint, latence, status, id métier). |

**Critère de fin** : Appels API (ou mocks) OK ; validation Zod en place ; Google Script ne pas bloquer le flux.

---

## Phase 5 — Module teams (scan, comparaison, snapshot)

**Objectif** : Récupération équipes complètes (tournoi → équipe → user), normalisation, comparaison avec la base, snapshot.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/modules/teams/fetchTeamPlayers.ts` | Pour un teamId API : appeler team API puis user API pour chaque joueur. |
| 2 | `src/modules/teams/fetchUserDiscordId.ts` | Encapsulation user API → discord_user_id. |
| 3 | `src/modules/teams/fetchTournamentTeams.ts` | Liste équipes tournoi → pour chaque équipe fetch joueurs + Discord IDs → liste d’équipes normalisées. |
| 4 | `src/modules/teams/normalizeTeam.ts` | Construction objet normalisé (team_api_id, team_name, normalized_team_name, players[]). |
| 5 | `src/modules/teams/resolveTeamPresence.ts` | Pour chaque joueur : discord_presence_on_guild, discord_member_found (nécessite client Discord ou module players). Peut être mockée en phase 5. |
| 6 | `src/modules/teams/computeSnapshotHash.ts` | Utiliser core/utils/snapshotHash. |
| 7 | `src/modules/teams/compareWithDb.ts` | Pour chaque équipe API : nouvelle / modifiée (hash différent) / inchangée. |
| 8 | `src/modules/teams/upsertTeamAndPlayers.ts` | Insert ou update teams + players. |
| 9 | `src/modules/teams/createTeamSnapshot.ts` | Insert team_snapshots. |
| 10 | `src/modules/teams/detectTeamChanges.ts` | Diff détaillé (nom, joueurs ajoutés/retirés) pour message staff. |

**Critère de fin** : Scan “logique” (sans Discord) : récupération + comparaison + écriture DB cohérente.

---

## Phase 6 — Discord (client, events, commands enregistrement)

**Objectif** : Bot connecté, events ready + interactionCreate, enregistrement des slash commands (sans implémentation métier complète).

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/bootstrap/initDiscord.ts` | Client Discord (discord.js v14), login avec DISCORD_TOKEN. |
| 2 | `src/bootstrap/registerCommands.ts` | Enregistrement des slash commands (syncdiv, creationchaneldiv, scanteams, syncmembers, teaminfo, retrypending) via API Discord. |
| 3 | `src/events/ready.ts` | Log ready, appeler registerCommands si nécessaire. |
| 4 | `src/events/interactionCreate.ts` | Routage : isCommand() → dispatcher commandes ; isButton() → dispatcher boutons. Vérification permissions staff pour commandes/boutons sensibles. |
| 5 | `src/commands/index.ts` | Liste des commandes et mapping nom → handler. |
| 6 | Stub chaque commande : répondre “Non implémenté” ou délégation vide. |

**Critère de fin** : Bot en ligne, commandes visibles, interactionCreate logue et répond.

---

## Phase 7 — Module discord (création rôle, salon, catégorie, embeds, boutons)

**Objectif** : Création catégorie S21 / S21-2, rôle équipe, salon équipe, embeds staff, boutons, persistance.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/modules/discord/checkDiscordLimits.ts` | Compter rôles/channels du guild, channels dans catégorie ; retourner “ok” / “role_limit” / “channel_limit”. |
| 2 | `src/modules/discord/findOrCreateCategoryS21.ts` | S21 si pas pleine, sinon S21-2, etc. (seuil CATEGORY_MAX_CHANNELS_SAFE_LIMIT). |
| 3 | `src/modules/discord/createTeamRole.ts` | Nom dérivé équipe, longueur safe, permissions minimales. |
| 4 | `src/modules/discord/createTeamChannel.ts` | Type texte, catégorie, permissions (staff + rôle équipe), nom slugifié. |
| 5 | `src/modules/discord/ensureTeamRoleAndChannel.ts` | Orchestration : limites → si rôle OK créer rôle puis channel ; si limite rôle → mode dégradé (channel seul) + pending. Si limite channel → pending blocked. |
| 6 | `src/modules/discord/persistDiscordResources.ts` | Écrire discord_resources + team_discord_state. |
| 7 | `src/modules/discord/embeds/newTeamEmbed.ts` | Embed nouvelle équipe (nom, ID API, joueurs, pseudo LoL, Discord ID, présence, date, état “non créée”). |
| 8 | `src/modules/discord/embeds/teamChangedEmbed.ts` | Embed équipe modifiée (ancien/nouveau nom, joueurs retirés/ajoutés). |
| 9 | `src/modules/discord/buttons/createChannelTeam.ts` | Handler : vérifications (staff, guild, équipe existe, pas déjà traité) → ensureTeamRoleAndChannel → mettre à jour message (bouton désactivé ou “Traité”). |
| 10 | `src/modules/discord/buttons/refreshPresence.ts`, `markTreated.ts` | Handlers optionnels. |
| 11 | `src/modules/discord/permissions.ts` | Vérifier Manage Roles, Manage Channels, etc. ; hiérarchie rôles. |
| 12 | `src/modules/discord/reconcileResource.ts` | Vérifier si role_id/channel_id/category_id existe encore sur le guild. |

**Critère de fin** : Création manuelle (ou via bouton) rôle + salon + persistance OK ; embeds affichés correctement.

---

## Phase 8 — Flux inscriptions complet (job scan + bouton création)

**Objectif** : Job toutes les 5 min : scan → comparaison → nouvelle équipe → embed + bouton ; équipe modifiée → message staff ; envoi Google Script ; création au clic bouton.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/jobs/scanTournamentTeams.ts` | Acquire lock → fetchTournamentTeams → pour chaque équipe compareWithDb → si nouvelle : upsertTeamAndPlayers, createTeamSnapshot, sendToScript1/2, newTeamEmbed + bouton, sauver staff_messages ; si modifiée : upsert, snapshot, teamChangedEmbed ; sinon last_seen_at. Release lock. |
| 2 | Intégration `resolveTeamPresence` avec client Discord (récupérer guild.members). |
| 3 | `src/events/interactionCreate.ts` | Bouton “create_channel_team” → appeler buttons/createChannelTeam. |
| 4 | `src/bootstrap/startScheduler.ts` | Enregistrer job scanTournamentTeams toutes les 5 min (si ENABLE_AUTOMATIC_TEAM_SCAN). |
| 5 | Gestion erreurs partielles (une équipe en échec ne doit pas arrêter le scan). |

**Critère de fin** : Scan automatique détecte nouvelles équipes et changements ; embed + bouton créés ; clic bouton crée rôle/salon.

---

## Phase 9 — Module players et sync membres

**Objectif** : Résolution présence sur guild ; attribution rôle à l’arrivée ; job sync toutes les 5 min.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/modules/players/resolvePresenceOnGuild.ts` | Pour un discord_user_id et guild_id : membre présent ou non (guild.members.fetch ou cache). |
| 2 | `src/modules/teams/resolveTeamPresence.ts` | Utiliser resolvePresenceOnGuild pour chaque joueur (par guild). |
| 3 | `src/modules/players/assignRoleToMember.ts` | Ajouter rôle équipe au membre ; gérer hiérarchie et erreurs. |
| 4 | `src/modules/players/syncTeamMembersToGuild.ts` | Pour une équipe avec active_role_id sur le guild : pour chaque joueur présent, assigner le rôle si pas déjà. |
| 5 | `src/modules/players/updateLastMembershipSync.ts` | Mettre à jour team_discord_state.last_membership_sync_at. |
| 6 | `src/jobs/syncTeamMembership.ts` | Lock → pour chaque équipe active sur chaque guild concerné, syncTeamMembersToGuild ; release lock. |
| 7 | `src/events/guildMemberAdd.ts` | Membre rejoint → trouver joueur par discord_user_id → si équipe active sur ce guild, assignRoleToMember. |
| 8 | Scheduler : enregistrer syncTeamMembership toutes les 5 min. |

**Critère de fin** : Joueur qui rejoint reçoit le rôle ; job sync met à jour les rôles manquants.

---

## Phase 10 — Divisions (syncdiv + creationchaneldiv)

**Objectif** : API calendrier, table division_assignments, commandes /syncdiv et /creationchaneldiv (Guild 1 vs 2).

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/modules/divisions/fetchAndParseCalendar.ts` | Appel calendarApi + validation. |
| 2 | `src/modules/divisions/resolveTeamFromCalendarEntry.ts` | Associer entrée API (nom ou id) à team en base. |
| 3 | `src/modules/divisions/upsertDivisionAssignments.ts` | Mise à jour division_assignments + teams.division_number, division_group. |
| 4 | `src/commands/syncdiv.ts` | Staff check → fetchAndParseCalendar → resolve + upsert pour chaque entrée → réponse résumé + anomalies. |
| 5 | `src/modules/divisions/getTeamsByDivision.ts` | Récupérer équipes par division_number. |
| 6 | `src/modules/divisions/findOrCreateDivisionCategory.ts` | DIVISION 1, si pleine DIVISION 1 - 2, etc. |
| 7 | `src/modules/discord/moveChannelToCategory.ts`, `renameChannel.ts`, `renameRole.ts` | Utilisés par creationchaneldiv. |
| 8 | `src/modules/divisions/applyCreationChannelDivGuild1.ts` | Créer catégorie division si besoin ; pour chaque équipe de la division : déplacer channel, renommer channel et rôle (format 1A-team-alpha). |
| 9 | `src/modules/divisions/applyCreationChannelDivGuild2.ts` | Créer catégorie ; pour chaque équipe : créer rôle + channel, nommer 1A-team-alpha ; persister comme état actif (team_discord_state) ; ne pas supprimer ressources Guild 1. |
| 10 | `src/commands/creationchaneldiv.ts` | Paramètre numero_division 1–12 ; détecter guild → si Guild 1 appeler applyCreationChannelDivGuild1, sinon applyCreationChannelDivGuild2. |

**Critère de fin** : /syncdiv remplit les divisions ; /creationchaneldiv sur Guild 1 déplace/renomme ; sur Guild 2 crée tout et met à jour l’état actif.

---

## Phase 11 — Jobs restants et réconciliation

**Objectif** : retryPendingActions, reconcileDiscordState, archiveMissingTeams ; réconciliation au démarrage.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/jobs/retryPendingActions.ts` | Lock → sélectionner pending_actions (status pending/blocked, next_attempt_at <= now) → pour chaque action réexécuter (création channel/role, sync member, etc.) → mettre à jour status/attempt_count/next_attempt_at. |
| 2 | `src/jobs/reconcileDiscordState.ts` | Parcourir discord_resources actives ; pour chaque ressource, reconcileResource ; si absente sur Discord, marquer inactif + alerte ou pending. |
| 3 | `src/jobs/archiveMissingTeams.ts` | (Optionnel) Équipes non vues depuis X jours → status archived. |
| 4 | Bootstrap : après init Discord, lancer une fois reconcileDiscordState (ou job différé). |
| 5 | Scheduler : enregistrer retryPendingActions et reconcileDiscordState (intervalle défini). |

**Critère de fin** : Pending actions retentées ; incohérences Discord/DB détectées et loguées ou réparées.

---

## Phase 12 — Interface web

**Objectif** : Authentification, tableau de bord, liste équipes, détail équipe, pending actions, état jobs, logs, boutons rescan / réconciliation.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/modules/web/session.ts` | express-session, cookie httpOnly, secure si NODE_ENV=production. |
| 2 | `src/modules/web/auth.ts` | Login (WEB_ADMIN_USERNAME, bcrypt compare), logout ; middleware requireAuth. |
| 3 | `src/modules/web/csrf.ts` | Token CSRF pour formulaires. |
| 4 | `src/modules/web/rateLimit.ts` | express-rate-limit sur /login et routes sensibles. |
| 5 | `src/modules/web/routes/*` | dashboard, teams, teamDetail, pendingActions, jobs, logs, integrations, rescan, reconcile. Chaque route : requireAuth, délégation aux repositories/services, rendu EJS. |
| 6 | `src/modules/web/views/*` | layout, login, dashboard, teams, teamDetail, pendingActions, jobs, logs. Escape output. |
| 7 | `src/bootstrap/initWeb.ts` | Express, helmet, rateLimit, session, auth routes, routes protégées, EJS, écoute WEB_PORT. |
| 8 | Bootstrap : si ENABLE_WEB_UI, initWeb. |

**Critère de fin** : Connexion admin OK ; pages accessibles ; actions manuelles (rescan, reconcile) déclenchables.

---

## Phase 13 — Sécurité, audit, santé, shutdown

**Objectif** : Audit log sur actions critiques ; healthcheck ; gestion unhandledRejection / uncaughtException ; shutdown propre.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `src/db/repositories/auditLogs.ts` | insert(actor_type, actor_id, action, target_type, target_id, details_json). |
| 2 | Appels audit depuis : handlers boutons, commandes slash, création rôle/channel, sync joueur, échecs critiques. |
| 3 | Route GET /health (sans auth) : DB ok, bot connecté (optionnel). |
| 4 | process.on('unhandledRejection'), process.on('uncaughtException') : log + shutdown propre. |
| 5 | Shutdown : stop scheduler, fermer DB, arrêter serveur web, client Discord destroy. |

**Critère de fin** : Aucune fuite au redémarrage ; healthcheck répond ; audit logs remplis.

---

## Phase 14 — Tests et déploiement

**Objectif** : Scripts npm, tests unitaires (utils, normalisation, hash), tests d’intégration (DB, API mockée), README et déploiement.

| Ordre | Fichier / action | Description |
|-------|------------------|-------------|
| 1 | `npm run dev` | ts-node src/index.ts ou nodemon. |
| 2 | `npm run build` | tsc. |
| 3 | `npm run start` | node dist/index.js. |
| 4 | `npm run migrate` | Exécuter migrations seules. |
| 5 | `npm run test` | vitest. |
| 6 | `npm run lint` | eslint. |
| 7 | Tests unitaires : normalizeTeamName, snapshotHash, compareWithDb (mock DB). |
| 8 | Tests d’intégration : repositories avec SQLite en mémoire. |
| 9 | README : prérequis, .env.example, install, migrate, dev, start. |
| 10 | Document déploiement : variables, backup SQLite, logs, surveillance. |

---

## Ordre des fichiers à créer (résumé)

1. Config + core (logger, errors, utils, locks, security).  
2. DB + migrations + repositories.  
3. Types.  
4. Intégrations (API + Google Script).  
5. Module teams (fetch, normalize, compare, snapshot).  
6. Bootstrap DB + Discord + events + commands (stubs).  
7. Module discord (catégorie, rôle, salon, embeds, boutons).  
8. Job scan + flux inscription + bouton création.  
9. Module players + job sync + guildMemberAdd.  
10. Module divisions + syncdiv + creationchaneldiv.  
11. Jobs retry + reconcile + archive.  
12. Interface web (auth, routes, vues).  
13. Audit, healthcheck, shutdown.  
14. Tests et scripts de déploiement.

Ce plan permet d’avancer pas à pas et de valider chaque bloc avant de passer au suivant.
