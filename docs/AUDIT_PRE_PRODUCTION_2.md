# Audit pré-production — 2ᵉ passe (config, scénarios, garde-fous)

**Date :** 2025-03-07  
**Objectif :** Vérifications concrètes et agressives : config, cas limites, scénarios de casse, garde-fous finaux.

---

## 1. Résumé exécutif

**Prêt pour la prod ?** **Oui**, sous réserve des corrections appliquées et de la surveillance des points restants.

**Ce qui est vraiment safe :**
- Toutes les actions sensibles (commandes, bouton, envois audit/notifications) sont limitées aux guildes configurées (DISCORD_GUILD_ID_1 / DISCORD_GUILD_ID_2).
- Les canaux d’audit et de notifications staff sont vérifiés : si le salon configuré n’est pas sur l’un des deux serveurs autorisés, aucun envoi (skip safe + log).
- La catégorie cible lors du déplacement de salons est validée (existence + même guilde) avant `setParent`.
- Démarrage : avertissement clair si les deux guild IDs sont absents.

**À surveiller en prod :**
- `/syncdiv` sans lock : deux exécutions simultanées possibles (risque moyen).
- Lock job et compteurs monitoring en mémoire : perdus au redémarrage.
- Variables API/calendrier/Google Sheets lues au moment de l’appel (pas au démarrage) : une mauvaise config se voit au premier run.

---

## 2. Bloc 1 — Validation de la config réelle

### Variables critiques pour la sécurité

| Variable | Validée au démarrage ? | Comportement si absente / mauvaise |
|----------|------------------------|------------------------------------|
| **DISCORD_GUILD_ID_1** | Non (warning si les deux absents) | `null` → garde-fous refusent toute action sur commandes/bouton. |
| **DISCORD_GUILD_ID_2** | Idem | Idem. |
| **DISCORD_TOKEN** | Oui (throw dans `createAndConnectClient`) | Bot ne démarre pas. |
| **DISCORD_CLIENT_ID** | Oui (throw dans `registerCommands`) | Enregistrement des commandes échoue. |
| **ALLOWED_STAFF_ROLE_IDS** | Non | `[]` → aucune commande/bouton accessible (refus "pas la permission"). |
| **AUDIT_LOG_CHANNEL_ID** | Non | `null` → `sendAuditLog` ne fait rien (pas de crash). |

### Variables critiques pour la stabilité

| Variable | Quand lue | Défaut / risque |
|----------|-----------|------------------|
| **API_BASE_URL** | Premier appel API | Throw si absente. |
| **TOURNAMENT_SLUG** | Premier run registrationSync | Throw si absent. |
| **TOURNAMENT_ID** / **CALENDAR_TOURNAMENT_ID** | syncdiv + calendrier | Throw dans `getTournamentId()` si absent (syncdiv échoue). |
| **STAFF_NEW_TEAM_CHANNEL_ID** / **NEW_TEAM_CHANNEL_ID** | Chaque envoi notifications | `null` → pas d’envoi (log warn). |
| **REGISTRATION_SYNC_INTERVAL_MINUTES** | Démarrage jobs | Défaut 5. |
| **ENABLE_AUTOMATIC_REGISTRATION_SYNC** | Démarrage jobs | Défaut false. |

### Variables lues trop tard (risque de mauvaise config détectée en cours de route)

- **TOURNAMENT_SLUG**, **TOURNAMENT_ID**, **API_BASE_URL** : lues au premier run du job ou de syncdiv → erreur à ce moment-là.
- **GOOGLE_SCRIPT_URL_1/2**, **ENABLE_GOOGLE_SHEETS_SYNC** : lues pendant registrationSync.
- **AUDIT_LOG_CHANNEL_ID** : lue à chaque `sendAuditLog` ; si mauvaise (salon d’un autre serveur), **corrigé** : refus d’envoi si le salon n’est pas sur guild 1 ou 2.

### Valeurs par défaut dangereuses

- Aucune identifiée. Les défauts (intervalles, seuils, TTL) sont raisonnables ; les IDs guild/canaux en `null` ou vide conduisent à refus ou skip.

