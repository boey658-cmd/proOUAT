# Arborescence complète du projet

Convention : **une fonction importante = un fichier**. Fichiers regroupés par domaine.

```
proOUAT/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── eslint.config.js
├── prettier.config.js
├── README.md
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ARBORESCENCE.md
│   ├── PLAN-IMPLEMENTATION.md
│   └── SCHEMA-SQL.md
│
├── migrations/
│   ├── 001_initial.sql
│   ├── 002_xxx.sql
│   └── run.ts
│
├── src/
│   ├── index.ts                    # Point d'entrée → bootstrap
│   │
│   ├── config/
│   │   ├── index.ts                # Export central config
│   │   ├── env.ts                  # Chargement et validation .env
│   │   ├── constants.ts            # Limites Discord, noms catégories, etc.
│   │   └── guilds.ts               # Config des 2 guilds (IDs, labels)
│   │
│   ├── core/
│   │   ├── index.ts
│   │   ├── logger.ts               # Pino, niveaux, masquage secrets
│   │   ├── errors.ts               # Classes d'erreurs (ApiError, DiscordError, DbError, ValidationError)
│   │   ├── scheduler.ts            # Planification jobs (cron)
│   │   ├── locks.ts                # Acquire/release job lock (job_locks)
│   │   ├── requestId.ts            # Génération/correlation request_id
│   │   ├── security/
│   │   │   ├── index.ts
│   │   │   ├── staffCheck.ts       # Vérifier rôle staff autorisé
│   │   │   ├── buttonNonce.ts     # Validation customId (team + action + nonce)
│   │   │   └── maskSecrets.ts     # Masquer secrets dans logs/erreurs
│   │   └── utils/
│   │       ├── index.ts
│   │       ├── normalizeTeamName.ts
│   │       ├── normalizeLolPseudo.ts
│   │       ├── normalizeDivisionGroup.ts
│   │       ├── slugifyChannelName.ts
│   │       ├── sanitizeRoleName.ts
│   │       ├── snapshotHash.ts    # Hash équipe + joueurs triés
│   │       └── sortPlayersStable.ts
│   │
│   ├── db/
│   │   ├── index.ts                # Connexion, WAL
│   │   ├── migrate.ts              # Exécution migrations
│   │   ├── transaction.ts         # Helper transaction si besoin
│   │   └── repositories/
│   │       ├── index.ts
│   │       ├── guilds.ts
│   │       ├── teams.ts
│   │       ├── players.ts
│   │       ├── teamSnapshots.ts
│   │       ├── discordResources.ts
│   │       ├── teamDiscordState.ts
│   │       ├── divisionAssignments.ts
│   │       ├── pendingActions.ts
│   │       ├── staffMessages.ts
│   │       ├── auditLogs.ts
│   │       ├── jobLocks.ts
│   │       └── appSettings.ts
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── api.ts                  # Types payloads API (tournament, team, user, calendar)
│   │   ├── team.ts                 # Team normalisée, joueur normalisé
│   │   ├── discord.ts              # Ressource Discord, état guild
│   │   ├── division.ts
│   │   └── audit.ts
│   │
│   ├── modules/
│   │   ├── integrations/
│   │   │   ├── index.ts
│   │   │   ├── client.ts           # Axios instance, timeout, retries
│   │   │   ├── tournamentApi.ts    # GET tournament (liste équipes)
│   │   │   ├── teamApi.ts          # GET team/{id} (joueurs)
│   │   │   ├── userApi.ts          # GET user/{id} (Discord ID)
│   │   │   ├── calendarApi.ts      # GET calendar/byTournament/{id}
│   │   │   ├── schemas/
│   │   │   │   ├── index.ts
│   │   │   │   ├── tournament.ts   # Schéma Zod tournoi
│   │   │   │   ├── team.ts
│   │   │   │   ├── user.ts
│   │   │   │   └── calendar.ts
│   │   │   └── googleScript/
│   │   │       ├── index.ts
│   │   │       ├── sendToScript1.ts
│   │   │       └── sendToScript2.ts
│   │   │
│   │   ├── teams/
│   │   │   ├── index.ts
│   │   │   ├── fetchTournamentTeams.ts   # Orchestration API tournoi → équipes → joueurs → user
│   │   │   ├── fetchTeamPlayers.ts
│   │   │   ├── fetchUserDiscordId.ts
│   │   │   ├── normalizeTeam.ts          # Objet équipe normalisé
│   │   │   ├── computeSnapshotHash.ts
│   │   │   ├── compareWithDb.ts          # Nouvelle / modifiée / inchangée
│   │   │   ├── upsertTeamAndPlayers.ts
│   │   │   ├── createTeamSnapshot.ts
│   │   │   ├── detectTeamChanges.ts      # Diff pour message staff (joueurs ajoutés/retirés, nom)
│   │   │   └── resolveTeamPresence.ts    # Pour chaque joueur : présent sur guild ou non
│   │   │
│   │   ├── players/
│   │   │   ├── index.ts
│   │   │   ├── resolvePresenceOnGuild.ts  # discord_user_id → présent sur guild ?
│   │   │   ├── syncTeamMembersToGuild.ts  # Attribuer rôles, accès channel
│   │   │   ├── assignRoleToMember.ts
│   │   │   └── updateLastMembershipSync.ts
│   │   │
│   │   ├── discord/
│   │   │   ├── index.ts
│   │   │   ├── findOrCreateCategoryS21.ts
│   │   │   ├── findOrCreateDivisionCategory.ts  # DIVISION 1, DIVISION 1 - 2, etc.
│   │   │   ├── createTeamRole.ts
│   │   │   ├── createTeamChannel.ts
│   │   │   ├── checkDiscordLimits.ts      # Rôles, channels, par catégorie
│   │   │   ├── ensureTeamRoleAndChannel.ts # Orchestration création (avec limites)
│   │   │   ├── moveChannelToCategory.ts
│   │   │   ├── renameChannel.ts
│   │   │   ├── renameRole.ts
│   │   │   ├── persistDiscordResources.ts
│   │   │   ├── reconcileResource.ts      # Vérifier rôle/channel/catégorie existe sur Discord
│   │   │   ├── embeds/
│   │   │   │   ├── index.ts
│   │   │   │   ├── newTeamEmbed.ts
│   │   │   │   └── teamChangedEmbed.ts
│   │   │   ├── buttons/
│   │   │   │   ├── index.ts
│   │   │   │   ├── createChannelTeam.ts   # Handler bouton "Créer channel équipe"
│   │   │   │   ├── refreshPresence.ts
│   │   │   │   └── markTreated.ts
│   │   │   └── permissions.ts             # Vérifier perms bot, hiérarchie rôles
│   │   │
│   │   ├── divisions/
│   │   │   ├── index.ts
│   │   │   ├── fetchAndParseCalendar.ts
│   │   │   ├── resolveTeamFromCalendarEntry.ts  # Associer entrée API → team en base
│   │   │   ├── upsertDivisionAssignments.ts
│   │   │   ├── getTeamsByDivision.ts
│   │   │   ├── createDivisionCategoryIfNeeded.ts
│   │   │   ├── applyCreationChannelDivGuild1.ts  # Déplacer + renommer
│   │   │   └── applyCreationChannelDivGuild2.ts  # Créer rôle + channel
│   │   │
│   │   └── web/
│   │       ├── index.ts            # Express app, routes
│   │       ├── auth.ts             # Middleware auth, login, logout
│   │       ├── session.ts          # Session config
│   │       ├── csrf.ts
│   │       ├── rateLimit.ts
│   │       ├── routes/
│   │       │   ├── index.ts
│   │       │   ├── dashboard.ts
│   │       │   ├── teams.ts
│   │       │   ├── teamDetail.ts
│   │       │   ├── pendingActions.ts
│   │       │   ├── jobs.ts
│   │       │   ├── logs.ts
│   │       │   ├── integrations.ts
│   │       │   ├── rescan.ts
│   │       │   └── reconcile.ts
│   │       └── views/              # EJS
│   │           ├── layout.ejs
│   │           ├── login.ejs
│   │           ├── dashboard.ejs
│   │           ├── teams.ejs
│   │           ├── teamDetail.ejs
│   │           ├── pendingActions.ejs
│   │           ├── jobs.ejs
│   │           └── logs.ejs
│   │
│   ├── commands/
│   │   ├── index.ts                # Enregistrement global des slash commands
│   │   ├── syncdiv.ts
│   │   ├── creationchaneldiv.ts
│   │   ├── scanteams.ts
│   │   ├── syncmembers.ts
│   │   ├── teaminfo.ts
│   │   └── retrypending.ts
│   │
│   ├── events/
│   │   ├── index.ts                # Enregistrement des events
│   │   ├── ready.ts
│   │   ├── interactionCreate.ts   # Routage slash / bouton
│   │   ├── guildMemberAdd.ts
│   │   ├── guildCreate.ts
│   │   └── guildDelete.ts
│   │
│   ├── jobs/
│   │   ├── index.ts                # Enregistrement des jobs dans le scheduler
│   │   ├── scanTournamentTeams.ts
│   │   ├── syncTeamMembership.ts
│   │   ├── retryPendingActions.ts
│   │   ├── reconcileDiscordState.ts
│   │   └── archiveMissingTeams.ts
│   │
│   └── bootstrap/
│       ├── index.ts                # run() : ordre d'init
│       ├── initDb.ts
│       ├── initWeb.ts
│       ├── initDiscord.ts
│       ├── registerCommands.ts
│       └── startScheduler.ts
│
└── tests/
    ├── unit/
    │   ├── utils/
    │   ├── integrations/
    │   └── teams/
    ├── integration/
    │   ├── db/
    │   └── api/
    └── mocks/
        ├── discord.ts
        └── api.ts
```

---

## Fichiers à créer en priorité (ordre logique)

Voir **PLAN-IMPLEMENTATION.md** pour l’ordre détaillé des créations et des dépendances entre fichiers.
