# Audit charge et scalabilité (250+ équipes)

**Objectif :** Identifier les risques et correctifs minimalistes quand le volume atteint 250+ équipes, sans refactor ni changement d’architecture.

**Référence code :** `runRegistrationSyncJob`, `scanTournamentRegistrations`, `buildEnrichedTeam`, `syncTeamsWithDatabase`, `notifyNewTeams` / `sendNewTeamMessage`, `syncTeamToGoogleSheets`, `findOrCreateTeamCategory`, `checkDiscordLimits`.

---

# PARTIE 1 — RISQUES DE CHARGE

## 1.1 Temps total du job registrationSync

**Flux actuel (séquentiel dans l’ordre) :**
1. 1 appel API tournoi (`getTournament` ou `getTournamentByTournamentId`)
2. Pour chaque équipe du tournoi (N) : `buildEnrichedTeam` → 1 `getTeamById` + M appels `getUserById` (M = joueurs + staff, concurrence limitée à `USER_API_MAX_CONCURRENT`, défaut 3)
3. Sync DB : N transactions (une par équipe) + 1 `findAllTeams()` + boucle sur toutes les équipes pour removed
4. Notify : pour chaque nouvelle équipe, `sendNewTeamMessage` (fetch channel, fetch guild, enrichTeamWithPresence = jusqu’à M `guild.members.fetch` par équipe, puis send)
5. Idem pour updated / removed / reactivated (un message par équipe concernée)
6. Google Sheets : pour chaque nouvelle équipe, 2 POST (DOC 1 + DOC 2) en séquence

**Estimation à 250 équipes, ~5 joueurs/équipe :**
- API tournoi : 1
- API team : 250
- API user : au pire 250 × 5 = 1250 ; avec cache (TTL 2 min) et concurrence 3, le premier cycle fait ~1250/3 requêtes réelles (hors cache). Ordre de grandeur : 2–5 min pour le scan si peu de cache.
- Sync DB : 250 transactions + 1 SELECT total teams + 250 itérations pour removed → quelques secondes.
- Notify nouvelles : si 20 nouvelles, 20 × (1 channel fetch + 1 guild fetch + 5 member fetch + 1 send) → dizaines de secondes.
- Google : 20 × 2 = 40 POST, séquentiels → peut ajouter 20–60 s si réseau lent.

**Risque :** Un cycle complet peut dépasser 5 min (intervalle par défaut). Le lock avec TTL évite les chevauchements ; le run suivant attend la fin du précédent ou le TTL. Pas d’alerte si la durée dépasse l’intervalle.

---

## 1.2 Nombre d’appels API (tournoi / team / user)

| Phase | Appels par cycle (250 équipes) |
|-------|--------------------------------|
| Tournoi | 1 |
| Team | 250 (1 par équipe, séquentiel dans la boucle `for (ref of teamRefs)`) |
| User | Jusqu’à 250 × (joueurs + staff) ; limité par cache TTL 2 min et concurrence 3 par équipe. Premier run froid : ordre de grandeur 250 × 5 / 3 ≈ 400+ requêtes réelles en vagues. |

**Risque :** En run froid (cache vide), le nombre d’appels user peut déclencher du 429 si l’API a un rate limit strict. Le retry + backoff est déjà en place ; le risque est surtout la durée du scan.

---

## 1.3 Concurrence des appels API

- **Tournoi :** 1 appel, pas de concurrence.
- **Équipes :** boucle `for (const ref of teamRefs)` avec `await buildEnrichedTeam(ref.id, ref.name)` → **séquentiel** : une équipe après l’autre. Pas de parallélisme entre équipes.
- **User (dans une équipe) :** `runWithConcurrencyLimit(playerRefs, getUserApiMaxConcurrent(), fn)` → au plus 3 appels user en parallèle **par équipe**.

**Risque :** Avec 250 équipes traitées une par une, la durée du scan est dominée par 250 × (temps getTeamById + temps pour tous les joueurs avec concurrence 3). Pas de risque de surcharge côté client (concurrence maîtrisée), mais le job peut être long.

---

## 1.4 Rate limit API (tournoi / team / user)

- **User :** cache TTL 2 min, retry 429 avec backoff exponentiel, concurrence 3. Bien protégé.
- **Team / tournoi :** pas de cache, pas de retry explicite dans le code (axios peut relancer selon la config). Si l’API renvoie 429 sur team ou tournoi, une seule équipe ou tout le scan peut échouer.

