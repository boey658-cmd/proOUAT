# Patches : rôle Discord (position + mentionnable) et séparation joueurs / staff

**Date :** 2025-03-07

---

## 1. Résumé des changements

### Fichiers modifiés

| Fichier | Modifications |
|---------|----------------|
| `src/config/discord.ts` | Ajout `getTeamRolePositionAboveRoleId()` (env `TEAM_ROLE_POSITION_ABOVE_ROLE_ID`) |
| `src/modules/discord/resources/createTeamRole.ts` | `mentionable: true` à la création ; positionnement au-dessus du rôle cible (si configuré) ; helper `trySetRolePositionAboveTarget` |
| `src/modules/divisions/createTeamResourcesForGuild.ts` | `mentionable: true` à la création du rôle division |
| `src/modules/divisions/renameTeamResources.ts` | Après renommage du rôle : `role.edit({ mentionable: true })` (warning si échec) |
| `src/modules/teams/extractors.ts` | Séparation joueurs / staff : `getActivePlayerItems`, `getActiveStaffItems`, `extractPlayerRefsFromTeam` (players uniquement), nouveau `extractStaffRefsFromTeam` |
| `src/modules/teams/types.ts` | `NormalizedTeam` : ajout `staff?: NormalizedPlayer[]` |
| `src/modules/teams/normalizer.ts` | `buildNormalizedTeam(..., players, staff?)` avec champ `staff` |
| `src/modules/teams/buildEnrichedTeam.ts` | Extraction joueurs + staff, enrichissement des deux, `buildNormalizedTeam(..., normalizedPlayers, normalizedStaff)` |
| `src/modules/teams/index.ts` | Export `extractStaffRefsFromTeam` |
| `src/modules/discord/embeds/newTeamEmbed.ts` | Sections « Joueurs » et « Staff » (Staff affiché seulement si `team.staff?.length`) |
| `src/modules/googleSheets/syncTeamToGoogleSheets.ts` | Aucun changement : `buildJoueursString(team)` utilise déjà `team.players` (désormais uniquement les joueurs) |

### Nouvelles propriétés

- **NormalizedTeam.staff** : `NormalizedPlayer[]` optionnel, rempli à partir de `data.staffs` (séparé de `players`).

### Comportement final

- **Rôle équipe (bouton / inscription)** : créé avec `mentionable: true` ; si `TEAM_ROLE_POSITION_ABOVE_ROLE_ID` est défini dans `.env`, le bot tente de placer le rôle juste au-dessus de ce rôle (même guilde, avec warnings en cas d’échec).
- **Rôle division (/creationchaneldiv)** : créé avec `mentionable: true` ; au renommage, le bot remet `mentionable: true` si possible.
- **Embeds « nouvelle équipe »** : section « Joueurs » (liste joueurs) et section « Staff » (liste staff) si présent.
- **Google Sheets** : le champ `joueurs` (DOC 1) contient uniquement les joueurs (plus de staff).
- **Base de données** : seuls les **joueurs** sont synchronisés dans la table `players` (le staff n’y est plus enregistré).

---

## 2. Rôle Discord — où c’est fait

### Position au-dessus du rôle cible (`802883450070761473`)

- **Fichier :** `src/modules/discord/resources/createTeamRole.ts`
- **Config :** variable d’environnement `TEAM_ROLE_POSITION_ABOVE_ROLE_ID`. Pour utiliser le rôle `802883450070761473`, ajouter dans `.env` :
  ```env
  TEAM_ROLE_POSITION_ABOVE_ROLE_ID=802883450070761473
  ```
- **Logique :** après `guild.roles.create(...)`, si `getTeamRolePositionAboveRoleId()` est défini :
  1. `trySetRolePositionAboveTarget(guild, createdRole, targetRoleId)` :
  2. fetch du rôle cible dans la guilde ;
  3. vérification que le rôle cible appartient à la même guilde ;
  4. `createdRole.setPosition(targetRole.position + 1)` ;
  5. en cas d’erreur (permissions, hiérarchie, rôle absent) : warning en log, pas d’exception, flux normal continué.

### Rôle mentionnable (`mentionable: true`)

- **Création rôle équipe (bouton)** : `src/modules/discord/resources/createTeamRole.ts` — `guild.roles.create({ ..., mentionable: true })`.
- **Création rôle division** : `src/modules/divisions/createTeamResourcesForGuild.ts` — `guild.roles.create({ ..., mentionable: true })`.
- **Renommage rôle existant (division)** : `src/modules/divisions/renameTeamResources.ts` — après `role.setName(...)`, appel à `role.edit({ mentionable: true })` dans un `try/catch` ; en cas d’échec, warning dans les logs, pas d’échec global.

---

## 3. Séparation joueurs / staff — où c’est fait

### Extraction

- **Fichier :** `src/modules/teams/extractors.ts`
- **Joueurs :** `getActivePlayerItems(obj)` lit uniquement `obj['players']` ; `extractPlayerRefsFromTeam(data)` retourne les refs **joueurs** (plus de fusion avec le staff).
- **Staff :** `getActiveStaffItems(obj)` lit uniquement `obj['staffs']` ; `extractStaffRefsFromTeam(data)` retourne les refs **staff**.

### Données enrichies

- **Fichier :** `src/modules/teams/buildEnrichedTeam.ts`
- Enrichissement en parallèle : `extractPlayerRefsFromTeam(rawTeam)` et `extractStaffRefsFromTeam(rawTeam)` ; chaque liste est enrichie via l’API user ; `buildNormalizedTeam(idStr, teamName, normalizedPlayers, normalizedStaff)` produit une équipe avec `players` (joueurs) et `staff` (staff).

### Embed « nouvelle inscription »

- **Fichier :** `src/modules/discord/embeds/newTeamEmbed.ts`
- Champ **Joueurs** : `formatPlayersField(normalizedTeam)` (basé sur `team.players`).
- Champ **Staff** : ajouté seulement si `normalizedTeam.staff?.length` ; `formatStaffField(normalizedTeam)` (même format de ligne que les joueurs).

### Google Sheets

- **Fichier :** `src/modules/googleSheets/syncTeamToGoogleSheets.ts`
- **Aucune modification** : `buildJoueursString(team)` utilise `team.players` ; comme `team.players` ne contient plus que les joueurs, le payload DOC 1 `{ equipe, joueurs }` envoie uniquement les joueurs (plus de staff dans `joueurs`).

---

## 4. Vérifications

- **`npx tsc --noEmit`** : OK.
- Logique métier : uniquement séparation joueurs/staff, position et mentionnable du rôle ; pas de refactor superflu.
- Flux existant : extraction, enrichissement, sync DB (joueurs uniquement), embeds, Google Sheets cohérents.
- En cas d’impossibilité de positionner le rôle : warnings en log (rôle cible introuvable, autre guilde, permission/hiérarchie), pas de crash.

---

## 5. Configuration optionnelle

- **Position du rôle :** par défaut le bot utilise le rôle `802883450070761473` comme cible. Pour utiliser un autre rôle : `TEAM_ROLE_POSITION_ABOVE_ROLE_ID=<role_id>` dans `.env`. Pour désactiver le repositionnement : `TEAM_ROLE_POSITION_ABOVE_ROLE_ID=` (vide).
