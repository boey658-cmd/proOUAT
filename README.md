# Bot Discord + Interface Web — Gestion de tournoi League of Legends

Système de gestion automatique des inscriptions et des divisions pour un tournoi LoL sur deux serveurs Discord : scan des équipes via API, création rôles/salons, synchronisation des joueurs, sync divisions, interface d’administration.

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Analyse du système, architecture en couches, modules et responsabilités
- **[docs/ARBORESCENCE.md](docs/ARBORESCENCE.md)** — Arborescence complète du projet (un fichier par fonction importante)
- **[docs/SCHEMA-SQL.md](docs/SCHEMA-SQL.md)** — Schéma SQLite et migrations
- **[docs/PLAN-IMPLEMENTATION.md](docs/PLAN-IMPLEMENTATION.md)** — Plan d’implémentation par phases (ordre des fichiers à créer)

## Stack

- Node.js LTS, TypeScript
- discord.js v14, Express, better-sqlite3, axios, zod, pino, node-cron, EJS (web)
- Sécurité : helmet, rate-limit, bcrypt, sessions, CSRF

## Prérequis

- Node.js 20+
- Variables d’environnement (voir `.env.example`)

## Commandes prévues

- `npm run dev` — Développement
- `npm run build` — Compilation TypeScript
- `npm run start` — Production
- `npm run migrate` — Exécuter les migrations
- `npm run test` — Tests
- `npm run lint` — ESLint

## Implémentation

Suivre le **plan par phases** dans `docs/PLAN-IMPLEMENTATION.md`. Ne pas coder sans avoir lu l’architecture et l’arborescence.
