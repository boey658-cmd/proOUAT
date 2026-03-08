# Audit final – Production (250+ équipes)

**Projet :** Bot Discord + backend Node.js TypeScript, SQLite, gestion équipes tournoi LoL.  
**Objectif :** Robustesse, sécurité, stabilité, scalabilité pour >250 équipes, sans refactor massif.

---

# PARTIE 1 — ÉTAT ACTUEL

## Ce qui est déjà solide

### Architecture et structure
- **Modulaire** : séparation nette `config/`, `db/`, `discord/`, `modules/` (api, teams, discord, googleSheets, divisions), `jobs/`, `core/jobs/`.
- **Point d’entrée clair** : `index.ts` → DB + migrations → client Discord → sur `ready` : commandes + `startJobs`.
- **Migrations versionnées** : `migrations/001_initial.sql` + `schema_migrations`, exécution en transaction par fichier.
- **Config centralisée** : tout depuis `.env` via `config/` (api, discord, channels, discordLimits, jobs, googleSheets), pas de secrets en dur.

### Base de données
- **SQLite WAL** : `journal_mode = WAL` dans `db/database.ts` (meilleure concurrence lecture/écriture).
- **Contraintes utiles** : `teams.team_api_id` UNIQUE ; `discord_resources (discord_guild_id, resource_type, discord_resource_id)` UNIQUE ; `team_discord_state.team_id` UNIQUE avec upsert.
- **Sync par équipe en transaction** : dans `syncTeamsWithDatabase`, chaque équipe est traitée dans un `db.transaction()` (atomicité insert/update par équipe).
- **Pas de suppression automatique** : équipes désinscrites passent en `archived`, pas de DELETE ; historique conservé.

### Concurrence et anti double-clic
- **Lock création d’équipe Discord** : `createTeamLock.ts` (clé `teamApiId:guildId`), TTL 3 min, purge des entrées expirées → évite double clic et blocage infini après crash.
- **Lock job** : `jobLock.ts` (en mémoire) évite qu’un second run du job ne démarre tant que le premier n’a pas fini (dans le même processus).
- **Vérifications avant création** : `isTeamAlreadyCreatedOnGuild` (état DB) + `isTeamCreationInProgress` avant d’acquérir le lock ; revalidation DB après `deferReply`.

### Limites Discord
- **Seuils configurables** : `DISCORD_ROLE_LIMIT_SAFE_THRESHOLD` (240), `DISCORD_CHANNEL_LIMIT_SAFE_THRESHOLD` (480), `CATEGORY_MAX_CHANNELS_SAFE_LIMIT` (50).
- **Vérification avant création** : `checkDiscordLimits(guild)` dans `handleCreateTeamButton` ; si limite rôles → mode dégradé (salon seul) ; si limite salons → refus total.
- **Catégories** : `findOrCreateTeamCategory` réutilise une catégorie existante (S21, S21-2, …) selon la place ; une seule catégorie partagée par équipe évite les doublons (insert conditionnel dans `persistTeamDiscordResources`).

### API métier (rate limit / robustesse)
- **User API** : cache mémoire TTL (`USER_API_CACHE_TTL_MS`), retry sur 429 avec backoff exponentiel (`REQUEST_RETRY_COUNT`, `REQUEST_RETRY_BASE_DELAY_MS`), concurrence limitée (`USER_API_MAX_CONCURRENT`) dans `buildEnrichedTeam`.
- **Pas de crash sur erreur équipe** : dans `scanTournamentRegistrations`, une équipe en échec est poussée dans `errors`, le scan continue.

### Notifications et erreurs
- **Notify** : `notifyNewTeams`, `notifyUpdatedTeams`, `notifyRemovedTeams`, `notifyReactivatedTeams` ne lancent pas ; compteurs `sent` / `failed` ; échec d’un message n’arrête pas les autres.
- **Job** : `try/catch` global dans `runRegistrationSyncJob`, erreurs dans `errors[]`, `releaseJobLock` dans `finally` → lock toujours relâché.