### Recommandations config

- **Critiques sécurité :** DISCORD_GUILD_ID_1/2, ALLOWED_STAFF_ROLE_IDS — pas de validation stricte au démarrage (refus à l’usage si guild manquant), **warning au démarrage** si les deux guild IDs sont absents (implémenté).
- **Critiques stabilité :** API_BASE_URL, TOURNAMENT_SLUG, TOURNAMENT_ID — validables au démarrage en option (non implémenté pour éviter de bloquer des déploiements partiels).
- **Idéal au démarrage :** vérifier au moins qu’une des deux guild est définie si on veut utiliser les commandes ; warning déjà ajouté.

---

## 3. Bloc 2 — Tests de robustesse / scénarios de casse

### 1. Commande sensible exécutée sur le mauvais serveur

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| /creationchaneldiv sur serveur 3 | `editReply` "doit être exécutée sur le serveur principal (1) ou secondaire (2)". | Oui | - | Vérif `guild.id === guildId1 \|\| guild.id === guildId2` | - |
| /syncdiv sur serveur 3 | Idem après `deferReply`. | Oui | - | Idem (ajout 1ʳᵉ passe) | - |
| Bouton Créer la team sur serveur 3 | `reply` "Cette action doit être effectuée sur le serveur principal (1) ou secondaire (2)". | Oui | - | Idem (ajout 1ʳᵉ passe) | - |

### 2. Double exécution / concurrence

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| 2 clics rapides bouton Créer la team | Lock `createTeamLock(teamApiId, guildId)` : 2ᵉ clic reçoit "Création déjà en cours". | Oui | Faible | Lock + revalidation DB avant création | - |
| 2 /syncdiv en parallèle | Les deux s’exécutent ; écritures DB et API en parallèle. | Partiel | Moyen | Aucune | Lock optionnel type jobLock (non implémenté). |
| registrationSync pendant autre action équipes | Lock job registrationSync ; pas de lock sur syncdiv ni sur création team. Pas de conflit direct sur les mêmes lignes DB en général. | Oui | Faible | Lock registrationSync | - |
| Création ressources pendant autre traitement même team | Lock création team par (teamApiId, guildId) ; revalidation "déjà créée" en DB avant création. | Oui | Faible | Lock + check `isTeamAlreadyCreatedOnGuild` | - |

### 3. Permissions manquantes

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| Pas Manage Channels | Erreur Discord au create/move/setParent ; catch → warning/erreur, pas de crash. | Oui | - | Try/catch, logs, audit | - |
| Pas Manage Roles | Erreur au create role / setName ; idem. | Oui | - | Idem | - |
| Pas accès salon audit | `fetch(channelId)` échoue ou salon non texte → log, return false. | Oui | - | sendAuditLog ne throw pas | - |
| Salon/catégorie introuvable | fetch null ou erreur → message d’erreur, pas d’action. **Catégorie** : vérification explicite avant setParent (correction 2ᵉ passe). | Oui | - | Vérif catégorie + guild | Fait. |

### 4. Payload API inattendu ou incomplet

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| Team sans nom | `buildNormalizedTeam` → `safeName = "Team-{id}"`. | Oui | Faible | normalizer | - |
| Division sans groupes | `extractDivisionEntries` : division ignorée, log warn. | Oui | Faible | getArrayFromObject, skip | - |
| Groupes vides / team_name bizarre | Slugify + slice 100 ; fallback "equipe". | Oui | Faible | slugify, utils divisions | - |
| null / undefined / objet au lieu de tableau | getArrayFromObject → [] ; extractors retournent []. | Oui | Faible | Guards dans extractors | - |
| API partielle / dégradée | Erreurs collectées par équipe ; scan dégradé désactive suppressions. | Oui | Moyen | Mode dégradé, erreurs dans result | - |

