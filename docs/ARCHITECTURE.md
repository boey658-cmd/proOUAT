# Architecture — Bot Discord + Interface Web de Gestion de Tournoi

Document d'architecture technique pour le système de gestion d'inscriptions et de divisions (tournoi League of Legends). À utiliser comme référence unique pour l'implémentation.

---

# 1 — Analyse du système

## 1.1 Objectifs métier

| Bloc | Rôle |
|------|------|
| **Bloc 1 — Inscriptions** | Détecter les équipes inscrites via API → reconstruire compositions → comparer avec la base → créer rôles/salons Discord → synchroniser les joueurs à l’arrivée sur le serveur. |
| **Bloc 2 — Divisions** | Synchroniser divisions/groupes via API calendrier → stocker en base → organiser équipes dans les catégories Discord selon division/groupe, avec comportement différent selon le serveur (1 vs 2). |

## 1.2 Contraintes fonctionnelles résumées

- **2 serveurs Discord** avec comportements distincts (Discord 1 : rôles/salons existants, déplacement/renommage ; Discord 2 : création complète, état actif).
- **SQLite** = source de vérité locale ; cohérence avec Discord et APIs externes.
- **Idempotence** : pas de doublons, relance propre des traitements.
- **Jobs** : protection contre exécutions concurrentes (locks).
- **Traçabilité** : messages staff dédiés, audit logs, logs structurés.
- **Résilience** : erreurs réseau, APIs indisponibles, ressources Discord supprimées manuellement → détection, log, réparation ou pending actions.

## 1.3 Chaînage API métier

```
API Tournoi (OUATventure Saison 20)
    → liste des équipes inscrites (IDs)
    → pour chaque équipe : API Team/{teamId}
        → joueurs (IDs)
        → pour chaque joueur : API User/{userId}
            → discord_user_id
```

- **API Divisions** : `calendar/byTournament/18` → division + groupe par équipe.

## 1.4 Flux principaux

- **Scan inscriptions (toutes les 5 min)** : récupération équipes → joueurs → Discord IDs → normalisation → comparaison hash → nouvelle équipe → embed + bouton ; équipe existante avec changement → message staff ; sinon → mise à jour `last_seen_at`.
- **Création rôle/salon** : déclenchée par bouton staff → vérifications (permissions, limites, existence) → catégorie S21 / S21-2… → rôle → salon → persistance → réconciliation si échec partiel.
- **Sync membres (5 min + guildMemberAdd)** : équipes actives → pour chaque joueur présent sur le guild → attribution rôle / accès channel.
- **Sync divisions** : `/syncdiv` → API calendrier → validation → résolution équipes en base → mise à jour `teams` + `division_assignments`.
- **Création par division** : `/creationchaneldiv <1-12>` → selon guild : déplacer/renommer (Guild 1) ou tout créer (Guild 2) → catégories DIVISION X, nommage `1A-team-alpha`.

## 1.5 Points critiques identifiés

- Limites Discord (rôles, channels, channels par catégorie).
- Pas de transaction commune Discord + SQLite → logique compensatoire et réconciliation.
- Données externes non fiables → validation stricte (Zod), pas de confiance aveugle.
- Double traitement (boutons, jobs) → locks, états, idempotence.

---

# 2 — Architecture logicielle

## 2.1 Principes

- **Une responsabilité par fichier** (dès que raisonnable : une fonction importante = un fichier).
- **Couches strictes** : config, core, db, modules (integrations, teams, players, discord, divisions, web), commands, events, jobs, types, bootstrap.
- **Aucune logique métier complexe** dans les handlers Discord, routes Express ou callbacks de boutons ; ils délèguent à des services applicatifs.

## 2.2 Couches et dépendances

```
bootstrap (entry)
    ↓
config (env, constantes)
    ↓
core (logger, errors, scheduler, locks, security, utils)
    ↓
db (connexion, migrations, repositories)
    ↓
types (globaux)
    ↓
modules/integrations (clients API, Google Script)
modules/teams (scan, comparaison, snapshots)
modules/players (sync joueurs, résolution présence)
modules/discord (rôles, salons, catégories, embeds, boutons)
modules/divisions (sync divisions, organisation)
modules/web (routes, auth, vues)
    ↓
commands (slash)
events (ready, interactionCreate, guildMemberAdd, …)
jobs (scan, sync members, retry pending, reconcile, archive)
```

- **config** : pas de dépendance métier.
- **core** : peut dépendre de config ; pas de db ni de Discord.
- **db** : config + core.
- **modules** : db, core, config, types ; pas de commands/events/jobs.
- **commands / events / jobs** : orchestration ; appellent les modules et le core.

## 2.3 Séparation stricte

