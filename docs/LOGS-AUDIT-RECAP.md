# Récapitulatif : stratégie de logs et salon d’audit

## 1. Fichiers modifiés

| Fichier | Modification |
|---------|---------------|
| **src/config/channels.ts** | Ajout de `getAuditLogChannelId()` (lecture de `AUDIT_LOG_CHANNEL_ID`). |
| **src/audit/sendAuditLog.ts** | Nouveau : envoi des messages d’audit dans le salon configuré. |
| **src/audit/index.ts** | Nouveau : export du module audit. |
| **src/jobs/runRegistrationSyncJob.ts** | Logs lisibles + appels à `sendAuditLog` (début, scan, sync, résumé final, erreurs). |
| **src/commands/syncdiv.ts** | Envoi d’un message d’audit au démarrage et en fin de commande (résumé ou erreur). |
| **src/commands/creationchaneldiv.ts** | Envoi d’un message d’audit au démarrage et en fin de commande (résumé ou erreur). |
| **src/modules/discord/interactions/handleCreateTeamButton.ts** | Envoi d’un message d’audit en cas de succès ou d’échec de création des ressources. |

Aucun autre fichier n’a été modifié. La logique métier (scan, sync, notifications, divisions, bouton) est inchangée.

---

## 2. Nouvelles fonctions / module

### Module **src/audit**

- **`sendAuditLog(client, message: string): Promise<boolean>`**  
  Envoie un message texte dans le salon défini par `AUDIT_LOG_CHANNEL_ID`.  
  - Si la variable n’est pas définie ou le salon est invalide : ne fait rien, retourne `false`, log éventuel en console avec le préfixe `[audit]`.  
  - Les erreurs d’envoi sont loguées en console uniquement, sans exception.  
  - Messages longs : troncature à 2000 caractères avec « … ».

- **`sendAuditLogEmbed(client, options): Promise<boolean>`**  
  Envoie un embed dans le même salon (titre, description, champs, footer, couleur).  
  Même gestion d’erreurs que `sendAuditLog`. Utilisable plus tard pour des résumés structurés.

### Config

- **`getAuditLogChannelId(): string | null`**  
  Retourne l’ID du salon d’audit depuis `.env` (`AUDIT_LOG_CHANNEL_ID`), ou `null` si non défini/vide.

---

## 3. Événements envoyés dans le salon d’audit

| Contexte | Message type (exemples) |
|----------|--------------------------|
| **Job registration sync** | Début du scan (tournoi X). |
| | X équipes détectées (éventuellement + Y erreurs scan). |
| | Si scan dégradé : attention, suppressions désactivées. |
| | Synchronisation base terminée : X nouvelles, Y mises à jour, Z supprimées, W réactivées. |
| | Résumé final : « Registration sync terminé — tournoi : … — scannées : … — créées : … — … — durée : N s ». |
| | Si erreurs : « Erreurs (N) : … ». |
| | Si erreur globale : « Erreur lors du sync inscriptions : … ». |
| **Commande /syncdiv** | « Sync divisions — Synchronisation des divisions depuis le calendrier démarrée. » |
| | « Sync divisions terminée — X entrées — … — Y anomalies — Z erreurs. » |
| | En cas d’exception : « Sync divisions — Erreur : … ». |
| **Commande /creationchaneldiv** | « Division N — Création / organisation démarrée (X équipes). » |
| | « Commande /creationchaneldiv terminée (division N) — X équipes traitées — … — Y avertissements / Z erreurs. » |
| | En cas d’exception : « Division N — Erreur lors de l’exécution : … ». |
| **Bouton « Créer la team »** | Succès : « Création des ressources Discord pour l’équipe **X** : rôle créé, salon créé, catégorie utilisée. » (ou version « mode dégradé »). |
| | Échec : « Échec création ressources Discord pour l’équipe **X** : … ». |

Seuls ces événements sont envoyés dans le salon audit. Aucun log technique détaillé (debug, traces pas à pas) n’y est envoyé.

---

## 4. Logs restant uniquement techniques (console)

Tous les appels existants à :

- **teamsLogger** (scan, extractors, sync DB, buildEnrichedTeam, etc.)
- **divisionsLogger** (rename, move, vocal, createTeamResources, syncDivisionsFromCalendar, etc.)
- **discordLogger** (notifications, handleCreateTeamButton, messages, etc.)
- **createJobLogger('registrationSync')** (début/fin de job, résumés JSON, avertissements, erreurs)

restent en console (ou futur fichier de log). Ils ne sont pas envoyés dans le salon d’audit.  
Les nouveaux messages « humains » ajoutés en console (ex. « Équipes détectées dans le tournoi », « Synchronisation base terminée ») le sont uniquement pour faciliter le debug à côté des résumés JSON existants.

---

## 5. Exemples de messages finaux dans le salon audit

- **Registration sync OK**  
  `Registration sync terminé — tournoi : OUATventure Saison 21 — scannées : 6 — créées : 6 — mises à jour : 0 — supprimées : 0 — réactivées : 0 — notifications : 6 envoyées — Google Sheets : 6 succès / 0 échec — durée : 52 s`

- **Sync divisions**  
  `Sync divisions terminée — 24 entrée(s) calendrier — 24 équipe(s) trouvée(s) en base — 24 mise(s) à jour — 0 anomalie(s) — 0 erreur(s)`

- **Creationchaneldiv**  
  `Commande /creationchaneldiv terminée (division 1) — 16 équipes traitées — 16 salon(s) déplacé(s) — 16 vocal(aux) synchronisé(s) — 3 avertissement(s)`

- **Bouton Créer la team**  
  `Création des ressources Discord pour l'équipe **HSD Atlas** : rôle créé, salon créé, catégorie utilisée.`

---

## 6. Convention de niveaux (inchangée)

- **info** : étape normale, résumé.
- **warn** : anomalie non bloquante (ex. scan dégradé, limite atteinte).
- **error** : échec (ex. erreur API, erreur Discord).

Les messages d’audit sont des **résumés ou alertes** pour le staff ; ils ne remplacent pas les niveaux info/warn/error en console.

---

## 7. Configuration requise

Dans `.env` :

```env
AUDIT_LOG_CHANNEL_ID=1479793278017736744
```

Si `AUDIT_LOG_CHANNEL_ID` est absent ou vide : aucun message n’est envoyé dans Discord, les appels à `sendAuditLog` / `sendAuditLogEmbed` retournent `false` et peuvent loguer en console en cas d’erreur interne (ex. client null).