**Risque :** Rate limit sur getTeamById ou getTournament non géré (pas de retry ni backoff). Probabilité faible si l’API est plus permissive sur ces endpoints.

---

## 1.5 Rate limit Discord

- **Envoi de messages :** `notifyNewTeams` / `notifyUpdatedTeams` / etc. font une boucle `for` avec `await send*Message` → envois **séquentiels**. Pas de file d’attente ni backoff. En cas de 429 Discord, l’envoi échoue (failed++) et on passe au suivant.
- **guild.members.fetch(userId) :** dans `enrichTeamWithPresence`, un fetch par joueur par équipe (en parallèle dans l’équipe via `Promise.all`). Beaucoup de membres = beaucoup de requêtes. Discord limite les requêtes par route (ex. 50/s pour certaines).
- **Création rôle / salon :** uniquement au clic sur “Créer la team”, pas en masse dans le job. Limite atteinte gérée par `checkDiscordLimits` (mode dégradé ou refus).

**Risque :** En cas de grosse vague de nouvelles équipes (ex. 20), 20 × (1 channel + 1 guild + N members) + 20 sends peut approcher ou dépasser des limites Discord ; pas de retry ni backoff sur les sends.

---

## 1.6 Volume de notifications Discord

- Un message par nouvelle équipe, un par équipe modifiée, un par désinscrite, un par réinscrite. Tous dans le **même salon** (STAFF_NEW_TEAM_CHANNEL_ID).
- Séquentiel : pas de batch. 20 nouvelles + 20 modifiées + 10 removed + 5 reactivated = 55 messages d’affilée dans le même channel.

**Risque :** Spam visuel et possible rate limit sur la route “send message” si Discord applique une limite stricte par channel. Pas de throttling côté bot.

---

## 1.7 Volume de créations rôles / salons

- Création **uniquement** au clic utilisateur (bouton “Créer la team”). Pas de création en masse dans le job.
- `checkDiscordLimits` vérifie `guild.roles.cache.size` et `guild.channels.cache.size` avant de créer. Seuils par défaut 240 (rôles) et 480 (salons).

**Risque :** À 250 équipes, si toutes créent leur rôle/salon sur le même guild, la limite rôles (250) est atteinte. Le code passe en mode dégradé (salon seul) ou refuse si limite salons. Comportement déjà géré.

---

## 1.8 Croissance SQLite

- **teams :** une ligne par équipe (250+).
- **players :** une par joueur (250 × ~5 ≈ 1250+).
- **discord_resources :** ~3 lignes par équipe ayant créé des ressources (role, channel, category partagée).
- **team_discord_state :** une ligne par équipe.
- Pas de purge automatique (archived reste en base).

**Risque :** Taille de la base et temps de requête restent raisonnables à 250 équipes (ordre du Mo, requêtes indexées). Pas de risque majeur à ce stade.

---

## 1.9 Nombre de requêtes DB par cycle

**Sync (pour 250 équipes) :**
- 250 × (1 findTeamByApiId + selon cas : insert team + inserts players, ou findTeamById + findPlayersByTeamId + N updatePlayer / insertPlayer) → ordre de grandeur 250 × (2 à 20+) requêtes par transaction.
- 1 × findAllTeams() (full scan).
- Jusqu’à 250 × updateTeam (pour removed → status archived).

**Index existants :** team_api_id, team_id (players), discord_resources (team_id, guild+type). Pas d’index sur `teams.status` ; `findAllTeams()` charge toutes les lignes puis filtre en mémoire.

**Risque :** À 250 équipes, acceptable. Au-delà (500+), un index sur `teams(status)` et une requête “SELECT * FROM teams WHERE status IN (...)” au lieu de findAllTeams + filter pourrait aider.

---

## 1.10 Coût du scan complet toutes les 5 minutes

- Chaque cycle refait **tout** le scan : 1 tournoi + 250 getTeamById + jusqu’à ~1250 getUserById (réduit par cache).
- Aucune détection d’“inactivité” : même si aucune équipe n’a changé, on refait toutes les requêtes API et la sync (unchanged++).

**Risque :** Charge API et DB constante même sans changement. Pas de “scan léger” (ex. vérifier une date de mise à jour côté API si elle existait).

---

## 1.11 Comportement quand 250+ équipes existent déjà

- Scan : 250+ appels team + 250+ × M user (avec cache et concurrence 3). Durée proportionnelle au nombre d’équipes.
- Sync : 250+ transactions ; pour chaque équipe, si “unchanged” (pas de diff), seul `updateLastSeenAt` ou rien (selon logique) ; sinon updateTeamAndPlayers. `findAllTeams()` retourne 250+ lignes ; boucle removed en O(N).
- Notify : seules les listes createdTeams / updatedTeams / removedTeams / reactivatedTeams envoient des messages. Si tout est “unchanged”, pas de message. Donc pas de spam si rien ne change.