### Rôle / membre
- **syncMemberTeamRole** : vérification réelle après `member.roles.add` (refetch + `cache.has(roleId)`), logs détaillés (position rôle, manageable), pas de “succès” sans confirmation.
- **Rôle supprimé côté Discord** : `member.roles.add` échoue → erreur catchée, loggée, pas de crash.

### Nom d’équipe
- **resolveTeamDisplayName** + **isValidTeamName** : rejet des placeholders ("POSSIBLY UNDEFINED", etc.), fallback `Team-{teamApiId}` ; **buildNormalizedTeam** sécurise aussi en entrée.

---

## Ce qui est déjà sécurisé

- **Token / config** : pas de secret en dur ; `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` requis au démarrage.
- **Staff** : `getAllowedStaffRoleIds()` pour les boutons / actions sensibles ; vérification dans `handleCreateTeamButton`.
- **Intent Discord** : `Guilds` + `GuildMembers` (nécessaire pour `guildMemberAdd` et rôles).

---

## Ce qui est déjà scalable (dans une seule instance)

- **Scan** : erreurs par équipe collectées ; pas d’arrêt global.
- **User API** : cache + concurrence limitée + retry 429.
- **Sync DB** : transaction par équipe (pas une grosse transaction sur tout le scan).
- **Notify** : boucle séquentielle mais messages indépendants ; échec isolé.
- **Limites Discord** : seuils respectés avant création ; mode dégradé si trop de rôles.

---

## Ce qui est déjà bien structuré

- **Flux unique** : scan → sync DB → notify (nouveau / modifié / retiré / réactivé) → Google Sheets (créations uniquement).
- **Séparation des responsabilités** : extractors, normalizer, repos DB, messages Discord, embeds, senders.
- **Types** : `NormalizedTeam`, `SyncResult`, `TeamUpdateDiff`, `RemovedTeamInfo`, `ReactivatedTeamInfo`, etc.

---

# PARTIE 2 — RISQUES À CORRIGER

## Critique

| # | Risque | Détail |
|---|--------|--------|
| C1 | **Lock job perdu au crash** | `jobLock.ts` : lock en mémoire uniquement. Si le processus crash pendant le job, au redémarrage le lock n’existe plus. Pas de double exécution dans le même processus, mais **aucun TTL** : si le job boucle ou bloque, le lock n’est jamais libéré (jusqu’au redémarrage). Variable `JOB_LOCK_TTL_SECONDS` dans `.env.example` **jamais lue**. |
| C2 | **Table `job_locks` inutilisée** | Migration crée `job_locks (job_name, locked_at, lock_owner, expires_at)` mais le code n’y écrit jamais. Impossible de voir en DB si un job est en cours ; pas de lock survivant au redémarrage ni partagé entre instances. |
| C3 | **Pas de protection multi-instance** | Un seul processus = un seul lock en mémoire. Si deux instances (ex. redémarrage avec ancien process encore actif, ou déploiement mal orchestré) tournent, les deux peuvent exécuter le job en parallèle → double scan, double sync, double notifications, risque d’incohérence DB. |
| C4 | **Google Sheets : échecs invisibles dans le résultat du job** | `syncTeamToGoogleSheets` ne throw pas ; les échecs sont seulement loggés. Le job ne remonte pas les échecs dans `errors[]` ni dans un compteur `googleSheetsFailed`. Impossible de monitorer “X équipes non envoyées aux Sheets” sans parser les logs. |

## Important

