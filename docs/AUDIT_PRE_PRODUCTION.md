# Audit pré-production — Bot Discord proOUAT

**Date :** 2025-03-07  
**Objectif :** Sécuriser la mise en production sur les 2 serveurs Discord principaux sans rien casser.

---

## 1. Résumé exécutif

**Le bot est-il safe pour le serveur principal ?**  
**Oui, sous réserve des corrections appliquées et des points de vigilance ci-dessous.**

- **Corrections critiques appliquées :** restriction stricte des actions Discord aux guildes configurées (`DISCORD_GUILD_ID_1`, `DISCORD_GUILD_ID_2`) pour le bouton « Créer la team » et la commande `/syncdiv`. Sans cela, un staff sur un 3ᵉ serveur aurait pu créer des rôles/salons ou modifier les divisions.
- **Risques importants restants :** aucun bloquant identifié. Points à surveiller : lock job en mémoire (redémarrage libère), pas de lock sur `/syncdiv` (deux exécutions simultanées possibles), état partiel possible en DB si crash pendant registrationSync.
- **Protections déjà en place :** vérification guild sur `/creationchaneldiv`, checkDiscordLimits (seuils rôles/salons), mode dégradé (création salon sans rôle si limite rôles), lock création team (anti double-clic), audit + monitoring, timeout/retry API.

---

## 2. Liste des risques détectés

### A. Risques bot / stabilité

| Criticité | Fichier(s) | Explication | Impact potentiel | Recommandation |
|-----------|------------|-------------|------------------|----------------|
| **Important** | `src/commands/syncdiv.ts` | Aucun lock : deux `/syncdiv` lancés en parallèle peuvent chevaucher (même DB, même API). | Données divisions incohérentes ou conflits d’écriture. | Optionnel : réutiliser un lock type `jobLock` ou refuser si sync en cours. |
| **Moyen** | `src/core/jobs/jobLock.ts` | Lock en mémoire : au redémarrage du bot le lock est perdu. Pas de TTL qui « reprend » le lock. | Si le bot crash pendant registrationSync, au redémarrage un nouveau run peut repartir tout de suite (pas de blocage durable). | Acceptable pour la V1. Documenter que le lock est perdu au restart. |
| **Moyen** | `src/index.ts` (avant correction) | Pas de handler `unhandledRejection` : une promesse rejetée non catchée pouvait faire planter ou rester silencieuse. | Crash ou erreur silencieuse. | **Corrigé :** handler ajouté qui log. |
| **Moyen** | `src/discord/events/interactionCreate.ts` (avant correction) | Pas de try/catch global : une exception dans un handler pouvait remonter en rejection non gérée. | Erreur non loguée, utilisateur sans retour. | **Corrigé :** try/catch global + réponse utilisateur. |
| **Faible** | `src/jobs/runRegistrationSyncJob.ts` | Pas de transaction globale sur tout le flux : si crash entre deux équipes, état DB partiel. | Quelques équipes à jour, d’autres non ; re-run suivant peut rattraper. | Acceptable ; le sync suivant réconcilie. |
| **Faible** | `src/modules/discord/interactions/handleCreateTeamButton.ts` | Création rôle/salon puis persistance DB : si échec après création Discord mais avant DB, pas de rollback Discord. | Rôle/salon orphelins sur Discord, à nettoyer à la main si rare. | Documenter ; en prod surveiller les logs "erreur DB (ressources peut-être déjà créées)". |
| **Faible** | Monitoring / compteurs | Compteurs d’échecs consécutifs en mémoire : perdus au redémarrage. | Après restart, pas de rappel des N échecs précédents. | Acceptable. |

### B. Risques Discord / sécurité / dégâts potentiels

| Criticité | Fichier(s) | Explication | Impact potentiel | Recommandation |
|-----------|------------|-------------|------------------|----------------|
| **Critique** (corrigé) | `handleCreateTeamButton.ts` | Aucune vérification de la guilde : le bouton « Créer la team » pouvait être utilisé sur **n’importe quel serveur** où le bot est présent. | Création de rôles/salons sur un 3ᵉ serveur (test, autre communauté). | **Corrigé :** garde-fou `guild.id === guildId1 \|\| guild.id === guildId2` avant toute action. |
| **Critique** (corrigé) | `syncdiv.ts` | Aucune vérification de la guilde : `/syncdiv` exécutable sur n’importe quel serveur. La commande met à jour la **base partagée** (divisions). | Staff sur un serveur non prévu pouvait modifier les divisions pour tous les serveurs. | **Corrigé :** même garde-fou guild que pour creationchaneldiv. |
| **Important** | `creationchaneldiv.ts` | Déjà protégé : vérification explicite `guild.id === guildId1 \|\| guild.id === guildId2` avant toute opération. | Aucun. | Aucune. |
| **Moyen** | `config/discord.ts` | Si `DISCORD_GUILD_ID_1` et `DISCORD_GUILD_ID_2` sont vides ou mal configurés, les garde-fous rejettent toute action (message « doit être exécutée sur le serveur principal (1) ou secondaire (2) »). | Aucune action possible sur les commandes / bouton tant que la config n’est pas corrigée. | Vérifier les IDs dans `.env` avant déploiement. |
| **Faible** | `renameTeamResources.ts` / `moveTeamChannels.ts` | Ils reçoivent `guild` du caller (`creationchaneldiv` ou `createTeamResourcesForGuild`). Pour creationchaneldiv le guild est déjà validé ; pour le bouton, désormais le guild est restreint. | Aucun risque identifié. | Aucune. |
| **Faible** | Noms de salons/rôles | `slugify.ts`, `utils.ts` (divisions) : noms limités à 100 caractères, caractères sûrs (alphanum, tirets). | Pas de nom bizarre ou dangereux envoyé à l’API Discord. | Aucune. |

