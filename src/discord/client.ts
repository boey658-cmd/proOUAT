/**
 * Client Discord : initialisation, chargement des événements, connexion.
 * Une responsabilité : créer le client, charger les events, se connecter.
 */

import {
  Client,
  GatewayIntentBits,
  type ClientOptions,
} from 'discord.js';
import { getDiscordToken } from '../config/index.js';
import { registerEvents } from './events/index.js';
import { registerCommands } from './registerCommands.js';
import { startJobs } from '../bootstrap/startJobs.js';

const DEFAULT_INTENTS: ClientOptions['intents'] = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
];

let clientInstance: Client<true> | null = null;

/**
 * Crée le client Discord, charge les événements et se connecte.
 * Le token est lu depuis .env (DISCORD_TOKEN).
 * La promesse est résolue une fois le bot prêt (événement ready).
 */
export async function createAndConnectClient(): Promise<Client<true>> {
  if (clientInstance) {
    return clientInstance;
  }

  const token = getDiscordToken();
  const client = new Client({
    intents: DEFAULT_INTENTS,
  });

  registerEvents(client);

  const readyClient = await new Promise<Client<true>>((resolve, reject) => {
    client.once('ready', (c) => resolve(c as Client<true>));
    client.once('error', reject);
    client.login(token).catch(reject);
  });

  await registerCommands(readyClient);
  startJobs(readyClient);
  clientInstance = readyClient;
  return readyClient;
}

/**
 * Retourne le client déjà connecté, ou null si createAndConnectClient n'a pas encore été appelé.
 */
export function getClient(): Client<true> | null {
  return clientInstance;
}

/**
 * Déconnecte le client et réinitialise l'instance (utile pour tests ou shutdown).
 */
export function destroyClient(): Promise<void> {
  if (clientInstance) {
    clientInstance.destroy();
    clientInstance = null;
  }
  return Promise.resolve();
}