| # | Risque | Détail |
|---|--------|--------|
| I1 | **Durée du job avec 250+ équipes** | Scan = N équipes × (1 getTeamById + M appels getUserById avec concurrence limitée). Avec 250 équipes et ~5 joueurs/équipe, même avec cache et concurrence 3, le job peut dépasser l’intervalle (ex. 5 min). Le lock évite le chevauchement mais le **prochain run attend la fin du précédent** ; si un run dure 10 min, la cadence réelle devient 10 min. Pas d’alerte si le job dépasse X minutes. |
| I2 | **Spam de notifications** | Si une équipe alterne désinscription / réinscription à chaque scan (API instable ou données incohérentes), le staff reçoit à chaque fois “équipe désinscrite” puis “équipe réinscrite”. Pas de déduplication ni de délai minimal entre deux notifications pour la même équipe. |
| I3 | **Rôle/salon créés mais DB en échec** | Dans `handleCreateTeamButton`, si `persistTeamDiscordResources` throw (ex. UNIQUE sur channel/role si cas limite), on log et on fait `clearTeamCreationInProgress`. Les ressources Discord **existent déjà** (rôle + salon créés avant le persist). À la prochaine tentative, `isTeamAlreadyCreatedOnGuild` peut être false si la DB n’a pas été mise à jour → risque de tentative de recréation (bloquée par Discord si même nom, ou doublon). Pas de “réconciliation” automatique (vérifier sur Discord si rôle/salon existent pour cette équipe et mettre à jour la DB). |
| I4 | **Suppression manuelle côté Discord** | Si un admin supprime un rôle ou un salon créé par le bot, la DB garde `active_role_id` / `active_channel_id`. `syncMemberTeamRole` échouera (rôle introuvable) et loguera ; pas de mise à jour de `team_discord_state` ni de `discord_resources.is_active`. Les données restent incohérentes jusqu’à action manuelle. |
| I5 | **Double insert discord_resources (channel/role)** | Seule la **catégorie** est protégée par un “find avant insert”. Pour channel et role, en cas de retry après erreur (ex. timeout après création Discord mais avant persist), une seconde tentative peut provoquer une erreur UNIQUE en base. Actuellement catch dans `handleCreateTeamButton` avec message utilisateur ; pas de “upsert” ou “insert or ignore” pour ces lignes. |
| I6 | **Index / requêtes à 250+ équipes** | Pas d’index évident manquant pour le flux actuel (`team_api_id`, `team_id`, `discord_guild_id` sont indexés). Les `findAllTeams()` puis filtre en mémoire pour `removedTeams` restent O(n) avec n = nombre d’équipes ; acceptable à 250. À surveiller si la base grossit beaucoup (500+ équipes). |

## Amélioration

| # | Risque | Détail |
|---|--------|--------|
| A1 | **Pas de stop propre** | `index.ts` ne gère pas SIGINT/SIGTERM : pas d’appel à `stopJobs()`, ni `destroyClient()`, ni fermeture DB. En production (PM2, Docker, etc.) un SIGTERM peut laisser le job en cours sans libération explicite du lock (résolu au crash du process, mais pas de shutdown propre). |
| A2 | **Logs non structurés** | Mélange de `console.log` / `console.info` / `teamsLogger` / `discordLogger` / `createJobLogger`. Pas de format commun (ex. JSON) ni de niveau centralisé (LOG_LEVEL partiel). Difficile pour une stack de logs (ELK, Datadog) sans adapter le format. |
| A3 | **Sauvegarde SQLite** | Aucune mention de backup automatique de `tournament.db`. En production, une corruption ou une suppression du fichier = perte de l’état (équipes, joueurs, discord_resources, team_discord_state). |
| A4 | **Audit / traçabilité** | Table `audit_logs` présente en migration mais pas utilisée dans le code parcouru. Pas d’écriture systématique des actions sensibles (création équipe Discord, changement de statut, etc.). |
| A5 | **Intent GuildMembers** | `GuildMembers` peut nécessiter “Privileged Intent” selon le nombre de membres ; à activer dans le portail Discord. Sans cela, `guildMemberAdd` ou le cache des membres peuvent être incomplets. |
| A6 | **Hiérarchie des rôles** | Le bot doit avoir un rôle **au-dessus** des rôles d’équipe pour pouvoir les attribuer. `syncMemberTeamRole` logue `manageable` (role.editable) ; si false, le rôle n’est pas attribué. Pas de doc ni de check au démarrage. |

---

# PARTIE 3 — PLAN DE CORRECTION MINIMAL ET SÛR

## C1 + C2 : Lock job avec TTL et optionnellement DB