**Risque :** Le temps du job croît linéairement avec N. Au-delà de ~5 min, le run suivant sera soit skippé (lock pris) soit en attente (TTL libère le lock après 5 min par défaut).

---

## 1.12 Beaucoup d’équipes updated au même cycle

- Sync : chaque équipe modifiée déclenche une transaction (updateTeamAndPlayers + éventuellement plusieurs updatePlayer / insertPlayer). Pas de batch.
- Notify : une boucle `for` avec `await sendUpdatedTeamMessage` par équipe → 20 updates = 20 messages séquentiels.

**Risque :** Temps de sync et de notify proportionnel au nombre d’updates. Pas de blocage, mais pic de durée si 50+ équipes modifiées.

---

## 1.13 Plusieurs removed / reactivated au même cycle

- removed : une notification par équipe dans removedTeams ; pour chacune, updateTeam(status = 'archived'). Séquentiel dans la boucle sur allTeams.
- reactivated : déjà traité dans la boucle principale du sync (équipe archived qui réapparaît). Une notif par équipe réinscrite.

**Risque :** Même logique, pas de cas pathologique identifié. Volume de messages = taille des listes.

---

## 1.14 Limite rôles Discord atteinte

- `checkDiscordLimits(guild)` avant création : si `currentRoleCount >= threshold` (240), `canCreateRole = false`, mode dégradé (créer seulement le salon). Si l’utilisateur clique “Créer la team”, le bot crée le salon et pas le rôle.

**Risque :** Déjà géré. Les équipes suivantes n’auront pas de rôle tant que la limite n’est pas repassée sous le seuil (suppressions manuelles côté Discord).

---

## 1.15 Limite salons Discord atteinte

- Si `currentChannelCount >= channelThreshold` (480), `canCreateChannel = false` → message à l’utilisateur et pas de création. Lock libéré.

**Risque :** Déjà géré.

---

## 1.16 Plusieurs catégories S21 / S21-2 / S21-3

- `findOrCreateTeamCategory` : parcourt les catégories du guild (cache), filtre par nom (S21, S21-N), trie par suffixe, prend la première avec `channelCount < maxChannels` (50). Sinon crée une nouvelle catégorie (S21-2, S21-3, …).
- À 250 équipes, 250 / 50 = 5 catégories. Chaque création de team fait un findOrCreate (lecture du cache + éventuellement 1 create). Pas de limite explicite sur le nombre de catégories.

**Risque :** Comportement correct. Les catégories sont créées à la demande. Coût : une lecture cache + au pire une création API Discord par nouvelle catégorie.

---

# PARTIE 2 — CORRECTIFS MINIMAUX RECOMMANDÉS

## Critique

### C-CH1 — Alerte si durée du job dépasse un seuil

- **Problème :** Si le job dépasse l’intervalle (ex. 5 min), le cycle suivant ne démarre qu’à la fin ou après TTL. Aucun log ni alerte.
- **Risque :** Retards de sync et de notifications non visibles en prod.
- **Fichiers :** `src/jobs/runRegistrationSyncJob.ts`.
- **Safe :** Oui (ajout d’un log uniquement).
- **Implémentation conservatrice :** Après calcul de `durationMs`, si `durationMs > getRegistrationSyncIntervalMinutes() * 60 * 1000 * 0.8`, faire `logger.warn('Job a dépassé 80% de l\'intervalle', { durationMs, intervalMinutes })`. Optionnel : variable d’env `JOB_DURATION_WARN_MS` pour seuil en ms.

---

## Important

### I-CH1 — Index sur teams(status) pour la détection des removed

- **Problème :** `findAllTeams()` charge toutes les équipes puis filtre en JS par status et présence dans scanTeamApiIds. À 250+ équipes, full scan à chaque cycle.
- **Risque :** Légère dégradation et charge CPU inutile quand la table teams grossit.
- **Fichiers :** Nouvelle migration `002_add_teams_status_index.sql` : `CREATE INDEX idx_teams_status ON teams(status);`. Puis, optionnel : dans `syncTeamsWithDatabase`, utiliser une requête “findTeamsByStatusIn(['new','active','changed'])” au lieu de findAllTeams + filter (réduit la quantité de lignes lues).
- **Safe :** Oui (index uniquement). Changer la logique sync pour utiliser status est un pas de plus, optionnel.