| Domaine | Rôle | Ne fait pas |
|---------|------|-------------|
| **integrations** | Appels HTTP, parsing, validation schémas | Logique Discord, écriture DB métier |
| **teams** | Scan, comparaison, hash, snapshot | Création Discord, appels API bruts |
| **players** | Résolution présence, sync membres | Création rôles/salons |
| **discord** | Rôles, salons, catégories, permissions, embeds | Décision “quelle équipe”, logique inscription |
| **divisions** | Sync API calendrier, organisation division/groupe | Création concrète des channels |
| **web** | Auth, routes, rendu | Logique métier lourde (délégation aux modules) |

---

# 3 — Modules et responsabilités

## 3.1 `src/config`

- Chargement et validation des variables d’environnement.
- Constantes applicatives (limites Discord, noms de catégories, etc.).
- Pas de logique métier.

## 3.2 `src/core`

- **Logger** : logs structurés JSON (pino), niveaux, masquage des secrets.
- **Errors** : classes d’erreurs typées (API, Discord, DB, validation).
- **Scheduler** : planification des jobs (node-cron ou équivalent), respect des intervalles.
- **Locks** : acquisition/relâchement des locks (table `job_locks`), TTL.
- **Sécurité** : vérification permissions staff, validation inputs, nonce/customId.
- **Utils** : normalisation (noms, pseudos, slugs), hash snapshot, dates (luxon/dayjs).

## 3.3 `src/db`

- Connexion SQLite (better-sqlite3), WAL, chemin depuis config.
- Migrations versionnées (fichiers SQL ou runner de migrations).
- Transactions (helpers si besoin).
- **Repositories** : un (ou plusieurs) fichiers par table/agrégat logique — uniquement accès données (CRUD, requêtes préparées). Pas de logique métier.

## 3.4 `src/modules/integrations`

- **Clients API** : un client par famille (tournament, team, user, calendar).
- **Validation** : schémas Zod par type de payload.
- **Google Apps Script** : 2 fonctions d’envoi (script 1 : equipe + joueurs ; script 2 : equipe), timeout, retries, log.

Responsabilité : récupérer et valider les données externes ; ne pas décider de la création Discord ou de l’écriture métier en base.

## 3.5 `src/modules/teams`

- Récupération liste équipes tournoi (orchestration des appels API via integrations).
- Récupération joueurs d’une équipe.
- Récupération données utilisateur (Discord ID).
- Normalisation équipe (nom, joueurs).
- Calcul hash snapshot (équipe + joueurs triés).
- Comparaison avec la base (nouvelle / modifiée / inchangée).
- Création/mise à jour équipes et joueurs en base.
- Snapshot (écriture `team_snapshots`).
- Détection des différences pour message staff (changements détaillés).

Pas de création de rôles/salons ; pas d’appels HTTP bruts (utilise integrations).

## 3.6 `src/modules/players`

- Résolution “présence sur un guild” (Discord ID → membre présent ou non).
- Synchronisation des membres d’une équipe (attribution rôle, accès channel).
- Gestion des cas : sans Discord ID, rôle/channel supprimé, membre introuvable, etc.

## 3.7 `src/modules/discord`

- Création / recherche catégorie (S21, S21-2, DIVISION 1, etc.).
- Création rôle équipe (nom, permissions minimales).
- Création salon équipe (catégorie, permissions, nom slugifié).
- Vérification existence ressource sur Discord (réconciliation).
- Gestion des limites (rôles, channels) et mode dégradé (channel sans rôle).
- Embeds staff (nouvelle équipe, équipe modifiée).
- Boutons (création channel, rafraîchir présence, marquer traité, etc.).
- Vérification permissions bot et hiérarchie rôles.
- Enregistrement des ressources en base (`discord_resources`, `team_discord_state`).

## 3.8 `src/modules/divisions`

- Appel API calendrier, validation payload.
- Normalisation division/groupe.
- Résolution équipe en base (par identifiant stable).
- Mise à jour `teams` et `division_assignments`.
- Logique “création catégorie division” et “répartition équipes” (DIVISION 1, DIVISION 1 - 2, etc.).
- Pour `/creationchaneldiv` : comportement Guild 1 (déplacer/renommer) vs Guild 2 (créer tout), nommage `numeroDivision+groupe+slug` (ex. `1A-team-alpha`).

## 3.9 `src/modules/web`

- Authentification (bcrypt, session, cookie sécurisé).
- Routes protégées (tableau de bord, équipes, pending actions, jobs, logs, rescan, réconciliation).
- CSRF, rate limit, helmet.
- Rendu (EJS recommandé en phase 1) ; pas de logique métier lourde dans les routes (délégation aux modules).

## 3.10 `src/commands`

- Enregistrement des slash commands.
- Handlers par commande : `/syncdiv`, `/creationchaneldiv`, `/scanteams`, `/syncmembers`, `/teaminfo`, `/retrypending`.
- Vérification rôle staff, log auteur, délégation aux services (teams, divisions, discord, etc.).

## 3.11 `src/events`