- **Pourquoi** : Éviter qu’un job bloqué garde le lock indéfiniment ; permettre (plus tard) un lock partagé via DB pour multi-instance.
- **Risque si on ne fait pas** : Un job qui boucle ou qui est très long bloque tout jusqu’au redémarrage ; en multi-instance, double exécution.
- **Fichiers** : `src/core/jobs/jobLock.ts`, éventuellement `src/config/jobs.ts` (lire `JOB_LOCK_TTL_SECONDS`).
- **Safe / risqué** : Safe si on se contente d’ajouter un TTL en mémoire (timestamp + expiration). Plus risqué si on bascule sur la table `job_locks` (migration déjà en place, mais il faut gérer expires_at et nettoyage).
- **Casser l’existant** : Non, si le comportement “un seul run à la fois” est conservé.
- **Implémentation conservatrice** :  
  - Lire `JOB_LOCK_TTL_SECONDS` (défaut 300).  
  - Dans `jobLock.ts`, stocker pour chaque job `{ lockedAt: number }` au lieu d’un booléen.  
  - `tryAcquireJobLock` : si lock existant et `Date.now() - lockedAt > TTL * 1000`, considérer le lock expiré, le libérer et en reprendre un.  
  - `isJobLocked` : retourner false si lock expiré.  
  - Ne pas toucher à la table `job_locks` dans un premier temps (éviter régression).

## C3 : Multi-instance

- **Pourquoi** : En production, une seule instance est le cas le plus simple ; le lock DB permettrait d’éviter les doubles runs si on scale un jour.
- **Risque si on ne fait pas** : Double exécution si deux processus.
- **Fichiers** : `src/core/jobs/jobLock.ts`, `src/db/repositories/` (nouveau ou existant pour job_locks).
- **Safe / risqué** : Plus risqué (concurrence DB, timezone, nettoyage des vieux locks).
- **Recommandation** : **Ne pas implémenter maintenant.** Documenter que le déploiement doit être **single instance**. Si besoin futur de multi-instance, introduire un lock basé sur `job_locks` avec `expires_at` et nettoyage au démarrage.

## C4 : Remonter les échecs Google Sheets dans le job

- **Pourquoi** : Visibilité et monitoring sans dépendre uniquement des logs.
- **Risque si on ne fait pas** : Impossible de savoir combien d’équipes n’ont pas été synchronisées aux Sheets.
- **Fichiers** : `src/jobs/runRegistrationSyncJob.ts`, éventuellement l’interface `RegistrationSyncJobResult`.
- **Safe / risqué** : Très safe.
- **Casser l’existant** : Non (ajout de champs optionnels).
- **Implémentation conservatrice** :  
  - Dans la boucle `for (const team of syncResult.createdTeams) { await syncTeamToGoogleSheets(team); }`, accumuler `googleSheetsSent` et `googleSheetsFailed` à partir du retour de `syncTeamToGoogleSheets`.  
  - Ajouter au `RegistrationSyncJobResult` : `googleSheetsSent?: number`, `googleSheetsFailed?: number`.  
  - Inclure ces champs dans le log “Fin du job” et dans l’objet retourné.

## I1 : Durée du job (250+ équipes)

- **Pourquoi** : Détecter un run anormalement long et éviter de croire que “le job ne tourne pas”.
- **Risque si on ne fait pas** : Runs de 10–15 min sans alerte ; intervalle effectif inconnu.
- **Fichiers** : `src/jobs/runRegistrationSyncJob.ts`, `src/core/jobs/jobLogger.ts` (déjà utilisé).
- **Safe** : Oui.
- **Implémentation conservatrice** :  
  - Logger la durée en fin de job (déjà le cas via `durationMs`).  
  - Ajouter un log **warn** si `durationMs > intervalMinutes * 60 * 1000 * 0.8` (ex. > 80 % de l’intervalle).  
  - Optionnel : variable d’env `JOB_DURATION_WARN_MS` pour seuil personnalisé.

## I2 : Spam notifications (désinscription / réinscription)