### I-CH2 — Réduire les logs verbeux en production (niveau debug)

- **Problème :** Chaque équipe créée / mise à jour / réinscrite logue (teamsLogger.info). À 250 équipes, des centaines de lignes par cycle. Idem pour userApi (“appel API”, “user servi depuis cache”).
- **Risque :** Volume de logs élevé, coût I/O et difficulté à suivre les vrais problèmes.
- **Fichiers :** `src/modules/teams/logger.ts`, `src/modules/teams/syncTeamsWithDatabase.ts` (passer les logs “équipe créée / mise à jour / réinscrite” en debug). `src/modules/api/userApi.ts` : “appel API” et “user servi depuis cache” en debug si LOG_LEVEL=debug.
- **Safe :** Oui. En info on garde les logs de début/fin de phase et les erreurs.

### I-CH3 — Throttle ou délai optionnel sur les envois Discord (notify)

- **Problème :** Envoi séquentiel de N messages dans le même channel sans délai. En cas de grosse vague (ex. 30 notifications), risque de rate limit ou de spam.
- **Risque :** 429 Discord ou mauvaise expérience dans le salon staff.
- **Fichiers :** Par ex. `src/modules/discord/messages/notifyNewTeams.ts` (et les 3 autres notify) : après chaque `send*Message`, `await new Promise(r => setTimeout(r, 200))` (200 ms) si une variable d’env `DISCORD_NOTIFY_DELAY_MS` est définie. Sinon comportement actuel.
- **Safe :** Oui. Désactivé par défaut (pas de délai si non configuré).

---

## Optionnel

### O-CH1 — Retry simple sur getTeamById / getTournament en cas de 429

- **Problème :** Pas de retry sur les APIs tournoi et team. Une 429 peut faire échouer une équipe ou tout le scan.
- **Risque :** Faible si l’API rate-limit surtout /user. Utile en environnement contraint.
- **Fichiers :** `src/modules/api/teamApi.ts` et `src/modules/api/tournamentApi.ts` (ou un wrapper) : en catch, si status 429 et attempt < 2, attendre 1–2 s et réessayer une fois.
- **Safe :** Oui, en limitant à 1 retry et un délai court.

### O-CH2 — Compteur / log du nombre d’appels user API réels par cycle

- **Problème :** Difficile de savoir combien d’appels réels ont été faits au total (cache vs réseau).
- **Risque :** Diagnostic du rate limit ou de la lenteur.
- **Fichiers :** `src/modules/teams/scanTournamentRegistrations.ts` : après la boucle, appeler une fonction qui retourne le total des appels user (ex. exposée par userApi : “getTotalUserApiCallsThisCycle” ou réutiliser le compteur existant si un reset global existe en début de job). Logger en info en fin de scan (ex. `userApiCallsReal: X`).
- **Safe :** Oui (lecture + log).

### O-CH3 — Timeout global optionnel pour le job

- **Problème :** Un job qui boucle ou qui est extrêmement long ne peut être stoppé que par TTL du lock (5 min) ou arrêt du process.
- **Risque :** Faible ; TTL libère déjà le lock.
- **Fichiers :** Optionnel : au début du job, `const deadline = Date.now() + JOB_MAX_DURATION_MS` ; dans la boucle des équipes (scan), vérifier `if (Date.now() > deadline) { logger.warn('Job interrompu (timeout)'); break; }` et ne traiter que les équipes déjà scannées. Complexe (état partiel). Recommandation : ne pas implémenter sauf besoin explicite.

---

# PARTIE 3 — PLAN DE TEST DE CHARGE

## 3.1 Objectifs

- Vérifier que le bot reste stable avec 250+ équipes.
- Mesurer la durée du job et les pics (notify, Google, API).
- Repérer les rate limits et les erreurs partielles.

## 3.2 Ce qu’il faut simuler