### C. Vérifications métier

| Point | Statut |
|-------|--------|
| Commandes sensibles limitées aux bons contextes | **OK** : staff (ALLOWED_STAFF_ROLE_IDS) + guild 1 ou 2 pour syncdiv, creationchaneldiv et bouton Créer la team. |
| Création team ne crée pas de ressources au mauvais endroit | **OK** après correction : guild obligatoirement 1 ou 2. |
| Sync divisions ne réorganise pas hors périmètre | **OK** : creationchaneldiv agit uniquement sur le guild de l’interaction (déjà validé). syncdiv ne touche qu’à la DB et à l’API calendrier, pas à Discord ; désormais exécutable seulement sur guild 1 ou 2. |
| Commandes pas exécutables sur le mauvais serveur | **OK** : les trois points d’entrée (syncdiv, creationchaneldiv, bouton) vérifient désormais le guild. |
| Bug API ne peut pas déclencher une réorganisation massive incorrecte | **OK** : les équipes/divisions viennent de la DB et du calendrier ; les actions Discord (move/rename/create) ciblent des équipes connues en base, pas des données brutes API. |
| Nom d’équipe bizarre → nom salon/rôle dangereux | **OK** : slugify + slice 100 caractères. |
| Fallbacks sûrs | **OK** : `slug || 'equipe'`, seuils config avec défauts raisonnables. |
| Mode dégradé protège contre suppressions/dégâts | **OK** : scan dégradé désactive les suppressions ; limite rôles → création salon uniquement (pas de rôle). |

---

## 3. Protections déjà en place

- **Lock job** : `registrationSync` protégé par `tryAcquireJobLock` / `releaseJobLock` (en mémoire).
- **Lock création team** : `createTeamLock` (teamApiId + guildId) évite double-clic et concurrence sur une même équipe.
- **Vérification guild** : `/creationchaneldiv` exige guild 1 ou 2 ; **après corrections** : même règle pour bouton « Créer la team » et `/syncdiv`.
- **checkDiscordLimits** : seuils rôles/salons (DISCORD_ROLE_LIMIT_SAFE_THRESHOLD, DISCORD_CHANNEL_LIMIT_SAFE_THRESHOLD) avant création ; mode dégradé si limite rôles.
- **Logs audit** : salon AUDIT_LOG_CHANNEL_ID avec indicateurs et préfixes (Registration Sync, Divisions, Création Team, Bot, Monitoring).
- **Monitoring** : alertes sur échecs consécutifs (registrationSync, syncdiv) et message au démarrage du bot.
- **API** : timeout (config), retry sur 429 (teamApi, userApi), Google Sheets avec AbortController + timeout.
- **Permissions Discord** : overwrites explicites (everyone deny ViewChannel, rôle équipe + staff allow ViewChannel) ; pas de permissions larges.
- **Pas de suppression involontaire** : le code ne supprime pas de rôles/salons/catégories ; renommage et déplacement uniquement sur ressources existantes.
- **Shutdown** : SIGINT/SIGTERM gérés, stopJobs + destroyClient + closeDatabase.

---

## 4. Corrections minimales appliquées avant prod

1. **handleCreateTeamButton.ts**  
   - Après vérification `guild` présent, ajout de la vérification `guild.id === getDiscordGuildId1() || guild.id === getDiscordGuildId2()`.  
   - Si guild non autorisé : message explicite + return sans aucune action Discord.  
   - Log warning avec guildId, teamApiId, userId.

2. **syncdiv.ts**  
   - Après `deferReply`, vérification `interaction.guild` puis guild 1 ou 2.  
   - Si serveur absent ou non autorisé : `editReply` avec message clair et return sans appeler l’API ni modifier la DB.

3. **interactionCreate.ts**  
   - Try/catch global autour du handler d’interaction.  
   - En cas d’erreur : log console + réponse utilisateur (reply ou editReply selon état) pour éviter rejection non gérée et utilisateur sans retour.

4. **index.ts**  
   - Handler `process.on('unhandledRejection', ...)` pour logger toute rejection non gérée et éviter sortie silencieuse.

---

## 5. Fichiers modifiés

- `src/modules/discord/interactions/handleCreateTeamButton.ts` — restriction guild 1 ou 2.
- `src/commands/syncdiv.ts` — restriction guild 1 ou 2.
- `src/discord/events/interactionCreate.ts` — try/catch global + réponse en erreur.
- `src/index.ts` — handler unhandledRejection.
- `docs/AUDIT_PRE_PRODUCTION.md` — présent rapport.

---

## 6. Vérification technique

- `npx tsc --noEmit` : **OK** (aucune erreur de compilation).

---

## 7. Recommandations optionnelles (post-déploiement)

- Vérifier que `.env` contient bien `DISCORD_GUILD_ID_1` et `DISCORD_GUILD_ID_2` pour les 2 serveurs cibles.
- Surveiller les logs `[unhandledRejection]` et `[interactionCreate] Erreur non gérée` en prod.
- Si besoin : ajouter un lock (ou « sync en cours ») pour `/syncdiv` pour éviter deux exécutions simultanées.
- Documenter la procédure de backup de la base SQLite (ex. avant chaque déploiement ou via cron).