- **Pourquoi** : Limiter le bruit si l’API ou les données oscillent.
- **Risque si on ne fait pas** : Beaucoup de messages pour la même équipe en peu de temps.
- **Fichiers** : Option 1 – `src/modules/teams/syncTeamsWithDatabase.ts` (ne pas remonter removed/reactivated si même équipe dans les deux listes au même run — déjà impossible car une équipe est soit dans le scan soit absente). Option 2 – déduplication côté notification (cache “dernière notif équipe X” + fenêtre 1 h).  
- **Recommandation** : **Amélioration seulement.** Documenter le risque ; si ça apparaît en prod, ajouter un cache court (ex. 15 min) “équipe X déjà notifiée (removed/reactivated)” avant envoi. Pas de changement du flux sync.

## I3 : Rôle/salon créés, DB en échec

- **Pourquoi** : Éviter état incohérent et double tentative de création.
- **Risque si on ne fait pas** : Rôle/salon orphelins côté Discord, équipe “non créée” en DB.
- **Fichiers** : `src/modules/discord/interactions/handleCreateTeamButton.ts`, éventuellement `src/modules/discord/resources/persistTeamDiscordResources.ts`.
- **Safe** : Moyen (logique de réconciliation à ajouter avec précaution).
- **Implémentation conservatrice** :  
  - Dans le `catch` après `persistTeamDiscordResources`, en plus du log et du message utilisateur : **tenter** un second `persistTeamDiscordResources` dans un bloc try/catch (idempotent si les lignes existent déjà). Pour éviter UNIQUE sur channel/role : dans `persistTeamDiscordResources` (ou dans un wrapper), pour **channel** et **role**, faire un “find by (guild_id, type, resource_id)” et n’insérer que si absent (comme pour la catégorie).  
  - Ainsi, un retry après erreur ne provoque plus d’UNIQUE ; si la première écriture a partiellement réussi (ex. catégorie + channel écrits, role en échec), le retry complète sans dupliquer.

## I4 : Suppression manuelle rôle/salon Discord

- **Pourquoi** : Garder la DB alignée avec la réalité Discord.
- **Risque si on ne fait pas** : État incohérent jusqu’à correction manuelle.
- **Fichiers** : Nouveau module ou fonction “réconciliation” (optionnel), ou traitement dans un job dédié / commande admin.
- **Recommandation** : **Ne pas automatiser tout de suite.** Documenter : “En cas de suppression manuelle d’un rôle/salon, mettre à jour ou désactiver les lignes concernées en base (discord_resources, team_discord_state).” Si besoin, ajouter plus tard une commande ou un job “vérifier présence des rôles/salons actifs” et marquer `is_active = 0` ou mettre à jour `team_discord_state` pour les ressources manquantes.

## I5 : Double insert discord_resources (channel/role)

- **Pourquoi** : Rendre le flux idempotent et éviter l’erreur UNIQUE en cas de retry.
- **Risque si on ne fait pas** : Erreur utilisateur “ressources peut-être déjà créées” et possible incohérence.
- **Fichiers** : `src/modules/discord/resources/persistTeamDiscordResources.ts`, `src/db/repositories/discordResources.ts` (déjà `findDiscordResourceByGuildAndTypeAndId`).
- **Safe** : Oui.
- **Casser l’existant** : Non.
- **Implémentation conservatrice** : Pour **channel** et **role**, avant chaque `insertDiscordResource`, appeler `findDiscordResourceByGuildAndTypeAndId(guildId, type, resourceId)` ; si une ressource existe déjà, ne pas réinsérer (comme pour la catégorie). Comportement métier inchangé quand tout se passe bien.

## A1 : Arrêt propre (SIGTERM / SIGINT)

- **Pourquoi** : Libérer le lock et fermer les connexions proprement.
- **Fichiers** : `src/index.ts`.
- **Safe** : Oui.
- **Implémentation conservatrice** : Enregistrer des handlers pour `SIGINT` et `SIGTERM` qui appellent `stopJobs()` (depuis `bootstrap/startJobs`), puis `destroyClient()` (depuis `discord/client`), puis éventuellement fermeture DB si une API `closeDatabase()` existe. Après 2–3 s, `process.exit(0)` si le process ne s’est pas arrêté.

