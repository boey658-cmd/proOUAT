# Vérification : qui peut exécuter les commandes et réagir aux boutons

## Source unique de vérité

| Élément | Fichier | Variable .env |
|--------|---------|----------------|
| **Rôles autorisés** | `src/config/discordLimits.ts` | **`ALLOWED_STAFF_ROLE_IDS`** |
| Format | Liste d’IDs Discord séparés par des **virgules** | Ex. `123456789,987654321` |

- Lecture : `getAllowedStaffRoleIds()` → `string[]`
- Si la variable est **vide ou absente** → tableau vide → **personne** n’est considéré comme staff (toutes les actions protégées sont refusées).

---

## 1. Commandes slash (qui peut les utiliser)

### 1.1 `/syncdiv`

| Fichier | Vérification |
|---------|----------------|
| `src/commands/syncdiv.ts` | `userHasStaffRole(interaction)` **avant** toute exécution |

- **Qui peut** : tout membre qui a **au moins un des rôles** listés dans `ALLOWED_STAFF_ROLE_IDS`.
- **Sinon** : réponse éphémère « Vous n'avez pas la permission d'utiliser cette commande. », la commande ne s’exécute pas.

### 1.2 `/creationchaneldiv`

| Fichier | Vérification |
|---------|----------------|
| `src/commands/creationchaneldiv.ts` | `userHasStaffRole(interaction)` **avant** toute exécution |

- **Qui peut** : même règle que `/syncdiv` (au moins un rôle staff).
- **Sinon** : même message de refus, rien n’est exécuté.

### Routage des commandes

- `src/discord/events/interactionCreate.ts` : seules ces deux commandes sont branchées (`syncdiv`, `creationchaneldiv`).
- Aucune autre commande slash n’est enregistrée ni gérée.
- Aucune commande ne s’exécute **sans** ce contrôle staff.

---

## 2. Bouton « Créer la team » (qui peut cliquer)

| Fichier | Vérification |
|---------|----------------|
| `src/modules/discord/interactions/handleCreateTeamButton.ts` | `userHasStaffRole(interaction)` **avant** création de rôle/salon |

- **Qui peut** : tout membre du serveur qui a **au moins un des rôles** listés dans `ALLOWED_STAFF_ROLE_IDS`.
- **Sinon** : réponse éphémère « Vous n'avez pas la permission d'effectuer cette action. », log `handleCreateTeamButton: utilisateur non autorisé`, aucune création.

### Routage du bouton

- `interactionCreate.ts` : si `interaction.isButton()` et `isCreateTeamCustomId(interaction.customId)` → uniquement `handleCreateTeamButton`.
- Aucun autre bouton n’est géré ; ce bouton est le seul protégé par une vérification explicite (et il l’est bien).

---

## 3. Logique commune « avoir un rôle staff »

La condition est la même partout, mais dupliquée dans 3 fichiers :

1. `src/commands/syncdiv.ts` — `userHasStaffRole(interaction)`
2. `src/commands/creationchaneldiv.ts` — `userHasStaffRole(interaction)`
3. `src/modules/discord/interactions/handleCreateTeamButton.ts` — `userHasStaffRole(interaction)`

Implémentation type (identique dans les 3) :

```ts
const member = interaction.member;
if (!member || !('roles' in member)) return false;
const allowed = getAllowedStaffRoleIds();
if (allowed.length === 0) return false;
const roles = member.roles;
const memberRoleIds = new Set(
  'cache' in roles ? roles.cache.keys() : (roles as string[] ?? [])
);
return allowed.some((id) => memberRoleIds.has(id));
```

- **Contexte** : uniquement pour des interactions **dans un serveur** (guild). Pour les commandes, `interaction.guild` existe ; pour le bouton, on refuse explicitement si `!guild`.
- **Rôles** : le bot utilise `GuildMembers` en intent, donc `member.roles` est disponible sur les interactions en guild.
- **Résultat** : un utilisateur peut utiliser les commandes et le bouton **si et seulement si** il possède au moins un rôle dont l’ID est dans `ALLOWED_STAFF_ROLE_IDS`.

---

## 4. Autres usages de « staff » (pas des contrôles d’accès)

Ces usages **ne décident pas** qui peut faire une action ; ils utilisent les mêmes rôles pour les **permissions des salons** créés par le bot :

| Fichier | Usage |
|---------|--------|
| `createTeamResourcesForGuild.ts` | Rôles staff **autorisés à voir** les salons texte (et vocaux) créés en division (serveur 2). |
| `createOrSyncTeamVoiceChannel.ts` | Idem : **accès** aux vocaux (staff + rôle équipe). |
| `createTeamChannel.ts` (bouton « Créer la team ») | Idem : **accès** au salon créé (staff + rôle équipe). |

- Même source : `getAllowedStaffRoleIds()`.
- Effet : les détenteurs de ces rôles **voient** ces salons/vocaux ; ça ne donne pas par ailleurs la possibilité d’utiliser les commandes ou le bouton (celle-ci vient uniquement des vérifications ci‑dessus).

---

## 5. Actions sans contrôle staff (automatiques)

Aucune interaction utilisateur ; pas de vérification de rôle :

| Action | Déclencheur | Qui est concerné |
|--------|-------------|-------------------|
| Sync inscriptions | Job planifié (toutes les N min) | N/A (bot seul) |
| Notifications (nouvelles / mises à jour / supprimées / réactivées) | Envoi dans un salon configuré | Tous ceux qui voient le salon (config Discord + permissions du canal) |
| Attribution du rôle équipe à l’arrivée | Événement `guildMemberAdd` | Tout membre qui rejoint et qui est reconnu comme joueur d’une équipe en base |

Aucune de ces actions n’est « commande » ou « bouton » ; elles ne passent pas par `userHasStaffRole`.

---

## 6. Récapitulatif

| Action | Contrôle | Source |
|--------|----------|--------|
| **Commande `/syncdiv`** | Oui : au moins un rôle dans `ALLOWED_STAFF_ROLE_IDS` | `syncdiv.ts` → `userHasStaffRole` |
| **Commande `/creationchaneldiv`** | Oui : idem | `creationchaneldiv.ts` → `userHasStaffRole` |
| **Bouton « Créer la team »** | Oui : idem | `handleCreateTeamButton.ts` → `userHasStaffRole` |
| Sync / notifications / rôle à l’arrivée | N/A (automatique) | Pas de check staff |

**En résumé** : seuls les membres qui ont **au moins un rôle dont l’ID est dans `ALLOWED_STAFF_ROLE_IDS`** peuvent utiliser les commandes et réagir au bouton. Si `ALLOWED_STAFF_ROLE_IDS` est vide, personne ne peut les utiliser.

---

## 7. Configuration à vérifier

- **`.env`** (ou environnement) : définir `ALLOWED_STAFF_ROLE_IDS` avec les IDs des rôles staff, séparés par des virgules, sans espaces superflus (le code fait `.trim()`).
- **`.env.example`** : la variable est documentée (ligne ~71, section « Permissions staff »).
- **Discord** : les IDs de rôles s’obtiennent via Mode développeur (Paramètres utilisateur → Applis → Mode développeur : Activé), puis clic droit sur le rôle → Copier l’identifiant du rôle.