### 5. État incohérent Discord / DB

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| Ressource en DB mais supprimée sur Discord | fetch channel/role → null ou erreur ; warning, pas de crash ; pas d’action destructive. | Oui | Faible | Try/catch, warnings | - |
| Ressource sur Discord mais absente en DB | Bouton "Créer la team" : revalidation DB ; si déjà créée (état) on affiche "déjà créée". Sinon création possible (doublon possible si état perdu). | Partiel | Faible | isTeamAlreadyCreatedOnGuild | - |
| Catégorie déplacée / salon renommé à la main | Prochain run /creationchaneldiv : renommage et setParent réappliquent le modèle ; pas de suppression. | Oui | Faible | - | - |
| Team déjà créée mais état partiel | Lock + recheck DB ; si état actif sur ce guild, on refuse. Sinon création peut repartir (risque doublon si rôle/salon déjà là). | Partiel | Faible | Lock, revalidation | - |

### 6. Redémarrage / crash au mauvais moment

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| Crash après rôle créé, avant DB | Rôle orphelin sur Discord ; au redémarrage pas de rollback Discord. | Acceptable | Faible | Log "ressources peut-être déjà créées" | Doc / procédure manuelle si rare. |
| Crash pendant registrationSync | Lock libéré au restart ; prochain run reprend ; DB partielle possible, réconciliée au run suivant. | Oui | Faible | Lock en mémoire, pas de TTL vol | - |
| Compteurs monitoring à zéro | Après restart, plus de rappel des N échecs précédents. | Acceptable | Faible | - | - |

### 7. Limites Discord / gros volume

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| Limite rôles atteinte | checkDiscordLimits → mode dégradé (création salon uniquement). | Oui | - | checkDiscordLimits, mode dégradé | - |
| Limite salons atteinte | canCreateChannel false → pas de création salon. | Oui | - | Idem | - |
| Renommages / déplacements en masse | Une requête par ressource ; pas de batch. Rate limit Discord possible. | Partiel | Moyen | Logs, pas de retry agressif | Surveiller 429. |
| setPositions en masse | Une seule opération bulk par catégorie. | Oui | Faible | reorderDivisionChannels | - |

### 8. Actions humaines imprévues

| Scénario | Comportement actuel | Safe ? | Risque | Protection | Correction utile |
|----------|---------------------|--------|--------|------------|------------------|
| Commande lancée deux fois | Deux runs (syncdiv sans lock) ou lock (création team). | Oui / partiel | Moyen pour syncdiv | Lock création team | Lock syncdiv optionnel. |
| Staff oublie le bon serveur | Message "doit être exécutée sur le serveur principal (1) ou secondaire (2)". | Oui | - | Garde-fou guild | - |
| Équipe avec ressources orphelines | Dépend du cas ; pas de suppression automatique. | Oui | Faible | - | - |
| Modification manuelle catégorie / nom salon | Prochain run réapplique noms et catégories. | Oui | Faible | - | - |

---

## 4. Bloc 3 — Garde-fous finaux avant prod

### Déjà en place (1ʳᵉ et 2ᵉ passe)

- Vérification guild sur /creationchaneldiv, /syncdiv, bouton Créer la team.
- Lock création team (createTeamLock).
- Lock job registrationSync.
- checkDiscordLimits + mode dégradé.
- Audit + monitoring.
- Try/catch global interactionCreate + unhandledRejection.
- Validation des canaux : **audit et notifications staff** refusés si le salon n’est pas sur guild 1 ou 2 (2ᵉ passe).
- **Catégorie** : existence + même guilde avant setParent (2ᵉ passe).
- Warning au démarrage si les deux guild IDs sont absents.

### Garde-fous ajoutés en 2ᵉ passe (implémentés)

1. **Config (discord.ts)**  
   - `isGuildIdAllowedForChannels(guildId)` : vrai seulement si aucun guild configuré (rétrocompat) ou si guildId === guildId1 ou guildId2.

2. **Audit (sendAuditLog.ts, sendAuditLogEmbed)**  
   - Après fetch du salon : si le salon n’est pas sur un guild autorisé → log + return false (pas d’envoi).