- `ready` : log, enregistrement des commands, démarrage scheduler.
- `interactionCreate` : routage slash vs bouton ; vérification permissions ; anti-double traitement ; délégation.
- `guildMemberAdd` : résolution joueur par Discord ID → attribution rôle si équipe active sur ce guild.
- `guildCreate` / `guildDelete` : mise à jour config ou état si utile.
- Optionnel : `channelDelete` / `roleDelete` pour alimenter la réconciliation.

## 3.12 `src/jobs`

- Chaque job dans un fichier dédié : `scanTournamentTeams`, `syncTeamMembership`, `retryPendingActions`, `reconcileDiscordState`, `archiveMissingTeams`.
- Pour chaque job : prise de lock, log début/fin/durée, appel des services, relâchement du lock même en erreur.

## 3.13 `src/types`

- Types et interfaces globaux (équipe normalisée, joueur, payload API, état Discord, etc.).

## 3.14 `src/bootstrap`

- Ordre de démarrage : env → logger → DB → migrations → config vérifiée → web (si activé) → client Discord → register commands → scheduler → réconciliation initiale.

---

# 4 — Stratégie d’idempotence

- **Scan** : hash snapshot ; si identique → mise à jour `last_seen_at` uniquement.
- **Sync divisions** : upsert par `team_id` dans `division_assignments`.
- **Création rôle/salon** : vérifier en base et sur Discord avant création ; customId avec team + action + nonce pour boutons.
- **Google Script** : marquer en base si envoi réussi pour éviter multi-envois (ex. `google_sync_status` ou équivalent).
- **Pending actions** : statut `processing` pendant traitement ; `done` / `failed` / `blocked` en fin ; retry avec backoff.

---

# 5 — Gestion des erreurs et pending actions

- **API indisponible** : log, métrique, ne pas faire échouer tout le scan ; pending ou skip pour l’élément concerné.
- **Limite Discord** : message staff, pending action en `blocked`, retry périodique.
- **Rôle/salon déjà existant non en base** : réconciliation → mise à jour base ou alerte.
- **Rôle/salon en base supprimé sur Discord** : marquer inactif, pending “recréer” ou alerte staff.
- **Double clic bouton** : vérifier état équipe/action, désactiver ou mettre à jour le bouton après traitement.
- Toute action critique : log + audit log + état DB cohérent.

---

# 6 — Logs et audit

- **Logs structurés JSON** : timestamp, level, module, action, guild_id, team_id, player_id, request_id, job_name, duration_ms, error_name, error_message.
- **Audit logs persistants** (table `audit_logs`) : actor_type, actor_id, action, target_type, target_id, details_json.
- **Filtrage** : par team_api_id, team_id, discord_user_id, guild_id, job_name, etc.
- **Secrets** : jamais logués en clair ; masquage dans messages d’erreur.

---

# 7 — Sécurité (résumé)

- Secrets en env uniquement ; `.env.example` fourni.
- API externes : timeout, retries, validation Zod, pas de confiance aux données.
- SQLite : requêtes préparées, transactions, WAL, backups.
- Discord : permissions minimales, vérification avant chaque action, hiérarchie rôles.
- Web : auth, bcrypt, session, cookie sécurisé, CSRF, rate limit, helmet, validation serveur.
- Jobs : locks, idempotence, pending actions.
- Process : gestion unhandledRejection / uncaughtException, shutdown propre, healthcheck.

---

# 8 — Plan d’implémentation proposé

Voir le document **PLAN-IMPLEMENTATION.md** pour les phases détaillées et l’ordre des fichiers à créer.

Résumé des phases :

1. **Fondations** : projet Node/TS, config, env, logger, errors, types de base.
2. **Base de données** : SQLite, migrations, schéma complet, repositories de base.
3. **Core** : scheduler, locks, utils (normalisation, hash), sécurité (staff check).
4. **Intégrations** : clients API (tournament, team, user, calendar), Zod, Google Script.
5. **Modules teams** : scan, normalisation, snapshot, comparaison, persistance équipes/joueurs.
6. **Discord de base** : client Discord, events ready + interactionCreate, enregistrement commands.
7. **Module discord** : création catégorie S21, rôle, salon, embeds, boutons, persistance.
8. **Flux inscriptions** : job scan, comparaison, nouvelle équipe → embed + bouton, création salon/role au clic.
9. **Module players** : sync présence, attribution rôle, guildMemberAdd.
10. **Divisions** : API calendrier, `/syncdiv`, module divisions, `/creationchaneldiv` (Guild 1 vs 2).
11. **Jobs** : syncTeamMembership, retryPendingActions, reconcileDiscordState, archiveMissingTeams.
12. **Interface web** : Express, auth, tableau de bord, équipes, pending, logs, actions manuelles.
13. **Sécurité et durcissement** : rate limit, CSRF, audit, masquage secrets, healthcheck, shutdown.
14. **Tests et déploiement** : scripts npm, tests unitaires/intégration, documentation déploiement.

---

*Document de référence — ne pas coder sans avoir lu l’arborescence et le plan d’implémentation.*
