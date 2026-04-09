/**
 * Serveur HTTP Express pour le panel admin (routes sous /admin).
 */

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import type { Client } from 'discord.js';
import { getAdminApiToken, getAdminHttpPort } from '../config/adminApi.js';
import { createAdminRouter } from './router.js';

let httpServer: http.Server | null = null;

export function closeAdminServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close((err) => {
      httpServer = null;
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Démarre l’API admin si ADMIN_API_TOKEN est défini.
 * @returns le port réellement écouté, ou null si désactivé.
 */
export function startAdminServer(client: Client<true>): number | null {
  if (!getAdminApiToken()) {
    console.info(
      '[admin] Panel désactivé : définir ADMIN_API_TOKEN (et optionnellement ADMIN_HTTP_PORT) dans .env'
    );
    return null;
  }

  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use('/admin', createAdminRouter(client));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'proouat-admin' });
  });

  const port = getAdminHttpPort();
  httpServer = http.createServer(app);
  httpServer.listen(port, () => {
    console.info(`[admin] API http://127.0.0.1:${port}/admin (Bearer ADMIN_API_TOKEN)`);
  });

  return port;
}