3. **Notifications staff (sendNewTeamMessage, sendUpdatedTeamMessage, sendRemovedTeamMessage, sendReactivatedTeamMessage)**  
   - Après fetch du salon : si guild du salon non autorisé → log + return false (skip safe).

4. **Divisions (moveTeamChannels.ts)**  
   - Avant `setParent` : fetch de la catégorie ; si introuvable, pas une catégorie, ou guilde différente → erreur + return (pas de déplacement).

5. **Démarrage (index.ts)**  
   - Si ni DISCORD_GUILD_ID_1 ni DISCORD_GUILD_ID_2 définis → `console.warn` explicite.

---

## 5. Risques restants (liste synthétique)

| Criticité | Fichier(s) | Scénario | Impact possible | Correction recommandée |
|-----------|------------|----------|-----------------|------------------------|
| Moyen | syncdiv.ts | Deux /syncdiv en parallèle | Écritures DB/API concurrentes, incohérence possible | Lock optionnel (jobLock ou flag "sync en cours"). |
| Faible | Divers | Crash après création Discord, avant DB | Rôle/salon orphelin | Procédure manuelle ; déjà documenté. |
| Faible | Config | Variables API/calendrier lues au premier run | Erreur au premier run plutôt qu’au démarrage | Optionnel : validation au startup. |

---

## 6. Protections déjà en place (rappel)

- Garde-fou guild sur les 3 points d’entrée sensibles.
- Vérification guild des canaux audit et staff (2ᵉ passe).
- Vérification catégorie avant setParent (2ᵉ passe).
- Locks : registrationSync, création team.
- checkDiscordLimits, mode dégradé.
- Audit + monitoring, try/catch interactions, unhandledRejection.
- Noms normalisés (slugify, slice 100).
- Pas de suppression de ressources Discord dans le code.
- Shutdown propre (SIGINT/SIGTERM, stopJobs, destroyClient, closeDatabase).

---

## 7. Corrections implémentées (2ᵉ passe)

| Fichier | Changement | Utilité |
|---------|------------|--------|
| **config/discord.ts** | Ajout `isGuildIdAllowedForChannels(guildId)` | Centraliser la règle "canal sur guild 1 ou 2" pour audit et notifications. |
| **audit/sendAuditLog.ts** | Après fetch du salon audit : refus si salon hors guild autorisés + log. | Éviter d’envoyer l’audit sur un mauvais serveur en cas de mauvaise config. |
| **modules/discord/messages/sendNewTeamMessage.ts** | Idem pour salon staff. | Éviter d’envoyer les notifications équipes sur un mauvais serveur. |
| **sendUpdatedTeamMessage.ts**, **sendRemovedTeamMessage.ts**, **sendReactivatedTeamMessage.ts** | Même vérification guild. | Cohérence avec sendNewTeamMessage. |
| **modules/divisions/moveTeamChannels.ts** | Avant setParent : fetch catégorie, vérif existence + type + même guilde. | Refus propre si categoryId invalide ou d’un autre serveur. |
| **index.ts** | Warning au démarrage si aucun DISCORD_GUILD_ID_1/2. | Alerter l’admin que les commandes refuseront tout. |

---

## 8. Vérification finale

- **npx tsc --noEmit** : OK.
- Aucun changement de logique métier : uniquement validations et refus en cas de contexte incohérent.
- Aucun élargissement du périmètre d’action du bot : même périmètre (guild 1 et 2), avec contrôles renforcés sur les canaux et la catégorie.

---

## 9. Priorité absolue — Récapitulatif

- **Mauvaise guilde :** Toutes les actions sensibles (commandes, bouton, envois audit/notifications) sont limitées aux deux guildes configurées ; canaux audit et staff vérifiés ; catégorie de déplacement vérifiée.
- **Création / modification / déplacement au mauvais endroit :** Vérifications guild + catégorie ; en cas de doute, skip safe + log + pas d’action Discord risquée.
- **Contexte incohérent :** Refus propre (message utilisateur + log) ; pas d’action Discord dangereuse.

En cas de doute, le code privilégie un refus safe (skip + log + audit) plutôt qu’une action Discord risquée.