## A2–A6

- **Logs** : Amélioration progressive (niveau, format) sans refactor massif.  
- **Sauvegarde SQLite** : Documenter et mettre en place un cron/script de backup (copie du fichier ou `sqlite3 .backup`) en dehors du code applicatif.  
- **Audit** : Utiliser `audit_logs` pour les actions sensibles (création équipe Discord, changement de statut d’équipe) dans une phase ultérieure.  
- **Intent / hiérarchie** : Documenter dans la checklist (voir Partie 4) : activer Guild Members (Privileged), placer le rôle du bot au-dessus des rôles d’équipe.

---

# PARTIE 4 — CHECKLIST FINALE PRODUCTION

## Configuration Discord

- [ ] **Token** : `DISCORD_TOKEN` défini, non commité, renouvelé si exposé.
- [ ] **Client ID** : `DISCORD_CLIENT_ID` (portail Discord).
- [ ] **Intents** : `Guilds` + `GuildMembers` ; **Guild Members** activé en “Privileged” dans le portail si le serveur dépasse 100 membres ou pour `guildMemberAdd` fiable.
- [ ] **Hiérarchie** : Le rôle du bot est **au-dessus** de tous les rôles d’équipe (S21, etc.) pour que `role.editable` soit true et que l’attribution de rôles fonctionne.
- [ ] **Permissions du bot** : Gérer les rôles, Gérer les salons, Lire les messages / canaux, Voir les membres, Envoyer des messages, Intégrer des liens (embeds), Utiliser des commandes slash. Sur les salons staff : envoyer des messages, gérer les messages (pour suppression du message après création d’équipe).

## Variables .env (production)