| Scénario | Description | Comment |
|----------|-------------|--------|
| 250+ équipes déjà présentes | Toutes en base, status new/active/changed ; le scan retourne les 250. | Données de test ou copie de prod avec 250 équipes. Lancer un cycle et mesurer la durée. |
| 20 nouvelles équipes d’un coup | Le tournoi renvoie 20 équipes de plus qu’en base. | Modifier temporairement la réponse API tournoi ou insérer 20 équipes “en retard” dans le scan. |
| 20 équipes modifiées | Même 250 équipes mais 20 avec joueurs/nom modifiés. | Modifier les données API pour 20 équipes (changement de joueur ou de nom). |
| 10 désinscrites | 10 équipes en base (new/active/changed) absentes du prochain scan. | Retirer 10 équipes de la réponse tournoi (mock ou données de test). |
| Retour simultané | Plusieurs équipes archived réapparaissent dans le scan. | Remettre dans la réponse tournoi des équipes déjà en base en archived. |
| Limite rôles atteinte | Guild avec 239 rôles, puis clic “Créer la team”. | Serveur de test proche de la limite ; vérifier mode dégradé (salon seul). |
| Limite salons atteinte | Guild avec 479 salons. | Idem, vérifier refus et message utilisateur. |
| API user lente | Latence élevée sur /user/{id}. | Proxy ou mock qui ajoute 500 ms par appel ; mesurer durée totale et échecs. |
| Google Sheets lent / partiellement KO | Timeout ou 5xx sur une des deux URLs. | Désactiver une URL ou injecter un délai/timeout ; vérifier que le job continue et que googleSheetsFailed remonte. |
| Redémarrage pendant un job | Arrêt du process au milieu d’un run. | Lancer un job, après 1–2 min envoyer SIGTERM ; redémarrer et vérifier que le prochain cycle reprend (lock libéré). |

## 3.3 Ce qu’il faut mesurer

- **Durée totale du job** : `durationMs` dans le log “Fin du job”.
- **Répartition approximative** : temps scan (avant sync), temps sync (avant notify), temps notify + Google (possible en ajoutant des logs de timestamps à chaque phase, optionnel).
- **Compteurs** : created, updated, unchanged, removed, reactivated, notified, notifyFailed, updatedNotified, removedNotified, reactivatedNotified, googleSheetsSent, googleSheetsFailed, errors.length.
- **Nombre d’appels user API** : via les logs “[userApi]” (appel API / user servi depuis cache) ou compteur exposé (O-CH2).
- **Erreurs** : tout message “Erreur …”, “erreur”, “failed”, “429”, dans les logs.

## 3.4 Logs à surveiller

- `[registrationSync]` ou équivalent : “Début du job”, “Fin du job” (avec summary), “Job déjà en cours, skip”, “Erreur globale du job”.
- `[teams]` : “scanTournamentRegistrations: démarrage/fin”, “syncTeamsWithDatabase: démarrage/fin”, “équipes absentes du scan”.
- `[userApi]` : “retry sur 429”, “Erreur getUserById”.
- `[discord]` : “notifyNewTeams: envoi des notifications”, “sendNewTeamMessage: message envoyé” / “erreur envoi”, “checkDiscordLimits: limite rôles/salons atteinte”.
- `[googleSheets]` : “sync Google: début/fin”, “échec DOC 1/2”, “suppression impossible”.

## 3.5 Seuils à surveiller

- **durationMs** : alerter si > 4 min (80 % d’un intervalle de 5 min) ou si > JOB_LOCK_TTL_SECONDS * 1000.
- **errors.length** : alerter si > 0 (déjà dans le résultat du job).
- **notifyFailed, updatedNotifyFailed, removedNotifyFailed, reactivatedNotifyFailed** : alerter si > 0.
- **googleSheetsFailed** : alerter si > 0.
- **Limites Discord** : log “limite rôles atteinte” / “limite salons atteinte” → alerte opérationnelle.

## 3.6 Vérification stabilité avec 250+ équipes

1. **Préparer un jeu de données** : 250 équipes dans l’API (ou mock) et en base (status cohérents).
2. **Lancer plusieurs cycles** (ex. 5 à 10) à 5 min d’intervalle sans modifier les données : tous les cycles doivent finir en “unchanged” (ou équivalent), durée stable, pas d’erreur.
3. **Injecter des changements** : 10 nouvelles, 10 modifiées, 5 removed, 2 reactivated sur un cycle. Vérifier les compteurs et que tous les messages attendus arrivent dans le salon staff.
4. **Vérifier le lock** : lancer un cycle long (ex. mock user très lent) ; avant la fin, déclencher un second cycle → doit loguer “Job déjà en cours, skip”. Après TTL, un nouveau run doit pouvoir démarrer.
5. **Redémarrage** : pendant un job, SIGTERM puis relance ; au prochain intervalle, le job doit repartir et le résumé doit être cohérent (pas de doublon ni d’état incohérent si le crash était après la sync DB).

---

*Document généré pour l’audit charge / scalabilité. À mettre à jour après application des correctifs (C-CH1, I-CH1, I-CH2, I-CH3, etc.).*
