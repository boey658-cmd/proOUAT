# Permissions Discord requises pour le bot

Lors de l’invitation du bot sur un serveur, cocher au minimum les permissions suivantes.

---

## Permissions à activer (invitation OAuth2)

| Permission | Utilisation dans le bot |
|------------|--------------------------|
| **Voir les salons** (View Channels) | Accéder aux salons (audit, staff, équipes) pour envoyer des messages et gérer les salons. |
| **Envoyer des messages** (Send Messages) | Envoi dans le salon d’audit, le salon staff (nouvelles équipes, mises à jour, etc.) et réponses aux commandes / boutons. |
| **Envoyer des messages dans les fils** (Send Messages in Threads) | Optionnel ; utile si le salon staff ou l’audit utilise des fils. |
| **Incorporer des liens** (Embed Links) | Tous les messages « équipe » (nouvelle, mise à jour, retirée, réactivée) et l’archivage utilisent des embeds. |
| **Gérer les messages** (Manage Messages) | Suppression du message « nouvelle équipe » après clic sur « Créer la team » (pour masquer le bouton une fois la création faite). |
| **Gérer les salons** (Manage Channels) | Création de catégories, salons texte et vocaux ; déplacement et renommage de salons ; réorganisation (setPositions) pour les divisions. |
| **Gérer les rôles** (Manage Roles) | Création des rôles équipe, renommage des rôles (divisions), attribution des rôles aux membres quand ils rejoignent ou après création d’une équipe. |

---

## Lien d’invitation (permissions minimales)

Pour générer un lien d’invitation avec uniquement ces permissions :

- **Scope :** `bot`
- Cocher manuellement dans l’interface d’invitation :
  - **View Channels** (Voir les salons)
  - **Send Messages** (Envoyer des messages)
  - **Send Messages in Threads** (optionnel)
  - **Embed Links** (Incorporer des liens)
  - **Manage Messages** (Gérer les messages)
  - **Manage Channels** (Gérer les salons)
  - **Manage Roles** (Gérer les rôles)

- **Valeur décimale (optionnel)** pour un lien personnalisé : `268449832`

Exemple d’URL (remplacer `TON_CLIENT_ID` par ton Application ID) :

```
https://discord.com/api/oauth2/authorize?client_id=TON_CLIENT_ID&permissions=268449832&scope=bot%20applications.commands
```

Le paramètre `applications.commands` est nécessaire pour que les commandes slash (`/syncdiv`, `/creationchaneldiv`) soient disponibles.

---

## Intention (Intent) à activer dans le portail développeur

En plus des permissions du serveur, il faut activer l’**intention privilégiée** suivante dans l’onglet **Bot** du [portail développeur Discord](https://discord.com/developers/applications) :

| Intent | Utilisation |
|--------|-------------|
| **Server Members Intent** (Guild Members) | Récupération des membres (`guild.members.fetch`) pour vérifier la présence des joueurs sur le serveur et leur attribuer le rôle équipe. |

Sans cette intention, le bot ne peut pas récupérer la liste des membres et l’attribution des rôles échouera.

---

## Récapitulatif

- **Permissions d’invitation :** Voir les salons, Envoyer des messages, Incorporer des liens, Gérer les messages, Gérer les salons, Gérer les rôles.  
- **Scope d’invitation :** `bot` + `applications.commands`.  
- **Intent à activer :** Server Members Intent (Guild Members).