- [ ] **Obligatoires** : `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `API_BASE_URL` (ou `API_BASE_URL_1`), `TOURNAMENT_SLUG`, `TOURNAMENT_ID` (ou `CALENDAR_TOURNAMENT_ID`).
- [ ] **DB** : `DATABASE_PATH` pointant vers un chemin persistant (ex. `/var/app/data/tournament.db`).
- [ ] **Salons** : `STAFF_NEW_TEAM_CHANNEL_ID` (ou `NEW_TEAM_CHANNEL_ID`), `STAFF_ARCHIVE_TEAM_CHANNEL_ID` renseignés.
- [ ] **Staff** : `ALLOWED_STAFF_ROLE_IDS` (IDs des rôles autorisés à cliquer “Créer la team”).
- [ ] **Jobs** : `ENABLE_AUTOMATIC_REGISTRATION_SYNC=true`, `REGISTRATION_SYNC_INTERVAL_MINUTES` (ex. 5).
- [ ] **Limites Discord** : `DISCORD_ROLE_LIMIT_SAFE_THRESHOLD` (ex. 240), `DISCORD_CHANNEL_LIMIT_SAFE_THRESHOLD` (ex. 480), `CATEGORY_MAX_CHANNELS_SAFE_LIMIT` (ex. 50).
- [ ] **API** : `REQUEST_TIMEOUT_MS`, `REQUEST_RETRY_COUNT`, `REQUEST_RETRY_BASE_DELAY_MS`, `USER_API_CACHE_TTL_MS`, `USER_API_MAX_CONCURRENT`.
- [ ] **Google Sheets** : `GOOGLE_SCRIPT_URL_1`, `GOOGLE_SCRIPT_URL_2`, `ENABLE_GOOGLE_SHEETS_SYNC=true` si utilisé.
- [ ] **Lock** : `JOB_LOCK_TTL_SECONDS` (ex. 300) une fois le TTL implémenté en code.

## Jobs

- [ ] Une seule instance du processus en production (pas de scaling horizontal sans lock distribué).
- [ ] Intervalle du job cohérent avec la durée attendue du scan (ex. 5 min si scan < 4 min en charge normale).
- [ ] Vérifier en logs que le job termine bien (“Fin du job”) et que le lock est relâché (pas de “Job déjà en cours” en boucle sauf si un run dépasse l’intervalle).

## Google Sheets

- [ ] URLs Apps Script en `/exec`, accessibles sans auth (ou avec auth gérée côté script).
- [ ] Tester manuellement un envoi (équipe de test) et vérifier le format (DOC 1 : equipe + joueurs ; DOC 2 : equipe).
- [ ] En cas d’échec (réseau, 4xx/5xx), les logs `[googleSheets]` sont suffisants pour diagnostiquer ; après correction C4, le résumé du job indiquera le nombre d’échecs.

## Base SQLite

- [ ] Fichier sur disque persistant (volume ou répertoire dédié).
- [ ] WAL activé (déjà le cas dans le code).
- [ ] Sauvegarde régulière (cron : copie du fichier ou `sqlite3 .backup`) vers un stockage sécurisé.
- [ ] Pas de connexion réseau sur la DB (fichier local uniquement).

## Logs

- [ ] Niveau configuré (`LOG_LEVEL=info` ou `debug` si besoin).
- [ ] Sortie standard (stdout/stderr) capturée par le superviseur (PM2, systemd, Docker) ou un collecteur de logs.
- [ ] Pas de log de token ou de secrets.

## Surveillance après déploiement

- [ ] **Disponibilité** : le processus tourne (PM2, health check, ou équivalent).
- [ ] **Job** : log “Fin du job” avec `durationMs` ; alerte si `durationMs` > seuil (ex. 8 min pour un intervalle de 5 min).
- [ ] **Erreurs** : log “Erreur globale du job” ou `errors.length > 0` dans le résumé → alerte.
- [ ] **Discord** : `notifyFailed`, `updatedNotifyFailed`, `removedNotifyFailed`, `reactivatedNotifyFailed` > 0 → investigation (salon supprimé, permissions, rate limit).
- [ ] **Google Sheets** : après implémentation C4, `googleSheetsFailed` > 0 → investigation.
- [ ] **Limites Discord** : logs “limite rôles atteinte” / “limite salons atteinte” → prévoir mode dégradé ou arrêt des créations.

## Tests manuels essentiels

- [ ] Création d’une équipe via le bouton “Créer la team” : rôle + salon créés, message archivé, message d’origine supprimé, joueurs présents reçoivent le rôle.
- [ ] Nouveau membre rejoint le serveur : il reçoit le rôle de son équipe si `discord_user_id` est en base et rôle actif.
- [ ] Double clic sur “Créer la team” : second clic refusé (“Création déjà en cours” ou équipe déjà créée).
- [ ] Scan avec une équipe nouvelle, une modifiée, une absente du tournoi : les 3 notifications arrivent (nouvelle, modifiée, désinscrite).
- [ ] Équipe désinscrite puis réinscrite au prochain scan : notification “réinscrite”, statut en base repasse à `active`.
- [ ] Limite rôles : créer des rôles jusqu’au seuil (ou simuler), puis “Créer la team” → mode dégradé (salon seul) ou refus si limite salons.

## Scénarios d’erreur à simuler

- [ ] **API user 429** : vérifier retry + backoff dans les logs, pas de crash du job.
- [ ] **Salon staff inexistant** : `STAFF_NEW_TEAM_CHANNEL_ID` invalide → notify échoue (failed), job continue.
- [ ] **Google Sheets URL invalide** : échec loggé, job continue ; après C4, compteur d’échecs dans le résumé.
- [ ] **Crash pendant le job** : tuer le process (SIGKILL) pendant un run, redémarrer → au prochain intervalle le job redémarre (lock perdu). Après implémentation du TTL, un run bloqué libère le lock après TTL.

## Déploiement

- [ ] **Single instance** : une seule instance du bot (pas de réplication horizontale sans lock distribué).
- [ ] **Redémarrage** : redémarrage propre (SIGTERM) avec handlers (A1) pour libérer le lock et fermer le client Discord.
- [ ] **Migrations** : exécutées au démarrage (`runMigrations()` dans `index.ts`) ; pas de migration manuelle en prod sans backup préalable.

---

*Document généré dans le cadre de l’audit final du projet. À mettre à jour après application des corrections (C1, C2, C4, I5, A1, etc.).*
